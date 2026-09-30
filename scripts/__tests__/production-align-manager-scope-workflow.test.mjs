import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-align-manager-scope.yml', 'utf8');

test('production manager-scope workflow uses canonical production identity and persisted names', () => {
  assert.match(workflow, /PROD_EMAIL: \$\{\{ secrets\.PROD_SMOKE_EMAIL \|\| secrets\.QA_EXAMINER_ADMIN_EMAIL \}\}/);
  assert.match(workflow, /PROD_PASSWORD: \$\{\{ secrets\.PROD_SMOKE_PASSWORD \|\| secrets\.QA_EXAMINER_ADMIN_PASSWORD \}\}/);
  assert.match(workflow, /REFERENCE_NAME: Yngrid/);
  assert.match(workflow, /TARGET_NAMES: Giancarlo,Emyle,Layla,Mirela Silva/);
});
