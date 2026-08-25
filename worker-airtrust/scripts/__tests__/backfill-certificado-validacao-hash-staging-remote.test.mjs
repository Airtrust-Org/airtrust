import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STAGING_QA_CERT_FIXTURE_EMPRESA_ID,
  STAGING_QA_CERT_FIXTURE_MARKER,
  createStagingFilteredExecRemote,
  excludeKnownStagingQaFixtureSql,
  runStagingBackfill,
} from '../backfill-certificado-validacao-hash-staging-remote.mjs';

const SHA = 'a'.repeat(40);

test('staging adapter excludes only the exact synthetic QA fixture from certificate SELECTs', () => {
  const sql = `SELECT h.id AS id\nFROM qualificacoes_historico h\nWHERE h.deleted_at IS NULL\nORDER BY h.id ASC\nLIMIT 250;`;
  const filtered = excludeKnownStagingQaFixtureSql(sql);
  assert.match(filtered, new RegExp(`h\\.empresa_id = ${STAGING_QA_CERT_FIXTURE_EMPRESA_ID}`));
  assert.match(filtered, new RegExp(STAGING_QA_CERT_FIXTURE_MARKER));
  assert.match(filtered, /AND NOT \(h\.empresa_id/);
});

test('staging adapter leaves UPDATE statements unchanged', () => {
  const sql = "UPDATE qualificacoes_historico SET validacao_hash = 'ABC' WHERE id = 1 AND empresa_id = 2;";
  assert.equal(excludeKnownStagingQaFixtureSql(sql), sql);
});

test('staging adapter fails closed if the governed SELECT shape changes', () => {
  const sql = 'SELECT h.id FROM qualificacoes_historico h WHERE h.deleted_at IS NULL;';
  assert.throws(() => excludeKnownStagingQaFixtureSql(sql), /SELECT shape changed/);
});

test('filtered remote executor rewrites SELECT but not writes', () => {
  const seen = [];
  const execRemote = createStagingFilteredExecRemote(({ databaseName, sql }) => {
    seen.push({ databaseName, sql });
    return [];
  });
  execRemote({
    databaseName: 'airtrust-db-staging-baseline-20260701',
    sql: 'SELECT h.id FROM qualificacoes_historico h\nWHERE h.deleted_at IS NULL\nORDER BY h.id ASC\nLIMIT 250;',
  });
  execRemote({
    databaseName: 'airtrust-db-staging-baseline-20260701',
    sql: "UPDATE qualificacoes_historico SET validacao_hash = 'ABC' WHERE id = 1 AND empresa_id = 2;",
  });
  assert.match(seen[0].sql, /QA_CERT_DOMAIN_E2E_999006/);
  assert.doesNotMatch(seen[1].sql, /QA_CERT_DOMAIN_E2E_999006/);
});

test('runStagingBackfill reports operational rows only after filtering the QA fixture', async () => {
  const calls = [];
  const result = await runStagingBackfill({
    releaseSha: SHA,
    apply: false,
    execRemote: ({ sql }) => {
      calls.push(sql);
      assert.match(sql, /QA_CERT_DOMAIN_E2E_999006/);
      return [
        {
          id: 101,
          empresa_id: 7,
          funcionario_id: 8,
          qualificacao_codigo: 'QUAL-1',
          data_conclusao: '2026-08-01',
          numero_certificado: 'CERT-1',
          validacao_hash: null,
          cpf: '12345678901',
        },
      ];
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(result.target, 'staging');
  assert.equal(result.eligible, 1);
  assert.equal(result.incomplete, 0);
  assert.equal(result.collisions, 0);
  assert.equal(result.toUpdate, 1);
  assert.equal(result.applied, 0);
});
