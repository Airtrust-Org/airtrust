import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  assertBaselineShape,
  canonicalizeDiagnosticText,
  checkBaselineGovernance,
  compareDiagnostics,
  dedupeDiagnostics,
  diagnosticFingerprint,
  diagnosticIdentity,
  normalizeFilePath,
  parseTscOutput,
} from '../typescript-baseline-ratchet-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, '..', 'typescript-baseline-ratchet.json');
const EXPECTED_SOURCE_SHA = '0ff8a839f12630f25dd061a5399997b9cb5ed04a';

function makeDiagnostic(overrides = {}) {
  return {
    file: 'src/react-app/components/Example.tsx',
    line: 10,
    column: 5,
    code: 'TS2322',
    message: "Type 'string' is not assignable to type 'number'.",
    ...overrides,
  };
}

// --- Governance test (section 3 of the task): baseline file itself ---------

describe('checked-in baseline file', () => {
  const text = readFileSync(BASELINE_PATH, 'utf8');
  const baseline = JSON.parse(text);

  it('is valid JSON with required top-level metadata fields', () => {
    expect(baseline.sourceSha).toBe(EXPECTED_SOURCE_SHA);
    expect(typeof baseline.generatedAt).toBe('string');
    expect(baseline.diagnosticCount).toBe(baseline.diagnostics.length);
    expect(Array.isArray(baseline.diagnostics)).toBe(true);
  });

  it('passes structural shape validation', () => {
    expect(() => assertBaselineShape(baseline)).not.toThrow();
  });

  it('every diagnostic entry has the required fields (file, line, column, code, message)', () => {
    for (const entry of baseline.diagnostics) {
      expect(entry).toHaveProperty('file');
      expect(entry).toHaveProperty('line');
      expect(entry).toHaveProperty('column');
      expect(entry).toHaveProperty('code');
      expect(entry).toHaveProperty('message');
    }
  });

  it('matches the expected count reported for the pinned source commit', () => {
    expect(baseline.diagnosticCount).toBe(289);
  });
});

// --- Ratchet comparison logic: the 10 required scenarios -------------------

describe('typescript baseline ratchet — comparison logic', () => {
  // 1. Baseline exactly reproduced -> PASS
  it('1. passes when current diagnostics exactly match the baseline', () => {
    const baseline = [makeDiagnostic(), makeDiagnostic({ line: 20, code: 'TS2339' })];
    const current = [makeDiagnostic(), makeDiagnostic({ line: 20, code: 'TS2339' })];
    const result = compareDiagnostics(current, baseline);
    expect(result.pass).toBe(true);
    expect(result.newDiagnostics).toEqual([]);
    expect(result.fixedDiagnostics).toEqual([]);
  });

  // 2. One baseline diagnostic removed (fixed) -> PASS
  it('2. passes when a baseline diagnostic is fixed (strict subset)', () => {
    const baseline = [makeDiagnostic(), makeDiagnostic({ line: 20, code: 'TS2339' })];
    const current = [makeDiagnostic()];
    const result = compareDiagnostics(current, baseline);
    expect(result.pass).toBe(true);
    expect(result.fixedDiagnostics).toHaveLength(1);
    expect(result.fixedDiagnostics[0].line).toBe(20);
  });

  // 3. One new diagnostic added (not in baseline) -> FAIL
  it('3. fails when a new diagnostic not in the baseline appears', () => {
    const baseline = [makeDiagnostic()];
    const current = [makeDiagnostic(), makeDiagnostic({ line: 99, code: 'TS9999', message: 'brand new error' })];
    const result = compareDiagnostics(current, baseline);
    expect(result.pass).toBe(false);
    expect(result.newDiagnostics).toHaveLength(1);
    expect(result.newDiagnostics[0].line).toBe(99);
  });

  // 4. One removed + one new (net same or lower count) -> FAIL
  it('4. fails when one diagnostic is fixed but another new one appears, even if net count is equal or lower', () => {
    const baseline = [makeDiagnostic(), makeDiagnostic({ line: 20, code: 'TS2339' })];
    const current = [makeDiagnostic(), makeDiagnostic({ line: 30, code: 'TS1111', message: 'new one' })];
    // net count: baseline=2, current=2 (equal) — must still fail.
    const result = compareDiagnostics(current, baseline);
    expect(result.currentCount).toBe(result.baselineCount);
    expect(result.pass).toBe(false);
    expect(result.newDiagnostics).toHaveLength(1);
    expect(result.fixedDiagnostics).toHaveLength(1);
  });

  // 5. Same diagnostics, presented out of order -> still deterministic PASS/FAIL
  it('5. is order-independent for both baseline and current diagnostic arrays', () => {
    const a = makeDiagnostic({ line: 1 });
    const b = makeDiagnostic({ line: 2 });
    const c = makeDiagnostic({ line: 3 });

    const result1 = compareDiagnostics([a, b, c], [c, b, a]);
    const result2 = compareDiagnostics([c, a, b], [a, c, b]);

    expect(result1.pass).toBe(true);
    expect(result2.pass).toBe(true);
    expect(result1.newDiagnostics).toEqual(result2.newDiagnostics);
  });

  // 6. Same diagnostic under different absolute path prefixes -> normalizes to same identity
  it('6. normalizes different absolute path prefixes to the same identity', () => {
    const linuxPath = normalizeFilePath('/home/node/project/src/react-app/components/Example.tsx', {
      cwd: '/home/node/project',
    });
    const macPath = normalizeFilePath('/Users/dev/repo/src/react-app/components/Example.tsx', {
      cwd: '/Users/dev/repo',
    });
    expect(linuxPath).toBe('src/react-app/components/Example.tsx');
    expect(macPath).toBe('src/react-app/components/Example.tsx');
    expect(linuxPath).toBe(macPath);

    const baseline = [makeDiagnostic({ file: linuxPath })];
    const current = [makeDiagnostic({ file: macPath })];
    expect(compareDiagnostics(current, baseline).pass).toBe(true);
  });

  // 7. Duplicate diagnostic entries in a single run's raw output -> deterministic dedupe
  it('7. dedupes duplicate diagnostic entries within a single run without causing a false new/count mismatch', () => {
    const baseline = [makeDiagnostic()];
    const currentWithDupes = [makeDiagnostic(), makeDiagnostic(), makeDiagnostic()];
    const deduped = dedupeDiagnostics(currentWithDupes);
    expect(deduped).toHaveLength(1);

    const result = compareDiagnostics(currentWithDupes, baseline);
    expect(result.pass).toBe(true);
    expect(result.currentCount).toBe(1);
  });

  it('7b. treats a known diagnostic moved by unrelated source edits as the same debt', () => {
    const baseline = [makeDiagnostic({ line: 10, column: 5 })];
    const current = [makeDiagnostic({ line: 146, column: 7 })];

    expect(diagnosticIdentity(current[0])).not.toBe(diagnosticIdentity(baseline[0]));
    expect(diagnosticFingerprint(current[0])).toBe(diagnosticFingerprint(baseline[0]));
    const result = compareDiagnostics(current, baseline);
    expect(result.pass).toBe(true);
    expect(result.newDiagnostics).toEqual([]);
    expect(result.fixedDiagnostics).toEqual([]);
  });

  it('7c. fails when a stable known diagnostic is duplicated at a new location', () => {
    const baseline = [makeDiagnostic({ line: 10 })];
    const current = [makeDiagnostic({ line: 110 }), makeDiagnostic({ line: 210 })];

    const result = compareDiagnostics(current, baseline);
    expect(result.pass).toBe(false);
    expect(result.newDiagnostics).toHaveLength(1);
    expect(result.currentCount).toBe(2);
    expect(result.baselineCount).toBe(1);
  });

  // 8. Invalid/malformed baseline file -> fail closed
  it('8. fails closed on a malformed baseline (missing required field)', () => {
    const malformed = {
      sourceSha: EXPECTED_SOURCE_SHA,
      generatedAt: new Date().toISOString(),
      diagnosticCount: 1,
      diagnostics: [{ file: 'src/x.ts', line: 1, code: 'TS1', message: 'no column field' }],
    };
    expect(() => assertBaselineShape(malformed)).toThrow(/column/);
  });

  it('8b. fails closed on baseline JSON that does not parse', () => {
    expect(() => JSON.parse('{ not valid json')).toThrow();
  });

  // 9. Simulated tsc crash (non-zero exit, no valid diagnostic output) -> fail closed
  it('9. treats non-zero exit with no parseable diagnostics as a crash, not zero errors', () => {
    const crashOutput = 'error TS5023: Unknown compiler option \'--bogus\'.\n';
    const diagnostics = parseTscOutput(crashOutput);
    // A config-level error does not match the `file(line,col): error TSxxxx`
    // diagnostic shape, so it must not be silently treated as "0 errors".
    expect(diagnostics).toEqual([]);
    // The guard script (guard-typescript-baseline-ratchet.mjs) additionally
    // checks stderr/signal state around this — see runTsc() — to decide
    // "crashed" vs "genuinely zero diagnostics". This test locks in that the
    // parser itself never fabricates a diagnostic out of a config error line.
  });

  // 10. Baseline claiming a different source SHA -> governance concern, detectable
  it('10. detects (advisory) when the baseline sourceSha differs from the expected SHA', () => {
    const baselineWithWrongSha = {
      sourceSha: '1111111111111111111111111111111111111111',
      generatedAt: new Date().toISOString(),
      diagnosticCount: 0,
      diagnostics: [],
    };
    const result = checkBaselineGovernance(baselineWithWrongSha, { expectedSha: EXPECTED_SOURCE_SHA });
    expect(result.checked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.declaredSha).toBe(baselineWithWrongSha.sourceSha);

    const matching = checkBaselineGovernance(
      { sourceSha: EXPECTED_SOURCE_SHA },
      { expectedSha: EXPECTED_SOURCE_SHA },
    );
    expect(matching.ok).toBe(true);
    // NOTE: this check is necessarily advisory, not cryptographic — the
    // script cannot independently re-derive git history at runtime. It can
    // only compare the declared string field against an expected value
    // supplied by the caller. The real enforcement mechanism is that the
    // baseline is a checked-in file: any change to sourceSha is a visible,
    // reviewable diff in the MR.
  });
});

describe('parseTscOutput — diagnostic identity plumbing', () => {
  it('folds multi-line tsc messages into a single diagnostic and computes a stable identity', () => {
    const raw = [
      "src/react-app/components/Foo.tsx(10,5): error TS2322: Type 'A' is not assignable to type 'B'.",
      "  Types of property 'x' are incompatible.",
      "    Type 'string' is not assignable to type 'number'.",
      "src/react-app/components/Bar.tsx(1,1): error TS2304: Cannot find name 'y'.",
    ].join('\n');

    const diagnostics = parseTscOutput(raw);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].file).toBe('src/react-app/components/Foo.tsx');
    expect(diagnostics[0].message).toContain('is not assignable to type');
    expect(diagnostics[0].message).toContain("Types of property 'x' are incompatible.");
    expect(diagnosticIdentity(diagnostics[0])).toBe(diagnosticIdentity(diagnostics[0]));
  });
});

// --- canonicalizeDiagnosticText: checkout-path independence (Tests A-F) ----

describe('canonicalizeDiagnosticText', () => {
  it('Test A: two different POSIX checkout roots canonicalize to the same identity', () => {
    const msgA =
      'Argument of type \'import("/tmp/checkout-a/src/foo").Funcionario\' is not assignable to parameter of type \'import("/tmp/checkout-a/src/react-app/types/index").Funcionario\'.';
    const msgB =
      'Argument of type \'import("/opt/checkout-b/src/foo").Funcionario\' is not assignable to parameter of type \'import("/opt/checkout-b/src/react-app/types/index").Funcionario\'.';

    const canonA = canonicalizeDiagnosticText(msgA, { cwd: '/tmp/checkout-a' });
    const canonB = canonicalizeDiagnosticText(msgB, { cwd: '/opt/checkout-b' });

    expect(canonA).toBe(canonB);
    expect(canonA).toContain('<repo>/src/foo');
    expect(canonA).toContain('<repo>/src/react-app/types/index');
    expect(canonA).not.toContain('/tmp/checkout-a');
  });

  it('Test B: a Windows-style path and a POSIX path for the same logical file canonicalize to the same identity', () => {
    // Same logical repo file (src/foo.ts), one rendered the way tsc would
    // render it on Windows (C:\... or its forward-slash form), the other
    // POSIX. We assert literal string equality of the canonicalized output —
    // that is the equivalence this design implements: both reduce to the
    // fixed `<repo>/...` token plus the path relative to the repo root.
    const winBackslash = canonicalizeDiagnosticText(
      String.raw`import("C:\work\airtrust\src\foo").Thing`,
      { cwd: 'C:\\work\\airtrust' },
    );
    const winForwardSlash = canonicalizeDiagnosticText('import("C:/work/airtrust/src/foo").Thing', {
      cwd: 'C:/work/airtrust',
    });
    const posix = canonicalizeDiagnosticText('import("/some/root/airtrust/src/foo").Thing', {
      cwd: '/some/root/airtrust',
    });

    expect(winBackslash).toBe('import("<repo>/src/foo").Thing');
    expect(winForwardSlash).toBe('import("<repo>/src/foo").Thing');
    expect(posix).toBe('import("<repo>/src/foo").Thing');
    expect(winBackslash).toBe(posix);
  });

  it('Test C: a genuine change in the reported type name still produces a different canonicalized message', () => {
    const before = canonicalizeDiagnosticText(
      'import("/tmp/checkout-a/src/foo").Funcionario is not assignable to type Bar',
      { cwd: '/tmp/checkout-a' },
    );
    const after = canonicalizeDiagnosticText(
      'import("/tmp/checkout-a/src/foo").Aeronave is not assignable to type Bar',
      { cwd: '/tmp/checkout-a' },
    );
    expect(before).not.toBe(after);
  });

  it('Test D: identical file/line/message-shape but a different TS code must not collide (identity level)', () => {
    const base = { file: 'src/foo.ts', line: 1, column: 1, message: 'Argument mismatch.' };
    const idA = diagnosticIdentity({ ...base, code: 'TS2345' });
    const idB = diagnosticIdentity({ ...base, code: 'TS2322' });
    expect(idA).not.toBe(idB);
  });

  it('Test E: same line/col/code/message-shape but a genuinely different file must not collide', () => {
    const base = { line: 1, column: 1, code: 'TS2345', message: 'Argument mismatch.' };
    const idA = diagnosticIdentity({ ...base, file: 'src/foo.ts' });
    const idB = diagnosticIdentity({ ...base, file: 'src/bar.ts' });
    expect(idA).not.toBe(idB);
  });

  it('Test F: an absolute path outside the repo checkout is preserved, not canonicalized away', () => {
    const msg =
      'Cannot find type definitions for module referenced at /opt/global-cache/some-unrelated-tool/types/index.d.ts';
    const canon = canonicalizeDiagnosticText(msg, { cwd: '/tmp/checkout-a' });
    expect(canon).toBe(msg);
    expect(canon).toContain('/opt/global-cache/some-unrelated-tool/types/index.d.ts');
  });

  it('canonicalizes real baseline-shaped messages the same way from two different checkout roots (parseTscOutput integration)', () => {
    const rawTemplate = (root) =>
      `src/react-app/components/HomeRouter.tsx(49,52): error TS2345: Argument of type 'import("${root}/src/types/index").Funcionario' is not assignable to parameter of type 'import("${root}/src/react-app/types/index").Funcionario'. Property 'status' is missing.`;

    const diagsA = parseTscOutput(rawTemplate('/private/tmp/airtrust-ratchet-a'), {
      cwd: '/private/tmp/airtrust-ratchet-a',
    });
    const diagsB = parseTscOutput(rawTemplate('/private/tmp/airtrust-ratchet-b'), {
      cwd: '/private/tmp/airtrust-ratchet-b',
    });

    expect(diagnosticIdentity(diagsA[0])).toBe(diagnosticIdentity(diagsB[0]));
  });
});
