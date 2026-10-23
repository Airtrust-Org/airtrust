import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const SHARED_STAGING_MUTEX = 'airtrust-staging-mutations-and-scorm-qa';

test('FRMS identity fixture QA shares the staging D1/deploy/SCORM mutex', () => {
  const frms = read('.github/workflows/staging-frms-auth-qa.yml');
  const stagingRelease = read('.github/workflows/deploy-staging.yml');

  assert.match(frms, new RegExp(`^concurrency:\\s*\\n\\s*group:\\s*${SHARED_STAGING_MUTEX}$`, 'm'));
  assert.match(frms, /^\s*cancel-in-progress:\s*false$/m);
  assert.match(stagingRelease, new RegExp(`^concurrency:\\s*\\n\\s*group:\\s*${SHARED_STAGING_MUTEX}$`, 'm'));
});
