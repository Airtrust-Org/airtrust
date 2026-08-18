#!/usr/bin/env node
// source_reference: CI ratchet gate for `frontend-typecheck`. Runs the exact
// same command as `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`)
// and compares its diagnostics against a checked-in baseline by normalized
// identity (file:line:column:code:message) instead of raw count, so the
// pre-existing 289-diagnostic legacy debt does not have to be zero before
// this becomes a required, always-passing-or-failing gate.
// operational_decision: `frontend-typecheck` currently blocks all 15 open
// MRs in the repo on unrelated pre-existing debt (confirmed identical
// failure across two unrelated backend-only branches). A raw count-based
// gate would let a regression hide behind an unrelated fix in the same PR
// (289 -> 288 while introducing 1 new error). This gate fails on ANY new
// diagnostic regardless of the net count.
// dry_run_required: read-only — runs `tsc --noEmit` and reads the baseline
// JSON; never mutates the working tree.
// rollback_plan_required: this script (and its CircleCI wiring) can be
// removed and CI can revert to bare `npm run typecheck` without touching any
// application behavior; it has no runtime footprint.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertBaselineShape,
  checkBaselineGovernance,
  compareDiagnostics,
  dedupeDiagnostics,
  formatDiagnostic,
  parseTscOutput,
} from './typescript-baseline-ratchet-lib.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'scripts', 'typescript-baseline-ratchet.json');
const EXPECTED_SOURCE_SHA = '0ff8a839f12630f25dd061a5399997b9cb5ed04a';

/**
 * Runs `tsc -p tsconfig.app.json --noEmit` and returns its parsed
 * diagnostics. tsc exits non-zero whenever there is at least one diagnostic
 * (that is its normal, expected mode here — NOT a crash). A crash is
 * distinguished by the absence of any parseable `file(line,col): error TSxxxx`
 * diagnostic lines combined with a non-zero exit — e.g. a tsconfig parse
 * error, an out-of-memory kill, or a missing binary. In that case we must
 * fail closed rather than silently reporting zero diagnostics as a clean
 * pass.
 */
export function runTsc({ cwd = REPO_ROOT } = {}) {
  let stdout = '';
  let stderr = '';
  let crashed = false;

  try {
    stdout = execFileSync('npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
    });
  } catch (err) {
    // execFileSync throws whenever tsc exits non-zero, which is the normal
    // case whenever there are diagnostics to report.
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
    if (err.signal || (err.status === null && err.status !== 0)) {
      // Killed by a signal (OOM, timeout) rather than a normal tsc exit.
      crashed = true;
    }
  }

  const combined = `${stdout}\n${stderr}`;
  const diagnostics = parseTscOutput(combined, { cwd });

  // If tsc produced no parseable diagnostics AND emitted something on
  // stderr (or the process was killed by a signal), treat this as a tooling
  // crash (e.g. tsconfig parse error, OOM) rather than "zero errors" —
  // silently passing here would be worse than a false failure.
  if (diagnostics.length === 0 && (crashed || stderr.trim())) {
    return { crashed: true, diagnostics: [], rawOutput: combined };
  }

  return { crashed: false, diagnostics, rawOutput: combined };
}

function loadBaseline() {
  let text;
  try {
    text = readFileSync(BASELINE_PATH, 'utf8');
  } catch (err) {
    throw new Error(`baseline file missing or unreadable at ${BASELINE_PATH}: ${err.message}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`baseline file is not valid JSON (${BASELINE_PATH}): ${err.message}`);
  }

  return assertBaselineShape(json);
}

export function runRatchet({ cwd = REPO_ROOT } = {}) {
  const baseline = loadBaseline();

  const governance = checkBaselineGovernance(baseline, { expectedSha: EXPECTED_SOURCE_SHA });

  const { crashed, diagnostics, rawOutput } = runTsc({ cwd });
  if (crashed) {
    return {
      pass: false,
      crashed: true,
      rawOutput,
      governance,
    };
  }

  const currentDeduped = dedupeDiagnostics(diagnostics);
  const comparison = compareDiagnostics(currentDeduped, baseline.diagnostics);

  return {
    pass: comparison.pass,
    crashed: false,
    comparison,
    baseline,
    governance,
  };
}

/**
 * Regenerates the baseline JSON from a real `tsc` run against the current
 * checkout. Because diagnostics are canonicalized (file field via
 * normalizeFilePath, message field via canonicalizeDiagnosticText) before
 * being written, the generated baseline is checkout-path-independent: two
 * checkouts of the same commit at different absolute roots produce
 * byte-identical `diagnostics` content (only `generatedAt` legitimately
 * differs between runs).
 */
export function generateBaseline({ cwd = REPO_ROOT, sourceSha = EXPECTED_SOURCE_SHA } = {}) {
  const { crashed, diagnostics, rawOutput } = runTsc({ cwd });
  if (crashed) {
    throw new Error(`tsc did not produce parseable diagnostic output while generating baseline:\n${rawOutput}`);
  }
  const deduped = dedupeDiagnostics(diagnostics);
  const sorted = [...deduped].sort((a, b) =>
    `${a.file}:${a.line}:${a.column}:${a.code}:${a.message}`.localeCompare(
      `${b.file}:${b.line}:${b.column}:${b.code}:${b.message}`,
    ),
  );
  return {
    sourceSha,
    generatedAt: new Date().toISOString(),
    diagnosticCount: sorted.length,
    diagnostics: sorted,
  };
}

function writeBaselineMain() {
  const baseline = generateBaseline();
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  console.log(
    `Wrote ${BASELINE_PATH}: ${baseline.diagnosticCount} diagnostic(s), sourceSha=${baseline.sourceSha}.`,
  );
}

function main() {
  if (process.argv.includes('--write-baseline')) {
    writeBaselineMain();
    return;
  }

  let result;
  try {
    result = runRatchet();
  } catch (err) {
    console.error(`RESULT: FAIL — guard:typescript-baseline-ratchet could not run: ${err.message}`);
    process.exit(1);
    return;
  }

  if (!result.governance.checked) {
    console.log('NOTE: baseline governance check skipped (no expected SHA configured).');
  } else if (!result.governance.ok) {
    console.log(
      `NOTE: baseline sourceSha (${result.governance.declaredSha}) differs from the SHA this guard ` +
        `expects (${result.governance.expectedSha}). This is advisory only — the baseline is a ` +
        'checked-in file, so any change to it (including this field) is a reviewable diff. Confirm ' +
        'the baseline was regenerated intentionally.',
    );
  }

  if (result.crashed) {
    console.error('RESULT: FAIL — tsc did not produce parseable diagnostic output (tooling crash).');
    console.error('--- raw tsc output ---');
    console.error(result.rawOutput);
    process.exit(1);
    return;
  }

  const { comparison, baseline } = result;

  if (result.pass) {
    console.log(
      `OK: guard:typescript-baseline-ratchet — ${comparison.currentCount} diagnostic(s), ` +
        `${comparison.baselineCount} in baseline, 0 new.`,
    );
    if (comparison.fixedDiagnostics.length > 0) {
      console.log(`${comparison.fixedDiagnostics.length} previously-baselined diagnostic(s) no longer present (fixed):`);
      for (const d of comparison.fixedDiagnostics) {
        console.log(`  - ${formatDiagnostic(d)}`);
      }
    }
    console.log('RESULT: PASS');
    process.exit(0);
    return;
  }

  console.error(
    `RESULT: FAIL — guard:typescript-baseline-ratchet found ${result.comparison.newDiagnostics.length} ` +
      `new diagnostic(s) not present in the baseline (${BASELINE_PATH}, source ${baseline.sourceSha}).`,
  );
  console.error('');
  console.error('New diagnostics:');
  for (const d of comparison.newDiagnostics) {
    console.error(`  ${formatDiagnostic(d)}`);
  }
  console.error('');
  console.error(
    `Current total: ${comparison.currentCount}. Baseline total: ${comparison.baselineCount}. ` +
      'A lower or equal total does NOT pass if any diagnostic is new — fix the new diagnostic(s) above.',
  );
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
