#!/usr/bin/env node
// Read-only production inventory for qualification histories whose model is configured
// as exact-day (vencimento_fim_mes=0) but whose persisted expiry has the strong
// signature of the previously forced month-end renewal bug.
//
// Output is structural only: no employee names, CPF, email, notes, document paths,
// certificate text, or other person-identifying fields are queried or emitted.
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const CONFIRMATION = 'AIRTRUST_PRODUCTION_READONLY_EXACT_DAY_EXPIRY';

function fail(code) {
  console.error(`EXACT_DAY_EXPIRY_INVENTORY_ERROR:${code}`);
  process.exit(1);
}

if (process.env.EXACT_DAY_EXPIRY_CONFIRMATION !== CONFIRMATION) fail('CONFIRMATION_REQUIRED');
if ((process.env.EXACT_DAY_EXPIRY_DB_NAME || DB_NAME) !== DB_NAME) fail('PRODUCTION_DB_TARGET_REJECTED');

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
      maxBuffer: 16 * 1024 * 1024,
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

function normalizeIsoDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function normalizeValidityMonths(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Mirrors qualification-history-atomic.ts calculateQualificationExpiry(..., endOfMonth=false).
function exactDayExpiry(completionDate, validityMonths) {
  const completion = new Date(`${completionDate}T00:00:00Z`);
  if (Number.isNaN(completion.getTime())) return null;
  const expiry = new Date(completion);
  expiry.setUTCMonth(expiry.getUTCMonth() + validityMonths);
  return expiry.toISOString().slice(0, 10);
}

// Mirrors qualification-history-atomic.ts calculateQualificationExpiry(..., endOfMonth=true).
function monthEndExpiry(completionDate, validityMonths) {
  const completion = new Date(`${completionDate}T00:00:00Z`);
  if (Number.isNaN(completion.getTime())) return null;
  return new Date(
    Date.UTC(
      completion.getUTCFullYear(),
      completion.getUTCMonth() + validityMonths + 1,
      0,
    ),
  )
    .toISOString()
    .slice(0, 10);
}

const rows = query(`
  SELECT
    qh.id AS historico_id,
    qh.empresa_id AS empresa_id,
    qh.qualificacao_id AS qualificacao_id,
    COALESCE(qt.codigo, 'UNKNOWN') AS qualification_code,
    qh.data_conclusao AS data_conclusao,
    qh.data_vencimento AS current_expiry,
    qh.validade_meses AS historico_validade_meses,
    qt.validade AS current_type_validade_meses,
    COALESCE(qt.vencimento_fim_mes, 0) AS current_type_vencimento_fim_mes,
    qh.renovacao_de AS renovacao_de,
    qh.origem_tipo AS origem_tipo,
    qh.lms_matricula_id AS lms_matricula_id,
    qh.certificado_arquivo_id AS certificado_arquivo_id,
    qh.status AS historico_status,
    qh.created_at AS historico_created_at,
    qh.updated_at AS historico_updated_at,
    d.id AS documento_id,
    d.created_at AS documento_created_at
  FROM qualificacoes_historico qh
  JOIN qualificacoes_tipos qt
    ON qt.id = qh.qualificacao_id
   AND qt.deleted_at IS NULL
   AND qt.empresa_id = qh.empresa_id
  LEFT JOIN documentos d
    ON d.id = qh.certificado_arquivo_id
   AND d.deleted_at IS NULL
  WHERE qh.deleted_at IS NULL
    AND qh.data_conclusao IS NOT NULL
    AND qh.data_vencimento IS NOT NULL
    AND COALESCE(qt.vencimento_fim_mes, 0) = 0
    AND COALESCE(qh.validade_meses, qt.validade, 0) > 0
  ORDER BY qh.empresa_id, qh.qualificacao_id, qh.id
`, 'exact_day_population');

const strongCandidates = [];
let exactMatches = 0;
let otherMismatches = 0;
let invalidRows = 0;

for (const row of rows) {
  const completion = normalizeIsoDate(row.data_conclusao);
  const current = normalizeIsoDate(row.current_expiry);
  const validity = normalizeValidityMonths(
    row.historico_validade_meses == null
      ? row.current_type_validade_meses
      : row.historico_validade_meses,
  );

  if (!completion || !current || !validity) {
    invalidRows += 1;
    continue;
  }

  const expected = exactDayExpiry(completion, validity);
  const monthEnd = monthEndExpiry(completion, validity);
  if (!expected || !monthEnd) {
    invalidRows += 1;
    continue;
  }

  if (current === expected) {
    exactMatches += 1;
    continue;
  }

  if (current === monthEnd && monthEnd !== expected) {
    strongCandidates.push({
      historico_id: Number(row.historico_id),
      empresa_id: Number(row.empresa_id),
      qualificacao_id: Number(row.qualificacao_id),
      qualification_code: String(row.qualification_code || 'UNKNOWN').slice(0, 64),
      data_conclusao: completion,
      current_expiry: current,
      expected_exact_expiry: expected,
      validity_months: validity,
      renovacao_de: row.renovacao_de == null ? null : Number(row.renovacao_de),
      origem_tipo: row.origem_tipo == null ? null : String(row.origem_tipo).slice(0, 32),
      lms_matricula_id: row.lms_matricula_id == null ? null : Number(row.lms_matricula_id),
      certificado_arquivo_id:
        row.certificado_arquivo_id == null ? null : Number(row.certificado_arquivo_id),
      documento_id: row.documento_id == null ? null : Number(row.documento_id),
      historico_status: row.historico_status == null ? null : String(row.historico_status).slice(0, 32),
      historico_created_at:
        row.historico_created_at == null ? null : String(row.historico_created_at).slice(0, 19),
      historico_updated_at:
        row.historico_updated_at == null ? null : String(row.historico_updated_at).slice(0, 19),
      documento_created_at:
        row.documento_created_at == null ? null : String(row.documento_created_at).slice(0, 19),
    });
  } else {
    otherMismatches += 1;
  }
}

const breakdownMap = new Map();
for (const row of strongCandidates) {
  const key = `${row.empresa_id}|${row.qualification_code}`;
  const current = breakdownMap.get(key) || {
    empresa_id: row.empresa_id,
    qualification_code: row.qualification_code,
    count: 0,
  };
  current.count += 1;
  breakdownMap.set(key, current);
}

const reportedSignature = strongCandidates.filter(
  (row) => row.qualification_code === 'M' && row.data_conclusao === '2026-07-17',
);

const output = {
  source_sha: process.env.GITHUB_SHA || null,
  inventory: 'QUALIFICATION_EXACT_DAY_MONTH_END_SIGNATURE',
  exact_day_population_count: rows.length,
  exact_matches_count: exactMatches,
  strong_month_end_signature_count: strongCandidates.length,
  other_mismatch_count: otherMismatches,
  invalid_row_count: invalidRows,
  reported_signature_count: reportedSignature.length,
  reported_signature_historico_ids: reportedSignature.map((row) => row.historico_id),
  strong_breakdown: [...breakdownMap.values()].sort(
    (a, b) => a.empresa_id - b.empresa_id || a.qualification_code.localeCompare(b.qualification_code),
  ),
  strong_candidates: strongCandidates,
  interpretation:
    strongCandidates.length === 0
      ? 'NO_STRONG_MONTH_END_SIGNATURE_FOUND'
      : 'STRONG_MONTH_END_SIGNATURE_REQUIRES_GOVERNED_REPAIR_REVIEW',
  writes: 0,
  pii_emitted: false,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
