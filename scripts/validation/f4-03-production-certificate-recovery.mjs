#!/usr/bin/env node
// F4-03 / 0435 read-only certificate recovery probe.
// Reads production D1 + R2 only. Emits structural IDs, hashes and extracted expiry dates;
// never emits names, CPF/e-mail, free-text, raw R2 keys or PDF contents.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const DB_NAME = 'airtrust-db';
const BUCKET_NAME = 'airtrust-storage';
const CONFIRMATION = 'AIRTRUST_PRODUCTION_READONLY_F4_03_CERTIFICATE_RECOVERY';
const INCIDENT_AT = '2026-07-15 19:05:19';

function fail(code) {
  console.error(`F4_03_CERT_RECOVERY_ERROR:${code}`);
  process.exit(1);
}
if (process.env.F4_03_CERTIFICATE_RECOVERY_CONFIRMATION !== CONFIRMATION) fail('CONFIRMATION_REQUIRED');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
function wrangler(args, label) {
  const r = spawnSync('npx', ['wrangler', ...args], {
    cwd: new URL('../../worker-airtrust/', import.meta.url),
    encoding: args.includes('--file') ? undefined : 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) fail(label);
  return r;
}
function query(sql) {
  const normalized = sql.trim().replace(/;+\s*$/, '').trim();
  if (!/^SELECT\b/i.test(normalized)) fail('NON_SELECT_SQL_REJECTED');
  if (/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|VACUUM|ATTACH|DETACH|REINDEX|ANALYZE)\b/i.test(normalized)) {
    fail('MUTATING_SQL_REJECTED');
  }
  const r = wrangler(
    ['d1','execute',DB_NAME,'--env','production','--remote','--json','--command',normalized],
    'D1_READ_FAILED',
  );
  let parsed;
  try { parsed = JSON.parse(String(r.stdout || '[]')); } catch { fail('D1_JSON_INVALID'); }
  const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!envelope || !Array.isArray(envelope.results)) fail('D1_RESULTS_MISSING');
  return envelope.results;
}
function normalizeDate(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
export function extractExpiry(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/(?:data\s+de\s+)?validade/i.test(lines[i])) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 5)).join(' ');
    const dates = [...window.matchAll(/\b(?:\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[0]);
    if (dates.length) return normalizeDate(dates.at(-1));
  }
  return null;
}

const rows = query(`
  SELECT
    qh.id AS historico_id,
    COALESCE(qh.empresa_id, 0) AS empresa_id,
    qh.qualificacao_id AS qualificacao_id,
    COALESCE(qt.codigo, 'UNKNOWN') AS qualification_code,
    qh.data_conclusao AS data_conclusao,
    qh.data_vencimento AS current_expiry,
    COALESCE(
      (SELECT d.r2_key FROM documentos d
        WHERE d.id = qh.certificado_arquivo_id AND d.deleted_at IS NULL LIMIT 1),
      (SELECT d.r2_key FROM documentos d
        WHERE qh.arquivo_url IN (
          '/api/pasta-virtual/stream/' || CAST(d.id AS TEXT),
          '/api/certificados/stream/' || CAST(d.id AS TEXT)
        ) AND d.deleted_at IS NULL LIMIT 1),
      (SELECT pv.caminho_arquivo FROM pasta_virtual pv
        WHERE pv.certificacao_id = qh.id AND pv.deleted_at IS NULL
        ORDER BY pv.id DESC LIMIT 1)
    ) AS r2_key,
    COALESCE(
      (SELECT d.created_at FROM documentos d
        WHERE d.id = qh.certificado_arquivo_id AND d.deleted_at IS NULL LIMIT 1),
      (SELECT d.created_at FROM documentos d
        WHERE qh.arquivo_url IN (
          '/api/pasta-virtual/stream/' || CAST(d.id AS TEXT),
          '/api/certificados/stream/' || CAST(d.id AS TEXT)
        ) AND d.deleted_at IS NULL LIMIT 1),
      (SELECT d.created_at FROM pasta_virtual pv
        JOIN documentos d ON d.id = pv.documento_id AND d.deleted_at IS NULL
        WHERE pv.certificacao_id = qh.id AND pv.deleted_at IS NULL
        ORDER BY pv.id DESC LIMIT 1)
    ) AS source_created_at
  FROM qualificacoes_historico qh
  JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
  WHERE qh.deleted_at IS NULL
    AND qh.origem_tipo = 'MANUAL'
    AND qh.lms_matricula_id IS NULL
    AND qh.observacoes LIKE '%LMS%'
    AND qh.data_conclusao IS NOT NULL
    AND qh.data_vencimento IS NOT NULL
    AND COALESCE(qt.vencimento_fim_mes, 0) = 0
    AND qh.data_vencimento = date(qh.data_conclusao, '+' || CAST(qt.validade AS TEXT) || ' months')
  ORDER BY qh.id
`);

const temp = mkdtempSync(join(tmpdir(), 'airtrust-f4-03-cert-'));
const recovered = [];
let sourceResolved = 0;
let sourcePreIncident = 0;
let objectDownloadFailures = 0;
let extractionFailures = 0;

try {
  for (const row of rows) {
    const r2Key = String(row.r2_key || '').trim();
    const createdAt = String(row.source_created_at || '').trim();
    if (!r2Key) continue;
    sourceResolved += 1;
    if (!createdAt || createdAt >= INCIDENT_AT) continue;
    sourcePreIncident += 1;

    const id = Number(row.historico_id || 0);
    const pdfPath = join(temp, `cert-${id}.pdf`);
    const txtPath = join(temp, `cert-${id}.txt`);
    const got = spawnSync(
      'npx',
      ['wrangler','r2','object','get',`${BUCKET_NAME}/${r2Key}`,'--env','production','--remote','--file',pdfPath],
      { cwd: new URL('../../worker-airtrust/', import.meta.url), env: process.env, encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    if (got.status !== 0) { objectDownloadFailures += 1; continue; }

    const pdf = readFileSync(pdfPath);
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      objectDownloadFailures += 1;
      continue;
    }
    const textRun = spawnSync('pdftotext', ['-layout', pdfPath, txtPath], {
      encoding: 'utf8', stdio: ['ignore','pipe','pipe'], maxBuffer: 1024 * 1024,
    });
    if (textRun.status !== 0) { extractionFailures += 1; continue; }
    const expiry = extractExpiry(readFileSync(txtPath, 'utf8'));
    if (!expiry) { extractionFailures += 1; continue; }

    recovered.push({
      historico_id: id,
      empresa_id: Number(row.empresa_id || 0),
      qualificacao_id: Number(row.qualificacao_id || 0),
      qualification_code: String(row.qualification_code || 'UNKNOWN').slice(0, 64),
      data_conclusao: row.data_conclusao ? String(row.data_conclusao).slice(0, 10) : null,
      current_expiry: row.current_expiry ? String(row.current_expiry).slice(0, 10) : null,
      certificate_expiry: expiry,
      certificate_created_at: createdAt.slice(0, 19),
      certificate_sha256: sha256(pdf),
      differs_from_current: expiry !== String(row.current_expiry || '').slice(0, 10),
    });
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const output = {
  source_sha: process.env.GITHUB_SHA || null,
  incident: 'F4-03_0435_MANUAL_EXPIRY',
  mode: 'PRODUCTION_READ_ONLY_CERTIFICATE_RECOVERY',
  broad_candidate_count: rows.length,
  certificate_source_resolved_count: sourceResolved,
  preincident_certificate_source_count: sourcePreIncident,
  recovered_expiry_count: recovered.length,
  recovered_difference_count: recovered.filter((r) => r.differs_from_current).length,
  object_download_failures: objectDownloadFailures,
  extraction_failures: extractionFailures,
  recovered,
  raw_r2_key_emitted: false,
  pdf_or_text_emitted: false,
  pii_emitted: false,
  writes: 0,
};
process.stdout.write(JSON.stringify(output, null, 2));
