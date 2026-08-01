import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQaGrantApplySql,
  buildQaGrantPreflightSql,
  buildQaGrantRollbackSql,
  extractQaGrantRow,
  QA_GRANT_CONSTANTS,
  validateQaGrantTarget,
} from '../staging/seed-qa-admin-operational-grant.mjs';

test('accepts only the exact staging D1 and synthetic QA administrator', () => {
  assert.deepEqual(
    validateQaGrantTarget({
      dbName: QA_GRANT_CONSTANTS.allowedD1Name,
      dbId: QA_GRANT_CONSTANTS.allowedD1Id,
      adminEmail: QA_GRANT_CONSTANTS.adminEmail,
    }),
    {
      dbName: QA_GRANT_CONSTANTS.allowedD1Name,
      dbId: QA_GRANT_CONSTANTS.allowedD1Id,
      adminEmail: QA_GRANT_CONSTANTS.adminEmail,
    },
  );
});

test('rejects production and non-QA targets', () => {
  assert.throws(
    () =>
      validateQaGrantTarget({
        dbName: 'airtrust-db-production',
        dbId: QA_GRANT_CONSTANTS.blockedProductionD1Id,
        adminEmail: QA_GRANT_CONSTANTS.adminEmail,
      }),
    /STAGING_D1_NAME_REJECTED/,
  );
  assert.throws(
    () =>
      validateQaGrantTarget({
        dbName: QA_GRANT_CONSTANTS.allowedD1Name,
        dbId: QA_GRANT_CONSTANTS.blockedProductionD1Id,
        adminEmail: QA_GRANT_CONSTANTS.adminEmail,
      }),
    /STAGING_D1_ID_REJECTED/,
  );
  assert.throws(
    () =>
      validateQaGrantTarget({
        dbName: QA_GRANT_CONSTANTS.allowedD1Name,
        dbId: QA_GRANT_CONSTANTS.allowedD1Id,
        adminEmail: 'usuario-real@example.com',
      }),
    /QA_ADMIN_EMAIL_REJECTED/,
  );
});

test('preflight is read-only and anchored by exact natural keys', () => {
  const sql = buildQaGrantPreflightSql();
  assert.match(sql, /qa_examiner_training/);
  assert.match(sql, /QA-SETOR-EXA/);
  assert.match(sql, /qa-examiner-admin@staging\.airtrust\.invalid/);
  assert.match(sql, /s\.dominio_codigo = 'OPERACOES'/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\b/i);
});

test('apply changes only the exact synthetic setores_gestores relation', () => {
  const sql = buildQaGrantApplySql();
  assert.match(sql, /UPDATE setores_gestores/);
  assert.match(sql, /INSERT INTO setores_gestores/);
  assert.match(sql, /qa_examiner_training/);
  assert.match(sql, /QA-SETOR-EXA/);
  assert.match(sql, /s\.dominio_codigo = 'OPERACOES'/);
  assert.doesNotMatch(sql, /UPDATE\s+usuarios\b/i);
  assert.doesNotMatch(sql, /UPDATE\s+empresas\b/i);
  assert.doesNotMatch(sql, /UPDATE\s+setores\b/i);
});

test('rollback is limited to the exact synthetic relation', () => {
  const sql = buildQaGrantRollbackSql();
  assert.match(sql, /^\s*UPDATE setores_gestores/m);
  assert.match(sql, /qa_examiner_training/);
  assert.match(sql, /QA-SETOR-EXA/);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /UPDATE\s+(?:usuarios|empresas|setores)\b/i);
});

test('extracts the first D1 result row and fails closed without one', () => {
  assert.deepEqual(extractQaGrantRow([{ results: [{ active_relation_count: 1 }] }]), {
    active_relation_count: 1,
  });
  assert.throws(() => extractQaGrantRow([]), /QA_GRANT_D1_ROW_MISSING/);
});
