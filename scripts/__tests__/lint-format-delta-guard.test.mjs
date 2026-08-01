import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveBaseRef, selectDeltaFiles } from '../guard-lint-format-delta.mjs';

function fixture(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'airtrust-lint-delta-'));
  for (const file of files) {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, 'fixture\n');
  }
  return root;
}

test('selects only supported existing files and deduplicates them', () => {
  const cwd = fixture(['src/a.ts', 'docs/a.md', 'assets/a.png']);
  const selected = selectDeltaFiles(
    ['src/a.ts', 'src/a.ts', 'docs/a.md', 'assets/a.png', 'src/deleted.ts'],
    cwd,
  );

  assert.deepEqual(selected.eslintFiles, ['src/a.ts']);
  assert.deepEqual(selected.prettierFiles, ['src/a.ts', 'docs/a.md']);
});

test('excludes generated dependency and build directories', () => {
  const cwd = fixture(['node_modules/pkg/a.js', 'dist/a.js', 'src/a.js']);
  const selected = selectDeltaFiles(
    ['node_modules/pkg/a.js', 'dist/a.js', 'src/a.js'],
    cwd,
  );

  assert.deepEqual(selected.eslintFiles, ['src/a.js']);
  assert.deepEqual(selected.prettierFiles, ['src/a.js']);
});

test('resolves explicit, environment and GitHub base refs in priority order', () => {
  assert.equal(
    resolveBaseRef({ GITHUB_BASE_REF: 'release' }, 'origin/custom'),
    'origin/custom',
  );
  assert.equal(
    resolveBaseRef(
      { GUARD_LINT_DELTA_BASE_REF: 'origin/develop', GITHUB_BASE_REF: 'main' },
      undefined,
    ),
    'origin/develop',
  );
  assert.equal(
    resolveBaseRef({ GITHUB_BASE_REF: 'release' }, undefined),
    'origin/release',
  );
  assert.equal(resolveBaseRef({}, undefined), 'origin/main');
});
