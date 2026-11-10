// source_reference: owner decision "CMA por idade" (follow-up of PR #2165 / issue #2158): CMA validity is 12 months, or 6 months when the
//   crew member has completed >= 60 years on the realization date (src/shared/utils/cma-validity.ts). PR #2165 only applies the rule to
//   NEW records; this batch corrects the tenant-6 history. Same pattern as lib/qualification-validity-no-dia-batch.mjs (#2165) and
//   lib/qualification-model-batch.mjs (#2158): primitives (sha256Hex, date math, SQL literal rendering) come from the latter.
// operational_decision: governed per-row CAS executor for tenant 6 only; ONE operation kind (history): qualificacoes_historico.validade_meses
//   and data_vencimento recomputed "no dia". Rows without a valid birth date are never altered; explicit/documentary expiries are preserved.
// dry_run_required: default dry-run (reads only; port.exec is never called). Apply needs plan hash + row count + SHA binding + audit actor.
// rollback_plan_required: buildRollbackManifest embeds the forward manifest; inverse CAS operations are derived deterministically
//   (from/to swapped) and bound to the original source SHA by their own hash.
//
// Domain library over an executor port { query(sql) -> rows, exec(sql) -> void } (scripts/production/lib/executors.mjs). Nothing here
// talks to a database by itself. Never touched: certificado_arquivo_id, arquivo_url, numero_certificado, data_conclusao, status, lms_*.
import {
  ACTOR_RE, DATE_RE, HASH_RE, RAW_TEXT_RE, REALIZED_STATUSES, SHA_RE, STATUS_RE, TENANT_ID,
  addMonthsClamped, check, fail, intOrNull, isValidDate, nullableText, sha256Hex, sqlInt, sqlNullableInt,
  sqlNullableText, sqlText,
} from './qualification-model-batch.mjs';

export { REALIZED_STATUSES, TENANT_ID, addMonthsClamped, isValidDate, sha256Hex };

export const CMA_CODE = 'CMA';
export const MAX_OPS = 3000;
export const MANIFEST_KIND = 'QUALIFICATION_CMA_AGE_MANIFEST_V1';
export const ROLLBACK_KIND = 'QUALIFICATION_CMA_AGE_ROLLBACK_MANIFEST_V1';
export const AUDIT_BASE = 'QUALIFICATION_CMA_AGE_HISTORY';
export const AUDIT_ORIGIN = 'CMA por idade (decisão do dono)';
export const REASONS = ['validity_wrong_by_age', 'expiry_wrong_legacy_eom'];

export function auditAction(direction) {
  return `${AUDIT_BASE}${direction === 'rollback' ? '_ROLLBACK' : ''}`;
}

/** Months required by the age rule; mirrors resolveCmaValidity (>= 60 completed years => 6, otherwise 12). */
export const monthsForAge = (age) => (age >= 60 ? 6 : 12);

/** Legacy end-of-month value, used ONLY to recognise expiries that the old rule derived. */
export function legacyEndOfMonth(completion, months) {
  if (!isValidDate(completion) || !Number.isInteger(months) || months < 1) return null;
  const [y, m] = completion.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/**
 * Pure classification of one live CMA history row (see the planner header for the classes).
 * `age_years` is the completed age on the realization date computed from the employee birth date (null when unavailable).
 */
export function classifyCmaRow(row) {
  const { id, qualificacao_id: tipoId, status, completion, old_expiry: oldExpiry, old_validity: oldValidity, age_years: age } = row;
  if (!REALIZED_STATUSES.has(status)) return { cls: 'status_not_realized' };
  if (!completion) return { cls: 'completion_date_missing_or_invalid' };
  if (!row.employee_in_tenant || age === null || age === undefined || !Number.isInteger(age) || age < 0) {
    return { cls: 'birth_date_missing', exact_expiry_12: addMonthsClamped(completion, 12) };
  }
  const expected = monthsForAge(age);
  const exact = addMonthsClamped(completion, expected);
  const legacy = legacyEndOfMonth(completion, expected);
  if (oldExpiry === null || oldExpiry === undefined) return { cls: 'no_stored_expiry' };
  if (!RAW_TEXT_RE.test(String(oldExpiry))) return { cls: 'explicit_expiry_preserved' };
  const stored = String(oldExpiry).slice(0, 10);
  const make = (reason) => ({
    cls: reason,
    operation: {
      id, qualificacao_id: tipoId, status, completion, old_expiry: oldExpiry, next_expiry: exact,
      old_validity_months: oldValidity, next_validity_months: expected, age_years: age, reason,
    },
  });
  if (oldValidity === expected) {
    if (stored === exact) return { cls: 'conforme' };
    if (oldExpiry === legacy) return make('expiry_wrong_legacy_eom');
    return { cls: 'explicit_expiry_preserved' };
  }
  const derived = new Set([exact, legacy]);
  if (Number.isInteger(oldValidity) && oldValidity >= 1) {
    derived.add(addMonthsClamped(completion, oldValidity));
    derived.add(legacyEndOfMonth(completion, oldValidity));
  }
  if (derived.has(stored)) return make('validity_wrong_by_age');
  return { cls: 'explicit_expiry_preserved' };
}

// ---------- canonical rows ----------
export function canonicalHistory(row) {
  check(row && typeof row === 'object', 'HISTORY_ROW_INVALID');
  check(Number.isSafeInteger(row.id) && row.id > 0, 'HISTORY_ROW_ID');
  check(Number.isSafeInteger(row.qualificacao_id) && row.qualificacao_id > 0, 'HISTORY_ROW_MODEL');
  check(typeof row.status === 'string' && STATUS_RE.test(row.status) && REALIZED_STATUSES.has(row.status), 'HISTORY_ROW_STATUS');
  check(isValidDate(row.completion), 'HISTORY_ROW_COMPLETION');
  check(REASONS.includes(row.reason), 'HISTORY_ROW_REASON');
  check(Number.isSafeInteger(row.age_years) && row.age_years >= 0 && row.age_years <= 150, 'HISTORY_ROW_AGE');
  const oldExpiry = nullableText(row.old_expiry, RAW_TEXT_RE, 'HISTORY_ROW_OLD_EXPIRY');
  check(oldExpiry !== null, 'HISTORY_ROW_OLD_EXPIRY_REQUIRED');
  const oldValidity = intOrNull(row.old_validity_months ?? null, 'HISTORY_ROW_OLD_VALIDITY');
  const nextValidity = intOrNull(row.next_validity_months ?? null, 'HISTORY_ROW_NEXT_VALIDITY');
  check(nextValidity === monthsForAge(row.age_years), 'HISTORY_ROW_AGE_RULE_MISMATCH');
  check(addMonthsClamped(row.completion, nextValidity) === row.next_expiry, 'HISTORY_ROW_EXPIRY_RULE_MISMATCH');
  check(oldExpiry !== row.next_expiry || oldValidity !== nextValidity, 'HISTORY_ROW_NOOP');
  if (row.reason === 'expiry_wrong_legacy_eom') check(oldValidity === nextValidity, 'HISTORY_ROW_EXPIRY_ONLY_VALIDITY_CHANGED');
  return {
    id: row.id, qualificacao_id: row.qualificacao_id, status: row.status, completion: row.completion,
    old_expiry: oldExpiry, next_expiry: row.next_expiry, old_validity_months: oldValidity, next_validity_months: nextValidity,
    age_years: row.age_years, reason: row.reason,
  };
}

function canonicalBody(source) {
  check(source && typeof source === 'object', 'MANIFEST_INVALID');
  check(Array.isArray(source.histories), 'MANIFEST_LISTS_MISSING');
  const histories = source.histories.map(canonicalHistory);
  for (let i = 1; i < histories.length; i++) check(histories[i - 1].id < histories[i].id, 'MANIFEST_HISTORIES_NOT_SORTED_OR_DUPLICATE');
  return { histories };
}

export function hashBody(body) {
  return sha256Hex(JSON.stringify({ histories: body.histories }));
}

export function countOps(body) {
  return body.histories.length;
}

/** Deterministic execution manifest from planner output. */
export function buildExecutionManifest(plan, { sourceSha = null } = {}) {
  const body = canonicalBody(plan?.manifest ?? plan);
  const total = countOps(body);
  check(total > 0 && total <= MAX_OPS, 'MANIFEST_ROW_COUNT');
  check(sourceSha === null || SHA_RE.test(String(sourceSha)), 'MANIFEST_SOURCE_SHA_INVALID');
  return { kind: MANIFEST_KIND, empresa_id: TENANT_ID, row_count: total, plan_sha256: hashBody(body), source_sha: sourceSha, ...body };
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
  const forward = body.histories.map((h) => ({
    id: h.id, spec: h, from: { expiry: h.old_expiry, validity: h.old_validity_months }, to: { expiry: h.next_expiry, validity: h.next_validity_months },
  }));
  if (direction === 'forward') return forward.map((op) => ({ ...op, direction }));
  return forward.reverse().map((op) => ({ ...op, direction, from: op.to, to: op.from }));
}

// ---------- CAS statements ----------
const statusGuard = (spec) => `UPPER(TRIM(COALESCE(status, ''))) = ${sqlText(spec.status, STATUS_RE, 'SQL_STATUS_INVALID')}`;
const completionGuard = (spec) => `substr(data_conclusao, 1, 10) = ${sqlText(spec.completion, DATE_RE, 'SQL_DATE_INVALID')}`;

/** Completed age on the realization date, computed inside SQL from the employee birth date (NULL when unavailable/invalid). */
export function ageSql(h, f) {
  // Mirrors parseCivilDay (src/shared/utils/validade-meses.ts): YYYY-MM-DD, optionally followed by "T" or " " + anything; no other suffix.
  const valid = (col) => `(trim(${col}) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
        AND (length(trim(${col})) = 10 OR substr(trim(${col}), 11, 1) IN ('T', ' '))
        AND date(substr(trim(${col}), 1, 10)) = substr(trim(${col}), 1, 10))`;
  return `CASE WHEN ${valid(`${f}.nascimento`)} AND ${valid(`${h}.data_conclusao`)}
       THEN CAST(strftime('%Y', substr(trim(${h}.data_conclusao), 1, 10)) AS INTEGER) - CAST(strftime('%Y', substr(trim(${f}.nascimento), 1, 10)) AS INTEGER)
            - (strftime('%m-%d', substr(trim(${h}.data_conclusao), 1, 10)) < strftime('%m-%d', substr(trim(${f}.nascimento), 1, 10)))
       ELSE NULL END`;
}

/** Forward-only guard: the employee (same tenant, live) still yields exactly the planned age on the realization date. */
function ageGuard(spec) {
  return `(SELECT ${ageSql('qualificacoes_historico', 'f')} FROM funcionarios f
     WHERE f.id = qualificacoes_historico.funcionario_id AND f.deleted_at IS NULL AND f.empresa_id = ${TENANT_ID}) = ${sqlInt(spec.age_years)}`;
}

function modelGuard() {
  return `EXISTS (SELECT 1 FROM qualificacoes_tipos t
     WHERE t.id = qualificacoes_historico.qualificacao_id AND t.empresa_id = ${TENANT_ID} AND t.deleted_at IS NULL
       AND UPPER(TRIM(t.codigo)) = '${CMA_CODE}')`;
}

/** One CAS UPDATE. Never writes certificate columns, data_conclusao, status or lms pointers. */
export function casUpdateSql(op) {
  const { spec, from, to } = op;
  const forward = op.direction === 'forward';
  const extra = forward ? `\n   AND ${modelGuard()}\n   AND ${ageGuard(spec)}` : '';
  return `UPDATE qualificacoes_historico
   SET data_vencimento = ${sqlNullableText(to.expiry)}, validade_meses = ${sqlNullableInt(to.validity)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND qualificacao_id = ${sqlInt(spec.qualificacao_id)}
   AND data_vencimento IS ${sqlNullableText(from.expiry)}
   AND validade_meses IS ${sqlNullableInt(from.validity)}
   AND ${completionGuard(spec)}
   AND ${statusGuard(spec)}${extra}`;
}

const auditJson = (state) => `json_object('data_vencimento', ${sqlNullableText(state.expiry)}, 'validade_meses', ${sqlNullableInt(state.validity)})`;

/** Audit row written only if the preceding UPDATE changed a row (changes() > 0). */
export function auditInsertSql(op, { planSha256, sourceSha, actor }) {
  check(ACTOR_RE.test(actor ?? ''), 'ACTOR_INVALID');
  check(SHA_RE.test(sourceSha ?? ''), 'SOURCE_SHA_INVALID');
  check(HASH_RE.test(planSha256), 'PLAN_HASH_INVALID');
  return `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, empresa_id, created_at)
SELECT NULL, '${auditAction(op.direction)}', 'qualificacoes_historico', ${sqlInt(op.id)},
  ${auditJson(op.from)},
  json_set(${auditJson(op.to)}, '$.origem', '${AUDIT_ORIGIN}', '$.actor', '${actor}', '$.plan_sha256', '${planSha256}', '$.source_sha', '${sourceSha}', '$.direction', '${op.direction}'),
  ${TENANT_ID}, datetime('now')
WHERE changes() > 0`;
}

// ---------- live reads ----------
const ids = (list) => list.map((n) => sqlInt(n)).join(',');

function readHistories(port, list) {
  const map = new Map();
  if (list.length === 0) return map;
  for (const row of port.query(`SELECT h.id, h.qualificacao_id, UPPER(TRIM(COALESCE(h.status, ''))) AS status,
  substr(h.data_conclusao, 1, 10) AS completion, h.data_vencimento, h.validade_meses,
  CASE WHEN h.deleted_at IS NULL THEN 0 ELSE 1 END AS deleted,
  (SELECT UPPER(TRIM(t.codigo)) FROM qualificacoes_tipos t WHERE t.id = h.qualificacao_id AND t.empresa_id = ${TENANT_ID} AND t.deleted_at IS NULL) AS model_code,
  (SELECT ${ageSql('h', 'f')} FROM funcionarios f WHERE f.id = h.funcionario_id AND f.deleted_at IS NULL AND f.empresa_id = ${TENANT_ID}) AS age_years
 FROM qualificacoes_historico h WHERE h.empresa_id = ${TENANT_ID} AND h.id IN (${ids(list)})`)) map.set(Number(row.id), row);
  return map;
}

function readAudits(port, ops) {
  const set = new Set();
  const list = [...new Set(ops.map((o) => o.id))];
  if (list.length === 0) return set;
  const rows = port.query(`SELECT entity_id, action, json_extract(new_values, '$.plan_sha256') AS plan_sha256
 FROM audit_logs WHERE empresa_id = ${TENANT_ID} AND entity_type = 'qualificacoes_historico'
   AND action IN ('${auditAction('forward')}','${auditAction('rollback')}') AND entity_id IN (${ids(list)})`);
  for (const r of rows) set.add(`${r.entity_id}|${r.action}|${r.plan_sha256}`);
  return set;
}

// ---------- classification ----------
const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

function stateMatches(live, state) {
  return (live.data_vencimento ?? null) === state.expiry && num(live.validade_meses) === state.validity;
}

function guardsMatch(op, live) {
  const spec = op.spec;
  return String(live.status ?? '') === spec.status && String(live.completion ?? '') === spec.completion
    && Number(live.qualificacao_id) === spec.qualificacao_id && Number(live.deleted) === 0 && live.model_code === CMA_CODE;
}

function classify({ ops, live, audits, direction, planSha256, forwardPlanSha256 }) {
  const out = { pending: [], already: [], skipped: [], conflicts: [] };
  for (const op of ops) {
    const row = live.get(op.id);
    if (!row) { out.conflicts.push({ id: op.id, reason: 'row_missing_deleted_or_out_of_scope' }); continue; }
    const key = (hash) => `${op.id}|${auditAction(direction)}|${hash}`;
    const forwardKey = `${op.id}|${auditAction('forward')}|${forwardPlanSha256}`;
    if (!guardsMatch(op, row)) { out.conflicts.push({ id: op.id, reason: 'guard_fields_changed' }); continue; }
    if (stateMatches(row, op.to)) {
      if (audits.has(key(planSha256))) out.already.push(op);
      else if (direction === 'rollback' && !audits.has(forwardKey)) out.skipped.push(op);
      else out.conflicts.push({ id: op.id, reason: 'target_state_without_audit' });
      continue;
    }
    if (!stateMatches(row, op.from)) { out.conflicts.push({ id: op.id, reason: 'row_changed_since_plan' }); continue; }
    if (direction === 'forward') {
      if (num(row.age_years) !== op.spec.age_years) { out.conflicts.push({ id: op.id, reason: 'age_changed_since_plan' }); continue; }
    } else if (!audits.has(forwardKey)) {
      out.conflicts.push({ id: op.id, reason: 'not_applied_by_forward_plan' });
      continue;
    }
    out.pending.push(op);
  }
  return out;
}

function snapshot(port, ops) {
  return { live: readHistories(port, ops.map((o) => o.id)), audits: readAudits(port, ops) };
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
    pending: state.pending.length, already_applied: state.already.length, skipped_not_applied: state.skipped.length,
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
  const done = new Set(after.already.map((o) => o.id));
  report.changed = state.pending.filter((o) => done.has(o.id)).length;
  report.cas_conflicts = state.pending.filter((o) => !done.has(o.id)).map((o) => ({ id: o.id }));
  report.already_applied = after.already.length;
  report.skipped_not_applied = after.skipped.length;
  report.pending = 0;
  report.conflicts = after.conflicts;
  report.postconditions_verified = report.cas_conflicts.length === 0 && after.conflicts.length === 0
    && after.already.length + after.skipped.length === ops.length;
  return report;
}

export { fail };
