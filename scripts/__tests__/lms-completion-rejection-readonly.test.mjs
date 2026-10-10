import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyReason,
  summarizeFailures,
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
