import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-align-manager-scope.yml', 'utf8');

test('production manager-scope workflow prioritizes production credentials', () => {
  assert.match(workflow, /PROD_EMAIL: \${{ secrets\.PROD_SMOKE_EMAIL \|\| secrets\.QA_EXAMINER_ADMIN_EMAIL }}/);
  assert.match(workflow, /PROD_PASSWORD: \${{ secrets\.PROD_SMOKE_PASSWORD \|\| secrets\.QA_EXAMINER_ADMIN_PASSWORD }}/);
  assert.doesNotMatch(workflow, /secrets\.QA_EXAMINER_ADMIN_EMAIL \|\| secrets\.PROD_SMOKE_EMAIL/);
  assert.doesNotMatch(workflow, /secrets\.QA_EXAMINER_ADMIN_PASSWORD \|\| secrets\.PROD_SMOKE_PASSWORD/);
});
