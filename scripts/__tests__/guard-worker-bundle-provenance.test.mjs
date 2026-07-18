import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const GUARD_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'guard-worker-bundle-provenance.mjs',
);

// Builds a minimal fake repo (real git repo, so `git ls-files` behaves
// correctly) with just enough structure for the guard to evaluate, then
// runs the guard against it via child process — exercising the real CLI
// entry point, not just an internal function.
function makeFakeRepo({
  trackBundleFile = false,
  gitignoreHasPatterns = true,
  deployScriptUsesMktemp = true,
  legacyPhraseInRuntimeFile = false,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-bundle-provenance-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });

  const gitignoreLines = gitignoreHasPatterns
    ? [
        'worker-airtrust/.tmp-worker-bundle/',
        'worker-airtrust/.tmp-worker-bundle-*/',
        'worker-airtrust/wrangler.*.tmp.toml',
      ]
    : ['node_modules/'];
  writeFileSync(join(dir, '.gitignore'), gitignoreLines.join('\n') + '\n');

  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(
    join(dir, 'scripts', 'deploy-example.sh'),
    deployScriptUsesMktemp
      ? '#!/usr/bin/env bash\nBUNDLE_DIR="$(mktemp -d ./.tmp-worker-bundle-XXXXXX)"\n'
      : '#!/usr/bin/env bash\nBUNDLE_DIR=./.tmp-worker-bundle\n',
  );

  mkdirSync(join(dir, 'worker-airtrust', 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'worker-airtrust', 'src', 'index.ts'),
    legacyPhraseInRuntimeFile
      ? "export const x = 'Rota disponível apenas em localhost.';\n"
      : "export const x = 'ok';\n",
  );

  if (trackBundleFile) {
    mkdirSync(join(dir, 'worker-airtrust', '.tmp-worker-bundle'), { recursive: true });
    writeFileSync(join(dir, 'worker-airtrust', '.tmp-worker-bundle', 'index.js'), 'stale');
  }

  execFileSync('git', ['add', '.'], { cwd: dir });
  if (trackBundleFile) {
    // Force-add despite .gitignore, simulating the exact incident condition.
    execFileSync('git', ['add', '-f', 'worker-airtrust/.tmp-worker-bundle/index.js'], { cwd: dir });
  }

  return dir;
}

function runGuard(cwd) {
  try {
    const output = execFileSync('node', [GUARD_SCRIPT], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, AIRTRUST_GUARD_ROOT: cwd },
    });
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('passes on a clean repo with no tracked bundle, correct .gitignore, and mktemp usage', () => {
  const dir = makeFakeRepo();
  try {
    const result = runGuard(dir);
    assert.equal(result.ok, true, result.output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fails when a worker bundle artifact is tracked (the exact 2026-07-18 incident condition)', () => {
  const dir = makeFakeRepo({ trackBundleFile: true });
  try {
    const result = runGuard(dir);
    assert.equal(result.ok, false);
    assert.match(result.output, /tracked files under a worker bundle temp dir/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fails when .gitignore is missing the bundle-dir patterns', () => {
  const dir = makeFakeRepo({ gitignoreHasPatterns: false });
  try {
    const result = runGuard(dir);
    assert.equal(result.ok, false);
    assert.match(result.output, /\.gitignore missing required pattern/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fails when a deploy script references the bundle dir without mktemp (reused/fixed outdir)', () => {
  const dir = makeFakeRepo({ deployScriptUsesMktemp: false });
  try {
    const result = runGuard(dir);
    assert.equal(result.ok, false);
    assert.match(result.output, /without using mktemp/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fails when the legacy 403 phrase appears in a tracked runtime file outside docs/tests', () => {
  const dir = makeFakeRepo({ legacyPhraseInRuntimeFile: true });
  try {
    const result = runGuard(dir);
    assert.equal(result.ok, false);
    assert.match(result.output, /legacy 403 phrase found in tracked runtime artifact/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
