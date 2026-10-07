import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const script = readFileSync('scripts/production/audit-historical-training-controls.py', 'utf8');

test('historical training control audit is read-only and emits no PII', () => {
  assert.match(script, /read-only reconciliation/i);
  assert.match(script, /if not re\.match\(r"\^\(SELECT\|WITH\)\\b"/);
  assert.match(script, /mutating SQL refused/);
  assert.match(script, /"mutation_executed": False/);
  assert.match(script, /"pii_emitted": False/);
  assert.doesNotMatch(script, /--file=/);
  assert.doesNotMatch(script, /mode.*apply/i);
});

test('audit covers the eleven controlled spreadsheet tabs with explicit canonical codes', () => {
  for (const [sheet, code] of [
    ['GESTAO DE MUDANCA', 'MUDA'],
    ['INTEGRACAO', 'INTEGRA'],
    ['REGRAS DE OURO', 'REGRAS_OURO_PETROBRAS'],
    ['GERENCIAMENTO E COLETA SELETIVA', 'COL_SEL'],
    ['DOUTRINAMENTO DE SEGURANCA', 'INTRO_SGQ'],
    ['AUDITORIA COMPORTAMENTAL', 'AUD_COMP'],
    ['NR 06', 'NR06'],
    ['NR 20', 'NR-20'],
    ['FISPQ', 'NR-26'],
    ['NR11', 'NR-11'],
    ['NR 35', 'NR-35'],
  ]) {
    assert.ok(script.includes(`"${sheet}": "${code}"`), `missing mapping ${sheet} -> ${code}`);
  }
});

test('audit preserves source outside git and never creates employees', () => {
  assert.match(script, /source workbook must stay outside the git repository/);
  assert.match(script, /resolve_employee/);
  assert.doesNotMatch(script, /INSERT INTO funcionarios/i);
  assert.doesNotMatch(script, /UPDATE funcionarios/i);
  assert.doesNotMatch(script, /DELETE FROM funcionarios/i);
});

test('audit identifies only active, past-or-current missing evidence as import candidates', () => {
  assert.match(script, /if active and date\.fromisoformat\(record\["date"\]\) <= TODAY/);
  assert.match(script, /missing_active_candidate_count/);
  assert.match(script, /missing_active_candidate_hash/);
  assert.match(script, /employee_inactive/);
  assert.match(script, /employee_unresolved/);
});
