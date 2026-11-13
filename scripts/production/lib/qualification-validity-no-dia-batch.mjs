// LEGACY NOTE: this batch only NORMALIZES the legacy flag qualificacoes_tipos.vencimento_fim_mes (1 -> 0) and
//   recomputes stored dates "no dia"; the flag itself no longer influences any expiry calculation.
// source_reference: owner decisions of 11/11/2026 (follow-up of issue #2158): every expiry is "no dia"; D2 and
//   MNT_INTEGRACAO_DOUTRINACAO validity 36 -> 24; ASO/G1-SEM/G2 leave the legacy end-of-month mode. Same pattern as
//   lib/qualification-model-batch.mjs (#2158) and PR #2141/#2153 (qualification-expiry-executor.mjs); the shared
//   primitives (sha256Hex, date math, SQL literal rendering, REALIZED_STATUSES, TENANT_ID) are imported from that module.
// operational_decision: governed per-statement CAS executor for tenant 6 only. Three operation kinds, applied in this order:
//   model (qualificacoes_tipos.validade 36 -> 24) -> flag (qualificacoes_tipos.vencimento_fim_mes 1 -> 0)
//   -> history (qualificacoes_historico.validade_meses and/or data_vencimento recomputed "no dia").
// dry_run_required: default dry-run (reads only; port.exec is never called). Apply needs plan hash + row count + SHA binding + audit actor.
// rollback_plan_required: buildRollbackManifest embeds the forward manifest; the inverse CAS operations are derived from it
//   deterministically (reverse order, from/to swapped) and are bound to the original source SHA by their own hash.
//
// Domain library over an executor port { query(sql) -> rows, exec(sql) -> void } (scripts/production/lib/executors.mjs).
// Nothing here talks to a database by itself. Never touched by any operation: certificado_arquivo_id, arquivo_url,
// numero_certificado, data_conclusao, status, lms_* pointers. Issued certificates are NOT reissued; the public QR validation
// reads data_vencimento/validade_meses from the database, so it reflects the new values after the batch.
import {
  ACTOR_RE, CODE_RE, DATE_RE, HASH_RE, RAW_TEXT_RE, REALIZED_STATUSES, SHA_RE, STATUS_RE, TENANT_ID,
  addMonthsClamped, check, fail, intOrNull, isValidDate, nullableText, sha256Hex, sqlInt, sqlNullableInt,
  sqlNullableText, sqlText,
} from './qualification-model-batch.mjs';

export { REALIZED_STATUSES, TENANT_ID, addMonthsClamped, isValidDate, sha256Hex };

export const MAX_OPS = 3000;
export const OLD_MONTHS = 36;
export const TARGET_MONTHS = 24;
export const MANIFEST_KIND = 'QUALIFICATION_VALIDITY_NO_DIA_MANIFEST_V1';
export const ROLLBACK_KIND = 'QUALIFICATION_VALIDITY_NO_DIA_ROLLBACK_MANIFEST_V1';
export const AUDIT_BASE = 'QUALIFICATION_VALIDITY_NO_DIA';
export const KINDS = ['model', 'flag', 'history'];
const KIND_LABEL = { model: 'MODEL', flag: 'FLAG', history: 'HISTORY' };
const ENTITY = { model: 'qualificacoes_tipos', flag: 'qualificacoes_tipos', history: 'qualificacoes_historico' };
export const HISTORY_GROUPS = ['validity', 'flag'];

/** Models whose validity 36 -> 24 (owner decision a) and whose 36-month histories follow (decision b). */
export const VALIDITY_MODEL_SCOPE = [
  { tipo_id: 23, code: 'D2', change_model: true },
  { tipo_id: 122, code: 'MNT_INTEGRACAO_DOUTRINACAO', change_model: true },
  { tipo_id: 129, code: 'MNT_S76AC', change_model: false },
  { tipo_id: 138, code: 'MNT_INGLES_TECNICO', change_model: false },
];
/** Models that leave the legacy end-of-month mode (owner decision c). */
export const FLAG_MODEL_SCOPE = [
  { tipo_id: 18, code: 'ASO' },
  { tipo_id: 106, code: 'G1-SEM' },
  { tipo_id: 40, code: 'G2' },
];

export function auditAction(kind, direction) {
  return `${AUDIT_BASE}_${KIND_LABEL[kind]}${direction === 'rollback' ? '_ROLLBACK' : ''}`;
}

// ---------- canonical rows ----------
export function canonicalModel(row) {
  check(row && typeof row === 'object', 'MODEL_ROW_INVALID');
  check(Number.isSafeInteger(row.tipo_id) && row.tipo_id > 0, 'MODEL_ROW_ID');
  check(typeof row.code === 'string' && CODE_RE.test(row.code), 'MODEL_ROW_CODE');
  check(row.old_validity === OLD_MONTHS && row.next_validity === TARGET_MONTHS, 'MODEL_ROW_VALIDITY');
  return { tipo_id: row.tipo_id, code: row.code, old_validity: OLD_MONTHS, next_validity: TARGET_MONTHS };
}

export function canonicalFlag(row) {
  check(row && typeof row === 'object', 'FLAG_ROW_INVALID');
  check(Number.isSafeInteger(row.tipo_id) && row.tipo_id > 0, 'FLAG_ROW_ID');
  check(typeof row.code === 'string' && CODE_RE.test(row.code), 'FLAG_ROW_CODE');
  check(row.old_flag === 1 && row.next_flag === 0, 'FLAG_ROW_VALUES');
  return { tipo_id: row.tipo_id, code: row.code, old_flag: 1, next_flag: 0 };
}

export function canonicalHistory(row) {
  check(row && typeof row === 'object', 'HISTORY_ROW_INVALID');
  check(Number.isSafeInteger(row.id) && row.id > 0, 'HISTORY_ROW_ID');
  check(HISTORY_GROUPS.includes(row.group), 'HISTORY_ROW_GROUP');
  check(Number.isSafeInteger(row.qualificacao_id) && row.qualificacao_id > 0, 'HISTORY_ROW_MODEL');
  check(typeof row.model_code === 'string' && CODE_RE.test(row.model_code), 'HISTORY_ROW_MODEL_CODE');
  check(typeof row.status === 'string' && STATUS_RE.test(row.status) && REALIZED_STATUSES.has(row.status), 'HISTORY_ROW_STATUS');
  check(isValidDate(row.completion), 'HISTORY_ROW_COMPLETION');
  const oldExpiry = nullableText(row.old_expiry, RAW_TEXT_RE, 'HISTORY_ROW_OLD_EXPIRY');
  const oldValidity = intOrNull(row.old_validity_months ?? null, 'HISTORY_ROW_OLD_VALIDITY');
  const nextValidity = intOrNull(row.next_validity_months ?? null, 'HISTORY_ROW_NEXT_VALIDITY');
  check(Number.isSafeInteger(row.validity_used) && row.validity_used >= 1 && row.validity_used <= 600, 'HISTORY_ROW_VALIDITY_USED');
  if (row.group === 'validity') {
    check(oldValidity === OLD_MONTHS && nextValidity === TARGET_MONTHS && row.validity_used === TARGET_MONTHS, 'HISTORY_ROW_VALIDITY_GROUP');
  } else {
    // flag group never touches validade_meses: only the stored expiry moves from end-of-month to no-dia
    check(oldValidity === nextValidity, 'HISTORY_ROW_FLAG_GROUP_VALIDITY_MUST_NOT_CHANGE');
    check(oldExpiry !== null, 'HISTORY_ROW_FLAG_GROUP_OLD_EXPIRY');
  }
  check(addMonthsClamped(row.completion, row.validity_used) === row.next_expiry, 'HISTORY_ROW_EXPIRY_RULE_MISMATCH');
  check(oldExpiry !== row.next_expiry || oldValidity !== nextValidity, 'HISTORY_ROW_NOOP');
  return {
    id: row.id, group: row.group, qualificacao_id: row.qualificacao_id, model_code: row.model_code, status: row.status,
    completion: row.completion, old_expiry: oldExpiry, next_expiry: row.next_expiry,
    old_validity_months: oldValidity, next_validity_months: nextValidity, validity_used: row.validity_used,
  };
}

function sortedById(rows, key, code) {
  for (let i = 1; i < rows.length; i++) check(rows[i - 1][key] < rows[i][key], code);
  return rows;
}

function canonicalBody(source) {
  check(source && typeof source === 'object', 'MANIFEST_INVALID');
  for (const list of ['models', 'flags', 'histories']) check(Array.isArray(source[list]), 'MANIFEST_LISTS_MISSING');
  const models = sortedById(source.models.map(canonicalModel), 'tipo_id', 'MANIFEST_MODELS_NOT_SORTED_OR_DUPLICATE');
  const flags = sortedById(source.flags.map(canonicalFlag), 'tipo_id', 'MANIFEST_FLAGS_NOT_SORTED_OR_DUPLICATE');
  const histories = sortedById(source.histories.map(canonicalHistory), 'id', 'MANIFEST_HISTORIES_NOT_SORTED_OR_DUPLICATE');
  const modelIds = new Set(models.map((m) => m.tipo_id));
  for (const f of flags) check(!modelIds.has(f.tipo_id), 'MANIFEST_TYPE_IN_MODEL_AND_FLAG');
  const scopeValidity = new Map(VALIDITY_MODEL_SCOPE.map((m) => [m.tipo_id, m.code]));
  const scopeFlag = new Map(FLAG_MODEL_SCOPE.map((m) => [m.tipo_id, m.code]));
  for (const m of models) check(scopeValidity.get(m.tipo_id) === m.code, 'MANIFEST_MODEL_OUTSIDE_OWNER_SCOPE');
  for (const f of flags) check(scopeFlag.get(f.tipo_id) === f.code, 'MANIFEST_FLAG_OUTSIDE_OWNER_SCOPE');
  for (const h of histories) {
    if (h.group === 'validity') check(scopeValidity.get(h.qualificacao_id) === h.model_code, 'MANIFEST_HISTORY_OUTSIDE_OWNER_SCOPE');
    // history-only corrections are allowed when the model flag is already 0 (the live-state guard in the executor requires flag 0 or a pending flag op)
    else check(scopeFlag.get(h.qualificacao_id) === h.model_code, 'MANIFEST_HISTORY_OUTSIDE_OWNER_SCOPE');
  }
  return { models, flags, histories };
}

export function hashBody(body) {
  return sha256Hex(JSON.stringify({ models: body.models, flags: body.flags, histories: body.histories }));
}

export function countOps(body) {
  return body.models.length + body.flags.length + body.histories.length;
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
  const models = body.models.map((m) => ({ kind: 'model', id: m.tipo_id, spec: m, from: { validity: m.old_validity }, to: { validity: m.next_validity } }));
  const flags = body.flags.map((f) => ({ kind: 'flag', id: f.tipo_id, spec: f, from: { flag: f.old_flag }, to: { flag: f.next_flag } }));
  const histories = body.histories.map((h) => ({
    kind: 'history', id: h.id, spec: h,
    from: { expiry: h.old_expiry, validity: h.old_validity_months },
    to: { expiry: h.next_expiry, validity: h.next_validity_months },
  }));
  const forward = [...models, ...flags, ...histories];
  if (direction === 'forward') return forward.map((op) => ({ ...op, direction }));
  return forward.reverse().map((op) => ({ ...op, direction, from: op.to, to: op.from }));
}

// ---------- CAS statements ----------
const statusGuard = (spec) => `UPPER(TRIM(COALESCE(status, ''))) = ${sqlText(spec.status, STATUS_RE, 'SQL_STATUS_INVALID')}`;
const completionGuard = (spec) => `substr(data_conclusao, 1, 10) = ${sqlText(spec.completion, DATE_RE, 'SQL_DATE_INVALID')}`;

/** Forward-only type-state guard that makes a history write depend on its model already being in the target state. */
function modelStateExists(spec) {
  const state = spec.group === 'validity'
    ? `AND t.validade = ${sqlInt(TARGET_MONTHS)}`
    : 'AND COALESCE(t.vencimento_fim_mes, 0) = 0';
  return `EXISTS (SELECT 1 FROM qualificacoes_tipos t
     WHERE t.id = qualificacoes_historico.qualificacao_id AND t.empresa_id = ${TENANT_ID} AND t.deleted_at IS NULL
       AND UPPER(TRIM(t.codigo)) = ${sqlText(spec.model_code, CODE_RE, 'SQL_MODEL_INVALID')} ${state})`;
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
   AND UPPER(TRIM(codigo)) = ${sqlText(spec.code, CODE_RE, 'SQL_MODEL_INVALID')}`;
  }
  if (op.kind === 'flag') {
    return `UPDATE qualificacoes_tipos
   SET vencimento_fim_mes = ${sqlInt(to.flag)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.tipo_id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND COALESCE(vencimento_fim_mes, 0) = ${sqlInt(from.flag)}
   AND UPPER(TRIM(codigo)) = ${sqlText(spec.code, CODE_RE, 'SQL_MODEL_INVALID')}`;
  }
  const guard = forward ? `\n   AND ${modelStateExists(spec)}` : '';
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

function auditJson(op, state) {
  if (op.kind === 'model') return `json_object('validade', ${sqlNullableInt(state.validity)})`;
  if (op.kind === 'flag') return `json_object('vencimento_fim_mes', ${sqlInt(state.flag)})`;
  return `json_object('data_vencimento', ${sqlNullableText(state.expiry)}, 'validade_meses', ${sqlNullableInt(state.validity)})`;
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
  for (const row of port.query(`SELECT id, UPPER(TRIM(codigo)) AS code, validade, COALESCE(vencimento_fim_mes, 0) AS flag,
  CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM qualificacoes_tipos WHERE empresa_id = ${TENANT_ID} AND id IN (${ids(list)})`)) map.set(Number(row.id), row);
  return map;
}

function readHistories(port, list) {
  const map = new Map();
  if (list.length === 0) return map;
  for (const row of port.query(`SELECT h.id, h.qualificacao_id, UPPER(TRIM(COALESCE(h.status, ''))) AS status,
  substr(h.data_conclusao, 1, 10) AS completion, h.data_vencimento, h.validade_meses,
  CASE WHEN h.deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM qualificacoes_historico h WHERE h.empresa_id = ${TENANT_ID} AND h.id IN (${ids(list)})`)) map.set(Number(row.id), row);
  return map;
}

function readAudits(port, ops) {
  const set = new Set();
  const list = [...new Set(ops.map((o) => o.id))];
  if (list.length === 0) return set;
  const actions = KINDS.flatMap((k) => [auditAction(k, 'forward'), auditAction(k, 'rollback')]);
  const rows = port.query(`SELECT entity_type, entity_id, action, json_extract(new_values, '$.plan_sha256') AS plan_sha256
 FROM audit_logs WHERE empresa_id = ${TENANT_ID} AND action IN (${actions.map((a) => `'${a}'`).join(',')})
   AND entity_id IN (${ids(list)})`);
  for (const r of rows) set.add(`${r.entity_type}|${r.entity_id}|${r.action}|${r.plan_sha256}`);
  return set;
}

// ---------- classification ----------
const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

function stateMatches(op, live, state) {
  if (op.kind === 'model') return num(live.validade) === state.validity;
  if (op.kind === 'flag') return Number(live.flag) === state.flag;
  return (live.data_vencimento ?? null) === state.expiry && num(live.validade_meses) === state.validity;
}

function guardsMatch(op, live) {
  const spec = op.spec;
  if (op.kind === 'model' || op.kind === 'flag') return Number(live.deleted) === 0 && live.code === spec.code;
  return String(live.status ?? '') === spec.status && String(live.completion ?? '') === spec.completion
    && Number(live.qualificacao_id) === spec.qualificacao_id && Number(live.deleted) === 0;
}

function forwardExtraConflict(op, models, pending) {
  if (op.kind !== 'history') return null;
  const spec = op.spec;
  const m = models.get(spec.qualificacao_id);
  if (!m || Number(m.deleted) !== 0 || m.code !== spec.model_code) return 'model_not_in_expected_state';
  if (spec.group === 'validity') {
    return num(m.validade) === TARGET_MONTHS || pending.has(`model:${spec.qualificacao_id}`) ? null : 'model_not_in_expected_state';
  }
  return Number(m.flag) === 0 || pending.has(`flag:${spec.qualificacao_id}`) ? null : 'model_not_in_expected_state';
}

function classify({ ops, live, models, audits, direction, planSha256, forwardPlanSha256 }) {
  const out = { pending: [], already: [], skipped: [], conflicts: [] };
  const pending = new Set();
  for (const op of ops) {
    const row = (op.kind === 'history' ? live : models).get(op.id);
    if (!row) { out.conflicts.push({ kind: op.kind, id: op.id, reason: 'row_missing_deleted_or_out_of_scope' }); continue; }
    const key = (hash) => `${ENTITY[op.kind]}|${op.id}|${auditAction(op.kind, direction)}|${hash}`;
    const forwardKey = `${ENTITY[op.kind]}|${op.id}|${auditAction(op.kind, 'forward')}|${forwardPlanSha256}`;
    if (!guardsMatch(op, row)) { out.conflicts.push({ kind: op.kind, id: op.id, reason: 'guard_fields_changed' }); continue; }
    if (stateMatches(op, row, op.to)) {
      if (audits.has(key(planSha256))) out.already.push(op);
      else if (direction === 'rollback' && !audits.has(forwardKey)) out.skipped.push(op);
      else out.conflicts.push({ kind: op.kind, id: op.id, reason: 'target_state_without_audit' });
      continue;
    }
    if (!stateMatches(op, row, op.from)) { out.conflicts.push({ kind: op.kind, id: op.id, reason: 'row_changed_since_plan' }); continue; }
    if (direction === 'forward') {
      const reason = forwardExtraConflict(op, models, pending);
      if (reason) { out.conflicts.push({ kind: op.kind, id: op.id, reason }); continue; }
    } else if (!audits.has(forwardKey)) {
      out.conflicts.push({ kind: op.kind, id: op.id, reason: 'not_applied_by_forward_plan' });
      continue;
    }
    if (op.kind === 'model' || op.kind === 'flag') pending.add(`${op.kind}:${op.id}`);
    out.pending.push(op);
  }
  return out;
}

function snapshot(port, ops) {
  const modelIds = new Set(ops.filter((o) => o.kind !== 'history').map((o) => o.id));
  for (const op of ops) if (op.kind === 'history') modelIds.add(op.spec.qualificacao_id);
  const histIds = ops.filter((o) => o.kind === 'history').map((o) => o.id);
  return { live: readHistories(port, histIds), models: readModels(port, [...modelIds]), audits: readAudits(port, ops) };
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
  const state = classify({ ops, ...snapshot(port, ops), direction, planSha256, forwardPlanSha256 });

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
  const after = classify({ ops, ...snapshot(port, ops), direction, planSha256, forwardPlanSha256 });
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

export { fail };
