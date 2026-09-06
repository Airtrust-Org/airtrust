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
export function parseTscOutput(rawText, { cwd = process?.cwd?.() ?? '' } = {}) {
  const opts = { cwd };
  const lines = rawText.split('\n');
  const diagnostics = [];
  let current = null;

  for (const line of lines) {
    const match = DIAGNOSTIC_HEADER_RE.exec(line);
    if (match) {
      if (current) diagnostics.push(finalizeDiagnostic(current, opts));
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
  if (current) diagnostics.push(finalizeDiagnostic(current, opts));

  return diagnostics;
}

function finalizeDiagnostic(current, opts) {
  return {
    file: normalizeFilePath(current.file, opts),
    line: current.line,
    column: current.column,
    code: current.code,
    message: canonicalizeDiagnosticText(current.messageLines.join(' ').trim(), opts),
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

// Matches an absolute path segment: POSIX (`/foo/bar`) or Windows
// (`C:\foo\bar` / `C:/foo/bar`), greedily up to the next character that
// cannot appear in a bare filesystem path (tsc wraps these in quotes or
// parens in every observed diagnostic shape, so `"`, `'`, `)`, whitespace,
// and backtick are safe stop characters).
const ABS_PATH_SEGMENT_RE = /(?:[A-Za-z]:[\\/]|\/)[^"'()\s`]+/g;

// Repo-root marker directories present in every real AirTrust checkout,
// reused by both normalizeFilePath (for the top-level `file` field) and
// canonicalizeDiagnosticText (for absolute paths embedded inside `message`,
// e.g. tsc's `import("/abs/path/to/src/foo")` cross-module type references).
const REPO_ROOT_MARKER_RE = /(src\/.*|worker-airtrust\/.*|node_modules\/.*)$/;

const CANONICAL_PREFIX = '<repo>/';

/**
 * Rewrites absolute filesystem paths embedded anywhere inside a diagnostic's
 * message text to a stable, checkout-path-independent canonical form.
 *
 * tsc's own diagnostic formatter sometimes renders full absolute paths
 * inside the message body itself (not just the leading `file(line,col):`
 * header) — most commonly in cross-module type-mismatch diagnostics shaped
 * like `import("/abs/path/to/repo/src/foo").SomeType`, but the same
 * mechanism can in principle appear in any message that mentions a type's
 * originating module. Since two checkouts of the identical commit differ
 * only in their absolute root path, a raw string comparison of `message`
 * would treat this as a brand-new diagnostic on every machine/CI path that
 * doesn't match wherever the baseline was generated — a false positive.
 *
 * Only paths that resolve to *inside* the current repo checkout are
 * rewritten (to `<repo>/relative/suffix`, POSIX-slashed). A path outside
 * the repo tree (e.g. a global cache path unrelated to this checkout) is
 * left untouched, so this never blanket-strips legitimate path text that a
 * diagnostic might reference. Nothing else about the message — TS code,
 * type names, property names, line/column — is touched.
 */
export function canonicalizeDiagnosticText(text, { cwd = process?.cwd?.() ?? '' } = {}) {
  const cwdNormalized = cwd.replace(/\\/g, '/');

  return text.replace(ABS_PATH_SEGMENT_RE, (match) => {
    // Normalize Windows drive-letter + backslash form to forward slashes so
    // the same repo-root-marker logic works for both platforms' rendering.
    let normalized = match.replace(/\\/g, '/');
    // Windows absolute path: `C:/foo/bar` -> strip the `C:` drive prefix
    // before marker matching (the drive letter carries no repo-relative
    // meaning once we know the path is inside this checkout).
    const isWindowsAbs = /^[A-Za-z]:\//.test(normalized);
    if (isWindowsAbs) normalized = normalized.slice(2);

    let relative = null;

    if (cwdNormalized && normalized.startsWith(`${cwdNormalized}/`)) {
      relative = normalized.slice(cwdNormalized.length + 1);
    } else {
      const markerMatch = REPO_ROOT_MARKER_RE.exec(normalized);
      if (markerMatch) relative = markerMatch[1];
    }

    // Not resolvable to inside this checkout (or not an absolute path at
    // all, e.g. a bare relative path that happened to match) — leave as-is.
    if (relative === null) return match;

    return `${CANONICAL_PREFIX}${relative}`;
  });
}

/** Builds the exact identity used for deterministic de-duplication and display. */
export function diagnosticIdentity(diagnostic) {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}:${diagnostic.code}:${diagnostic.message}`;
}

/**
 * Stable fingerprint used by the ratchet after exact matches are removed.
 * Line/column are deliberately excluded: unrelated edits can move a known
 * diagnostic without changing the underlying TypeScript debt. Multiplicity is
 * still enforced, so adding another identical diagnostic in the same file
 * increases the fingerprint count and fails the ratchet.
 */
export function diagnosticFingerprint(diagnostic) {
  return `${diagnostic.file}:${diagnostic.code}:${diagnostic.message}`;
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
 * Compares current diagnostics against the baseline. Exact identities match
 * first; remaining diagnostics may match a stable file/code/message fingerprint
 * so harmless line shifts do not become false regressions. Fingerprint counts
 * are enforced, so a newly duplicated diagnostic still fails.
 */
export function compareDiagnostics(currentDiagnostics, baselineDiagnostics) {
  const currentDeduped = dedupeDiagnostics(currentDiagnostics);
  const baselineDeduped = dedupeDiagnostics(baselineDiagnostics);

  // Match exact locations first. This preserves the strongest identity when
  // source positions did not move.
  const baselineExact = new Set(baselineDeduped.map(diagnosticIdentity));
  const currentExact = new Set(currentDeduped.map(diagnosticIdentity));
  const currentRemaining = currentDeduped.filter(
    (d) => !baselineExact.has(diagnosticIdentity(d)),
  );
  const baselineRemaining = baselineDeduped.filter(
    (d) => !currentExact.has(diagnosticIdentity(d)),
  );

  // Then match known diagnostics that merely moved because unrelated lines
  // were inserted/removed. Match as a multiset, not a plain Set: one known
  // diagnostic cannot grandfather two current diagnostics with the same
  // fingerprint.
  const baselineBuckets = new Map();
  for (const diagnostic of baselineRemaining) {
    const fingerprint = diagnosticFingerprint(diagnostic);
    const bucket = baselineBuckets.get(fingerprint) ?? [];
    bucket.push(diagnostic);
    baselineBuckets.set(fingerprint, bucket);
  }

  const newDiagnostics = [];
  for (const diagnostic of sortDiagnostics(currentRemaining)) {
    const fingerprint = diagnosticFingerprint(diagnostic);
    const bucket = baselineBuckets.get(fingerprint);
    if (bucket?.length) {
      bucket.shift();
    } else {
      newDiagnostics.push(diagnostic);
    }
  }

  const fixedDiagnostics = [];
  for (const bucket of baselineBuckets.values()) {
    fixedDiagnostics.push(...bucket);
  }

  return {
    pass: newDiagnostics.length === 0,
    newDiagnostics: sortDiagnostics(newDiagnostics),
    fixedDiagnostics: sortDiagnostics(fixedDiagnostics),
    currentCount: currentDeduped.length,
    baselineCount: baselineDeduped.length,
  };
}

/** Formats a single diagnostic identity for human-readable CLI output. */
export function formatDiagnostic(d) {
  return `${d.file}:${d.line}:${d.column} ${d.code} ${d.message}`;
}
