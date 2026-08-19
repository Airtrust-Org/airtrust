import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('production D1 backup drill script parses before the maintenance workflow invokes it', () => {
  const scriptPath = fileURLToPath(
    new URL('../production/backup-production-d1-readonly.mjs', import.meta.url),
  );

  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', scriptPath], { stdio: 'pipe' });
  });
});
