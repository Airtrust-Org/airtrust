import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/production-qualification-evidence-reconciliation-20261004.yml', 'utf8');
const materializer = readFileSync('scripts/production/materialize-qualification-evidence-plan-20261004.py', 'utf8');
const executor = readFileSync('scripts/production/reconcile-qualification-evidence-20261004.py', 'utf8');

test('qualification evidence production workflow is hash-locked and requires reviewed dry-run predecessor', () => {
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /expected_plan_sha:/);
  assert.match(workflow, /expected_candidate_count:/);
  assert.match(workflow, /expected_candidate_hash:/);
  assert.match(workflow, /reviewed_dry_run_run_id:/);
  assert.match(workflow, /bb4aaadfce1c5ae9ed9fa4ae8723f3126103f5edbd048dff46d0ef8dffa900cc/);
  assert.match(workflow, /3797b28d538ba6cd810ee9334755012b9df54b4134e94c0cfc29b9ab3cfab6d0/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_RECONCILE_QUALIFICATION_EVIDENCE_20261004/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /d1 time-travel info/);
});

test('online materializer keeps the reviewed plan out of git and performs no R2 mutation', () => {
  assert.doesNotMatch(materializer, /funcionarios\//i);
  assert.doesNotMatch(materializer, /source_sha256=/i);
  assert.doesNotMatch(materializer, /r2 object (put|delete)/i);
  assert.match(materializer, /SELECT id,funcionario_id,nome_arquivo,r2_key FROM documentos/);
  assert.match(workflow, /Remove materialized plan containing document metadata/);
  assert.doesNotMatch(workflow, /qualification-evidence-plan\.json\s*\n\s*retention-days/);
});

test('executor remains fail-closed on exact clean main and zero R2 writes', () => {
  assert.match(executor, /apply requires exact clean origin\/main on branch main/);
  assert.match(executor, /r2_mutations/);
  assert.doesNotMatch(executor, /wrangler[\s\S]{0,120}r2[\s\S]{0,80}(put|delete)/i);
});
