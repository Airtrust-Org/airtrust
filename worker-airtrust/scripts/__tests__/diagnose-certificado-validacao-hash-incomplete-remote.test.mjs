import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DiagnosticRefusedError,
  STAGING_DATABASE_ID,
  STAGING_DATABASE_NAME,
  assertReadOnlySql,
  assertReleaseSha,
  buildDiagnosticSql,
  runDiagnostic,
  sanitizeDiagnosticRow,
} from '../diagnose-certificado-validacao-hash-incomplete-remote.mjs';

const VALID_SHA = 'a'.repeat(40);

test('diagnostic target is staging-only and hardcoded', () => {
  assert.equal(STAGING_DATABASE_NAME, 'airtrust-db-staging-baseline-20260701');
  assert.equal(STAGING_DATABASE_ID, 'bf9963f4-eb12-439b-a830-20bbf577ac22');
});

test('requires an exact 40-character release SHA', () => {
  assert.throws(() => assertReleaseSha('deadbeef'), DiagnosticRefusedError);
  assert.throws(() => assertReleaseSha('g'.repeat(40)), DiagnosticRefusedError);
  assert.equal(assertReleaseSha(VALID_SHA), VALID_SHA);
});

test('diagnostic SQL is fixed read-only SELECT with no write or DDL verbs', () => {
  const sql = buildDiagnosticSql();
  assert.match(sql.trim(), /^SELECT\b/i);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|PRAGMA|ATTACH|DETACH)\b/i);
  assert.doesNotThrow(() => assertReadOnlySql(sql));
});

test('read-only guard refuses mutation statements', () => {
  for (const sql of [
    'UPDATE qualificacoes_historico SET validacao_hash = NULL',
    'DELETE FROM qualificacoes_historico',
    'CREATE TABLE x (id INTEGER)',
    'PRAGMA table_info(qualificacoes_historico)',
  ]) {
    assert.throws(() => assertReadOnlySql(sql), DiagnosticRefusedError);
  }
});

test('sanitized output never returns certificate/hash source values', () => {
  const sanitized = sanitizeDiagnosticRow({
    id: 7,
    empresa_id: 3,
    funcionario_id: 99,
    funcionario_ausente_ou_excluido: 0,
    cpf_missing: 1,
    qualificacao_codigo_missing: 0,
    data_conclusao_missing: 0,
    numero_certificado_missing: 0,
    cpf: '12345678901',
    qualificacao_codigo: 'SECRET-CODE',
    data_conclusao: '2026-08-25',
    numero_certificado: 'SECRET-CERT',
    validacao_hash: 'ABCDEF0123456789',
  });

  assert.deepEqual(Object.keys(sanitized).sort(), [
    'cpf_missing',
    'data_conclusao_missing',
    'empresa_id',
    'funcionario_ausente_ou_excluido',
    'funcionario_id',
    'id',
    'numero_certificado_missing',
    'qualificacao_codigo_missing',
  ].sort());
  assert.equal(JSON.stringify(sanitized).includes('12345678901'), false);
  assert.equal(JSON.stringify(sanitized).includes('SECRET-CERT'), false);
  assert.equal(JSON.stringify(sanitized).includes('SECRET-CODE'), false);
});

test('runDiagnostic performs one SELECT and emits only sanitized rows', () => {
  const calls = [];
  const result = runDiagnostic({
    releaseSha: VALID_SHA,
    execRemote: ({ sql }) => {
      calls.push(sql);
      return [{
        id: 4,
        empresa_id: 2,
        funcionario_id: 10,
        funcionario_ausente_ou_excluido: 1,
        cpf_missing: 1,
        qualificacao_codigo_missing: 0,
        data_conclusao_missing: 0,
        numero_certificado_missing: 0,
        cpf: 'SHOULD-NOT-LEAK',
      }];
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].trim(), /^SELECT\b/i);
  assert.equal(result.target, 'staging');
  assert.equal(result.readOnly, true);
  assert.equal(result.incompleteCount, 1);
  assert.equal(result.rows[0].cpf_missing, true);
  assert.equal(JSON.stringify(result).includes('SHOULD-NOT-LEAK'), false);
});
