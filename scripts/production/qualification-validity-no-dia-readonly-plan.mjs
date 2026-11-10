#!/usr/bin/env node
/**
 * Owner decisions of 11/11/2026 (follow-up of issue #2158) - deterministic tenant-6 plan (read-only):
 *  (a) qualificacoes_tipos 23 (D2) and 122 (MNT_INTEGRACAO_DOUTRINACAO): validade 36 -> 24;
 *  (b) qualificacoes_historico with validade_meses = 36 of types 23, 122, 129 (MNT_S76AC), 138 (MNT_INGLES_TECNICO):
 *      validade_meses -> 24 and data_vencimento = data_conclusao + 24 months "no dia" (clamped to the month end);
 *  (c) types 18 (ASO), 106 (G1-SEM) and 40 (G2): vencimento_fim_mes 1 -> 0 and the live histories whose stored expiry was
 *      derived by the old end-of-month rule are recomputed "no dia". A stored expiry that matches neither rule is an
 *      explicit/documentary date and is PRESERVED (listed as excluded, never rewritten).
 *
 * Only SELECTs. Models that are not exclusively tenant 6 (global, other tenant, or used by another tenant), whose code does not
 * match the owner scope, or that are inactive/deleted are blocked and never enter the manifest. No names, CPF, e-mail,
 * birth dates or certificate file names are read; only opaque ids, codes, dates and aggregates. Issued certificates are never
 * reissued or touched: the summary counts the operations whose history already has a certificate (the public QR validation
 * reads data_vencimento/validade_meses from the database and therefore shows the new values). The plan hash covers ONLY the
 * operations; the compliance estimate depends on "today".
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wranglerExecutor } from './lib/executors.mjs';
import {
  FLAG_MODEL_SCOPE, OLD_MONTHS, REALIZED_STATUSES, TARGET_MONTHS, TENANT_ID, VALIDITY_MODEL_SCOPE,
  addMonthsClamped, buildExecutionManifest, isValidDate,
} from './lib/qualification-validity-no-dia-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const READONLY_CONFIRMATION = 'AIRTRUST_PRODUCTION_QUALIFICATION_VALIDITY_NO_DIA_READONLY';

const SCOPE_IDS = [...VALIDITY_MODEL_SCOPE.map((m) => m.tipo_id), ...FLAG_MODEL_SCOPE.map((m) => m.tipo_id)];
const normStatus = (value) => String(value ?? '').trim().toUpperCase();
const dateOnly = (value) => {
  const text = typeof value === 'string' ? value.slice(0, 10) : '';
  return isValidDate(text) ? text : null;
};
const asInt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};
const bump = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };
/** Legacy end-of-month rule, used ONLY to recognise expiries that the old rule derived. */
const legacyEndOfMonth = (completion, months) => {
  if (!isValidDate(completion) || !Number.isInteger(months) || months < 1) return null;
  const [y, m] = completion.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

// ---------- inventory (SELECT only, opaque ids/aggregates) ----------
export function readInventory(port) {
  const list = SCOPE_IDS.join(',');
  const types = port.query(`SELECT id, empresa_id, UPPER(TRIM(codigo)) AS codigo, validade, COALESCE(vencimento_fim_mes, 0) AS flag,
  COALESCE(ativo, 1) AS ativo, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM qualificacoes_tipos WHERE id IN (${list}) ORDER BY id`);
  const foreign = port.query(`SELECT qualificacao_id AS tipo_id, empresa_id, COUNT(*) AS n FROM qualificacoes_historico
 WHERE qualificacao_id IN (${list}) AND (empresa_id IS NULL OR empresa_id <> ${TENANT_ID}) GROUP BY qualificacao_id, empresa_id`);
  const foreignRequisitos = port.query(`SELECT qualificacao_tipo_id AS tipo_id, empresa_id, COUNT(*) AS n FROM treinamento_requisitos
 WHERE qualificacao_tipo_id IN (${list}) AND (empresa_id IS NULL OR empresa_id <> ${TENANT_ID}) AND ativo = 1 AND deleted_at IS NULL
 GROUP BY qualificacao_tipo_id, empresa_id`);
  const histories = port.query(`SELECT id, qualificacao_id, UPPER(TRIM(COALESCE(status, ''))) AS status,
  substr(data_conclusao, 1, 10) AS data_conclusao, data_vencimento, validade_meses,
  CASE WHEN certificado_arquivo_id IS NOT NULL THEN 1 ELSE 0 END AS has_certificate_id,
  CASE WHEN arquivo_url IS NOT NULL AND TRIM(arquivo_url) <> '' THEN 1 ELSE 0 END AS has_certificate_url
 FROM qualificacoes_historico WHERE empresa_id = ${TENANT_ID} AND deleted_at IS NULL AND qualificacao_id IN (${list}) ORDER BY id`);
  return { types, foreign, foreignRequisitos, histories };
}

// ---------- planning (pure) ----------
function bucket(expiry, today, soonDays = 30) {
  if (!expiry) return 'SEM_VENCIMENTO';
  const day = String(expiry).slice(0, 10);
  if (day < today) return 'VENCIDO';
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + soonDays);
  return day <= limit.toISOString().slice(0, 10) ? 'VENCENDO' : 'CONFORME';
}

export function buildPlan(inventory, { today } = {}) {
  const todayDate = today ?? new Date().toISOString().slice(0, 10);
  if (!isValidDate(todayDate)) throw new Error('TODAY_INVALID');
  const sumBy = (rows) => {
    const map = new Map();
    for (const r of rows) map.set(Number(r.tipo_id), (map.get(Number(r.tipo_id)) || 0) + Number(r.n));
    return map;
  };
  const foreignH = sumBy(inventory.foreign);
  const foreignR = sumBy(inventory.foreignRequisitos);
  const liveTypes = new Map(inventory.types.map((t) => [Number(t.id), t]));

  const blocked = [];
  const models = [];
  const flags = [];
  const eligibleValidity = new Map(); // tipo_id -> effective validity used for the group
  const eligibleFlag = new Map();
  const reasonOf = (scope, t) => {
    if (!t) return 'blocked_type_missing';
    if (t.empresa_id === null || t.empresa_id === undefined) return 'blocked_global_model';
    if (Number(t.empresa_id) !== TENANT_ID) return 'blocked_other_tenant_model';
    if (Number(t.deleted) === 1) return 'blocked_deleted_model';
    if (Number(t.ativo) === 0) return 'blocked_inactive_model';
    if (t.codigo !== scope.code) return 'blocked_code_mismatch';
    if ((foreignH.get(scope.tipo_id) || 0) + (foreignR.get(scope.tipo_id) || 0) > 0) return 'blocked_shared_with_other_tenant';
    return null;
  };
  for (const scope of VALIDITY_MODEL_SCOPE) {
    const t = liveTypes.get(scope.tipo_id);
    let reason = reasonOf(scope, t);
    const validity = t ? asInt(t.validade) : null;
    if (!reason && scope.change_model && validity !== OLD_MONTHS) reason = validity === TARGET_MONTHS ? 'model_already_24' : 'blocked_model_validity_not_36';
    if (!reason && !scope.change_model && validity !== TARGET_MONTHS) reason = 'blocked_model_validity_not_24';
    if (reason && reason !== 'model_already_24') { blocked.push({ tipo_id: scope.tipo_id, code: scope.code, group: 'validity', reason }); continue; }
    if (scope.change_model && !reason) models.push({ tipo_id: scope.tipo_id, code: scope.code, old_validity: OLD_MONTHS, next_validity: TARGET_MONTHS });
    eligibleValidity.set(scope.tipo_id, scope);
  }
  for (const scope of FLAG_MODEL_SCOPE) {
    const t = liveTypes.get(scope.tipo_id);
    let reason = reasonOf(scope, t);
    const flag = t ? asInt(t.flag) : null;
    if (!reason && flag !== 1) reason = flag === 0 ? 'flag_already_0' : 'blocked_flag_ambiguous';
    if (reason && reason !== 'flag_already_0') { blocked.push({ tipo_id: scope.tipo_id, code: scope.code, group: 'flag', reason }); continue; }
    if (!reason) flags.push({ tipo_id: scope.tipo_id, code: scope.code, old_flag: 1, next_flag: 0 });
    eligibleFlag.set(scope.tipo_id, { scope, type: t });
  }

  const histories = [];
  const excluded = { validity: {}, flag: {} };
  const perModel = {};
  const certificates = { operations_with_certificate_id: 0, operations_with_uploaded_file: 0, operations_with_any_certificate: 0, by_model: {} };
  const staleNullValidity = { rows_with_null_validity_and_36m_expiry: 0, by_model: {} };
  const estimateRows = [];
  for (const row of inventory.histories) {
    const tipoId = Number(row.qualificacao_id);
    const status = normStatus(row.status);
    const completion = dateOnly(row.data_conclusao);
    const oldExpiry = row.data_vencimento ?? null;
    const oldValidity = asInt(row.validade_meses);
    const anyCert = Number(row.has_certificate_id) === 1 || Number(row.has_certificate_url) === 1;

    if (eligibleValidity.has(tipoId)) {
      const scope = eligibleValidity.get(tipoId);
      const entry = (perModel[scope.code] ??= { group: 'validity', live_rows: 0, operations: 0 });
      if (oldValidity === null && completion && oldExpiry === addMonthsClamped(completion, OLD_MONTHS)) {
        staleNullValidity.rows_with_null_validity_and_36m_expiry++;
        bump(staleNullValidity.by_model, scope.code);
      }
      if (oldValidity !== OLD_MONTHS) continue; // owner scope is validade_meses = 36 exactly
      entry.live_rows++;
      if (!completion) { bump(excluded.validity, 'completion_date_missing_or_invalid'); continue; }
      if (!REALIZED_STATUSES.has(status)) { bump(excluded.validity, 'status_not_realized'); continue; }
      const next = addMonthsClamped(completion, TARGET_MONTHS);
      if (oldExpiry !== null && !/^[0-9A-Za-z:.+\- ]{1,40}$/.test(String(oldExpiry))) { bump(excluded.validity, 'old_expiry_not_representable'); continue; }
      histories.push({
        id: Number(row.id), group: 'validity', qualificacao_id: tipoId, model_code: scope.code, status, completion,
        old_expiry: oldExpiry, next_expiry: next, old_validity_months: OLD_MONTHS, next_validity_months: TARGET_MONTHS, validity_used: TARGET_MONTHS,
      });
      entry.operations++;
      if (anyCert) {
        if (Number(row.has_certificate_id) === 1) certificates.operations_with_certificate_id++;
        if (Number(row.has_certificate_url) === 1) certificates.operations_with_uploaded_file++;
        certificates.operations_with_any_certificate++;
        bump(certificates.by_model, scope.code);
      }
      estimateRows.push({ id: Number(row.id), oldExpiry, nextExpiry: next });
      continue;
    }

    const flagInfo = eligibleFlag.get(tipoId);
    if (flagInfo) {
      const { scope, type } = flagInfo;
      const entry = (perModel[scope.code] ??= { group: 'flag', live_rows: 0, operations: 0 });
      entry.live_rows++;
      if (!completion) { bump(excluded.flag, 'completion_date_missing_or_invalid'); continue; }
      if (!REALIZED_STATUSES.has(status)) { bump(excluded.flag, 'status_not_realized'); continue; }
      if (oldExpiry === null) { bump(excluded.flag, 'no_stored_expiry'); continue; }
      if (!/^[0-9A-Za-z:.+\- ]{1,40}$/.test(String(oldExpiry))) { bump(excluded.flag, 'old_expiry_not_representable'); continue; }
      const validityUsed = oldValidity ?? asInt(type?.validade);
      if (!validityUsed || validityUsed < 1) { bump(excluded.flag, 'validity_missing'); continue; }
      const exact = addMonthsClamped(completion, validityUsed);
      const legacy = legacyEndOfMonth(completion, validityUsed);
      if (!exact || !legacy) { bump(excluded.flag, 'expiry_computation_invalid'); continue; }
      const stored = String(oldExpiry).slice(0, 10);
      if (stored === exact && oldExpiry === exact) { bump(excluded.flag, 'already_no_dia'); continue; }
      if (stored !== legacy || oldExpiry !== legacy) { bump(excluded.flag, 'explicit_expiry_preserved'); continue; }
      histories.push({
        id: Number(row.id), group: 'flag', qualificacao_id: tipoId, model_code: scope.code, status, completion,
        old_expiry: oldExpiry, next_expiry: exact, old_validity_months: oldValidity, next_validity_months: oldValidity, validity_used: validityUsed,
      });
      entry.operations++;
      if (anyCert) {
        if (Number(row.has_certificate_id) === 1) certificates.operations_with_certificate_id++;
        if (Number(row.has_certificate_url) === 1) certificates.operations_with_uploaded_file++;
        certificates.operations_with_any_certificate++;
        bump(certificates.by_model, scope.code);
      }
      estimateRows.push({ id: Number(row.id), oldExpiry, nextExpiry: exact });
    }
  }

  const byId = (key) => (a, b) => a[key] - b[key];
  const manifest = buildExecutionManifest({
    models: models.sort(byId('tipo_id')), flags: flags.sort(byId('tipo_id')), histories: histories.sort(byId('id')),
  });

  const estimate = { today: todayDate, ignores: 'requirement scopes, employee active status and concurrent LMS evidence', transitions: {}, expiry_moves_earlier: 0, expiry_moves_later: 0 };
  for (const e of estimateRows) {
    const before = bucket(e.oldExpiry, todayDate);
    const after = bucket(e.nextExpiry, todayDate);
    bump(estimate.transitions, `${before}->${after}`);
    if (e.oldExpiry && e.nextExpiry < String(e.oldExpiry).slice(0, 10)) estimate.expiry_moves_earlier++;
    if (e.oldExpiry && e.nextExpiry > String(e.oldExpiry).slice(0, 10)) estimate.expiry_moves_later++;
  }

  const summary = {
    inventory: 'QUALIFICATION_VALIDITY_NO_DIA_TENANT6',
    empresa_id: TENANT_ID,
    plan_sha256: manifest.plan_sha256,
    row_count: manifest.row_count,
    models: {
      validity_36_to_24: models.map((m) => m.code), flag_1_to_0: flags.map((f) => f.code),
      blocked: blocked.length, blocked_detail: blocked,
    },
    histories: {
      operations: histories.length,
      validity_group: histories.filter((h) => h.group === 'validity').length,
      flag_group: histories.filter((h) => h.group === 'flag').length,
      excluded, by_model: Object.fromEntries(Object.entries(perModel).sort(([a], [b]) => a.localeCompare(b))),
      stale_36m_expiry_with_null_validity: staleNullValidity,
    },
    certificates: {
      ...certificates,
      reissued: 0,
      note: 'issued certificates are not reissued; public QR validation reads data_vencimento/validade_meses from the database',
    },
    compliance_estimate: estimate,
    writes: 0, pii_emitted: false, production_apply_authorized: false,
  };
  return { manifest, summary };
}

function run() {
  const args = process.argv.slice(2);
  if (args.includes('--apply') || args.some((a) => /--write|--execute|--mutate/i.test(a))) throw new Error('PRODUCTION_WRITE_FORBIDDEN');
  if (process.env.AIRTRUST_VALIDITY_NO_DIA_READONLY_CONFIRMATION !== READONLY_CONFIRMATION) throw new Error('EXPLICIT_READONLY_CONFIRMATION_REQUIRED');
  const manifestFlag = args.find((a) => a.startsWith('--manifest='));
  const todayFlag = args.find((a) => a.startsWith('--today='));
  if (args.some((a) => !a.startsWith('--manifest=') && !a.startsWith('--today='))) throw new Error('UNRECOGNIZED_ARGUMENT');
  const port = wranglerExecutor({ database: 'airtrust-db', env: 'production', remote: true, allowWrites: false, cwd: path.join(ROOT, 'worker-airtrust') });
  const plan = buildPlan(readInventory(port), { today: todayFlag?.slice('--today='.length) });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (manifestFlag) {
    const destination = manifestFlag.slice('--manifest='.length);
    if (!path.isAbsolute(destination) || destination.startsWith(ROOT + path.sep)) throw new Error('MANIFEST_MUST_BE_ABSOLUTE_OUTSIDE_REPO');
    writeFileSync(destination, JSON.stringify({ ...plan.manifest, source_sha: sha }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }
  process.stdout.write(JSON.stringify({ ...plan.summary, source_sha: sha }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) {
    console.error('QUALIFICATION_VALIDITY_NO_DIA_READONLY_PLAN_ERROR:' + (error instanceof Error ? error.message : 'UNKNOWN'));
    process.exitCode = 1;
  }
}
