// source_reference: 0569 edition-pinned SCORM assessment policy + backend-owned approvals
// operational_decision: allow only the reviewed SQL/plan hashes on trusted main; schema before Worker; no deployment
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const workflow = readFileSync('.github/workflows/staging-apply-schema-v2.yml', 'utf8');
const manifest = JSON.parse(readFileSync('worker-airtrust/schema-v2/lms-scorm-edition-policy-approvals-0569.json', 'utf8'));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const check = (term) => assert.ok(workflow.includes(term), term);

test('0569 is allow-listed only with the exact reviewed SQL and plan hashes', () => {
  assert.equal(manifest.fileHash, sha('worker-airtrust/schema-v2/changes/0569_lms_scorm_edition_policy_approvals.sql'));
  assert.equal(manifest.planHash, sha('worker-airtrust/schema-v2/plans/lms-scorm-edition-policy-approvals-0569.md'));
  for (const term of ['lms-scorm-edition-policy-approvals-0569', manifest.fileHash, manifest.planHash,
    '0569_lms_scorm_edition_policy_approvals.sql', 'REVIEWED_MANIFEST_SCOPE_MISMATCH']) check(term);
});

test('0569 pre/postconditions fail closed, never backfill, and never touch learner records', () => {
  for (const term of ['SCORM_0569_SOURCE_TABLES_MISSING', 'SCORM_0569_VERSION_COLUMNS_ALREADY_PRESENT_WITHOUT_LEDGER',
    'SCORM_0569_CYCLE_COLUMN_ALREADY_PRESENT_WITHOUT_LEDGER', 'SCORM_0569_APPROVALS_TABLE_ALREADY_PRESENT_WITHOUT_LEDGER',
    'SCORM_0569_TRIGGERS_ALREADY_PRESENT_WITHOUT_LEDGER', 'SCORM_0569_VERSION_COLUMNS_MISSING', 'SCORM_0569_CYCLE_COLUMN_MISSING',
    'SCORM_0569_APPROVALS_TABLE_MISSING', 'SCORM_0569_TRIGGERS_MISSING', 'SCORM_0569_UNEXPECTED_APPROVAL_ROWS',
    'SCORM_0569_UNEXPECTED_CYCLE_BACKFILL', 'SCORM_0569_UNEXPECTED_EDITION_BACKFILL', 'SCORM_0569_ENROLLMENTS_CHANGED',
    'SCORM_0569_CYCLES_CHANGED', 'SCORM_0569_PROGRESS_CHANGED', 'SCORM_0569_QUALIFICATIONS_CHANGED',
    'SCORM_0569_COURSES_BEFORE:', 'SCORM_0569_QUALIFICATIONS_BEFORE:']) check(term);
});

test('0569 SQL is DDL-only and contains no data mutation of learner or course rows', () => {
  const sql = readFileSync('worker-airtrust/schema-v2/changes/0569_lms_scorm_edition_policy_approvals.sql', 'utf8')
    .replace(/--.*$/gm, '').toUpperCase();
  for (const forbidden of ['UPDATE LMS_', 'DELETE FROM', 'DROP ', 'INSERT INTO LMS_MATRICULA', 'INSERT INTO LMS_CURSOS', 'INSERT INTO LMS_PROGRESSO']) {
    assert.ok(!sql.includes(forbidden), forbidden);
  }
});
