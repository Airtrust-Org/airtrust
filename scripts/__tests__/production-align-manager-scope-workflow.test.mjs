import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-align-manager-scope.yml', 'utf8');

test('production manager-scope workflow requires an exact SHA, caller-provided identities, and reviewed dry-run before apply', () => {
  assert.match(
    workflow,
    /PROD_EMAIL: \$\{\{ secrets\.PROD_SMOKE_EMAIL \|\| secrets\.QA_EXAMINER_ADMIN_EMAIL \}\}/,
  );
  assert.match(
    workflow,
    /PROD_PASSWORD: \$\{\{ secrets\.PROD_SMOKE_PASSWORD \|\| secrets\.QA_EXAMINER_ADMIN_PASSWORD \}\}/,
  );
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /reference_name:/);
  assert.match(workflow, /target_names:/);
  assert.match(workflow, /reviewed_dry_run_run_id:/);
  assert.match(workflow, /ALIGN_MANAGER_EXPECTED_CANDIDATE_HASH/);
});

test('manager-scope operation resolves people through the canonical tenant user list', () => {
  const script = readFileSync('scripts/production/align-manager-scope.mjs', 'utf8');
  assert.match(script, /\/api\/empresas\/\$\{tenantId\}\/usuarios/);
  assert.match(script, /identitiesFromTenantUsers/);
  assert.match(script, /mergeIdentities/);
  assert.match(script, /candidateHash/);
  assert.match(script, /O conjunto de candidatos não corresponde ao dry-run revisado/);
});
