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

test('audit treats only real completion dates as historical evidence', () => {
  assert.match(script, /"N\/C", "NC", "N\.A\.", "NA", "NAO CONSTA"/);
  assert.match(script, /re\.fullmatch\(r"\(\\d\{1,2\}\)\/\(\\d\{1,2\}\)\/\(\\d\{4\}\)"/);
  assert.match(script, /if not completion:/);
  assert.match(script, /source_unverified_date_rows/);
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

test('audit quantifies evidence that needs canonical-code fallback without exposing people', () => {
  assert.match(script, /history_exact_requires_code_fallback/);
  assert.match(script, /active_history_exact_requires_code_fallback/);
  assert.match(script, /exact_via_current_fk/);
  assert.match(script, /exact_via_canonical_code/);
});

test('audit identifies only active, past-or-current missing evidence as import candidates', () => {
  assert.match(script, /if active and date\.fromisoformat\(record\["date"\]\) <= TODAY/);
  assert.match(script, /missing_active_candidate_count/);
  assert.match(script, /missing_active_candidate_hash/);
  assert.match(script, /employee_inactive/);
  assert.match(script, /employee_unresolved/);
});

test('audit rejects incomplete or disagreeing source copies before querying production', () => {
  assert.match(script, /parser\.add_argument\("--reference", type=Path, required=True\)/);
  assert.match(script, /controlled workbook copies disagree: reconciliation refused/);
  assert.match(script, /missing controlled training sheet\(s\)/);
  assert.match(script, /"source_copies_agree": True/);
  assert.match(script, /TODAY = date\.today\(\)/);
});

test('historical evidence requires a completion date and accepts exact canonical code', () => {
  assert.match(script, /row\.get\("data_conclusao"\)/);
  assert.match(script, /original_code/);
  assert.match(script, /type_code/);
  assert.match(script, /"REPROVADA"/);
  assert.match(script, /"EM_ANDAMENTO"/);
});
  
test('audit reports undated source rows without treating them as completions', () => {
  assert.match(script, /source_named_rows/);
  assert.match(script, /source_rows_without_completion/);
  assert.match(script, /source_unverified_date_rows/);
  assert.match(script, /controlled workbook completion counts disagree/);
});
