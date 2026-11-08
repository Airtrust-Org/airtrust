// source_reference: #2081 after the production 0548 row 704 was soft-deleted.
// dry_run_required: test executes SQLite in memory only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

const id = 'training-compliance-iio-aprs-assistant-restore-0575';
test('0575 has immutable Schema V2 manifest, reviewed recovery plan and official guards', () => {
  const m = JSON.parse(readFileSync(`worker-airtrust/schema-v2/${id}.json`, 'utf8'));
  assert.equal(m.changeId, id);
  assert.equal(m.baselineId, 'production-d1-baseline-v2-20260714');
  for (const [p,h] of [['filePath','fileHash'], ['planPath','planHash']])
    assert.equal(createHash('sha256').update(readFileSync(m[p])).digest('hex'), m[h]);
  const workflow = readFileSync('.github/workflows/apply-schema-change-v2.yml', 'utf8');
  assert.equal(workflow.match(/training-compliance-iio-aprs-assistant-restore-0575/g)?.length, 2);
  assert.match(workflow, /validate-0575-production-preflight\.sh/);
  assert.match(workflow, /validate-0575-production-postconditions\.sh/);
});
test('0575 changes only rule 704 plus audit and does not grant APRS privileges', () => {
  const sql = readFileSync('worker-airtrust/schema-v2/changes/0575_training_compliance_iio_aprs_assistant_restore.sql','utf8');
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|INSERT INTO)\s+(?:lms_matriculas|lms_matricula_ciclos|qualificacoes_historico|usuarios|usuarios_empresas)\b/i);
  assert.match(sql,/WHERE id=704 AND empresa_id=6 AND qualificacao_tipo_id=127/);
  assert.match(sql,/auto_matricular_ead=0/);
  assert.match(sql,/COUNT\(\*\) FROM funcionarios/);
  assert.match(sql,/INSERT INTO audit_logs/);
  assert.match(execFileSync('python3',['scripts/__tests__/schema-v2-0575-iio-aprs-fixture.py'],{encoding:'utf8'}),/SCHEMA_0575_SQLITE_FIXTURE=PASS/);
});
