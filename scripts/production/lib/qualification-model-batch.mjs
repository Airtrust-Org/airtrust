// source_reference: issue #2158 (owner decisions of 10/11/2026: models without validity -> 24 months, histories follow the model,
//   orphan OUT_* histories relinked or soft-deleted), pattern of PR #2141/#2153 (qualification-expiry-executor.mjs).
// operational_decision: governed per-statement CAS executor for tenant 6 only. Four operation kinds, applied in this order:
//   model (qualificacoes_tipos.validade) -> relink (orphan history -> current type) -> history (validade_meses/data_vencimento) -> softdelete.
// dry_run_required: default dry-run (reads only; port.exec is never called). Apply needs plan hash + row count + SHA binding + audit actor.
// rollback_plan_required: buildRollbackManifest embeds the forward manifest; the inverse CAS operations are derived from it
//   deterministically (reverse order, from/to swapped) and are bound to the original source SHA by their own hash.
//
// Domain library over an executor port { query(sql) -> rows, exec(sql) -> void } (scripts/production/lib/executors.mjs).
// Nothing here talks to a database by itself. Never touched by any operation: certificado_arquivo_id, arquivo_url,
// numero_certificado, data_conclusao, status, lms_* pointers (soft-delete only runs when no pointer exists).
import { createHash } from 'node:crypto';

export const TENANT_ID = 6;
export const MAX_OPS = 1000;
export const TARGET_MONTHS = 24;
export const MANIFEST_KIND = 'QUALIFICATION_MODEL_BATCH_MANIFEST_2158';
export const ROLLBACK_KIND = 'QUALIFICATION_MODEL_BATCH_ROLLBACK_MANIFEST_2158';
export const AUDIT_BASE = 'QUALIFICATION_MODEL_BATCH_2158';
export const KINDS = ['model', 'relink', 'history', 'softdelete'];
const KIND_LABEL = { model: 'MODEL', relink: 'RELINK', history: 'HISTORY', softdelete: 'SOFT_DELETE' };
const ENTITY = { model: 'qualificacoes_tipos', relink: 'qualificacoes_historico', history: 'qualificacoes_historico', softdelete: 'qualificacoes_historico' };

export function auditAction(kind, direction) {
  return `${AUDIT_BASE}_${KIND_LABEL[kind]}${direction === 'rollback' ? '_ROLLBACK' : ''}`;
}

/** Statuses that count as a realized qualification (owner decision 1: NULL status with dates is a real completion). */
export const REALIZED_STATUSES = new Set(['', 'CONCLUIDA', 'CONCLUIDO', 'RENOVADA', 'VALIDA', 'VENCIDA', 'PROXIMA_VENCIMENTO']);

const HASH_RE = /^[0-9a-f]{64}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RAW_TEXT_RE = /^[0-9A-Za-z:.+\- ]{1,40}$/;
const NAME_TEXT_RE = /^[0-9A-Za-zÀ-ÿ _.,\-/()]{1,120}$/;
const CODE_RE = /^[A-Z0-9_-]{1,64}$/;
const STATUS_RE = /^[A-Z_]{0,20}$/;
const ACTOR_RE = /^[A-Za-z0-9_.@-]{1,64}$/;

const fail = (code) => { throw new Error(code); };
const check = (value, code) => { if (!value) fail(code); };

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

// ---------- canonical date math (clamp semantics) ----------
export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Exact-day mode keeps the day and clamps it to the last valid day of the target month
 * (2024-02-29 + 24m -> 2026-02-28). End-of-month mode returns the last day of the target month.
 */
export function addMonthsClamped(date, months, endOfMonth = false) {
  if (!isValidDate(date) || !Number.isInteger(months) || months < 1 || months > 600) return null;
  const [y, m, d] = date.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = endOfMonth ? last : Math.min(d, last);
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------- literal rendering (validated first; no free text reaches SQL) ----------
function sqlInt(value) {
  check(Number.isSafeInteger(value), 'SQL_INT_INVALID');
  return String(value);
}
function sqlNullableInt(value) { return value === null ? 'NULL' : sqlInt(value); }
function sqlText(value, re, code) {
  check(typeof value === 'string' && re.test(value), code);
  return `'${value}'`;
}
function sqlNullableText(value, re = RAW_TEXT_RE) {
  return value === null ? 'NULL' : sqlText(value, re, 'SQL_TEXT_INVALID');
}
function intOrNull(value, code) {
  if (value === null || value === undefined) return null;
  check(typeof value === 'number' && Number.isSafeInteger(value), code);
  return value;
}
function nullableText(value, re, code) {
  if (value === null || value === undefined) return null;
  check(typeof value === 'string' && re.test(value), code);
  return value;
}

// ---------- canonical rows ----------
export function canonicalModel(row) {
  check(row && typeof row === 'object', 'MODEL_ROW_INVALID');
  check(Number.isSafeInteger(row.tipo_id) && row.tipo_id > 0, 'MODEL_ROW_ID');
  check(typeof row.code === 'string' && CODE_RE.test(row.code), 'MODEL_ROW_CODE');
  const oldValidity = intOrNull(row.old_validity ?? null, 'MODEL_ROW_OLD_VALIDITY');
  check(oldValidity === null || oldValidity <= 0, 'MODEL_ROW_OLD_VALIDITY_NOT_EMPTY');
  check(row.next_validity === TARGET_MONTHS, 'MODEL_ROW_NEXT_VALIDITY');
  check(row.end_of_month === 0 || row.end_of_month === 1, 'MODEL_ROW_EOM');
  return { tipo_id: row.tipo_id, code: row.code, old_validity: oldValidity, next_validity: TARGET_MONTHS, end_of_month: row.end_of_month };
}

function commonHistory(row, prefix) {
  check(row && typeof row === 'object', `${prefix}_ROW_INVALID`);
  check(Number.isSafeInteger(row.id) && row.id > 0, `${prefix}_ROW_ID`);
  check(typeof row.status === 'string' && STATUS_RE.test(row.status) && REALIZED_STATUSES.has(row.status), `${prefix}_ROW_STATUS`);
  check(isValidDate(row.completion), `${prefix}_ROW_COMPLETION`);
  return { id: row.id, status: row.status, completion: row.completion };
}

export function canonicalHistory(row) {
  const base = commonHistory(row, 'HISTORY');
  check(Number.isSafeInteger(row.qualificacao_id) && row.qualificacao_id > 0, 'HISTORY_ROW_MODEL');
  check(typeof row.model_code === 'string' && CODE_RE.test(row.model_code), 'HISTORY_ROW_MODEL_CODE');
  check(row.end_of_month === 0 || row.end_of_month === 1, 'HISTORY_ROW_EOM');
  check(row.next_validity_months === TARGET_MONTHS, 'HISTORY_ROW_NEXT_VALIDITY');
  const oldExpiry = nullableText(row.old_expiry, RAW_TEXT_RE, 'HISTORY_ROW_OLD_EXPIRY');
  const oldValidity = intOrNull(row.old_validity_months ?? null, 'HISTORY_ROW_OLD_VALIDITY');
  check(addMonthsClamped(base.completion, TARGET_MONTHS, row.end_of_month === 1) === row.next_expiry, 'HISTORY_ROW_EXPIRY_RULE_MISMATCH');
  check(oldExpiry !== row.next_expiry || oldValidity !== TARGET_MONTHS, 'HISTORY_ROW_NOOP');
  return {
    id: base.id, qualificacao_id: row.qualificacao_id, model_code: row.model_code, status: base.status,
    completion: base.completion, old_expiry: oldExpiry, next_expiry: row.next_expiry,
    old_validity_months: oldValidity, next_validity_months: TARGET_MONTHS, end_of_month: row.end_of_month,
  };
}

function canonicalLinkState(state, prefix) {
  check(state && typeof state === 'object', `${prefix}_STATE`);
  check(Number.isSafeInteger(state.qualificacao_id) && state.qualificacao_id > 0, `${prefix}_STATE_MODEL`);
  check(typeof state.code === 'string' && CODE_RE.test(state.code), `${prefix}_STATE_CODE`);
  return {
    qualificacao_id: state.qualificacao_id, code: state.code,
    tipo: nullableText(state.tipo, NAME_TEXT_RE, `${prefix}_STATE_TIPO`),
    categoria: nullableText(state.categoria, NAME_TEXT_RE, `${prefix}_STATE_CATEGORIA`),
  };
}

export function canonicalRelink(row) {
  const base = commonHistory(row, 'RELINK');
  check(Number.isSafeInteger(row.funcionario_id) && row.funcionario_id > 0, 'RELINK_ROW_EMPLOYEE');
  const from = canonicalLinkState(row.from, 'RELINK_FROM');
  const to = canonicalLinkState(row.to, 'RELINK_TO');
  check(from.qualificacao_id !== to.qualificacao_id && from.code !== to.code, 'RELINK_ROW_NOOP');
  check(row.end_of_month === 0 || row.end_of_month === 1, 'RELINK_ROW_EOM');
  const nextValidity = intOrNull(row.next_validity_months, 'RELINK_ROW_NEXT_VALIDITY');
  check(nextValidity !== null && nextValidity >= 1 && nextValidity <= 600, 'RELINK_ROW_NEXT_VALIDITY');
  const oldExpiry = nullableText(row.old_expiry, RAW_TEXT_RE, 'RELINK_ROW_OLD_EXPIRY');
  const oldValidity = intOrNull(row.old_validity_months ?? null, 'RELINK_ROW_OLD_VALIDITY');
  check(addMonthsClamped(base.completion, nextValidity, row.end_of_month === 1) === row.next_expiry, 'RELINK_ROW_EXPIRY_RULE_MISMATCH');
  return {
    id: base.id, funcionario_id: row.funcionario_id, status: base.status, completion: base.completion,
    from, to, old_expiry: oldExpiry, next_expiry: row.next_expiry,
    old_validity_months: oldValidity, next_validity_months: nextValidity, end_of_month: row.end_of_month,
  };
}

export function canonicalSoftDelete(row) {
  const base = commonHistory(row, 'SOFT_DELETE');
  check(Number.isSafeInteger(row.qualificacao_id) && row.qualificacao_id > 0, 'SOFT_DELETE_ROW_MODEL');
  check(typeof row.model_code === 'string' && CODE_RE.test(row.model_code), 'SOFT_DELETE_ROW_MODEL_CODE');
  // owner decision on a colliding orphan: soft-delete only as a duplicate of a live row (same employee, date and target type)
  let duplicateOf = null;
  if (row.duplicate_of !== null && row.duplicate_of !== undefined) {
    const d = row.duplicate_of;
    check(Number.isSafeInteger(d.id) && d.id > 0 && d.id !== base.id, 'SOFT_DELETE_DUPLICATE_ID');
    check(Number.isSafeInteger(d.qualificacao_id) && d.qualificacao_id > 0, 'SOFT_DELETE_DUPLICATE_MODEL');
    check(Number.isSafeInteger(d.funcionario_id) && d.funcionario_id > 0, 'SOFT_DELETE_DUPLICATE_EMPLOYEE');
    duplicateOf = { id: d.id, qualificacao_id: d.qualificacao_id, funcionario_id: d.funcionario_id };
  }
  return {
    id: base.id, qualificacao_id: row.qualificacao_id, model_code: row.model_code, status: base.status,
    completion: base.completion, duplicate_of: duplicateOf,
  };
}

function sortedById(rows, key, code) {
  for (let i = 1; i < rows.length; i++) check(rows[i - 1][key] < rows[i][key], code);
  return rows;
}

function canonicalBody(source) {
  check(source && typeof source === 'object', 'MANIFEST_INVALID');
  const lists = ['models', 'relinks', 'histories', 'soft_deletes'];
  for (const list of lists) check(Array.isArray(source[list]), 'MANIFEST_LISTS_MISSING');
  const models = sortedById(source.models.map(canonicalModel), 'tipo_id', 'MANIFEST_MODELS_NOT_SORTED_OR_DUPLICATE');
  const relinks = sortedById(source.relinks.map(canonicalRelink), 'id', 'MANIFEST_RELINKS_NOT_SORTED_OR_DUPLICATE');
  const histories = sortedById(source.histories.map(canonicalHistory), 'id', 'MANIFEST_HISTORIES_NOT_SORTED_OR_DUPLICATE');
  const softDeletes = sortedById(source.soft_deletes.map(canonicalSoftDelete), 'id', 'MANIFEST_SOFT_DELETES_NOT_SORTED_OR_DUPLICATE');
  // one history row can only be touched by a single operation
  const seen = new Set();
  for (const row of [...relinks, ...histories, ...softDeletes]) {
    check(!seen.has(row.id), 'MANIFEST_HISTORY_IN_MULTIPLE_OPERATIONS');
    seen.add(row.id);
  }
  // the evidence row of a duplicate soft-delete must itself stay untouched by the batch
  for (const row of softDeletes) check(!row.duplicate_of || !seen.has(row.duplicate_of.id), 'MANIFEST_DUPLICATE_EVIDENCE_TOUCHED');
  // history operations may only follow a model operation of this very manifest (same code and end-of-month mode)
  const byModel = new Map(models.map((m) => [m.tipo_id, m]));
  for (const h of histories) {
    const model = byModel.get(h.qualificacao_id);
    check(model && model.code === h.model_code && model.end_of_month === h.end_of_month, 'MANIFEST_HISTORY_MODEL_NOT_IN_BATCH');
  }
  return { models, relinks, histories, soft_deletes: softDeletes };
}

export function hashBody(body) {
  return sha256Hex(JSON.stringify({
    models: body.models, relinks: body.relinks, histories: body.histories, soft_deletes: body.soft_deletes,
  }));
}

export function countOps(body) {
  return body.models.length + body.relinks.length + body.histories.length + body.soft_deletes.length;
}

/** Deterministic execution manifest from planner output. */
export function buildExecutionManifest(plan, { sourceSha = null } = {}) {
  const body = canonicalBody(plan?.manifest ?? plan);
  const total = countOps(body);
  check(total > 0 && total <= MAX_OPS, 'MANIFEST_ROW_COUNT');
  check(sourceSha === null || SHA_RE.test(String(sourceSha)), 'MANIFEST_SOURCE_SHA_INVALID');
  return {
    kind: MANIFEST_KIND, empresa_id: TENANT_ID, row_count: total, plan_sha256: hashBody(body),
    source_sha: sourceSha, ...body,
  };
}

export function validateManifest(manifest, { expectedPlanHash, expectedCount }) {
  check(HASH_RE.test(String(expectedPlanHash ?? '')), 'EXPECTED_PLAN_HASH_REQUIRED');
  check(Number.isSafeInteger(expectedCount) && expectedCount > 0, 'EXPECTED_COUNT_REQUIRED');
  check(manifest && manifest.kind === MANIFEST_KIND && manifest.empresa_id === TENANT_ID, 'MANIFEST_TENANT');
  const body = canonicalBody(manifest);
  const total = countOps(body);
  check(total > 0 && total <= MAX_OPS, 'MANIFEST_ROW_COUNT');
  const hash = hashBody(body);
  check(manifest.plan_sha256 === hash, 'MANIFEST_HASH_MISMATCH');
  check(hash === expectedPlanHash, 'EXPECTED_PLAN_HASH_MISMATCH');
  check(total === expectedCount, 'EXPECTED_ROW_COUNT_MISMATCH');
  const sourceSha = manifest.source_sha ?? null;
  check(sourceSha === null || SHA_RE.test(String(sourceSha)), 'MANIFEST_SOURCE_SHA_INVALID');
  return { body, planSha256: hash, sourceSha, total };
}

function hashRollback(sourceSha, forwardHash) {
  return sha256Hex(JSON.stringify({ direction: 'rollback', source_sha: sourceSha, forward_plan_sha256: forwardHash }));
}

/** Compensating manifest: embeds the validated forward manifest; inverse CAS operations are derived from it. */
export function buildRollbackManifest(forwardManifest, { expectedPlanHash, expectedCount }) {
  const { body, planSha256, sourceSha, total } = validateManifest(forwardManifest, { expectedPlanHash, expectedCount });
  return {
    kind: ROLLBACK_KIND, empresa_id: TENANT_ID, row_count: total, source_sha: sourceSha,
    forward_plan_sha256: planSha256, rollback_plan_sha256: hashRollback(sourceSha, planSha256),
    forward: { kind: MANIFEST_KIND, empresa_id: TENANT_ID, row_count: total, plan_sha256: planSha256, source_sha: sourceSha, ...body },
  };
}

export function validateRollbackManifest(manifest, { expectedPlanHash, expectedCount }) {
  check(HASH_RE.test(String(expectedPlanHash ?? '')), 'EXPECTED_PLAN_HASH_REQUIRED');
  check(manifest && manifest.kind === ROLLBACK_KIND && manifest.empresa_id === TENANT_ID, 'ROLLBACK_MANIFEST_INVALID');
  check(HASH_RE.test(String(manifest.forward_plan_sha256 ?? '')), 'ROLLBACK_FORWARD_HASH_INVALID');
  const forward = validateManifest(manifest.forward, { expectedPlanHash: manifest.forward_plan_sha256, expectedCount });
  check((manifest.source_sha ?? null) === forward.sourceSha, 'ROLLBACK_SOURCE_SHA_MISMATCH');
  const hash = hashRollback(forward.sourceSha, forward.planSha256);
  check(manifest.rollback_plan_sha256 === hash && hash === expectedPlanHash, 'ROLLBACK_HASH_MISMATCH');
  return { body: forward.body, planSha256: hash, forwardPlanSha256: forward.planSha256, sourceSha: forward.sourceSha, total: forward.total };
}

// ---------- operation descriptors (direction-neutral) ----------
function buildOps(body, direction) {
  const modelState = (validity) => ({ validity });
  const models = body.models.map((m) => ({
    kind: 'model', id: m.tipo_id, spec: m,
    from: modelState(m.old_validity), to: modelState(m.next_validity),
  }));
  const relinks = body.relinks.map((r) => ({
    kind: 'relink', id: r.id, spec: r,
    from: { ...r.from, expiry: r.old_expiry, validity: r.old_validity_months },
    to: { ...r.to, expiry: r.next_expiry, validity: r.next_validity_months },
  }));
  const histories = body.histories.map((h) => ({
    kind: 'history', id: h.id, spec: h,
    from: { expiry: h.old_expiry, validity: h.old_validity_months },
    to: { expiry: h.next_expiry, validity: h.next_validity_months },
  }));
  const deletes = body.soft_deletes.map((d) => ({
    kind: 'softdelete', id: d.id, spec: d, from: { deleted: 0 }, to: { deleted: 1 },
  }));
  const forward = [...models, ...relinks, ...histories, ...deletes];
  if (direction === 'forward') return forward.map((op) => ({ ...op, direction }));
  return forward.reverse().map((op) => ({ ...op, direction, from: op.to, to: op.from }));
}

// ---------- CAS statements ----------
const statusGuard = (spec) => `UPPER(TRIM(COALESCE(status, ''))) = ${sqlText(spec.status, STATUS_RE, 'SQL_STATUS_INVALID')}`;
const completionGuard = (spec) => `substr(data_conclusao, 1, 10) = ${sqlText(spec.completion, DATE_RE, 'SQL_DATE_INVALID')}`;

function modelExists(alias, tipoIdSql, { code, validity, endOfMonth }) {
  return `EXISTS (SELECT 1 FROM qualificacoes_tipos ${alias}
     WHERE ${alias}.id = ${tipoIdSql}
       AND ${alias}.empresa_id = ${TENANT_ID}
       AND ${alias}.deleted_at IS NULL
       AND UPPER(TRIM(${alias}.codigo)) = ${sqlText(code, CODE_RE, 'SQL_MODEL_INVALID')}
       AND ${alias}.validade = ${sqlInt(validity)}
       AND COALESCE(${alias}.vencimento_fim_mes, 0) = ${sqlInt(endOfMonth)})`;
}

function duplicateGuard(spec) {
  const d = spec.duplicate_of;
  if (!d) return '';
  return `
   AND EXISTS (SELECT 1 FROM qualificacoes_historico d
     WHERE d.id = ${sqlInt(d.id)} AND d.empresa_id = ${TENANT_ID} AND d.deleted_at IS NULL
       AND d.funcionario_id = qualificacoes_historico.funcionario_id
       AND d.funcionario_id = ${sqlInt(d.funcionario_id)}
       AND d.data_conclusao = qualificacoes_historico.data_conclusao
       AND d.qualificacao_id = ${sqlInt(d.qualificacao_id)})`;
}

/** One CAS UPDATE. Never writes certificate columns, data_conclusao, status or lms pointers. */
export function casUpdateSql(op) {
  const { spec, from, to } = op;
  const forward = op.direction === 'forward';
  if (op.kind === 'model') {
    return `UPDATE qualificacoes_tipos
   SET validade = ${sqlNullableInt(to.validity)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.tipo_id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND validade IS ${sqlNullableInt(from.validity)}
   AND UPPER(TRIM(codigo)) = ${sqlText(spec.code, CODE_RE, 'SQL_MODEL_INVALID')}
   AND COALESCE(vencimento_fim_mes, 0) = ${sqlInt(spec.end_of_month)}`;
  }
  if (op.kind === 'history') {
    const guard = forward
      ? `\n   AND ${modelExists('t', 'qualificacoes_historico.qualificacao_id', { code: spec.model_code, validity: to.validity, endOfMonth: spec.end_of_month })}`
      : '';
    return `UPDATE qualificacoes_historico
   SET data_vencimento = ${sqlNullableText(to.expiry)}, validade_meses = ${sqlNullableInt(to.validity)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND qualificacao_id = ${sqlInt(spec.qualificacao_id)}
   AND data_vencimento IS ${sqlNullableText(from.expiry)}
   AND validade_meses IS ${sqlNullableInt(from.validity)}
   AND ${completionGuard(spec)}
   AND ${statusGuard(spec)}${guard}`;
  }
  if (op.kind === 'relink') {
    const guard = forward
      ? `\n   AND ${modelExists('t', sqlInt(to.qualificacao_id), { code: to.code, validity: to.validity, endOfMonth: spec.end_of_month })}
   AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico x
     WHERE x.empresa_id = ${TENANT_ID} AND x.deleted_at IS NULL
       AND x.funcionario_id = qualificacoes_historico.funcionario_id
       AND x.data_conclusao = qualificacoes_historico.data_conclusao
       AND x.qualificacao_codigo = ${sqlText(to.code, CODE_RE, 'SQL_CODE_INVALID')}
       AND x.id <> qualificacoes_historico.id)`
      : '';
    return `UPDATE qualificacoes_historico
   SET qualificacao_id = ${sqlInt(to.qualificacao_id)},
       qualificacao_codigo = ${sqlNullableText(to.code, CODE_RE)},
       tipo = ${sqlNullableText(to.tipo, NAME_TEXT_RE)},
       categoria = ${sqlNullableText(to.categoria, NAME_TEXT_RE)},
       data_vencimento = ${sqlNullableText(to.expiry)}, validade_meses = ${sqlNullableInt(to.validity)},
       updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND funcionario_id = ${sqlInt(spec.funcionario_id)}
   AND qualificacao_id = ${sqlInt(from.qualificacao_id)}
   AND qualificacao_codigo IS ${sqlNullableText(from.code, CODE_RE)}
   AND tipo IS ${sqlNullableText(from.tipo, NAME_TEXT_RE)}
   AND categoria IS ${sqlNullableText(from.categoria, NAME_TEXT_RE)}
   AND data_vencimento IS ${sqlNullableText(from.expiry)}
   AND validade_meses IS ${sqlNullableInt(from.validity)}
   AND ${completionGuard(spec)}
   AND ${statusGuard(spec)}${guard}`;
  }
  // softdelete: same shape as DELETE /qualificacoes/historico/:id (deleted_at only) and only when nothing points at the row.
  if (forward) {
    return `UPDATE qualificacoes_historico
   SET deleted_at = datetime('now'), updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND qualificacao_id = ${sqlInt(spec.qualificacao_id)}
   AND ${completionGuard(spec)}
   AND ${statusGuard(spec)}
   AND UPPER(TRIM(COALESCE(status, ''))) <> 'RENOVADA'
   AND renovacao_de IS NULL
   AND EXISTS (SELECT 1 FROM qualificacoes_tipos t
     WHERE t.id = qualificacoes_historico.qualificacao_id AND t.empresa_id = ${TENANT_ID}
       AND t.deleted_at IS NOT NULL AND UPPER(TRIM(t.codigo)) = ${sqlText(spec.model_code, CODE_RE, 'SQL_MODEL_INVALID')})
   AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico s WHERE s.renovacao_de = qualificacoes_historico.id AND s.deleted_at IS NULL)
   AND NOT EXISTS (SELECT 1 FROM lms_matriculas m WHERE m.qualificacao_historico_id = qualificacoes_historico.id)
   AND NOT EXISTS (SELECT 1 FROM lms_matricula_ciclos c WHERE c.qualificacao_historico_id = qualificacoes_historico.id)${duplicateGuard(spec)}`;
  }
  return `UPDATE qualificacoes_historico
   SET deleted_at = NULL, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NOT NULL
   AND qualificacao_id = ${sqlInt(spec.qualificacao_id)}
   AND ${completionGuard(spec)}
   AND ${statusGuard(spec)}`;
}

function auditJson(op, state) {
  if (op.kind === 'model') return `json_object('validade', ${sqlNullableInt(state.validity)})`;
  if (op.kind === 'softdelete') return `json_object('deleted', ${sqlInt(state.deleted)})`;
  if (op.kind === 'history') return `json_object('data_vencimento', ${sqlNullableText(state.expiry)}, 'validade_meses', ${sqlNullableInt(state.validity)})`;
  return `json_object('qualificacao_id', ${sqlInt(state.qualificacao_id)}, 'qualificacao_codigo', ${sqlNullableText(state.code, CODE_RE)},
    'data_vencimento', ${sqlNullableText(state.expiry)}, 'validade_meses', ${sqlNullableInt(state.validity)})`;
}

/** Audit row written only if the preceding UPDATE changed a row (changes() > 0). */
export function auditInsertSql(op, { planSha256, sourceSha, actor }) {
  check(ACTOR_RE.test(actor ?? ''), 'ACTOR_INVALID');
  check(SHA_RE.test(sourceSha ?? ''), 'SOURCE_SHA_INVALID');
  check(HASH_RE.test(planSha256), 'PLAN_HASH_INVALID');
  return `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, empresa_id, created_at)
SELECT NULL, '${auditAction(op.kind, op.direction)}', '${ENTITY[op.kind]}', ${sqlInt(op.id)},
  ${auditJson(op, op.from)},
  json_set(${auditJson(op, op.to)}, '$.actor', '${actor}', '$.plan_sha256', '${planSha256}', '$.source_sha', '${sourceSha}', '$.direction', '${op.direction}'),
  ${TENANT_ID}, datetime('now')
WHERE changes() > 0`;
}

// ---------- live reads ----------
const ids = (list) => list.map((n) => sqlInt(n)).join(',');

function readModels(port, list) {
  const map = new Map();
  if (list.length === 0) return map;
  for (const row of port.query(`SELECT id, UPPER(TRIM(codigo)) AS code, validade, COALESCE(vencimento_fim_mes, 0) AS eom,
  CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM qualificacoes_tipos WHERE empresa_id = ${TENANT_ID} AND id IN (${ids(list)})`)) map.set(Number(row.id), row);
  return map;
}

function readHistories(port, list) {
  const map = new Map();
  if (list.length === 0) return map;
  for (const row of port.query(`SELECT h.id, h.funcionario_id, h.qualificacao_id, h.qualificacao_codigo, h.tipo, h.categoria,
  UPPER(TRIM(COALESCE(h.status, ''))) AS status, substr(h.data_conclusao, 1, 10) AS completion,
  h.data_vencimento, h.validade_meses, h.renovacao_de,
  CASE WHEN h.deleted_at IS NULL THEN 0 ELSE 1 END AS deleted,
  (SELECT COUNT(*) FROM qualificacoes_historico s WHERE s.renovacao_de = h.id AND s.deleted_at IS NULL) AS successors,
  (SELECT COUNT(*) FROM lms_matriculas m WHERE m.qualificacao_historico_id = h.id) AS lms_enrollments,
  (SELECT COUNT(*) FROM lms_matricula_ciclos c WHERE c.qualificacao_historico_id = h.id) AS lms_cycles
 FROM qualificacoes_historico h WHERE h.empresa_id = ${TENANT_ID} AND h.id IN (${ids(list)})`)) map.set(Number(row.id), row);
  return map;
}

function readCollisions(port, relinks) {
  const hit = new Set();
  for (const op of relinks) {
    const spec = op.spec;
    const rows = port.query(`SELECT x.id FROM qualificacoes_historico h
 JOIN qualificacoes_historico x ON x.empresa_id = ${TENANT_ID} AND x.deleted_at IS NULL
   AND x.funcionario_id = h.funcionario_id AND x.data_conclusao = h.data_conclusao
   AND x.qualificacao_codigo = ${sqlText(spec.to.code, CODE_RE, 'SQL_CODE_INVALID')} AND x.id <> h.id
 WHERE h.id = ${sqlInt(spec.id)} AND h.empresa_id = ${TENANT_ID}`);
    if (rows.length > 0) hit.add(spec.id);
  }
  return hit;
}

function readAudits(port, ops) {
  const map = new Set();
  const list = ops.map((o) => o.id);
  if (list.length === 0) return map;
  const actions = KINDS.flatMap((k) => [auditAction(k, 'forward'), auditAction(k, 'rollback')]);
  const rows = port.query(`SELECT entity_type, entity_id, action, json_extract(new_values, '$.plan_sha256') AS plan_sha256
 FROM audit_logs WHERE empresa_id = ${TENANT_ID} AND action IN (${actions.map((a) => `'${a}'`).join(',')})
   AND entity_id IN (${ids([...new Set(list)])})`);
  for (const r of rows) map.add(`${r.entity_type}|${r.entity_id}|${r.action}|${r.plan_sha256}`);
  return map;
}

// ---------- classification ----------
const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

function stateMatches(op, live, state) {
  if (op.kind === 'model') return num(live.validade) === state.validity;
  if (op.kind === 'softdelete') return Number(live.deleted) === state.deleted;
  const base = (live.data_vencimento ?? null) === state.expiry && num(live.validade_meses) === state.validity;
  if (op.kind === 'history') return base;
  return base && Number(live.qualificacao_id) === state.qualificacao_id && (live.qualificacao_codigo ?? null) === state.code
    && (live.tipo ?? null) === state.tipo && (live.categoria ?? null) === state.categoria;
}

function guardsMatch(op, live) {
  const spec = op.spec;
  if (op.kind === 'model') return Number(live.deleted) === 0 && live.code === spec.code && Number(live.eom) === spec.end_of_month;
  if (String(live.status ?? '') !== spec.status || String(live.completion ?? '') !== spec.completion) return false;
  if (op.kind === 'history') return Number(live.qualificacao_id) === spec.qualificacao_id && Number(live.deleted) === 0;
  if (op.kind === 'relink') return Number(live.deleted) === 0 && Number(live.funcionario_id) === spec.funcionario_id;
  return Number(live.qualificacao_id) === spec.qualificacao_id;
}

function forwardExtraConflict(op, live, models, collisions, pendingModels, dups) {
  const validityReady = (m, want) => num(m.validade) === want || pendingModels.has(Number(m.id));
  const spec = op.spec;
  if (op.kind === 'history') {
    const m = models.get(spec.qualificacao_id);
    if (!m || Number(m.deleted) !== 0 || m.code !== spec.model_code || Number(m.eom) !== spec.end_of_month
      || !validityReady(m, spec.next_validity_months)) return 'model_not_in_expected_state';
  } else if (op.kind === 'relink') {
    const m = models.get(spec.to.qualificacao_id);
    if (!m) return 'target_model_missing_or_foreign_tenant';
    if (Number(m.deleted) !== 0 || m.code !== spec.to.code || Number(m.eom) !== spec.end_of_month
      || !validityReady(m, spec.next_validity_months)) return 'target_model_not_in_expected_state';
    if (collisions.has(spec.id)) return 'relink_code_collision';
  } else if (op.kind === 'softdelete') {
    if (Number(live.successors) > 0 || (live.renovacao_de ?? null) !== null || live.status === 'RENOVADA') return 'lineage_present';
    if (Number(live.lms_enrollments) > 0 || Number(live.lms_cycles) > 0) return 'lms_pointer_present';
    const m = models.get(spec.qualificacao_id);
    if (!m || Number(m.deleted) !== 1 || m.code !== spec.model_code) return 'orphan_model_not_deleted';
    if (spec.duplicate_of) {
      const d = dups.get(spec.duplicate_of.id);
      if (!d || Number(d.deleted) !== 0 || Number(d.qualificacao_id) !== spec.duplicate_of.qualificacao_id
        || Number(d.funcionario_id) !== spec.duplicate_of.funcionario_id || Number(d.funcionario_id) !== Number(live.funcionario_id)
        || String(d.completion ?? '') !== spec.completion) return 'duplicate_evidence_changed';
    }
  }
  return null;
}

function classify({ ops, live, models, audits, collisions, dups, direction, planSha256, forwardPlanSha256 }) {
  const out = { pending: [], already: [], skipped: [], conflicts: [] };
  const pendingModels = new Set();
  for (const op of ops) {
    const row = (op.kind === 'model' ? models : live).get(op.id);
    if (!row) { out.conflicts.push({ kind: op.kind, id: op.id, reason: 'row_missing_deleted_or_out_of_scope' }); continue; }
    const key = (hash) => `${ENTITY[op.kind]}|${op.id}|${auditAction(op.kind, direction)}|${hash}`;
    const forwardKey = `${ENTITY[op.kind]}|${op.id}|${auditAction(op.kind, 'forward')}|${forwardPlanSha256}`;
    if (!guardsMatch(op, row)) {
      // soft-delete target state is "deleted": a deleted row legitimately fails the live-row guard of forward ops
      if (!(op.kind === 'softdelete' && stateMatches(op, row, op.to) && String(row.status ?? '') === op.spec.status)) {
        out.conflicts.push({ kind: op.kind, id: op.id, reason: 'guard_fields_changed' });
        continue;
      }
    }
    if (stateMatches(op, row, op.to)) {
      if (audits.has(key(planSha256))) out.already.push(op);
      else if (direction === 'rollback' && !audits.has(forwardKey)) out.skipped.push(op);
      else out.conflicts.push({ kind: op.kind, id: op.id, reason: 'target_state_without_audit' });
      continue;
    }
    if (!stateMatches(op, row, op.from)) { out.conflicts.push({ kind: op.kind, id: op.id, reason: 'row_changed_since_plan' }); continue; }
    if (direction === 'forward') {
      const reason = forwardExtraConflict(op, row, models, collisions, pendingModels, dups);
      if (reason) { out.conflicts.push({ kind: op.kind, id: op.id, reason }); continue; }
    } else if (!audits.has(forwardKey)) {
      out.conflicts.push({ kind: op.kind, id: op.id, reason: 'not_applied_by_forward_plan' });
      continue;
    }
    if (op.kind === 'model') pendingModels.add(op.id);
    out.pending.push(op);
  }
  return out;
}

function snapshot(port, ops, direction) {
  const modelIds = new Set(ops.filter((o) => o.kind === 'model').map((o) => o.id));
  for (const op of ops) {
    if (op.kind === 'history') modelIds.add(op.spec.qualificacao_id);
    if (op.kind === 'relink') modelIds.add(op.spec.to.qualificacao_id);
    if (op.kind === 'softdelete') modelIds.add(op.spec.qualificacao_id);
  }
  const histIds = ops.filter((o) => o.kind !== 'model').map((o) => o.id);
  const relinks = direction === 'forward' ? ops.filter((o) => o.kind === 'relink') : [];
  const dupIds = direction === 'forward'
    ? ops.filter((o) => o.kind === 'softdelete' && o.spec.duplicate_of).map((o) => o.spec.duplicate_of.id) : [];
  return {
    dups: readHistories(port, dupIds),
    live: readHistories(port, histIds), models: readModels(port, [...modelIds]),
    collisions: readCollisions(port, relinks), audits: readAudits(port, ops),
  };
}

function countByKind(list) {
  const out = {};
  for (const k of KINDS) out[k] = list.filter((o) => o.kind === k).length;
  return out;
}

/**
 * Plan/apply a forward or rollback manifest.
 *  - apply !== true  => dry-run: reads only, port.exec is never called.
 *  - any preflight conflict aborts BEFORE the first write.
 *  - every write is "CAS UPDATE + audit INSERT (changes()>0)" for a single row, scoped by empresa_id.
 *  - the result is verified by re-reading; counts come from reads, not from the port.
 */
export function executeManifest({
  port, manifest, direction = 'forward', apply = false,
  expectedPlanHash, expectedCount, actor, sourceSha,
}) {
  check(direction === 'forward' || direction === 'rollback', 'DIRECTION_INVALID');
  check(port && typeof port.query === 'function' && typeof port.exec === 'function', 'PORT_INVALID');
  const validated = direction === 'forward'
    ? validateManifest(manifest, { expectedPlanHash, expectedCount })
    : validateRollbackManifest(manifest, { expectedPlanHash, expectedCount });
  const planSha256 = validated.planSha256;
  const forwardPlanSha256 = direction === 'forward' ? planSha256 : validated.forwardPlanSha256;
  if (apply) {
    check(ACTOR_RE.test(actor ?? ''), 'ACTOR_INVALID');
    check(SHA_RE.test(sourceSha ?? ''), 'SOURCE_SHA_INVALID');
    check(validated.sourceSha !== null && validated.sourceSha === sourceSha, 'MANIFEST_SOURCE_SHA_MISMATCH');
  }
  const ops = buildOps(validated.body, direction);
  const state = classify({ ops, ...snapshot(port, ops, direction), direction, planSha256, forwardPlanSha256 });

  const report = {
    tenant: TENANT_ID, direction, mode: apply ? 'apply' : 'dry-run',
    plan_sha256: planSha256, row_count: ops.length,
    pending: state.pending.length, pending_by_kind: countByKind(state.pending),
    already_applied: state.already.length, skipped_not_applied: state.skipped.length,
    conflicts: state.conflicts, cas_conflicts: [],
    changed: 0, writes_attempted: 0, postconditions_verified: false,
  };
  if (!apply) { report.postconditions_verified = state.conflicts.length === 0; return report; }
  if (state.conflicts.length > 0) {
    const error = new Error('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
    error.report = report;
    throw error;
  }
  const meta = { planSha256, sourceSha, actor };
  for (const op of state.pending) {
    port.exec(`${casUpdateSql(op)};\n${auditInsertSql(op, meta)}`);
    report.writes_attempted++;
  }
  const after = classify({ ops, ...snapshot(port, ops, direction), direction, planSha256, forwardPlanSha256 });
  const done = new Set(after.already.map((o) => `${o.kind}:${o.id}`));
  report.changed = state.pending.filter((o) => done.has(`${o.kind}:${o.id}`)).length;
  report.cas_conflicts = state.pending.filter((o) => !done.has(`${o.kind}:${o.id}`)).map((o) => ({ kind: o.kind, id: o.id }));
  report.already_applied = after.already.length;
  report.skipped_not_applied = after.skipped.length;
  report.pending = 0;
  report.pending_by_kind = countByKind([]);
  report.conflicts = after.conflicts;
  report.postconditions_verified = report.cas_conflicts.length === 0 && after.conflicts.length === 0
    && after.already.length + after.skipped.length === ops.length;
  return report;
}
