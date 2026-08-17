// source_reference: pure helpers for the frontend TypeScript baseline ratchet.
// operational_decision: `frontend-typecheck` blocks every open MR (15/15) on
// 289 pre-existing diagnostics unrelated to the change being reviewed — a
// separate team owns cleanup of a chunk of these (Qualificacoes/EAD/LMS).
// This ratchet grandfathers the exact known diagnostic set (by normalized
// identity, not count) so CI still fails hard on any *new* diagnostic while
// unblocking unrelated MRs, and still rewards fixing old ones since a strict
// subset of the baseline also passes.
// dry_run_required: all functions here are pure (no fs/process access);
// callers do the `tsc` invocation and file I/O.
// rollback_plan_required: delete this file, guard-typescript-baseline-ratchet.mjs,
// the baseline JSON, and the `guard:typescript-baseline-ratchet` npm script /
// CircleCI wiring to fully revert — no runtime footprint elsewhere.

const DIAGNOSTIC_HEADER_RE = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.*)$/;

/**
 * Parses raw `tsc -p tsconfig.app.json --noEmit` stdout+stderr text into a
 * flat array of diagnostics. tsc wraps a single diagnostic's message across
 * multiple lines (indented continuation lines with no leading
 * `path(line,col):` header) — those are folded back into one message so a
 * diagnostic's identity does not fragment across lines.
 */
export function parseTscOutput(rawText) {
  const lines = rawText.split('\n');
  const diagnostics = [];
  let current = null;

  for (const line of lines) {
    const match = DIAGNOSTIC_HEADER_RE.exec(line);
    if (match) {
      if (current) diagnostics.push(finalizeDiagnostic(current));
      const [, file, lineNo, colNo, code, message] = match;
      current = {
        file,
        line: Number(lineNo),
        column: Number(colNo),
        code,
        messageLines: [message],
      };
      continue;
    }

    // Continuation line: only meaningful while inside a diagnostic and only
    // if it is not blank noise between diagnostics.
    if (current && line.trim()) {
      current.messageLines.push(line.trim());
    }
  }
  if (current) diagnostics.push(finalizeDiagnostic(current));

  return diagnostics;
}

function finalizeDiagnostic(current) {
  return {
    file: normalizeFilePath(current.file),
    line: current.line,
    column: current.column,
    code: current.code,
    message: current.messageLines.join(' ').trim(),
  };
}

/**
 * Normalizes a file path emitted by tsc into a repo-root-relative,
 * forward-slash path. tsc invoked via `-p tsconfig.app.json --noEmit` from
 * the repo root already emits project-relative paths, but this defends
 * against absolute-path leakage (different CI/local machine roots) so the
 * baseline comparison never treats an environment difference as a new
 * diagnostic.
 */
export function normalizeFilePath(rawPath, { cwd = process?.cwd?.() ?? '' } = {}) {
  let p = rawPath.replace(/\\/g, '/');
  const cwdNormalized = cwd.replace(/\\/g, '/');
  if (cwdNormalized && p.startsWith(`${cwdNormalized}/`)) {
    p = p.slice(cwdNormalized.length + 1);
  }
  // Strip any other absolute-path prefix up to a repo-root marker directory
  // we know exists in every checkout (src/ or worker-airtrust/), so a
  // baseline generated on one machine still matches a run on another.
  const markerMatch = /^(?:.*\/)?(src\/.*|worker-airtrust\/.*)$/.exec(p);
  if (markerMatch) p = markerMatch[1];
  return p;
}

/** Builds the deterministic identity string used for baseline comparison. */
export function diagnosticIdentity(diagnostic) {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}:${diagnostic.code}:${diagnostic.message}`;
}

/** Deduplicates diagnostics by identity (tsc can double-emit in edge cases). */
export function dedupeDiagnostics(diagnostics) {
  const seen = new Map();
  for (const d of diagnostics) {
    const key = diagnosticIdentity(d);
    if (!seen.has(key)) seen.set(key, d);
  }
  return [...seen.values()];
}

/** Sorts diagnostics deterministically (order in raw tsc output is not guaranteed stable across environments). */
export function sortDiagnostics(diagnostics) {
  return [...diagnostics].sort((a, b) => diagnosticIdentity(a).localeCompare(diagnosticIdentity(b)));
}

const REQUIRED_BASELINE_FIELDS = ['sourceSha', 'generatedAt', 'diagnosticCount', 'diagnostics'];
const REQUIRED_DIAGNOSTIC_FIELDS = ['file', 'line', 'column', 'code', 'message'];

/**
 * Validates baseline structural shape. Throws with a descriptive message on
 * any structural problem so callers can fail closed. Does not (cannot)
 * independently re-derive git history — the `sourceSha` field is a
 * documentation/governance marker, not a cryptographic proof; see
 * `checkBaselineGovernance` below for the advisory check built on top of it.
 */
export function assertBaselineShape(baseline) {
  if (baseline === null || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw new Error('baseline: root must be a JSON object');
  }
  for (const field of REQUIRED_BASELINE_FIELDS) {
    if (!(field in baseline)) {
      throw new Error(`baseline: missing required field '${field}'`);
    }
  }
  if (typeof baseline.sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(baseline.sourceSha)) {
    throw new Error('baseline: sourceSha must be a full 40-character git SHA string');
  }
  if (typeof baseline.generatedAt !== 'string' || Number.isNaN(Date.parse(baseline.generatedAt))) {
    throw new Error('baseline: generatedAt must be a valid ISO timestamp string');
  }
  if (!Array.isArray(baseline.diagnostics)) {
    throw new Error('baseline: diagnostics must be an array');
  }
  if (typeof baseline.diagnosticCount !== 'number' || baseline.diagnosticCount !== baseline.diagnostics.length) {
    throw new Error(
      `baseline: diagnosticCount (${baseline.diagnosticCount}) does not match diagnostics.length (${baseline.diagnostics.length})`,
    );
  }

  baseline.diagnostics.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new Error(`baseline: diagnostics[${index}] must be an object`);
    }
    for (const field of REQUIRED_DIAGNOSTIC_FIELDS) {
      if (!(field in entry)) {
        throw new Error(`baseline: diagnostics[${index}] missing required field '${field}'`);
      }
    }
    if (typeof entry.file !== 'string' || !entry.file) {
      throw new Error(`baseline: diagnostics[${index}].file must be a non-empty string`);
    }
    if (!Number.isInteger(entry.line) || entry.line < 1) {
      throw new Error(`baseline: diagnostics[${index}].line must be a positive integer`);
    }
    if (!Number.isInteger(entry.column) || entry.column < 1) {
      throw new Error(`baseline: diagnostics[${index}].column must be a positive integer`);
    }
    if (typeof entry.code !== 'string' || !/^TS\d+$/.test(entry.code)) {
      throw new Error(`baseline: diagnostics[${index}].code must look like 'TS1234'`);
    }
    if (typeof entry.message !== 'string' || !entry.message) {
      throw new Error(`baseline: diagnostics[${index}].message must be a non-empty string`);
    }
  });

  return baseline;
}

/**
 * Advisory governance check: flags when the baseline's declared source SHA
 * differs from the SHA the caller expects it to be pinned to. A script
 * cannot independently re-derive whether that SHA is "the right one" from
 * git history alone (it can only compare two strings) — the real governance
 * is that the baseline is a checked-in file, so any change to it (including
 * to this field) shows up as a reviewable diff on the MR. This function only
 * makes the mismatch loudly visible when an `expectedSha` is supplied.
 */
export function checkBaselineGovernance(baseline, { expectedSha } = {}) {
  if (!expectedSha) return { ok: true, checked: false };
  const ok = baseline.sourceSha.toLowerCase() === expectedSha.toLowerCase();
  return { ok, checked: true, declaredSha: baseline.sourceSha, expectedSha };
}

/**
 * Compares a current diagnostic set against the baseline using normalized
 * identity (not count). Returns { pass, newDiagnostics, fixedDiagnostics }.
 * PASS iff current diagnostics are a subset of (or equal to) the baseline
 * set — any diagnostic present now but absent from baseline fails the run,
 * regardless of how many other diagnostics were simultaneously fixed.
 */
export function compareDiagnostics(currentDiagnostics, baselineDiagnostics) {
  const currentDeduped = dedupeDiagnostics(currentDiagnostics);
  const baselineDeduped = dedupeDiagnostics(baselineDiagnostics);

  const baselineKeys = new Set(baselineDeduped.map(diagnosticIdentity));
  const currentKeys = new Set(currentDeduped.map(diagnosticIdentity));

  const newDiagnostics = sortDiagnostics(
    currentDeduped.filter((d) => !baselineKeys.has(diagnosticIdentity(d))),
  );
  const fixedDiagnostics = sortDiagnostics(
    baselineDeduped.filter((d) => !currentKeys.has(diagnosticIdentity(d))),
  );

  return {
    pass: newDiagnostics.length === 0,
    newDiagnostics,
    fixedDiagnostics,
    currentCount: currentDeduped.length,
    baselineCount: baselineDeduped.length,
  };
}

/** Formats a single diagnostic identity for human-readable CLI output. */
export function formatDiagnostic(d) {
  return `${d.file}:${d.line}:${d.column} ${d.code} ${d.message}`;
}
