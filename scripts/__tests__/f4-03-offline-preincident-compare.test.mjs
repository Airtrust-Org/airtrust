import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareRows,
  parseCsv,
} from '../validation/f4-03-offline-preincident-compare.mjs';

test('parseCsv supports quoted commas and escaped quotes', () => {
  const rows = parseCsv('id,note\n1,"alpha, beta"\n2,"a ""quoted"" value"\n');
  assert.deepEqual(rows, [
    { id: '1', note: 'alpha, beta' },
    { id: '2', note: 'a "quoted" value' },
  ]);
});

test('compareRows finds only expiry changes on stable row identity', () => {
  const before = parseCsv([
    'id,empresa_id,funcionario_id,qualificacao_tipo_id,data_conclusao,data_vencimento,deleted_at',
    '10,6,100,7,2026-01-15,2027-01-31,',
    '11,6,101,8,2026-02-10,2027-02-28,',
    '12,6,102,9,2026-03-01,2027-03-31,',
  ].join('\n'));
  const current = parseCsv([
    'id,empresa_id,funcionario_id,qualificacao_id,data_conclusao,data_vencimento,deleted_at',
    '10,6,100,7,2026-01-15,2027-01-15,',
    '11,6,101,8,2026-02-10,2027-02-28,',
    '12,6,999,9,2026-03-01,2027-03-01,',
  ].join('\n'));

  const result = compareRows(before, current);
  assert.deepEqual(result.summary, {
    before_rows: 3,
    current_rows: 3,
    ids_matched: 3,
    stable_identity_matches: 2,
    stable_identity_expiry_differences: 1,
    identity_changed_since_snapshot: 1,
    matched_rows_currently_deleted: 0,
    before_ids_missing_current: 0,
  });
  assert.equal(result.details.length, 1);
  assert.equal(result.details[0].id, 10);
  assert.equal(result.details[0].data_vencimento_before, '2027-01-31');
  assert.equal(result.details[0].data_vencimento_current, '2027-01-15');
});

test('compareRows counts missing/deleted rows without treating them as automatic repair targets', () => {
  const before = parseCsv([
    'id,empresa_id,funcionario_id,qualificacao_id,data_conclusao,data_vencimento,deleted_at',
    '20,6,200,10,2026-04-01,2027-04-30,',
    '21,6,201,11,2026-04-02,2027-04-30,',
  ].join('\n'));
  const current = parseCsv([
    'id,empresa_id,funcionario_id,qualificacao_id,data_conclusao,data_vencimento,deleted_at',
    '20,6,200,10,2026-04-01,2027-04-01,2026-08-01 10:00:00',
  ].join('\n'));

  const result = compareRows(before, current);
  assert.equal(result.summary.ids_matched, 1);
  assert.equal(result.summary.before_ids_missing_current, 1);
  assert.equal(result.summary.matched_rows_currently_deleted, 1);
  assert.equal(result.summary.stable_identity_expiry_differences, 1);
});
