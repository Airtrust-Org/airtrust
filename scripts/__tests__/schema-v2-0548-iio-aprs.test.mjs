import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createHash } from 'node:crypto';

test('Schema V2 0548 manifest pins source and reviewed plan', () => {
  const manifest = JSON.parse(readFileSync('worker-airtrust/schema-v2/training-compliance-maintenance-iio-aprs-assistants-0548.json', 'utf8'));
  for (const [pathKey,hashKey] of [['filePath','fileHash'],['planPath','planHash']]) {
    assert.equal(createHash('sha256').update(readFileSync(manifest[pathKey])).digest('hex'), manifest[hashKey]);
  }
  assert.equal(manifest.changeId,'training-compliance-maintenance-iio-aprs-assistants-0548');
});

test('IIO/APRS 0548 synthetic migration is fail-closed and tenant-safe', () => {
  const output = execFileSync('python3',['scripts/__tests__/schema-v2-0548-iio-aprs-fixture.py'],{encoding:'utf8'});
  assert.match(output,/positive\/negative\/cross-tenant checks passed/);
});

test('official Schema V2 workflow preserves preflight and postconditions', () => {
  const workflow=readFileSync('.github/workflows/apply-schema-change-v2.yml','utf8');
  assert.match(workflow,/training-compliance-maintenance-iio-aprs-assistants-0548/);
  assert.match(workflow,/validate-0548-production-preflight\.sh/);
  assert.match(workflow,/validate-0548-production-postconditions\.sh/);
  const sql=readFileSync('worker-airtrust/schema-v2/changes/0548_training_compliance_maintenance_iio_aprs_assistants.sql','utf8');
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|INSERT INTO)\s+(?:lms_matriculas|qualificacoes_historico|lms_progresso_scorm)\b/i);
});
