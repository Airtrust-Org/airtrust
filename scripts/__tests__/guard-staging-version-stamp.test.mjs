import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('guard:staging-version-stamp', () => {
  it('passes against the current repository layout', () => {
    const result = spawnSync('node', ['scripts/guard-staging-version-stamp.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /OK: guard:staging-version-stamp/);
  });
});
