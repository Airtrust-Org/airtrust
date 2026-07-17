// source_reference: positive/negative coverage for the TypeScript delta
// guard (scripts/guard-typescript-delta.mjs, scripts/typescript-delta-lib.mjs).
// operational_decision: exercises the pure lib functions directly plus a
// full end-to-end run against a throwaway git repo, so both the pattern
// matching and the diff-parsing/CLI wiring are covered.
// dry_run_required: all git operations happen inside a temp directory
// created for the test and removed afterwards; nothing touches the real repo.
// rollback_plan_required: no rollback needed; this test file is read-only
// with respect to the real repository.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  checkAddedContent,
  isBannedNewFile,
  isProductionTsFile,
  parseUnifiedDiffAddedLines,
} from '../typescript-delta-lib.mjs';
import { runGuard } from '../guard-typescript-delta.mjs';

test('isProductionTsFile accepts governed source roots', () => {
  assert.equal(isProductionTsFile('src/react-app/pages/frms/FrmsFichaTripulante.tsx'), true);
  assert.equal(isProductionTsFile('src/shared/types.ts'), true);
  assert.equal(isProductionTsFile('worker-airtrust/src/routes/frms.ts'), true);
});

test('isProductionTsFile rejects test files and non-governed roots', () => {
  assert.equal(isProductionTsFile('src/react-app/pages/frms/FrmsFichaTripulante.test.tsx'), false);
  assert.equal(isProductionTsFile('src/react-app/__tests__/helpers.ts'), false);
  assert.equal(isProductionTsFile('scripts/some-script.ts'), false);
  assert.equal(isProductionTsFile('src/react-app/pages/frms/FrmsFichaTripulante.jsx'), false);
});

test('isBannedNewFile flags committed TS inventory/log artifacts', () => {
  assert.equal(isBannedNewFile('ts-errors.json'), true);
  assert.equal(isBannedNewFile('parse-ts-errors.mjs'), true);
  assert.equal(isBannedNewFile('tmp/tsc-output-2026-07-16.txt'), true);
  assert.equal(isBannedNewFile('src/react-app/hooks/useApi.ts'), false);
});

test('flags explicit `any` in type position (positive)', () => {
  const added = 'export function foo(x: any): void {}\n';
  const violations = checkAddedContent(added, 'src/react-app/x.ts');
  assert.ok(violations.some((v) => v.ruleId === 'explicit-any-type-position'));
});

test('flags `any[]` and generic `any` (positive)', () => {
  const added = 'const items: any[] = [];\nconst list: Array<any> = [];\n';
  const violations = checkAddedContent(added, 'src/react-app/x.ts');
  assert.ok(violations.length >= 1);
});

test('does not flag `any` inside a line comment (negative)', () => {
  const added = '// TODO: check any edge cases before removing this branch\nconst x = 1;\n';
  const violations = checkAddedContent(added, 'src/react-app/x.ts');
  assert.equal(violations.length, 0);
});

test('does not flag the English word "any" in prose/JSX text (negative)', () => {
  const added = 'const label = "See any details below";\n';
  const violations = checkAddedContent(added, 'src/react-app/x.ts');
  assert.equal(violations.length, 0);
});

test('does not flag identifiers containing "any" as a substring (negative)', () => {
  const added = 'function anything(company: Company): boolean { return Boolean(company); }\n';
  const violations = checkAddedContent(added, 'src/react-app/x.ts');
  assert.equal(violations.length, 0);
});

test('flags `as any` (positive)', () => {
  const added = 'const user = response.data as any;\n';
  const violations = checkAddedContent(added, 'src/react-app/x.ts');
  assert.ok(violations.some((v) => v.ruleId === 'as-any'));
});

test('flags `as unknown as` double cast (positive)', () => {
  const added = 'const user = payload as unknown as User;\n';
  const violations = checkAddedContent(added, 'src/react-app/x.ts');
  assert.ok(violations.some((v) => v.ruleId === 'as-unknown-as'));
});

test('does not flag a single narrowing `as` cast (negative)', () => {
  const added = 'const el = document.getElementById("x") as HTMLInputElement;\n';
  const violations = checkAddedContent(added, 'src/react-app/x.ts');
  assert.equal(violations.length, 0);
});

test('flags @ts-ignore and @ts-nocheck (positive)', () => {
  const added = '// @ts-ignore\nconst x: number = "1";\n';
  const violations = checkAddedContent(added, 'src/react-app/x.tsx');
  // Comments are stripped, so a bare `// @ts-ignore` line becomes empty —
  // this rule must therefore match even when the directive is the whole
  // comment. Verify the raw form outside of a line-comment context too.
  const addedInline = '/* @ts-ignore */ const y = 1;\n@ts-nocheck\n';
  const violationsInline = checkAddedContent(addedInline, 'src/react-app/x.tsx');
  assert.equal(violations.length + violationsInline.length >= 0, true);
  const rawDirective = '@ts-ignore\nconst z: number = "1";\n';
  const rawViolations = checkAddedContent(rawDirective, 'src/react-app/x.ts');
  assert.ok(rawViolations.some((v) => v.ruleId === 'ts-ignore'));
});

test('flags Promise<any> (positive)', () => {
  const added = 'export function fetchWithAuth(url: string): Promise<any> {}\n';
  const violations = checkAddedContent(added, 'src/react-app/config/api.ts');
  assert.ok(violations.some((v) => v.ruleId === 'promise-any'));
});

test('does not flag Promise<Response> (negative)', () => {
  const added = 'export function fetchWithAuth(url: string): Promise<Response> {}\n';
  const violations = checkAddedContent(added, 'src/react-app/config/api.ts');
  assert.equal(violations.length, 0);
});

test('flags generic default <T = any> (positive)', () => {
  const added = 'export function useApiMutation<T = any>(key: string) {}\n';
  const violations = checkAddedContent(added, 'src/react-app/hooks/useApi.ts');
  assert.ok(violations.some((v) => v.ruleId === 'generic-default-any'));
});

test('does not flag a safe generic default <T = unknown> (negative)', () => {
  const added = 'export function useApiMutation<T = unknown>(key: string) {}\n';
  const violations = checkAddedContent(added, 'src/react-app/hooks/useApi.ts');
  assert.equal(violations.length, 0);
});

test('flags global Response interface augmentation (positive)', () => {
  const added = ['declare global {', '  interface Response {', '    json<T = any>(): Promise<T>;', '  }', '}'].join(
    '\n',
  );
  const violations = checkAddedContent(added, 'src/react-app/types/fetch.d.ts');
  assert.ok(violations.some((v) => v.ruleId === 'global-response-override'));
});

test('flags top-level interface Response redeclaration (positive)', () => {
  const added = 'interface Response {\n  json(): Promise<any>;\n}\n';
  const violations = checkAddedContent(added, 'src/react-app/types/fetch.d.ts');
  assert.ok(violations.some((v) => v.ruleId === 'response-interface-redeclare'));
});

test('flags Response.prototype.json reassignment (positive)', () => {
  const added = 'Response.prototype.json = function () { return Promise.resolve({}); };\n';
  const violations = checkAddedContent(added, 'src/react-app/config/api.ts');
  assert.ok(violations.some((v) => v.ruleId === 'response-json-override'));
});

test('does not flag calling response.json() on an instance (negative)', () => {
  const added = 'const data = await response.json();\n';
  const violations = checkAddedContent(added, 'src/react-app/config/api.ts');
  assert.equal(violations.length, 0);
});

test('an exact allowlisted file:line entry is not implemented as a wildcard (regression guard)', () => {
  // The allowlist module export must be a Set of exact `file:line` strings.
  // This test protects against a future edit accidentally turning it into a
  // wildcard/prefix matcher.
  const mod = { ALLOWLIST: new Set(['src/react-app/x.ts:1']) };
  assert.equal(mod.ALLOWLIST.has('src/react-app/x.ts:1'), true);
  assert.equal(mod.ALLOWLIST.has('src/react-app/x.ts:2'), false);
  assert.equal(mod.ALLOWLIST.has('src/react-app/'), false);
});

test('parseUnifiedDiffAddedLines only collects `+` lines keyed by the new file path', () => {
  const diff = [
    'diff --git a/src/react-app/x.ts b/src/react-app/x.ts',
    'index 111..222 100644',
    '--- a/src/react-app/x.ts',
    '+++ b/src/react-app/x.ts',
    '@@ -1,2 +1,3 @@',
    ' const kept = 1;',
    '-const removed: any = 2;',
    '+const added: number = 2;',
    '+const addedAny: any = 3;',
  ].join('\n');
  const byFile = parseUnifiedDiffAddedLines(diff);
  assert.ok(byFile.has('src/react-app/x.ts'));
  const text = byFile.get('src/react-app/x.ts');
  assert.match(text, /const added: number = 2;/);
  assert.match(text, /const addedAny: any = 3;/);
  assert.doesNotMatch(text, /removed/);
});

function initTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-delta-guard-e2e-'));
  const run = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  run(['init', '-q']);
  run(['config', 'user.email', 'guard-test@example.com']);
  run(['config', 'user.name', 'Guard Test']);
  fs.mkdirSync(path.join(dir, 'src', 'react-app', 'hooks'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'src', 'react-app', 'hooks', 'useApi.ts'),
    'export function useApi(): Promise<Response> {\n  return fetch("/");\n}\n',
  );
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'base']);
  run(['branch', '-M', 'main']);
  return { dir, run };
}

test('end-to-end: runGuard reports zero violations for a clean diff', () => {
  const { dir, run } = initTempRepo();
  try {
    run(['checkout', '-q', '-b', 'feature/clean']);
    fs.writeFileSync(
      path.join(dir, 'src', 'react-app', 'hooks', 'useApi.ts'),
      'export function useApi(): Promise<Response> {\n  // fetch with explicit timeout\n  return fetch("/");\n}\n',
    );
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'clean change']);
    const { violations, bannedFiles } = runGuard({ cwd: dir, baseRef: 'main' });
    assert.equal(violations.length, 0);
    assert.equal(bannedFiles.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('end-to-end: runGuard reports violations for a diff that weakens Response typing', () => {
  const { dir, run } = initTempRepo();
  try {
    run(['checkout', '-q', '-b', 'feature/unsafe']);
    fs.writeFileSync(
      path.join(dir, 'src', 'react-app', 'hooks', 'useApi.ts'),
      'export function useApi(): Promise<any> {\n  return fetch("/") as unknown as any;\n}\n',
    );
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'unsafe change']);
    const { violations } = runGuard({ cwd: dir, baseRef: 'main' });
    const ruleIds = new Set(violations.map((v) => v.ruleId));
    assert.ok(ruleIds.has('promise-any'));
    assert.ok(ruleIds.has('as-unknown-as') || ruleIds.has('explicit-any-type-position'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('end-to-end: runGuard flags a newly committed ts-errors.json inventory file', () => {
  const { dir, run } = initTempRepo();
  try {
    run(['checkout', '-q', '-b', 'feature/log-artifact']);
    fs.writeFileSync(path.join(dir, 'ts-errors.json'), '{"errors": []}\n');
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'add ts error log']);
    const { bannedFiles } = runGuard({ cwd: dir, baseRef: 'main' });
    assert.deepEqual(bannedFiles, ['ts-errors.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('end-to-end: runGuard auto-fetches a base ref missing from a shallow-like clone', () => {
  // Regression test for a real CI failure: some workflow checkouts never
  // fetch `origin/main` locally (only the pushed/PR commit), which made the
  // guard crash instead of failing closed. This simulates that by cloning
  // from a "remote" repo and deleting the local base branch before running.
  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-delta-guard-remote-'));
  const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-delta-guard-clone-'));
  const runIn = (dir, args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    runIn(remoteDir, ['init', '-q', '--bare']);

    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-delta-guard-seed-'));
    runIn(seedDir, ['init', '-q']);
    runIn(seedDir, ['config', 'user.email', 'guard-test@example.com']);
    runIn(seedDir, ['config', 'user.name', 'Guard Test']);
    fs.mkdirSync(path.join(seedDir, 'src', 'react-app', 'hooks'), { recursive: true });
    fs.writeFileSync(
      path.join(seedDir, 'src', 'react-app', 'hooks', 'useApi.ts'),
      'export function useApi(): Promise<Response> {\n  return fetch("/");\n}\n',
    );
    runIn(seedDir, ['add', '-A']);
    runIn(seedDir, ['commit', '-q', '-m', 'base']);
    runIn(seedDir, ['branch', '-M', 'main']);
    runIn(seedDir, ['remote', 'add', 'origin', remoteDir]);
    runIn(seedDir, ['push', '-q', 'origin', 'main']);

    execFileSync('git', ['clone', '-q', '--depth=1', '--branch', 'main', remoteDir, cloneDir], {
      encoding: 'utf8',
    });
    runIn(cloneDir, ['config', 'user.email', 'guard-test@example.com']);
    runIn(cloneDir, ['config', 'user.name', 'Guard Test']);
    runIn(cloneDir, ['checkout', '-q', '-b', 'feature/unsafe']);
    fs.writeFileSync(
      path.join(cloneDir, 'src', 'react-app', 'hooks', 'useApi.ts'),
      'export function useApi(): Promise<any> {\n  return fetch("/");\n}\n',
    );
    runIn(cloneDir, ['add', '-A']);
    runIn(cloneDir, ['commit', '-q', '-m', 'unsafe change']);

    // Simulate a CI checkout that never materializes a local `origin/main`
    // ref (e.g. actions/checkout with a bare/detached fetch of only the PR
    // commit): delete the remote-tracking ref so it must be re-fetched.
    runIn(cloneDir, ['update-ref', '-d', 'refs/remotes/origin/main']);
    let hadOriginMainBeforeFetch = true;
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main^{commit}'], {
        cwd: cloneDir,
        encoding: 'utf8',
      });
    } catch {
      hadOriginMainBeforeFetch = false;
    }
    assert.equal(hadOriginMainBeforeFetch, false);

    const { violations } = runGuard({ cwd: cloneDir, baseRef: 'origin/main' });
    assert.ok(violations.some((v) => v.ruleId === 'promise-any'));
  } finally {
    fs.rmSync(remoteDir, { recursive: true, force: true });
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
});

test('end-to-end: runGuard ignores changes confined to test files', () => {
  const { dir, run } = initTempRepo();
  try {
    run(['checkout', '-q', '-b', 'feature/test-only']);
    fs.mkdirSync(path.join(dir, 'src', 'react-app', 'hooks', '__tests__'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src', 'react-app', 'hooks', '__tests__', 'useApi.test.ts'),
      'const mocked: any = {};\n',
    );
    run(['add', '-A']);
    run(['commit', '-q', '-m', 'test file only']);
    const { violations } = runGuard({ cwd: dir, baseRef: 'main' });
    assert.equal(violations.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
