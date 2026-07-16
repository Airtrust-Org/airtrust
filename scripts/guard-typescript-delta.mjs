#!/usr/bin/env node
// source_reference: CI guard that rejects new occurrences of type-safety
// weakening patterns (`any`, double casts, `@ts-ignore`, global Response
// overrides, committed TS error logs) in the lines a PR adds — without
// requiring the pre-existing 344-error legacy baseline to be clean first.
// operational_decision: this guard was created in direct response to PR #336
// (merged with --admin, then reverted as PR #337), which introduced exactly
// these patterns to make `npm run typecheck` pass without fixing real causes.
// dry_run_required: read-only; runs `git diff` against a base ref and never
// mutates the working tree or history.
// rollback_plan_required: this script can be removed from CI (and deleted)
// without touching application behavior; it has no runtime footprint.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import {
  checkAddedContent,
  isBannedNewFile,
  isProductionTsFile,
  parseUnifiedDiffAddedLines,
} from './typescript-delta-lib.mjs';

function resolveBaseRef() {
  const cliArg = process.argv[2];
  if (cliArg) return cliArg;
  if (process.env.GUARD_TS_DELTA_BASE_REF) return process.env.GUARD_TS_DELTA_BASE_REF;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  return 'origin/main';
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

function refExists(ref, cwd) {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

function ensureBaseRefFetched(baseRef, cwd) {
  if (refExists(baseRef, cwd)) return;
  // CI checkouts are frequently shallow and only fetch the PR/push commit —
  // the base branch itself is not guaranteed to be present locally. Fetch it
  // on demand rather than silently skipping the guard (a missing base ref
  // must never be treated as "no violations").
  const branchName = baseRef.startsWith('origin/') ? baseRef.slice('origin/'.length) : baseRef;
  try {
    git(['fetch', '--quiet', '--depth=500', 'origin', branchName], cwd);
  } catch {
    // Best effort — if this also fails (e.g. no network, no such branch),
    // resolveMergeBase()/runGuard() below will surface a clear error instead
    // of silently passing.
  }
}

function resolveMergeBase(baseRef, cwd) {
  ensureBaseRefFetched(baseRef, cwd);
  return git(['merge-base', baseRef, 'HEAD'], cwd).trim();
}

export function runGuard({ cwd = process.cwd(), baseRef } = {}) {
  const resolvedBaseRef = baseRef ?? resolveBaseRef();
  const mergeBase = resolveMergeBase(resolvedBaseRef, cwd);

  const nameStatusRaw = git(['diff', '--name-status', '-M', `${mergeBase}...HEAD`], cwd);
  const addedFiles = new Set();
  for (const line of nameStatusRaw.split('\n')) {
    if (!line.trim()) continue;
    const [status, ...rest] = line.split('\t');
    if (status.startsWith('A')) {
      addedFiles.add(rest[rest.length - 1]);
    }
  }

  const diffText = git(['diff', '-U0', `${mergeBase}...HEAD`], cwd);
  const addedByFile = parseUnifiedDiffAddedLines(diffText);

  const violations = [];
  const bannedFiles = [];

  for (const filePath of addedByFile.keys()) {
    if (addedFiles.has(filePath) && isBannedNewFile(filePath)) {
      bannedFiles.push(filePath);
    }
  }

  for (const [filePath, addedText] of addedByFile) {
    if (!isProductionTsFile(filePath)) continue;
    if (!addedText.trim()) continue;
    const fileViolations = checkAddedContent(addedText, filePath);
    violations.push(...fileViolations);
  }

  return { violations, bannedFiles, baseRef: resolvedBaseRef, mergeBase };
}

function main() {
  const cwd = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const { violations, bannedFiles, baseRef, mergeBase } = runGuard({ cwd });

  if (bannedFiles.length === 0 && violations.length === 0) {
    console.log(`OK: guard:typescript-delta — no forbidden type-safety patterns added vs ${baseRef} (${mergeBase})`);
    console.log('RESULT: PASS');
    process.exit(0);
  }

  console.error(`\nRESULT: FAIL — guard:typescript-delta rejected this diff vs ${baseRef} (${mergeBase})\n`);

  if (bannedFiles.length > 0) {
    console.error('Forbidden new files (TS log/inventory artifacts must not be committed):');
    for (const f of bannedFiles) {
      console.error(`  - ${f}`);
    }
    console.error('');
  }

  if (violations.length > 0) {
    console.error('Forbidden type-safety patterns added:');
    for (const v of violations) {
      console.error(`  ${v.file}:~${v.line} [${v.ruleId}] ${v.message}`);
      console.error(`    + ${v.snippet}`);
    }
    console.error('');
  }

  console.error(
    'Fix: remove the pattern and address the underlying type error with narrowing, a runtime schema\n' +
      "validator, or `unknown` + a type guard. If a pattern is truly unavoidable, add an exact\n" +
      "'file:line' entry to ALLOWLIST in scripts/typescript-delta-lib.mjs with an inline justification\n" +
      '— never a wildcard, and never for AirTrust-controlled production logic.',
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
