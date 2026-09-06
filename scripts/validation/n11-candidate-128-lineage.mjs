#!/usr/bin/env node
// N-11 candidate 128 lineage probe — production D1 read-only.
// Purpose: gather structural, non-PII lineage evidence for funcionario_id 128.
// No names, emails, document numbers, free text, scores, timestamps or mutations are emitted.
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const EMPRESA_ID = 6;
const TARGET_FUNCIONARIO_ID = 128;
const CONFIRMATION = 'AIRTRUST_PRODUCTION_READONLY_N11_128_LINEAGE';

function fail(message) {
  console.error(`N11_128_LINEAGE_ERROR:${message}`);
  process.exit(1);
}

if (process.env.N11_128_LINEAGE_CONFIRMATION !== CONFIRMATION) fail('CONFIRMATION_REQUIRED');
if ((process.env.N11_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) fail('PRODUCTION_DB_TARGET_REJECTED');

function assertReadOnlySql(sql) {
  const normalized = String(sql || '').trim().replace(/;+\s*$/, '').trim();
  if (!normalized || normalized.includes(';')) fail('MULTI_STATEMENT_SQL_REJECTED');
  if (!/^SELECT\b/i.test(normalized)) fail('NON_READONLY_SQL_REJECTED');
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX|ANALYZE)\b/i.test(normalized)) {
    fail('MUTATING_SQL_REJECTED');
  }
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/[A-Za-z0-9_+\/-]{24,}/g, '[REDACTED]')
    .replace(/\/accounts\/[^/\s"]+/g, '/accounts/[REDACTED]')
    .replace(/database\/[0-9a-f-]{16,}/gi, 'database/[REDACTED]');
}

function query(sql, label) {
  assertReadOnlySql(sql);
  console.error(`[D1_QUERY_START] ${label}`);
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, '--env', 'production', '--remote', '--json', '--command', sql],
    {
      cwd: new URL('../../worker-airtrust/', import.meta.url),
      encoding: 'utf8',
      env: process.env,
    },
  );

  if (result.status !== 0) {
    console.error(`[D1_QUERY_FAILED] ${label}`);
    console.error(`D1_EXIT_STATUS:${result.status ?? 'null'}`);
    console.error(`D1_STDOUT:${redactSecrets(result.stdout).slice(0, 4000)}`);
    console.error(`D1_STDERR:${redactSecrets(result.stderr).slice(0, 4000)}`);
    fail('D1_READ_FAILED');
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '[]');
  } catch {
    fail('D1_JSON_INVALID');
  }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope || !Array.isArray(envelope.results)) fail('D1_RESULTS_MISSING');
  return envelope.results;
}

const candidate = query(`
  SELECT
    id,
    empresa_id,
    COALESCE(ativo, 0) AS ativo,
    UPPER(COALESCE(NULLIF(TRIM(status), ''), 'UNKNOWN')) AS status_normalized,
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted
  FROM funcionarios
  WHERE id = ${TARGET_FUNCIONARIO_ID} AND empresa_id = ${EMPRESA_ID}
`, 'candidate');

if (candidate.length !== 1) fail('CANDIDATE_NOT_EXACTLY_ONE');

const linkedUsers = query(`
  SELECT
    id,
    funcionario_id,
    COALESCE(active, 0) AS active,
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted
  FROM usuarios
  WHERE funcionario_id = ${TARGET_FUNCIONARIO_ID}
  ORDER BY id
`, 'linked_users');

const matriculas = query(`
  SELECT
    id,
    curso_id,
    status,
    matriculado_por,
    qualificacao_historico_id,
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted
  FROM lms_matriculas
  WHERE empresa_id = ${EMPRESA_ID}
    AND funcionario_id = ${TARGET_FUNCIONARIO_ID}
  ORDER BY id
`, 'lms_matriculas');

const ciclos = query(`
  SELECT
    id,
    matricula_id,
    historico_importado_id,
    curso_id,
    origem,
    status,
    qualificacao_historico_id,
    CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted
  FROM lms_matricula_ciclos
  WHERE empresa_id = ${EMPRESA_ID}
    AND funcionario_id = ${TARGET_FUNCIONARIO_ID}
  ORDER BY id
`, 'lms_matricula_ciclos');

const importedHistory = query(`
  SELECT COUNT(*) AS total
  FROM lms_historico_importado
  WHERE empresa_id = ${EMPRESA_ID}
    AND funcionario_id = ${TARGET_FUNCIONARIO_ID}
    AND deleted_at IS NULL
`, 'lms_historico_importado_count');

const qualificationHistory = query(`
  SELECT COUNT(*) AS total
  FROM qualificacoes_historico
  WHERE empresa_id = ${EMPRESA_ID}
    AND funcionario_id = ${TARGET_FUNCIONARIO_ID}
    AND deleted_at IS NULL
`, 'qualificacoes_historico_count');

const documentRows = query(`
  SELECT COUNT(*) AS total
  FROM documentos
  WHERE funcionario_id = ${TARGET_FUNCIONARIO_ID}
    AND deleted_at IS NULL
`, 'documentos_count');

const virtualFolderRows = query(`
  SELECT COUNT(*) AS total
  FROM pasta_virtual
  WHERE funcionario_id = ${TARGET_FUNCIONARIO_ID}
    AND deleted_at IS NULL
`, 'pasta_virtual_count');

const output = {
  mode: 'production-d1-read-only-lineage',
  source_sha: process.env.GITHUB_SHA || null,
  empresa_id: EMPRESA_ID,
  candidate: {
    id: Number(candidate[0].id),
    empresa_id: Number(candidate[0].empresa_id),
    ativo: Number(candidate[0].ativo),
    status_normalized: String(candidate[0].status_normalized),
    soft_deleted: Number(candidate[0].soft_deleted),
  },
  linked_users: linkedUsers.map((row) => ({
    id: Number(row.id),
    funcionario_id: Number(row.funcionario_id),
    active: Number(row.active),
    soft_deleted: Number(row.soft_deleted),
  })),
  lms_matriculas: matriculas.map((row) => ({
    id: Number(row.id),
    curso_id: Number(row.curso_id),
    status: String(row.status || ''),
    matriculado_por: row.matriculado_por == null ? null : Number(row.matriculado_por),
    qualificacao_historico_id: row.qualificacao_historico_id == null ? null : Number(row.qualificacao_historico_id),
    soft_deleted: Number(row.soft_deleted),
  })),
  lms_ciclos: ciclos.map((row) => ({
    id: Number(row.id),
    matricula_id: row.matricula_id == null ? null : Number(row.matricula_id),
    historico_importado_id: row.historico_importado_id == null ? null : Number(row.historico_importado_id),
    curso_id: row.curso_id == null ? null : Number(row.curso_id),
    origem: String(row.origem || ''),
    status: String(row.status || ''),
    qualificacao_historico_id: row.qualificacao_historico_id == null ? null : Number(row.qualificacao_historico_id),
    soft_deleted: Number(row.soft_deleted),
  })),
  structural_counts: {
    active_imported_history: Number(importedHistory[0]?.total || 0),
    active_qualification_history: Number(qualificationHistory[0]?.total || 0),
    active_documents: Number(documentRows[0]?.total || 0),
    active_virtual_folder_rows: Number(virtualFolderRows[0]?.total || 0),
  },
  writes: 0,
  pii_emitted: false,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
