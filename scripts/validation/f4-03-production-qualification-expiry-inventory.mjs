#!/usr/bin/env node
// F4-03 read-only production inventory for the quarantined 0435 qualification-expiry incident.
// Output is aggregate-only: no names, emails, document numbers, notes, row payloads, or credentials.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const DB_NAME = 'airtrust-db';
const CONFIRMATION = 'AIRTRUST_PRODUCTION_READONLY_F4_03';

function fail(message) {
  console.error(`F4_03_READONLY_ERROR:${message}`);
  process.exit(1);
}

if (process.env.F4_03_PRODUCTION_READONLY_CONFIRMATION !== CONFIRMATION) fail('CONFIRMATION_REQUIRED');
if ((process.env.F4_03_PRODUCTION_DB_NAME || DB_NAME) !== DB_NAME) fail('PRODUCTION_DB_TARGET_REJECTED');

function assertReadOnly(sql) {
  const normalized = String(sql || '').trim().replace(/;+\s*$/, '').trim();
  if (!normalized || normalized.includes(';')) fail('MULTI_STATEMENT_SQL_REJECTED');
  if (!/^SELECT\b/i.test(normalized)) fail('NON_SELECT_SQL_REJECTED');
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX|ANALYZE)\b/i.test(normalized)) {
    fail('MUTATING_SQL_REJECTED');
  }
}

function query(sql, label) {
  assertReadOnly(sql);
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
    console.error(`D1_READ_FAILED:${label}:exit=${result.status ?? 'null'}`);
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

const exact = query(`
  SELECT
    COALESCE(qh.empresa_id, 0) AS empresa_id,
    COALESCE(qt.codigo, 'UNKNOWN') AS qualification_code,
    COUNT(*) AS total
  FROM qualificacoes_historico qh
  JOIN qualificacoes_tipos qt
    ON qt.id = qh.qualificacao_id
   AND qt.deleted_at IS NULL
  WHERE qh.deleted_at IS NULL
    AND qh.origem_tipo = 'MANUAL'
    AND qh.lms_matricula_id IS NULL
    AND qh.observacoes LIKE '%LMS%'
    AND qh.updated_at >= '2026-07-15 19:05:00'
    AND qh.updated_at <  '2026-07-15 19:06:00'
  GROUP BY COALESCE(qh.empresa_id, 0), COALESCE(qt.codigo, 'UNKNOWN')
  ORDER BY empresa_id, qualification_code
`, 'exact_incident_window');

const broad = query(`
  SELECT
    COALESCE(qh.empresa_id, 0) AS empresa_id,
    COALESCE(qt.codigo, 'UNKNOWN') AS qualification_code,
    COUNT(*) AS total
  FROM qualificacoes_historico qh
  JOIN qualificacoes_tipos qt
    ON qt.id = qh.qualificacao_id
   AND qt.deleted_at IS NULL
  WHERE qh.deleted_at IS NULL
    AND qh.origem_tipo = 'MANUAL'
    AND qh.lms_matricula_id IS NULL
    AND qh.observacoes LIKE '%LMS%'
    AND qh.data_conclusao IS NOT NULL
    AND qh.data_vencimento IS NOT NULL
    AND COALESCE(qt.vencimento_fim_mes, 0) = 0
    AND qh.data_vencimento = date(qh.data_conclusao, '+' || CAST(qt.validade AS TEXT) || ' months')
  GROUP BY COALESCE(qh.empresa_id, 0), COALESCE(qt.codigo, 'UNKNOWN')
  ORDER BY empresa_id, qualification_code
`, 'broad_manual_signature');

const structural = query(`
  SELECT
    qh.id AS historico_id,
    COALESCE(qh.empresa_id, 0) AS empresa_id,
    qh.qualificacao_id AS qualificacao_id,
    COALESCE(qt.codigo, 'UNKNOWN') AS qualification_code,
    qh.data_conclusao AS data_conclusao,
    qh.data_vencimento AS current_expiry,
    qh.certificado_arquivo_id AS certificado_arquivo_id,
    CASE
      WHEN qh.arquivo_url IS NULL OR TRIM(qh.arquivo_url) = '' THEN 0
      ELSE 1
    END AS has_arquivo_url,
    d.id AS documento_id,
    d.r2_key AS r2_key,
    d.created_at AS documento_created_at,
    d.tamanho AS documento_tamanho
  FROM qualificacoes_historico qh
  JOIN qualificacoes_tipos qt
    ON qt.id = qh.qualificacao_id
   AND qt.deleted_at IS NULL
  LEFT JOIN documentos d
    ON d.id = qh.certificado_arquivo_id
  WHERE qh.deleted_at IS NULL
    AND qh.origem_tipo = 'MANUAL'
    AND qh.lms_matricula_id IS NULL
    AND qh.observacoes LIKE '%LMS%'
    AND qh.data_conclusao IS NOT NULL
    AND qh.data_vencimento IS NOT NULL
    AND COALESCE(qt.vencimento_fim_mes, 0) = 0
    AND qh.data_vencimento = date(qh.data_conclusao, '+' || CAST(qt.validade AS TEXT) || ' months')
  ORDER BY qh.id
`, 'broad_structural_candidates');

const intendedLms = query(`
  SELECT COUNT(*) AS total
  FROM qualificacoes_historico qh
  JOIN qualificacoes_tipos qt
    ON qt.id = qh.qualificacao_id
   AND qt.deleted_at IS NULL
  WHERE qh.deleted_at IS NULL
    AND (qh.origem_tipo = 'LMS' OR qh.lms_matricula_id IS NOT NULL)
    AND qh.data_conclusao IS NOT NULL
    AND qh.data_vencimento IS NOT NULL
    AND COALESCE(qt.vencimento_fim_mes, 0) = 0
`, 'intended_lms_population');

const auditSchema = query(`
  SELECT
    name,
    CASE WHEN sql LIKE '%dados_anteriores%' THEN 1 ELSE 0 END AS has_before_payload,
    CASE WHEN sql LIKE '%registro_id%' THEN 1 ELSE 0 END AS has_record_id,
    CASE WHEN sql LIKE '%created_at%' THEN 1 ELSE 0 END AS has_created_at
  FROM sqlite_master
  WHERE type = 'table'
    AND name IN ('audit_logs', 'audit_events_v2')
  ORDER BY name
`, 'audit_schema');

const exactCount = exact.reduce((sum, row) => sum + Number(row.total || 0), 0);
const broadCount = broad.reduce((sum, row) => sum + Number(row.total || 0), 0);
if (structural.length !== broadCount) fail('STRUCTURAL_COUNT_MISMATCH');

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

const output = {
  source_sha: process.env.GITHUB_SHA || null,
  incident: 'F4-03_0435_MANUAL_EXPIRY',
  exact_incident_window_count: exactCount,
  broad_manual_signature_count: broadCount,
  intended_lms_population_count: Number(intendedLms[0]?.total || 0),
  exact_breakdown: exact.map((row) => ({
    empresa_id: Number(row.empresa_id || 0),
    qualification_code: String(row.qualification_code || 'UNKNOWN').slice(0, 64),
    count: Number(row.total || 0),
  })),
  broad_breakdown: broad.map((row) => ({
    empresa_id: Number(row.empresa_id || 0),
    qualification_code: String(row.qualification_code || 'UNKNOWN').slice(0, 64),
    count: Number(row.total || 0),
  })),
  structural_candidates: structural.map((row) => ({
    historico_id: Number(row.historico_id || 0),
    empresa_id: Number(row.empresa_id || 0),
    qualificacao_id: Number(row.qualificacao_id || 0),
    qualification_code: String(row.qualification_code || 'UNKNOWN').slice(0, 64),
    data_conclusao: row.data_conclusao ? String(row.data_conclusao).slice(0, 10) : null,
    current_expiry: row.current_expiry ? String(row.current_expiry).slice(0, 10) : null,
    certificado_arquivo_id:
      row.certificado_arquivo_id == null ? null : Number(row.certificado_arquivo_id),
    has_arquivo_url: Number(row.has_arquivo_url || 0) === 1,
    documento_id: row.documento_id == null ? null : Number(row.documento_id),
    r2_key_sha256: row.r2_key ? sha256(row.r2_key) : null,
    documento_created_at:
      row.documento_created_at ? String(row.documento_created_at).slice(0, 19) : null,
    documento_size_bytes:
      row.documento_tamanho == null ? null : Number(row.documento_tamanho),
  })),
  audit_recovery_schema: auditSchema.map((row) => ({
    table: String(row.name),
    has_before_payload: Number(row.has_before_payload || 0) === 1,
    has_record_id: Number(row.has_record_id || 0) === 1,
    has_created_at: Number(row.has_created_at || 0) === 1,
  })),
  interpretation:
    exactCount === 18
      ? 'DOCUMENTED_18_STILL_IDENTIFIABLE_BY_INCIDENT_WINDOW'
      : exactCount > 0
        ? 'PARTIAL_OR_CHANGED_SINCE_INCIDENT'
        : 'INCIDENT_ROWS_NOT_IDENTIFIABLE_BY_ORIGINAL_UPDATED_AT_WINDOW',
  writes: 0,
  structural_candidate_fields_emitted: true,
  pii_emitted: false,
};

process.stdout.write(JSON.stringify(output, null, 2));
