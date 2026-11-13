#!/usr/bin/env node
/**
 * Issue #2068 — deterministic tenant-6 legacy qualification expiry inventory.
 *
 * Read-only by construction. A generated plan does NOT authorize remote changes:
 * production D1 apply requires its own reviewed Schema V2 transaction/recovery
 * protocol, a separately approved exact SHA, and a same-hash dry-run.
 *
 * No employee names, birth dates, CPF, emails, tokens or R2 object names are read.
 */
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const READONLY_CONFIRMATION = 'AIRTRUST_PRODUCTION_QUALIFICATION_EXPIRY_READONLY_2068';
export const REALIZED_STATUSES = new Set(['CONCLUIDA', 'CONCLUIDO', 'RENOVADA', 'VALIDA', 'VENCIDA']);

// Explicit exceptions depend on personnel/medical or special operating rules;
// do not auto-recalculate by a generic training-model month count.
const EXCEPTIONS = new Set(['CMA', 'ASO', 'G1-SEM', 'G1_SEM']);

/** CMA/ASO/CHT/G1-SEM models follow regulatory rules and never use the generic month count. */
export function isRegulatoryException(modelCode) {
  const model = String(modelCode ?? '').trim().toUpperCase();
  return EXCEPTIONS.has(model) || model.startsWith('CMA_') || model.startsWith('CHT-');
}
const SELECT_BASE = `
SELECT
  h.id, h.empresa_id, h.qualificacao_id, t.codigo AS model_code,
  h.status, h.data_conclusao, h.data_vencimento,
  h.validade_meses AS historical_months,
  t.validade AS model_months,
  0 AS model_end_of_month, -- LEGADO: qualificacoes_tipos.vencimento_fim_mes ignorada (todo vencimento vence no dia)
  h.origem_tipo, h.renovacao_de, h.certificado_arquivo_id,
  h.lms_matricula_id,
  CASE WHEN h.arquivo_url IS NOT NULL AND TRIM(h.arquivo_url) <> '' THEN 1 ELSE 0 END AS has_uploaded_certificate
FROM qualificacoes_historico h
LEFT JOIN qualificacoes_tipos t
  ON t.id = h.qualificacao_id
 AND t.empresa_id = h.empresa_id
 AND t.deleted_at IS NULL
WHERE h.empresa_id = 6
  AND h.deleted_at IS NULL
  AND h.data_conclusao IS NOT NULL`;
const SELECT = `${SELECT_BASE}
ORDER BY h.id`.trim();

/** Same inventory SELECT (tenant 6) optionally narrowed to validated history ids. */
export function buildInventorySelectSql(ids = null) {
  if (ids === null) return SELECT;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(i => Number.isSafeInteger(i) && i > 0)) {
    throw new Error('INVENTORY_IDS_INVALID');
  }
  return `${SELECT_BASE}\n  AND h.id IN (${ids.join(',')})\nORDER BY h.id`.trim();
}

function dateOnly(value) {
  const str = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const date = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === str ? str : null;
}

/**
 * Every expiry is "no dia": keep the day and clamp it to the last valid day of the target month
 * (2025-01-31 + 1m -> 2025-02-28). The third parameter is accepted only for call-site compatibility
 * and IGNORED: qualificacoes_tipos.vencimento_fim_mes is a legacy column (owner decision).
 */
// eslint-disable-next-line no-unused-vars
export function expectedExpiry(completed, months, _endOfMonth = false) {
  const valid = dateOnly(completed);
  if (!valid || !Number.isInteger(months) || months < 1 || months > 600) return null;
  const [y, m, d] = valid.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}

function asPositiveMonths(value) {
  if (value === null || value === '' || value === undefined) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 600 ? n : null;
}

function classify(row) {
  const model = String(row.model_code ?? '').trim().toUpperCase();
  const status = String(row.status ?? '').trim().toUpperCase();
  const completed = dateOnly(row.data_conclusao);
  const actual = dateOnly(row.data_vencimento);
  const validity = asPositiveMonths(row.model_months);
  const historicValidity = asPositiveMonths(row.historical_months);
  const eomValue = Number(row.model_end_of_month ?? 0);
  let reason = null;

  if (Number(row.empresa_id) !== 6 || !Number.isInteger(Number(row.id)) || Number(row.id) < 1) reason = 'invalid_tenant_or_id';
  else if (!model || !Number.isInteger(Number(row.qualificacao_id)) || Number(row.qualificacao_id) < 1) reason = 'model_link_missing';
  else if (!REALIZED_STATUSES.has(status)) reason = 'non_realized_or_unrecognized_status';
  else if (!completed) reason = 'completion_date_invalid';
  else if (EXCEPTIONS.has(model) || model.startsWith('CMA_') || model.startsWith('CHT-')) reason = 'regulatory_special_case';
  else if (validity === null) reason = 'model_validity_ambiguous';

  const wanted = reason ? null : expectedExpiry(completed, validity);
  if (!reason && !wanted) reason = 'expiry_computation_invalid';
  const validityChanged = historicValidity !== validity;
  const expiryChanged = actual !== wanted;

  if (!reason && (row.certificado_arquivo_id != null || Number(row.has_uploaded_certificate) === 1)) {
    if (validityChanged || expiryChanged) reason = 'issued_certificate_requires_review';
  }
  // An unexplained explicit historical expiry can express an approved manual
  // exception, unlike a NULL expiry or stale model-month snapshot.
  if (!reason && String(row.origem_tipo ?? '').toUpperCase() === 'MANUAL'
    && actual && actual !== wanted && !validityChanged) {
    reason = 'manual_expiry_override_requires_review';
  }

  if (!reason && !validityChanged && !expiryChanged) return { kind: 'consistent', model };
  if (reason) return { kind: 'blocked', model: model || 'UNKNOWN', reason };
  return {
    kind: 'candidate', model,
    record: {
      id: Number(row.id), empresa_id: 6, qualificacao_id: Number(row.qualificacao_id),
      expected_model_code: model, expected_status: status,
      expected_completion_date: completed,
      old_expiry: row.data_vencimento ?? null,
      next_expiry: wanted,
      old_validity_months: row.historical_months ?? null,
      next_validity_months: validity,
      model_end_of_month: eomValue,
      expected_certificate_id: row.certificado_arquivo_id ?? null,
    },
  };
}

export function buildPlan(rows) {
  if (!Array.isArray(rows)) throw new Error('EXPECTED_D1_ROWS_ARRAY');
  const candidates = [];
  const blocked = {};
  const byModel = {};
  let consistent = 0;
  const seen = new Set();
  for (const row of rows) {
    const id = String(row.id);
    if (seen.has(id)) throw new Error('DUPLICATE_HISTORY_ID_FAIL_CLOSED');
    seen.add(id);
    const c = classify(row);
    const key = c.model;
    byModel[key] ??= { candidate: 0, consistent: 0, blocked: 0 };
    if (c.kind === 'candidate') {
      candidates.push(c.record);
      byModel[key].candidate++;
    } else if (c.kind === 'consistent') {
      consistent++;
      byModel[key].consistent++;
    } else {
      blocked[c.reason] = (blocked[c.reason] || 0) + 1;
      byModel[key].blocked++;
    }
  }
  candidates.sort((a, b) => a.id - b.id);
  const stable = JSON.stringify(candidates);
  const planSha256 = createHash('sha256').update(stable).digest('hex');
  return {
    inventory: 'QUALIFICATION_MODEL_EXPIRY_TENANT6_2068',
    empresa_id: 6,
    total_read: rows.length,
    consistent,
    eligible_candidate_count: candidates.length,
    blocked_total: Object.values(blocked).reduce((a, b) => a + b, 0),
    blocked,
    by_model: Object.fromEntries(Object.entries(byModel).sort(([a], [b]) => a.localeCompare(b))),
    plan_sha256: planSha256,
    candidates,
    writes: 0,
    pii_emitted: false,
    production_apply_authorized: false,
  };
}

function readProductionRows() {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'airtrust-db',
    '--env', 'production', '--remote', '--json', '--command', SELECT], {
    cwd: path.join(ROOT, 'worker-airtrust'), encoding: 'utf8',
    timeout: 120000, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('PRODUCTION_D1_READ_FAILED');
  const response = JSON.parse(result.stdout);
  if (!Array.isArray(response) || !Array.isArray(response[0]?.results)) {
    throw new Error('PRODUCTION_D1_READ_SHAPE_INVALID');
  }
  return response[0].results;
}

function run() {
  if (process.argv.includes('--apply') || process.argv.some(a => /--write|--execute|--mutate/i.test(a))) {
    throw new Error('PRODUCTION_WRITE_FORBIDDEN');
  }
  if (process.env.AIRTRUST_EXPIRY_READONLY_CONFIRMATION !== READONLY_CONFIRMATION) {
    throw new Error('EXPLICIT_READONLY_CONFIRMATION_REQUIRED');
  }
  const args = process.argv.slice(2);
  const manifestFlag = args.find(a => a.startsWith('--manifest='));
  if (args.some(a => !a.startsWith('--manifest=')) || args.filter(a => a.startsWith('--manifest=')).length > 1) {
    throw new Error('UNRECOGNIZED_ARGUMENT');
  }
  const plan = buildPlan(readProductionRows());
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (manifestFlag) {
    const destination = manifestFlag.slice('--manifest='.length);
    if (!path.isAbsolute(destination) || destination.startsWith(ROOT + path.sep)) {
      throw new Error('MANIFEST_MUST_BE_ABSOLUTE_OUTSIDE_REPO');
    }
    writeFileSync(destination, JSON.stringify({ ...plan, source_sha: sha }, null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }
  const { candidates: _sensitiveIds, ...summary } = plan;
  process.stdout.write(JSON.stringify({ ...summary, source_sha: sha }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); }
  catch (error) {
    console.error('QUALIFICATION_EXPIRY_READONLY_PLAN_ERROR:' + (error instanceof Error ? error.message : 'UNKNOWN'));
    process.exitCode = 1;
  }
}
