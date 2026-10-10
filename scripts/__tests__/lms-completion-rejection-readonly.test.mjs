import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyReason,
  summarizeFailures,
  summarizeCategoryMappings,
} from '../production/lms-completion-rejection-readonly.mjs';

test('classifies SQL errors into bounded non-sensitive reasons', () => {
  assert.equal(classifyReason('UNIQUE constraint failed: qualificacoes_historico.funcionario_id, qualificacoes_historico.data_conclusao'), 'UNIQUE_CONSTRAINT');
  assert.equal(classifyReason('NOT NULL constraint failed: qualification.secret@example.com'), 'NOT_NULL_CONSTRAINT');
  assert.equal(classifyReason('FOREIGN KEY constraint failed'), 'FOREIGN_KEY_CONSTRAINT');
  assert.equal(classifyReason('Histórico existente #999 tem status incompatível para reuso: RENOVADA'), 'HISTORY_STATUS_INCOMPATIBLE');
  assert.equal(classifyReason('Tipo de qualificação sem categoria_id canônico no tenant da matrícula'), 'QUALIFICATION_TYPE_MAPPING_INVALID');
  assert.equal(classifyReason('Categoria do tipo de qualificação não está integrada ao LMS'), 'CATEGORY_CONFIG_INVALID');
  assert.equal(classifyReason('no such column: private_column'), 'MISSING_COLUMN');
  assert.equal(classifyReason('trg_QUALIFICATION_HISTORY_CATEGORY_INVALID'), 'CATEGORY_CONSTRAINT');
  assert.equal(classifyReason('stack secret'), 'OTHER_REDACTED');
  assert.equal(classifyReason(null), 'NO_INTERNAL_REASON');
});

test('returns only counts, course IDs and controlled classifications', () => {
  const rows = [
    { course_id: 71, audit_json: JSON.stringify({ reason: 'NOT NULL constraint failed: secret@example.com', origin: 'private' }) },
    { course_id: 71, audit_json: JSON.stringify({ reason: 'NOT NULL constraint failed: other@email.com', user_id: 400 }) },
    { course_id: 73, audit_json: JSON.stringify({ reason: 'FOREIGN KEY constraint failed', password: 'secret' }) },
    { course_id: 73, audit_json: '{bad' },
  ];
  const report = summarizeFailures(rows);
  assert.equal(report.events_scanned, 4);
  assert.deepEqual(report.groups, [
    { course_id: 71, reason: 'NOT_NULL_CONSTRAINT', count: 2 },
    { course_id: 73, reason: 'FOREIGN_KEY_CONSTRAINT', count: 1 },
    { course_id: 73, reason: 'NO_INTERNAL_REASON', count: 1 },
  ]);
  assert.equal(report.writes, 0);
  assert.equal(report.contains_personal_data, false);
  const text = JSON.stringify(report);
  assert.equal(text.includes('secret'), false);
  assert.equal(text.includes('email.com'), false);
  assert.equal(text.includes('400'), false);
});

test('rejects invalid D1 rows and result sets beyond the fixed cap', () => {
  assert.throws(() => summarizeFailures([{ course_id: 0, audit_json: '{}' }]), /COURSE_ID_INVALID/);
  assert.throws(() => summarizeFailures(Array.from({ length: 301 }, () => ({ course_id: 71 }))), /RESULTS_TOO_LARGE/);
  assert.throws(() => summarizeFailures({}), /RESULTS_TOO_LARGE/);
});

test('identifies only broken LMS qualification/category links without employee data', () => {
  const report = summarizeCategoryMappings([
    { course_id: 71, type_id: 400, type_category_id: 5, category_code: 'OPERACOES', state: 'CATEGORY_NOT_INTEGRATED' },
    { course_id: 73, type_id: 401, type_category_id: 8, category_code: 'EAD', state: 'VALID' },
    { course_id: 74, type_id: 402, type_category_id: null, category_code: null, state: 'TYPE_WITHOUT_CATEGORY' },
  ], [{ id: 8, codigo: 'EAD', ativo: 1, lms_integrada: 1 }]);
  assert.deepEqual(report.mismatches, [
    { course_id: 71, type_id: 400, category_id: 5, category_code: 'OPERACOES', state: 'CATEGORY_NOT_INTEGRATED' },
    { course_id: 74, type_id: 402, category_id: null, category_code: null, state: 'TYPE_WITHOUT_CATEGORY' },
  ]);
  assert.equal(report.invalid, 2);
  assert.equal(report.evaluated, 3);
  assert.equal(report.writes, 0);
  assert.equal(report.contains_personal_data, false);
  const sanitized = summarizeCategoryMappings([
    { course_id: 71, state: 'VALID', category_code: 'private@example.com' },
  ], []);
  assert.equal(sanitized.mismatches[0].category_code, null);
});

test('fails closed on invalid category inventory payloads', () => {
  assert.throws(() => summarizeCategoryMappings([{ course_id: 71, state: 'PERMISSION_BYPASS' }], []), /CATEGORY_STATE_INVALID/);
  assert.throws(() => summarizeCategoryMappings([{ course_id: 71, state: 'VALID' }, { course_id: 71, state: 'VALID' }], []), /COURSE_ID_INVALID/);
  assert.throws(() => summarizeCategoryMappings([], [{ id: 8, codigo: 'EAD', ativo: 1, lms_integrada: 0 }]), /CANONICAL_CATEGORY_INVALID/);
});
