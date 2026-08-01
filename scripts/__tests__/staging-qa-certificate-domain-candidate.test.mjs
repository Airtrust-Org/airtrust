// source_reference: regression coverage for the staging-only candidate required
// by issue #568 runs 30703547716, 30706103939 and 30706766016.
// operational_decision: validate generated SQL as inert text; no database call.
// dry_run_required: tests do not execute DML.
// rollback_plan_required: rollback SQL is asserted to target only the exact QA
// type and history natural keys.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCandidatePostconditionSql,
  buildCandidateSql,
  QA_CERT_CANDIDATE,
  validateCandidateTarget,
} from '../staging/seed-qa-certificate-domain-candidate.mjs';

const TYPE_COLUMNS = [
  'id',
  'tipo',
  'codigo',
  'nome',
  'descricao',
  'categoria',
  'categoria_id',
  'dominio_codigo',
  'carga_horaria',
  'validade',
  'vencimento_fim_mes',
  'observacoes',
  'ativo',
  'empresa_id',
  'created_at',
  'updated_at',
  'deleted_at',
];
const HISTORY_COLUMNS = [
  'id',
  'funcionario_id',
  'funcionario_cpf',
  'qualificacao_id',
  'qualificacao_codigo',
  'tipo',
  'categoria',
  'categoria_id',
  'data_conclusao',
  'data_vencimento',
  'carga_horaria',
  'instrutor',
  'local',
  'modalidade',
  'observacoes',
  'status',
  'validade_meses',
  'tipo_treinamento',
  'empresa_id',
  'certificado_arquivo_id',
  'created_at',
  'updated_at',
  'deleted_at',
];

test('accepts only the exact staging D1', () => {
  assert.deepEqual(
    validateCandidateTarget({
      dbName: QA_CERT_CANDIDATE.allowedD1Name,
      dbId: QA_CERT_CANDIDATE.allowedD1Id,
    }),
    { dbName: QA_CERT_CANDIDATE.allowedD1Name, dbId: QA_CERT_CANDIDATE.allowedD1Id },
  );
  assert.throws(
    () =>
      validateCandidateTarget({
        dbName: 'airtrust-db-production',
        dbId: QA_CERT_CANDIDATE.blockedProductionD1Id,
      }),
    /QA_CERT_D1_NAME_REJECTED/,
  );
});

test('builds an idempotent unclassified candidate without undefined SQL', () => {
  const sql = buildCandidateSql(TYPE_COLUMNS, HISTORY_COLUMNS, 'apply');
  assert.match(sql, /QA-CERT-DOMAIN-E2E-999006/);
  assert.match(sql, /QA_CERT_DOMAIN_E2E_999006/);
  assert.match(sql, /QA-PARTICIPANTE-ALFA/);
  assert.match(sql, /categoria_id = NULL/);
  assert.match(sql, /dominio_codigo = NULL/);
  assert.match(sql, /INSERT INTO qualificacoes_tipos/);
  assert.match(sql, /INSERT INTO qualificacoes_historico/);
  assert.match(sql, /INSERT INTO empresas_config/);
  assert.doesNotMatch(sql, /\bundefined\b/);
  assert.doesNotMatch(sql, /7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae/);
});

test('adapts empresas_config SQL when legacy staging has no deleted_at', () => {
  const legacyConfigColumns = [
    'id',
    'empresa_id',
    'certificado_template_html',
    'timezone',
    'idioma',
    'created_at',
    'updated_at',
  ];
  const postcondition = buildCandidatePostconditionSql(legacyConfigColumns);
  assert.doesNotMatch(postcondition, /ec\.deleted_at/);
  assert.match(postcondition, /ec\.certificado_template_html/);

  const sql = buildCandidateSql(
    TYPE_COLUMNS,
    HISTORY_COLUMNS,
    'apply',
    legacyConfigColumns,
    ['id', 'cpf', 'updated_at'],
  );
  const configUpdateAssignments = sql.match(
    /UPDATE empresas_config\nSET ([\s\S]*?)\nWHERE empresa_id/,
  )?.[1];
  const configInsertColumns = sql.match(/INSERT INTO empresas_config \(([^)]*)\)/)?.[1];
  assert.ok(configUpdateAssignments);
  assert.ok(configInsertColumns);
  assert.doesNotMatch(configUpdateAssignments, /\bdeleted_at\b/);
  assert.doesNotMatch(configInsertColumns, /\bdeleted_at\b/);
  assert.match(configUpdateAssignments, /certificado_template_html/);
  assert.match(configInsertColumns, /certificado_template_html/);
});

test('rollback is limited to the exact synthetic type and history', () => {
  const sql = buildCandidateSql(TYPE_COLUMNS, HISTORY_COLUMNS, 'rollback');
  assert.match(sql, /^UPDATE qualificacoes_historico/m);
  assert.match(sql, /QA_CERT_DOMAIN_E2E_999006/);
  assert.match(sql, /^UPDATE qualificacoes_tipos/m);
  assert.match(sql, /QA-CERT-DOMAIN-E2E-999006/);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql, /UPDATE\s+(?:empresas|usuarios|setores)\b/i);
});

test('postcondition requires one unclassified type, history and template', () => {
  const sql = buildCandidatePostconditionSql();
  assert.match(sql, /qt\.categoria_id IS NULL/);
  assert.match(sql, /qt\.dominio_codigo IS NULL/);
  assert.match(sql, /s\.dominio_codigo = 'OPERACOES'/);
  assert.match(sql, /certificado_template_html/);
});

test('fails closed when required schema columns are absent', () => {
  assert.throws(
    () => buildCandidateSql(['id', 'codigo'], HISTORY_COLUMNS, 'apply'),
    /QA_CERT_SCHEMA_MISSING:qualificacoes_tipos\.nome/,
  );
  assert.throws(
    () => buildCandidateSql(TYPE_COLUMNS, ['id', 'funcionario_id'], 'apply'),
    /QA_CERT_SCHEMA_MISSING:qualificacoes_historico\.qualificacao_id/,
  );
  assert.throws(
    () =>
      buildCandidateSql(
        TYPE_COLUMNS,
        HISTORY_COLUMNS,
        'apply',
        ['id', 'empresa_id'],
      ),
    /QA_CERT_SCHEMA_MISSING:empresas_config\.certificado_template_html/,
  );
});
