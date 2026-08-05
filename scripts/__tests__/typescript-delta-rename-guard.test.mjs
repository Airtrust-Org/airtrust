// source_reference: regression coverage for rename/copy-aware TypeScript delta guards.
// operational_decision: compatibility extraction must not reclassify pre-existing
// legacy violations as new, while additions made in the copy remain guarded.
// dry_run_required: all git operations use an isolated temporary repository.
// rollback_plan_required: test-only file; no runtime or data effect.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runGuard } from '../guard-typescript-delta.mjs';

function createRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-delta-copy-'));
  const git = (args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
    });
  git(['init', '-q']);
  git(['config', 'user.email', 'guard-test@example.com']);
  git(['config', 'user.name', 'Guard Test']);
  fs.mkdirSync(path.join(dir, 'worker-airtrust', 'src', 'routes'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'worker-airtrust', 'src', 'routes', 'legacy.ts'),
    'export const legacy = (value: any) => value as unknown as string;\n',
  );
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'base']);
  git(['branch', '-M', 'main']);
  git(['checkout', '-q', '-b', 'feature/extract']);
  return { dir, git };
}

function extractCompatibilityCopy(dir) {
  const routes = path.join(dir, 'worker-airtrust', 'src', 'routes');
  fs.copyFileSync(path.join(routes, 'legacy.ts'), path.join(routes, 'legacy-compat.ts'));
  fs.writeFileSync(path.join(routes, 'legacy.ts'), "export { legacy } from './legacy-compat';\n");
}

test('compatibility copy does not reclassify pre-existing forbidden lines as new', () => {
  const { dir, git } = createRepo();
  try {
    extractCompatibilityCopy(dir);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'extract compatibility route']);

    const result = runGuard({ cwd: dir, baseRef: 'main' });
    assert.equal(result.violations.length, 0);
    assert.equal(result.bannedFiles.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compatibility copy still reports a forbidden line added in the extracted file', () => {
  const { dir, git } = createRepo();
  try {
    extractCompatibilityCopy(dir);
    fs.appendFileSync(
      path.join(dir, 'worker-airtrust', 'src', 'routes', 'legacy-compat.ts'),
      'export const newlyUnsafe: any = null;\n',
    );
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'extract and modify compatibility route']);

    const result = runGuard({ cwd: dir, baseRef: 'main' });
    assert.ok(
      result.violations.some((violation) => violation.ruleId === 'explicit-any-type-position'),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
