// source_reference: pure helpers for the TypeScript type-safety delta guard.
// operational_decision: only analyzes lines ADDED by a diff (never pre-existing
// legacy code), so the 344-error legacy baseline is not required to be clean
// before this guard can be turned on as a required check.
// dry_run_required: all functions here are pure and file-system free except
// isBannedNewFile/isProductionTsFile which only inspect a path string.
// rollback_plan_required: no rollback needed; read-only static analysis.

/**
 * Allowlist of exact `file:line` entries that are permitted to contain a
 * pattern that would otherwise be rejected. Must be justified with a comment
 * immediately above the entry. Never use wildcards. Never allowlist AirTrust
 * first-party production logic — only for cases where a third-party type
 * definition file forces a shape we do not control.
 *
 * (Intentionally empty. Add entries only with an inline justification.)
 */
export const ALLOWLIST = new Set([
  // Vite injects import.meta.env.VITE_API_URL at build time via `define`.
  // TypeScript does not know about this injected property, so the only way
  // to read it without a ts-ignore is a double cast through unknown.
  // This is a Vite convention, not an AirTrust pattern.
  // Line numbers are diff-relative (index in added lines), not file-absolute.
  'src/react-app/config/api.ts:12', // resolveScormRuntimeBaseUrl — import.meta as unknown as { env?: { VITE_API_URL?: string } }
]);

const PRODUCTION_DIR_PATTERNS = [/^src\/react-app\//, /^src\/shared\//, /^worker-airtrust\/src\//];

const EXCLUDED_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /(^|\/)__tests__\//,
  /(^|\/)__mocks__\//,
  /(^|\/)test-utils\//,
  /(^|\/)tests\//,
];

/**
 * Returns true if `filePath` is production TypeScript/TSX under one of the
 * governed source roots (frontend app, shared contracts, worker source),
 * excluding test/mocks files.
 */
export function isProductionTsFile(filePath) {
  if (!/\.(ts|tsx)$/.test(filePath)) return false;
  if (!PRODUCTION_DIR_PATTERNS.some((re) => re.test(filePath))) return false;
  if (EXCLUDED_FILE_PATTERNS.some((re) => re.test(filePath))) return false;
  return true;
}

const BANNED_NEW_FILE_PATTERNS = [
  /(^|\/)ts-errors\.json$/i,
  /(^|\/)ts-errors[^/]*\.(json|txt|log)$/i,
  /(^|\/)tsc-?output[^/]*\.(json|txt|log)$/i,
  /(^|\/)compile-?log[^/]*\.(json|txt|log)$/i,
  /(^|\/)parse-ts-errors\.mjs$/i,
  /\.tsbuildinfo$/i,
  /(^|\/)typecheck-report[^/]*\.(json|txt|log)$/i,
];

/** Returns true if adding this file path is itself a violation (TS log/inventory artifact). */
export function isBannedNewFile(filePath) {
  return BANNED_NEW_FILE_PATTERNS.some((re) => re.test(filePath));
}

/**
 * Strips `//` line comments and `/* ... *\/` block comments from a blob of
 * added-line text so that discussing a forbidden pattern in prose (e.g.
 * "// TODO: remove the `any` cast here") does not trigger a false positive.
 * This is a best-effort stripper (not a full TS parser): it does not try to
 * distinguish comment markers inside string/template literals. That is an
 * acceptable trade-off for a delta guard whose false negatives are far less
 * risky than false positives that would train authors to ignore the guard.
 */
export function stripComments(text) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat(countNewlines(m)));
  out = out.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return out;
}

function countNewlines(s) {
  let n = 0;
  for (const ch of s) if (ch === '\n') n++;
  return n;
}

/**
 * Rule set. Each rule gets the comment-stripped added-text for a single file
 * and returns an array of { line, snippet } matches (line = 1-based line
 * number within the added-only text, which is intentionally NOT the real
 * file line number since we only ever see added lines — good enough to
 * locate the offending hunk in review).
 */
const RULES = [
  {
    id: 'explicit-any-type-position',
    message:
      'explicit `any` used in a type position (parameter, return, variable, generic, array, union)',
    // Matches `any` only when it appears where a type is expected: after `:`,
    // `<`, `,`, `(`, `|`, `&`, `=>`, or as `any[]` / `any,` / `any>` / `any)`.
    regex: /(?:[:<,(|&]|=>)\s*any\b(?!\w)|\bany\[\]|\bany(?=\s*[,>)])/g,
  },
  {
    id: 'as-any',
    message: '`as any` type assertion',
    regex: /\bas\s+any\b/g,
  },
  {
    id: 'as-unknown-as',
    message: '`as unknown as` double cast',
    regex: /\bas\s+unknown\s+as\b/g,
  },
  {
    id: 'ts-ignore',
    message: '`@ts-ignore` suppresses a real type error instead of fixing it',
    regex: /@ts-ignore\b/g,
  },
  {
    id: 'ts-nocheck',
    message: '`@ts-nocheck` disables type-checking for the whole file',
    regex: /@ts-nocheck\b/g,
  },
  {
    id: 'promise-any',
    message: '`Promise<any>` — an awaited value with no real type contract',
    regex: /\bPromise\s*<\s*any\s*>/g,
  },
  {
    id: 'generic-default-any',
    message: 'generic default `<T = any>` weakens every call site that omits the type argument',
    regex: /<\s*[A-Za-z_$][\w$]*\s*(?:extends\s+[^=<>]+)?=\s*any\s*>/g,
  },
  {
    id: 'global-response-override',
    message:
      'global `Response` interface/type augmentation weakens the DOM Response contract repo-wide',
    regex: /declare\s+global\s*\{[^}]*\binterface\s+Response\b/g,
    multiline: true,
  },
  {
    id: 'response-interface-redeclare',
    message:
      'top-level `interface Response` redeclaration merges into the global DOM Response type',
    regex: /^\s*interface\s+Response\b/gm,
  },
  {
    id: 'response-json-override',
    message:
      '`Response.prototype.json` / `Response.json` reassignment changes behavior for every fetch call in the app',
    regex: /\bResponse\.(?:prototype\.)?json\s*=(?!=)/g,
  },
];

/**
 * Runs all rules against the added-only (comment-stripped) text of one file.
 * `filePath` is used only to build allowlist keys and to compute an
 * approximate line number for the report.
 */
/**
 * Parses a unified diff (as produced by `git diff -U0`) into a Map of
 * filePath -> concatenated added-line text (each `+` line, marker stripped,
 * joined with `\n`). File header/hunk metadata lines are ignored. Deleted
 * lines are ignored entirely — this guard only cares about what a PR adds.
 */
export function parseUnifiedDiffAddedLines(diffText) {
  const result = new Map();
  let currentFile = null;
  const lines = diffText.split('\n');

  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      if (raw === '/dev/null') {
        currentFile = null;
      } else {
        currentFile = raw.startsWith('b/') ? raw.slice(2) : raw;
        if (!result.has(currentFile)) result.set(currentFile, []);
      }
      continue;
    }
    if (line.startsWith('--- ') || line.startsWith('diff --git ') || line.startsWith('index ')) {
      continue;
    }
    if (currentFile && line.startsWith('+') && !line.startsWith('+++')) {
      result.get(currentFile).push(line.slice(1));
    }
  }

  const out = new Map();
  for (const [file, addedLines] of result) {
    out.set(file, addedLines.join('\n'));
  }
  return out;
}

export function checkAddedContent(rawAddedText, filePath) {
  const stripped = stripComments(rawAddedText);
  const lines = stripped.split('\n');
  const violations = [];

  const pushViolation = (rule, lineNo, snippet) => {
    const key = `${filePath}:${lineNo}`;
    if (ALLOWLIST.has(key)) return;
    violations.push({
      ruleId: rule.id,
      message: rule.message,
      file: filePath,
      line: lineNo,
      snippet: snippet.trim().slice(0, 160),
    });
  };

  for (const rule of RULES) {
    if (rule.multiline) {
      // Cross-line constructs (e.g. `declare global { interface Response`)
      // cannot be caught by per-line scanning, so this branch matches
      // against the whole added-text blob and derives the line number from
      // the match offset.
      const re = new RegExp(rule.regex.source, rule.regex.flags);
      let match;
      while ((match = re.exec(stripped)) !== null) {
        const lineNo = stripped.slice(0, match.index).split('\n').length;
        pushViolation(rule, lineNo, match[0].split('\n')[0]);
        if (match.index === re.lastIndex) re.lastIndex++;
      }
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const re = new RegExp(rule.regex.source, rule.regex.flags);
      let match;
      while ((match = re.exec(line)) !== null) {
        pushViolation(rule, i + 1, line);
        if (match.index === re.lastIndex) re.lastIndex++;
      }
    }
  }

  return violations;
}
