// source_reference: issue #1661 / PR #1662, Schema V2 0571 (question bank) and 0572 (attempts)
// operational_decision: allow only the reviewed SQL/plan hashes on trusted main; schema before Worker; no deployment
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const workflow = readFileSync('.github/workflows/staging-apply-schema-v2.yml', 'utf8');
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
const bank = load('worker-airtrust/schema-v2/lms-exam-question-bank-0571.json');
const attempts = load('worker-airtrust/schema-v2/lms-exam-attempts-0572.json');
const check = (term) => assert.ok(workflow.includes(term), term);

test('0571 and 0572 are allow-listed only with the exact reviewed SQL and plan hashes', () => {
  for (const [m, id] of [[bank, 'lms-exam-question-bank-0571'], [attempts, 'lms-exam-attempts-0572']]) {
    assert.equal(m.changeId, id);
    assert.equal(m.baselineId, 'production-d1-baseline-v2-20260714');
    assert.equal(m.fileHash, sha(m.filePath));
    assert.equal(m.planHash, sha(m.planPath));
    for (const term of [m.changeId, m.fileHash, m.planHash, m.filePath, 'REVIEWED_MANIFEST_SCOPE_MISMATCH']) check(term);
    assert.ok(workflow.includes(`- ${id}`), `dispatch option ${id}`);
    assert.ok(workflow.includes(`"$CHANGE_ID" == '${id}'`), `allow list ${id}`);
  }
});

test('0572 strictly depends on the exact applied 0569 and 0571 ledger rows', () => {
  for (const term of ['EXAM_0572_REQUIRES_0571_LEDGER', 'EXAM_0572_REQUIRES_0569_LEDGER',
    `change_id='lms-exam-question-bank-0571' AND baseline_id='$BASELINE_ID' AND file_hash='${bank.fileHash}' AND plan_hash='${bank.planHash}'`,
    "change_id='lms-scorm-edition-policy-approvals-0569'"]) check(term);
});

test('0571/0572 pre/postconditions fail closed, never backfill, and never touch learner records', () => {
  for (const term of ['EXAM_0571_SOURCE_TABLES_MISSING', 'EXAM_0571_TABLES_ALREADY_PRESENT_WITHOUT_LEDGER',
    'EXAM_0571_INDEXES_ALREADY_PRESENT_WITHOUT_LEDGER', 'EXAM_0571_TRIGGERS_ALREADY_PRESENT_WITHOUT_LEDGER',
    'EXAM_0571_TABLES_MISSING', 'EXAM_0571_INDEXES_MISSING', 'EXAM_0571_TRIGGERS_MISSING',
    'EXAM_0571_UNEXPECTED_QUESTION_ROWS', 'EXAM_0571_UNEXPECTED_AUDIT_ROWS',
    'EXAM_0571_ENROLLMENTS_CHANGED', 'EXAM_0571_CYCLES_CHANGED', 'EXAM_0571_PROGRESS_CHANGED', 'EXAM_0571_QUALIFICATIONS_CHANGED',
    'EXAM_0572_SOURCE_TABLES_MISSING', 'EXAM_0572_CYCLE_COLUMNS_MISSING', 'EXAM_0572_PACKAGE_COLUMNS_MISSING',
    'EXAM_0572_TABLES_ALREADY_PRESENT_WITHOUT_LEDGER', 'EXAM_0572_INDEXES_ALREADY_PRESENT_WITHOUT_LEDGER',
    'EXAM_0572_TRIGGERS_ALREADY_PRESENT_WITHOUT_LEDGER', 'EXAM_0572_TABLES_MISSING', 'EXAM_0572_INDEXES_MISSING',
    'EXAM_0572_TRIGGERS_MISSING', 'EXAM_0572_ATTEMPT_PLAN_FK_MISSING',
    'EXAM_0572_UNEXPECTED_PLANS_ROWS', 'EXAM_0572_UNEXPECTED_EDITION_BINDINGS_ROWS',
    'EXAM_0572_UNEXPECTED_ATTEMPTS_ROWS', 'EXAM_0572_UNEXPECTED_ATTEMPT_RESPONSES_ROWS',
    'EXAM_0572_ENROLLMENTS_CHANGED', 'EXAM_0572_CYCLES_CHANGED', 'EXAM_0572_PROGRESS_CHANGED', 'EXAM_0572_QUALIFICATIONS_CHANGED',
    'EXAM_ENROLLMENTS_BEFORE:', 'EXAM_QUALIFICATIONS_BEFORE:']) check(term);
});

test('every trigger and index the SQL creates is verified by name in the workflow', () => {
  for (const path of [bank.filePath, attempts.filePath]) {
    const sql = readFileSync(path, 'utf8');
    const names = [...sql.matchAll(/CREATE (?:UNIQUE )?(?:INDEX|TRIGGER) (\w+)/g)].map((m) => m[1]);
    assert.ok(names.length >= 9, path);
    for (const name of names) check(`'${name}'`);
  }
});

test('0571/0572 SQL is DDL-only and contains no data mutation of learner or course rows', () => {
  for (const path of [bank.filePath, attempts.filePath]) {
    const sql = readFileSync(path, 'utf8').replace(/--.*$/gm, '').toUpperCase();
    for (const forbidden of ['UPDATE LMS_', 'DELETE FROM', 'DROP ', 'ALTER TABLE', 'PRAGMA', 'IF NOT EXISTS',
      'INSERT INTO LMS_MATRICULA', 'INSERT INTO LMS_CURSOS', 'INSERT INTO LMS_PROGRESSO', 'INSERT INTO QUALIFICACOES']) {
      assert.ok(!sql.includes(forbidden), `${path}: ${forbidden}`);
    }
  }
});

test('the staging workflow keeps production out of reach for the new changes', () => {
  check('PRODUCTION_TARGET_REJECTED');
  check('STAGING_D1_PIN_MISMATCH');
  check("[[ \"$GITHUB_REF\" == 'refs/heads/main' ]]");
});
