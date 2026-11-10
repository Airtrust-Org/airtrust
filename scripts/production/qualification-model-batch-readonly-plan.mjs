#!/usr/bin/env node
/**
 * Issue #2158 - deterministic tenant-6 qualification model batch plan (read-only).
 *
 * Owner decisions of 10/11/2026 prepared here (nothing is executed by this script):
 *  (4) every active tenant-6 qualification model with validade NULL/<=0 gets 24 months;
 *  (3) live histories linked to those models (also with certificates) follow the model
 *      (canonical clamp: exact-day keeps the day clamped to the month end, end-of-month mode = last day);
 *  (5) 6 orphan histories pointing to soft-deleted OUT_NR11/OUT_NR35/OUT_LGPD types are relinked to NR-11/NR-35/LGPD,
 *      the other 12 (soft-deleted OUT_* types) are soft-deleted (deleted_at only, certificate files stay in R2).
 *
 * Only SELECTs. Models that are not exclusively tenant 6 (global, other tenant, or used by another tenant) are listed as
 * blocked and never enter the manifest. No names, CPF, e-mail, birth dates or certificate file names are read; only opaque
 * ids, codes, dates and aggregates. The plan hash covers ONLY the operations; the compliance estimate depends on "today".
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wranglerExecutor } from './lib/executors.mjs';
import {
  REALIZED_STATUSES, TARGET_MONTHS, TENANT_ID, addMonthsClamped, buildExecutionManifest, isValidDate,
} from './lib/qualification-model-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const READONLY_CONFIRMATION = 'AIRTRUST_PRODUCTION_QUALIFICATION_MODEL_BATCH_READONLY_2158';

/** The 18 orphan histories named by the owner (decision 5). Anything that no longer matches is excluded with a reason. */
export const ORPHAN_HISTORY_IDS = [4966, 4970, 4989, 4992, 4994, 5006, 5017, 5051, 5052, 5056, 5105, 5168, 5169, 5215, 5216, 5217, 5218, 5275];
export const RELINK_MAP = { OUT_NR11: 'NR-11', OUT_NR35: 'NR-35', OUT_LGPD: 'LGPD' };
export const SOFT_DELETE_CODES = new Set(['OUT_FISQP', 'OUT_DIDATICA_ENSINO', 'OUT_AUDITOR_INT', 'OUT_RESIDUOS_COLETA', 'OUT_GERIR_AUDIT', 'OUT_COMBATE_INCENDIO']);
const NON_COMPLIANCE_STATUSES = new Set(['CANCELADA', 'CANCELADO', 'PLANEJADA', 'PLANEJADO']);

const inList = (values) => values.map((v) => {
  if (!Number.isSafeInteger(v)) throw new Error('INVENTORY_ID_INVALID');
  return String(v);
}).join(',');

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

// ---------- inventory (SELECT only, opaque ids/aggregates) ----------
export function readInventory(port) {
  const types = port.query(`SELECT id, empresa_id, UPPER(TRIM(codigo)) AS codigo, validade, COALESCE(vencimento_fim_mes, 0) AS eom, COALESCE(ativo, 1) AS ativo
 FROM qualificacoes_tipos WHERE deleted_at IS NULL AND (validade IS NULL OR validade <= 0) ORDER BY id`);
  const typeIds = types.map((t) => Number(t.id));
  const none = typeIds.length === 0;
  const foreign = (table, col, extra = '') => (none ? [] : port.query(`SELECT ${col} AS tipo_id, empresa_id, COUNT(*) AS n FROM ${table}
 WHERE ${col} IN (${inList(typeIds)}) AND (empresa_id IS NULL OR empresa_id <> ${TENANT_ID})${extra} GROUP BY ${col}, empresa_id`));
  const linked = none ? [] : port.query(`SELECT id, funcionario_id, qualificacao_id, UPPER(TRIM(COALESCE(status, ''))) AS status,
  substr(data_conclusao, 1, 10) AS data_conclusao, data_vencimento, validade_meses,
  CASE WHEN certificado_arquivo_id IS NOT NULL THEN 1 ELSE 0 END AS has_certificate_id,
  CASE WHEN arquivo_url IS NOT NULL AND TRIM(arquivo_url) <> '' THEN 1 ELSE 0 END AS has_certificate_url
 FROM qualificacoes_historico WHERE empresa_id = ${TENANT_ID} AND deleted_at IS NULL AND qualificacao_id IN (${inList(typeIds)}) ORDER BY id`);
  const requisitos = none ? [] : port.query(`SELECT qualificacao_tipo_id AS tipo_id, COUNT(*) AS n FROM treinamento_requisitos
 WHERE empresa_id = ${TENANT_ID} AND ativo = 1 AND deleted_at IS NULL AND qualificacao_tipo_id IN (${inList(typeIds)}) GROUP BY qualificacao_tipo_id`);

  const orphans = port.query(`SELECT h.id, h.empresa_id, h.funcionario_id, h.qualificacao_id, h.qualificacao_codigo, h.tipo, h.categoria,
  UPPER(TRIM(COALESCE(h.status, ''))) AS status, substr(h.data_conclusao, 1, 10) AS data_conclusao, h.data_vencimento, h.validade_meses,
  h.renovacao_de, CASE WHEN h.deleted_at IS NULL THEN 0 ELSE 1 END AS deleted,
  CASE WHEN h.certificado_arquivo_id IS NOT NULL THEN 1 ELSE 0 END AS has_certificate_id,
  CASE WHEN h.arquivo_url IS NOT NULL AND TRIM(h.arquivo_url) <> '' THEN 1 ELSE 0 END AS has_certificate_url,
  t.empresa_id AS type_empresa_id, UPPER(TRIM(t.codigo)) AS type_code, CASE WHEN t.deleted_at IS NULL THEN 0 ELSE 1 END AS type_deleted
 FROM qualificacoes_historico h LEFT JOIN qualificacoes_tipos t ON t.id = h.qualificacao_id
 WHERE h.id IN (${inList(ORPHAN_HISTORY_IDS)}) ORDER BY h.id`);
  const successors = port.query(`SELECT renovacao_de AS id, COUNT(*) AS n FROM qualificacoes_historico
 WHERE renovacao_de IN (${inList(ORPHAN_HISTORY_IDS)}) AND deleted_at IS NULL GROUP BY renovacao_de`);
  const lmsEnrollments = port.query(`SELECT qualificacao_historico_id AS id, COUNT(*) AS n FROM lms_matriculas
 WHERE qualificacao_historico_id IN (${inList(ORPHAN_HISTORY_IDS)}) GROUP BY qualificacao_historico_id`);
  const lmsCycles = port.query(`SELECT qualificacao_historico_id AS id, COUNT(*) AS n FROM lms_matricula_ciclos
 WHERE qualificacao_historico_id IN (${inList(ORPHAN_HISTORY_IDS)}) GROUP BY qualificacao_historico_id`);
  const codes = Object.values(RELINK_MAP).map((c) => `'${c}'`).join(',');
  const targets = port.query(`SELECT id, empresa_id, UPPER(TRIM(codigo)) AS codigo, nome, categoria, validade, COALESCE(vencimento_fim_mes, 0) AS eom,
  CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted FROM qualificacoes_tipos WHERE UPPER(TRIM(codigo)) IN (${codes}) ORDER BY id`);
  const collisions = [];
  for (const [fromCode, toCode] of Object.entries(RELINK_MAP)) {
    for (const row of port.query(`SELECT h.id FROM qualificacoes_historico h
 JOIN qualificacoes_historico x ON x.empresa_id = ${TENANT_ID} AND x.deleted_at IS NULL AND x.funcionario_id = h.funcionario_id
   AND x.data_conclusao = h.data_conclusao AND x.qualificacao_codigo = '${toCode}' AND x.id <> h.id
 WHERE h.id IN (${inList(ORPHAN_HISTORY_IDS)}) AND UPPER(TRIM(h.qualificacao_codigo)) = '${fromCode}'`)) collisions.push(Number(row.id));
  }
  return {
    types, linked, requisitos, orphans, targets, collisions,
    foreignHistories: foreign('qualificacoes_historico', 'qualificacao_id'),
    foreignRequisitos: foreign('treinamento_requisitos', 'qualificacao_tipo_id'),
    foreignCourses: foreign('lms_cursos', 'qualificacao_tipo_id'),
    successors, lmsEnrollments, lmsCycles,
  };
}

// ---------- planning (pure) ----------
const bump = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };

function classifyLinked(row, model) {
  const status = normStatus(row.status);
  const completion = dateOnly(row.data_conclusao);
  if (!completion) return { reason: 'completion_date_missing_or_invalid' };
  if (!REALIZED_STATUSES.has(status)) return { reason: 'status_not_realized' };
  const nextExpiry = addMonthsClamped(completion, TARGET_MONTHS, model.eom === 1);
  if (!nextExpiry) return { reason: 'expiry_computation_invalid' };
  const oldExpiry = row.data_vencimento ?? null;
  const oldValidity = asInt(row.validade_meses);
  if (oldExpiry === nextExpiry && oldValidity === TARGET_MONTHS) return { reason: 'already_consistent' };
  return {
    record: {
      id: Number(row.id), qualificacao_id: Number(row.qualificacao_id), model_code: model.codigo, status, completion,
      old_expiry: oldExpiry, next_expiry: nextExpiry, old_validity_months: oldValidity,
      next_validity_months: TARGET_MONTHS, end_of_month: model.eom,
    },
  };
}

function bucket(expiry, today, soonDays = 30) {
  if (!expiry) return 'CONFORME_SEM_VENCIMENTO';
  const day = String(expiry).slice(0, 10);
  if (day < today) return 'VENCIDO';
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + soonDays);
  return day <= limit.toISOString().slice(0, 10) ? 'VENCENDO' : 'CONFORME';
}

export function buildBatchPlan(inventory, { today } = {}) {
  const todayDate = today ?? new Date().toISOString().slice(0, 10);
  if (!isValidDate(todayDate)) throw new Error('TODAY_INVALID');
  const sumBy = (rows) => {
    const map = new Map();
    for (const r of rows) map.set(Number(r.tipo_id), (map.get(Number(r.tipo_id)) || 0) + Number(r.n));
    return map;
  };
  const foreignH = sumBy(inventory.foreignHistories);
  const foreignR = sumBy(inventory.foreignRequisitos);
  const foreignC = sumBy(inventory.foreignCourses);
  const requisitos = sumBy(inventory.requisitos);

  const blockedModels = [];
  const eligible = [];
  for (const t of inventory.types) {
    const id = Number(t.id);
    const base = { tipo_id: id, code: t.codigo };
    let reason = null;
    if (t.empresa_id === null || t.empresa_id === undefined) reason = 'blocked_global_model';
    else if (Number(t.empresa_id) !== TENANT_ID) reason = 'blocked_other_tenant_model';
    else if (Number(t.ativo) === 0) reason = 'blocked_inactive_model';
    else if (![0, 1].includes(Number(t.eom))) reason = 'blocked_end_of_month_ambiguous';
    else if ((foreignH.get(id) || 0) + (foreignR.get(id) || 0) + (foreignC.get(id) || 0) > 0) reason = 'blocked_shared_with_other_tenant';
    if (reason) blockedModels.push({ ...base, reason, other_tenant_histories: foreignH.get(id) || 0, other_tenant_requirements: foreignR.get(id) || 0, other_tenant_courses: foreignC.get(id) || 0 });
    else eligible.push({ ...t, id, eom: Number(t.eom), codigo: t.codigo });
  }
  const modelById = new Map(eligible.map((t) => [t.id, t]));

  // --- models + linked histories ---
  const models = eligible.map((t) => ({
    tipo_id: t.id, code: t.codigo, old_validity: t.validade === null || t.validade === undefined ? null : Number(t.validade),
    next_validity: TARGET_MONTHS, end_of_month: t.eom,
  }));
  const histories = [];
  const excluded = {};
  const perModel = {};
  const certificates = { with_certificate_id: 0, with_uploaded_file: 0, rows_with_any_certificate: 0 };
  const linkedForEstimate = [];
  for (const row of inventory.linked) {
    const model = modelById.get(Number(row.qualificacao_id));
    if (!model) { bump(excluded, 'model_blocked'); continue; }
    const entry = (perModel[model.codigo] ??= { linked: 0, new_expiry: 0, excluded: 0 });
    entry.linked++;
    const result = classifyLinked(row, model);
    const anyCert = Number(row.has_certificate_id) === 1 || Number(row.has_certificate_url) === 1;
    if (result.record) {
      histories.push(result.record);
      entry.new_expiry += result.record.old_expiry !== result.record.next_expiry ? 1 : 0;
      if (Number(row.has_certificate_id) === 1) certificates.with_certificate_id++;
      if (Number(row.has_certificate_url) === 1) certificates.with_uploaded_file++;
      if (anyCert) certificates.rows_with_any_certificate++;
    } else { bump(excluded, result.reason); entry.excluded++; }
    linkedForEstimate.push({ row, model, result, status: normStatus(row.status) });
  }

  // --- orphan relink / soft-delete ---
  const relinks = [];
  const softDeletes = [];
  const orphanExcluded = {};
  const orphanCertificates = { relink_with_certificate_id: 0, soft_delete_with_certificate_id: 0, soft_delete_with_uploaded_file: 0 };
  const succ = new Map(inventory.successors.map((r) => [Number(r.id), Number(r.n)]));
  const enr = new Map(inventory.lmsEnrollments.map((r) => [Number(r.id), Number(r.n)]));
  const cyc = new Map(inventory.lmsCycles.map((r) => [Number(r.id), Number(r.n)]));
  const collided = new Set(inventory.collisions.map(Number));
  const targetByCode = new Map();
  for (const t of inventory.targets) {
    // only tenant-6 models resolve for tenant 6; other tenants may legitimately reuse the same code
    if (Number(t.deleted) === 1 || Number(t.empresa_id) !== TENANT_ID) continue;
    const list = targetByCode.get(t.codigo) ?? [];
    list.push(t);
    targetByCode.set(t.codigo, list);
  }
  const found = new Set(inventory.orphans.map((r) => Number(r.id)));
  for (const id of ORPHAN_HISTORY_IDS) if (!found.has(id)) bump(orphanExcluded, 'orphan_history_missing');
  for (const row of inventory.orphans) {
    const id = Number(row.id);
    const code = row.type_code ?? null;
    const status = normStatus(row.status);
    const completion = dateOnly(row.data_conclusao);
    let reason = null;
    if (Number(row.empresa_id) !== TENANT_ID) reason = 'orphan_not_tenant_6';
    else if (Number(row.deleted) === 1) reason = 'orphan_already_deleted';
    else if (Number(row.type_deleted) !== 1 || Number(row.type_empresa_id) !== TENANT_ID) reason = 'orphan_type_not_soft_deleted_in_tenant';
    else if (!completion) reason = 'completion_date_missing_or_invalid';
    else if (!REALIZED_STATUSES.has(status)) reason = 'status_not_realized';
    else if (row.renovacao_de !== null && row.renovacao_de !== undefined) reason = 'lineage_present';
    else if ((succ.get(id) || 0) > 0) reason = 'lineage_present';
    else if ((enr.get(id) || 0) > 0 || (cyc.get(id) || 0) > 0) reason = 'lms_pointer_present';
    else if (!(code in RELINK_MAP) && !SOFT_DELETE_CODES.has(code)) reason = 'orphan_code_not_in_owner_decision';
    if (reason) { bump(orphanExcluded, reason); continue; }
    if (code in RELINK_MAP) {
      const targetCode = RELINK_MAP[code];
      const candidates = targetByCode.get(targetCode) ?? [];
      const target = candidates.length === 1 ? candidates[0] : null;
      if (!target) { bump(orphanExcluded, 'target_type_missing_or_ambiguous'); continue; }
      const targetValidity = asInt(target.validade) ?? 0;
      // a target that is itself in the batch would be set to 24; any other target must already hold a positive validity
      const planned = modelById.get(Number(target.id));
      const nextValidity = planned ? TARGET_MONTHS : targetValidity;
      if (nextValidity < 1) { bump(orphanExcluded, 'target_type_without_validity'); continue; }
      if (collided.has(id)) { bump(orphanExcluded, 'relink_code_collision'); continue; }
      const eom = Number(target.eom);
      const nextExpiry = addMonthsClamped(completion, nextValidity, eom === 1);
      const text = /^[0-9A-Za-zÀ-ÿ _.,\-/()]{1,120}$/;
      const oldTipo = row.tipo ?? null;
      const oldCategoria = row.categoria ?? null;
      const newTipo = target.nome ?? null;
      const newCategoria = target.categoria ?? null;
      const representable = [oldTipo, oldCategoria, newTipo, newCategoria].every((v) => v === null || text.test(String(v)))
        && /^[A-Z0-9_-]{1,64}$/.test(String(row.qualificacao_codigo ?? ''));
      if (!nextExpiry || !representable) { bump(orphanExcluded, 'relink_values_not_representable'); continue; }
      if (Number(row.has_certificate_id) === 1) orphanCertificates.relink_with_certificate_id++;
      relinks.push({
        id, funcionario_id: Number(row.funcionario_id), status, completion,
        from: { qualificacao_id: Number(row.qualificacao_id), code: row.qualificacao_codigo ?? '', tipo: oldTipo, categoria: oldCategoria },
        to: { qualificacao_id: Number(target.id), code: targetCode, tipo: newTipo, categoria: newCategoria },
        old_expiry: row.data_vencimento ?? null, next_expiry: nextExpiry,
        old_validity_months: asInt(row.validade_meses), next_validity_months: nextValidity, end_of_month: eom,
      });
    } else {
      if (Number(row.has_certificate_id) === 1) orphanCertificates.soft_delete_with_certificate_id++;
      if (Number(row.has_certificate_url) === 1) orphanCertificates.soft_delete_with_uploaded_file++;
      softDeletes.push({ id, qualificacao_id: Number(row.qualificacao_id), model_code: code, status, completion });
    }
  }

  const byId = (key) => (a, b) => a[key] - b[key];
  const manifest = buildExecutionManifest({
    models: models.sort(byId('tipo_id')), relinks: relinks.sort(byId('id')),
    histories: histories.sort(byId('id')), soft_deletes: softDeletes.sort(byId('id')),
  });
  const body = { models: manifest.models, relinks: manifest.relinks, histories: manifest.histories, soft_deletes: manifest.soft_deletes };

  // --- compliance estimate (approximate: ignores requirement scopes, employee status, LMS evidence) ---
  const estimate = { today: todayDate, ignores: 'requirement scopes, employee active status and concurrent LMS evidence', transitions: {}, current_evidence_pairs: 0, pairs_changing_bucket: 0, pairs_moving_to_vencido: 0, pairs_moving_to_vencendo: 0 };
  const byPair = new Map();
  for (const item of linkedForEstimate) {
    if (NON_COMPLIANCE_STATUSES.has(item.status) || !dateOnly(item.row.data_conclusao)) continue;
    const key = `${item.row.funcionario_id}:${item.row.qualificacao_id}`;
    const list = byPair.get(key) ?? [];
    list.push(item);
    byPair.set(key, list);
  }
  for (const list of byPair.values()) {
    list.sort((a, b) => (b.row.data_conclusao.localeCompare(a.row.data_conclusao)) || (Number(b.row.id) - Number(a.row.id)));
    const current = list[0];
    if (!(requisitos.get(Number(current.row.qualificacao_id)) > 0)) continue;
    estimate.current_evidence_pairs++;
    const before = bucket(current.row.data_vencimento, todayDate);
    const after = current.result.record ? bucket(current.result.record.next_expiry, todayDate)
      : (current.result.reason === 'already_consistent' ? before : bucket(current.row.data_vencimento, todayDate));
    bump(estimate.transitions, `${before}->${after}`);
    if (before !== after) {
      estimate.pairs_changing_bucket++;
      if (after === 'VENCIDO') estimate.pairs_moving_to_vencido++;
      if (after === 'VENCENDO') estimate.pairs_moving_to_vencendo++;
    }
  }
  estimate.models_with_active_requirement = [...requisitos.keys()].filter((id) => modelById.has(id)).length;

  const newExpiry = histories.filter((h) => h.old_expiry !== h.next_expiry).length;
  const summary = {
    inventory: 'QUALIFICATION_MODEL_BATCH_TENANT6_2158',
    empresa_id: TENANT_ID,
    plan_sha256: manifest.plan_sha256,
    row_count: manifest.row_count,
    models: { eligible: models.length, blocked: blockedModels.length, blocked_detail: blockedModels, eligible_codes: models.map((m) => m.code) },
    linked_histories: {
      linked_live_total: inventory.linked.length, operations: histories.length, new_expiry: newExpiry,
      validity_months_only: histories.length - newExpiry, excluded, certificates, by_model: Object.fromEntries(Object.entries(perModel).sort(([a], [b]) => a.localeCompare(b))),
    },
    orphans: {
      scope_ids: ORPHAN_HISTORY_IDS.length, relink: relinks.length, soft_delete: softDeletes.length, excluded: orphanExcluded,
      certificates: orphanCertificates,
      relink_by_target: relinks.reduce((acc, r) => { bump(acc, r.to.code); return acc; }, {}),
      soft_delete_by_model: softDeletes.reduce((acc, r) => { bump(acc, r.model_code); return acc; }, {}),
    },
    compliance_estimate: estimate,
    writes: 0, pii_emitted: false, production_apply_authorized: false,
  };
  return { manifest, body, summary };
}

function run() {
  const args = process.argv.slice(2);
  if (args.includes('--apply') || args.some((a) => /--write|--execute|--mutate/i.test(a))) throw new Error('PRODUCTION_WRITE_FORBIDDEN');
  if (process.env.AIRTRUST_MODEL_BATCH_READONLY_CONFIRMATION !== READONLY_CONFIRMATION) throw new Error('EXPLICIT_READONLY_CONFIRMATION_REQUIRED');
  const manifestFlag = args.find((a) => a.startsWith('--manifest='));
  const todayFlag = args.find((a) => a.startsWith('--today='));
  if (args.some((a) => !a.startsWith('--manifest=') && !a.startsWith('--today='))) throw new Error('UNRECOGNIZED_ARGUMENT');
  const port = wranglerExecutor({ database: 'airtrust-db', env: 'production', remote: true, allowWrites: false, cwd: path.join(ROOT, 'worker-airtrust') });
  const plan = buildBatchPlan(readInventory(port), { today: todayFlag?.slice('--today='.length) });
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
    console.error('QUALIFICATION_MODEL_BATCH_READONLY_PLAN_ERROR:' + (error instanceof Error ? error.message : 'UNKNOWN'));
    process.exitCode = 1;
  }
}
