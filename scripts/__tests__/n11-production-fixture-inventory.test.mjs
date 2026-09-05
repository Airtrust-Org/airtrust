import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SCRIPT = 'scripts/validation/n11-production-fixture-inventory.mjs';
const WORKFLOW = '.github/workflows/n11-production-fixture-readonly-inventory.yml';

test('N-11 production inventory is explicit, SHA-pinned and read-only', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  const workflow = readFileSync(WORKFLOW, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:\s*$/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_READONLY_N11/);
  assert.match(workflow, /EXPECTED_SHA_MISMATCH/);
  assert.match(workflow, /n11-production-fixture-inventory\.mjs/);
  assert.doesNotMatch(workflow, /wrangler\s+(?:deploy|pages deploy)/);
  assert.doesNotMatch(workflow, /--file\b/);

  assert.match(script, /const DB_NAME = 'airtrust-db'/);
  assert.match(script, /'--env', 'production', '--remote', '--json', '--command'/);
  assert.match(script, /documented_qa_id_129/);
  assert.match(script, /audit_observed_fixture_label/);
  assert.match(script, /pragma_table_info/);
  assert.match(script, /total_rows/);
  assert.doesNotMatch(script, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\s+(?:INTO|TABLE|FROM|SET)?/i);
  assert.doesNotMatch(script, /--file\b/);
  assert.doesNotMatch(script, /SELECT\s+[^;]*(?:email|cpf)/i);
});

test('N-11 inventory output construction excludes direct personal fields', () => {
  const script = readFileSync(SCRIPT, 'utf8');
  const outputStart = script.indexOf('const output =');
  assert.notEqual(outputStart, -1);
  const outputSection = script.slice(outputStart);
  for (const forbidden of ['funcionario_nome', 'email:', 'cpf:', 'matricula:', 'nome:']) {
    assert.equal(outputSection.includes(forbidden), false, `output must not include ${forbidden}`);
  }
});
