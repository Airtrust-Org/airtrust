import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const SCRIPT = 'scripts/validation/n11-structural-remediation.mjs';
const WORKFLOW = '.github/workflows/n11-production-structural-remediation.yml';

test('N-11 structural remediation workflow is explicit, SHA-pinned and guarded', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:\s*$/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_DRYRUN_N11_REMEDIATION/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_APPLY_N11_REMEDIATION/);
  assert.match(workflow, /EXPECTED_SHA_MISMATCH/);
  assert.match(workflow, /n11-structural-remediation\.mjs/);
  assert.doesNotMatch(workflow, /wrangler\s+(?:deploy|pages deploy)/);
  assert.match(workflow, /secrets\.CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_WORKER_API_TOKEN/);
  assert.match(workflow, /d1 time-travel info/);
});

test('N-11 structural remediation script targets strictly exact IDs and tenant 6 without text heuristics', () => {
  const script = readFileSync(SCRIPT, 'utf8');

  assert.match(script, /const DB_NAME = 'airtrust-db'/);
  assert.match(script, /const EMPRESA_ID = 6/);
  assert.match(script, /TARGET_FUNCIONARIO_IDS = \[129\]/);
  assert.match(script, /TARGET_USER_ID = 108/);

  // Must not use display-name filtering
  assert.doesNotMatch(script, /nome\s*=\s*['"]/i);
  assert.doesNotMatch(script, /nome\s+LIKE/i);
  assert.doesNotMatch(script, /Fixture LMS/i);
  assert.doesNotMatch(script, /Funcionário Teste/i);

  // Must have preflight and postconditions
  assert.match(script, /preflightFuncionarios/);
  assert.match(script, /preflightUser/);
  assert.match(script, /postFuncionarios/);
  assert.match(script, /postUser/);
  assert.match(script, /POSTCONDITION_FUNCIONARIOS_NOT_FULLY_DEACTIVATED/);
  assert.match(script, /POSTCONDITION_USER_NOT_FULLY_DEACTIVATED/);

  // Must exclude PII in output
  const outputStart = script.indexOf('const summary =');
  assert.notEqual(outputStart, -1);
  const outputSection = script.slice(outputStart);
  for (const forbidden of ['funcionario_nome', 'email:', 'cpf:', 'matricula:']) {
    assert.equal(outputSection.includes(forbidden), false, `output must not include ${forbidden}`);
  }
});
