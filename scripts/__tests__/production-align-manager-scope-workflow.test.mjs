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

test('manager-scope operation resolves people through the canonical tenant user list', () => {
  const script = readFileSync('scripts/production/align-manager-scope.mjs', 'utf8');
  assert.match(script, /\/api\/empresas\/\$\{tenantId\}\/usuarios/);
  assert.match(script, /identitiesFromTenantUsers/);
  assert.match(script, /mergeIdentities/);
});
