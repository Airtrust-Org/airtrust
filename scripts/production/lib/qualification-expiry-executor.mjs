// source_reference: issue #2068 and merged read-only planner (PR #2082), scripts/production/qualification-expiry-legacy-readonly-plan.mjs.
// operational_decision: governed per-row CAS executor for tenant-6 historical qualification expiry; it only changes data_vencimento/validade_meses/updated_at.
// dry_run_required: default dry-run; apply needs the exact plan hash, exact row count, confirmation env and a same-hash live preflight with zero conflicts.
// rollback_plan_required: deterministic inverse-CAS rollback manifest (buildRollbackManifest) plus a Time Travel recovery point before any production apply.
//
// Domain library: pure functions over an executor port { query(sql) -> rows, exec(sql) -> void }
// (see scripts/production/lib/executors.mjs). Nothing here talks to a database by itself and
// nothing is ever written unless apply === true. Every statement carries empresa_id = 6.
//
// Rows that are NOT touched (they stay "manual review" in the planner with a reason code):
// published/issued certificate files, CMA/ASO/CHT/G1-SEM, non-realized statuses, ambiguous
// or missing model validity, manual overrides. The executor re-checks the certificate guard
// inside every UPDATE so a certificate published after planning also blocks the row.
import { createHash } from 'node:crypto';
import {
  REALIZED_STATUSES,
  buildInventorySelectSql,
  buildPlan,
  expectedExpiry,
  isRegulatoryException,
} from '../qualification-expiry-legacy-readonly-plan.mjs';

export const TENANT_ID = 6;
export const MAX_ROWS = 1000;
export const AUDIT_ACTION_APPLY = 'QUALIFICATION_EXPIRY_RECONCILE_2068';
export const AUDIT_ACTION_ROLLBACK = 'QUALIFICATION_EXPIRY_RECONCILE_2068_ROLLBACK';
export const MANIFEST_KIND = 'QUALIFICATION_EXPIRY_EXECUTION_MANIFEST_2068';
export const ROLLBACK_KIND = 'QUALIFICATION_EXPIRY_ROLLBACK_MANIFEST_2068';

const HASH_RE = /^[0-9a-f]{64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RAW_TEXT_RE = /^[0-9A-Za-z:.+\- ]{1,40}$/;
const MODEL_RE = /^[A-Z0-9_-]{1,64}$/;
const ACTOR_RE = /^[A-Za-z0-9_.@-]{1,64}$/;
const SHA_RE = /^[0-9a-f]{40}$/;

const fail = (code) => { throw new Error(code); };
const check = (value, code) => { if (!value) fail(code); };

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

// ---------- literal rendering (values are validated first; no free text reaches SQL) ----------
function sqlInt(value) {
  check(Number.isSafeInteger(value), 'SQL_INT_INVALID');
  return String(value);
}
function sqlNullableInt(value) {
  return value === null ? 'NULL' : sqlInt(value);
}
function sqlNullableText(value) {
  if (value === null) return 'NULL';
  check(typeof value === 'string' && RAW_TEXT_RE.test(value), 'SQL_TEXT_INVALID');
  return `'${value}'`;
}
function sqlStrictText(value, re, code) {
  check(typeof value === 'string' && re.test(value), code);
  return `'${value}'`;
}

// ---------- manifest ----------
function validDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function nullableInt(value, code) {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number.NaN;
  check(Number.isSafeInteger(n), code);
  return n;
}

/** Canonical key order == planner record order, so the hash equals the planner's plan_sha256. */
export function canonicalRow(row) {
  check(row && typeof row === 'object', 'MANIFEST_ROW_INVALID');
  const id = nullableInt(row.id, 'MANIFEST_ROW_ID');
  check(id !== null && id > 0, 'MANIFEST_ROW_ID');
  check(row.empresa_id === TENANT_ID, 'MANIFEST_ROW_TENANT');
  const qualificacaoId = nullableInt(row.qualificacao_id, 'MANIFEST_ROW_MODEL');
  check(qualificacaoId !== null && qualificacaoId > 0, 'MANIFEST_ROW_MODEL');
  const model = row.expected_model_code;
  check(typeof model === 'string' && MODEL_RE.test(model) && !isRegulatoryException(model),
    'MANIFEST_ROW_MODEL_CODE');
  check(typeof row.expected_status === 'string' && REALIZED_STATUSES.has(row.expected_status),
    'MANIFEST_ROW_STATUS');
  check(validDate(row.expected_completion_date), 'MANIFEST_ROW_COMPLETION');
  const oldExpiry = row.old_expiry ?? null;
  check(oldExpiry === null || (typeof oldExpiry === 'string' && RAW_TEXT_RE.test(oldExpiry)),
    'MANIFEST_ROW_OLD_EXPIRY');
  const nextValidity = nullableInt(row.next_validity_months, 'MANIFEST_ROW_NEXT_VALIDITY');
  check(nextValidity !== null && nextValidity >= 1 && nextValidity <= 600, 'MANIFEST_ROW_NEXT_VALIDITY');
  const oldValidity = nullableInt(row.old_validity_months ?? null, 'MANIFEST_ROW_OLD_VALIDITY');
  check(row.model_end_of_month === 0 || row.model_end_of_month === 1, 'MANIFEST_ROW_EOM');
  check(validDate(row.next_expiry), 'MANIFEST_ROW_NEXT_EXPIRY');
  // Tamper check: the target date must be what the model rule produces for this completion date.
  check(expectedExpiry(row.expected_completion_date, nextValidity, row.model_end_of_month === 1)
    === row.next_expiry, 'MANIFEST_ROW_EXPIRY_RULE_MISMATCH');
  check((row.expected_certificate_id ?? null) === null, 'MANIFEST_ROW_HAS_CERTIFICATE');
  check(oldExpiry !== row.next_expiry || oldValidity !== nextValidity, 'MANIFEST_ROW_NOOP');
  return {
    id, empresa_id: TENANT_ID, qualificacao_id: qualificacaoId,
    expected_model_code: model, expected_status: row.expected_status,
    expected_completion_date: row.expected_completion_date,
    old_expiry: oldExpiry, next_expiry: row.next_expiry,
    old_validity_months: oldValidity, next_validity_months: nextValidity,
    model_end_of_month: row.model_end_of_month,
    expected_certificate_id: null,
  };
}

export function hashRows(rows) {
  return sha256Hex(JSON.stringify(rows));
}

/** Deterministic execution manifest from a planner output (candidates are sorted by id). */
export function buildExecutionManifest(plan, { sourceSha = null } = {}) {
  const source = plan?.candidates ?? plan?.rows;
  check(Array.isArray(source), 'MANIFEST_ROWS_MISSING');
  const rows = source.map(canonicalRow).sort((a, b) => a.id - b.id);
  return {
    kind: MANIFEST_KIND,
    empresa_id: TENANT_ID,
    row_count: rows.length,
    plan_sha256: hashRows(rows),
    source_sha: sourceSha,
    rows,
  };
}

/** Validates a manifest file against operator-supplied hash + count; returns canonical rows. */
export function validateManifest(manifest, { expectedPlanHash, expectedCount }) {
  check(HASH_RE.test(String(expectedPlanHash ?? '')), 'EXPECTED_PLAN_HASH_REQUIRED');
  check(Number.isSafeInteger(expectedCount) && expectedCount > 0, 'EXPECTED_COUNT_REQUIRED');
  check(manifest && typeof manifest === 'object', 'MANIFEST_INVALID');
  check(manifest.empresa_id === TENANT_ID, 'MANIFEST_TENANT');
  const source = manifest.candidates ?? manifest.rows;
  check(Array.isArray(source) && source.length > 0 && source.length <= MAX_ROWS, 'MANIFEST_ROW_COUNT');
  const rows = source.map(canonicalRow);
  for (let i = 1; i < rows.length; i++) check(rows[i - 1].id < rows[i].id, 'MANIFEST_NOT_SORTED_OR_DUPLICATE');
  const hash = hashRows(rows);
  check(manifest.plan_sha256 === hash, 'MANIFEST_HASH_MISMATCH');
  check(hash === expectedPlanHash, 'EXPECTED_PLAN_HASH_MISMATCH');
  check(rows.length === expectedCount, 'EXPECTED_ROW_COUNT_MISMATCH');
  const sourceSha = manifest.source_sha ?? null;
  check(sourceSha === null || SHA_RE.test(String(sourceSha)), 'MANIFEST_SOURCE_SHA_INVALID');
  return { rows, planSha256: hash, sourceSha };
}

/** Rollback hash binds the source SHA together with the inverse rows. */
function hashRollback(sourceSha, ops) {
  return sha256Hex(JSON.stringify({ source_sha: sourceSha, rows: ops }));
}

/** Compensating manifest: same rows, inverse CAS (from = applied state, to = original state). */
export function buildRollbackManifest(forwardManifest, { expectedPlanHash, expectedCount }) {
  const { rows, planSha256, sourceSha } = validateManifest(forwardManifest, { expectedPlanHash, expectedCount });
  const ops = rows.map((r) => ({
    id: r.id, empresa_id: TENANT_ID, qualificacao_id: r.qualificacao_id,
    expected_status: r.expected_status, expected_completion_date: r.expected_completion_date,
    from_expiry: r.next_expiry, from_validity_months: r.next_validity_months,
    to_expiry: r.old_expiry, to_validity_months: r.old_validity_months,
  }));
  return {
    kind: ROLLBACK_KIND, empresa_id: TENANT_ID, row_count: ops.length,
    source_sha: sourceSha,
    forward_plan_sha256: planSha256, rollback_plan_sha256: hashRollback(sourceSha, ops), rows: ops,
  };
}

function canonicalRollbackOp(op) {
  const id = nullableInt(op?.id, 'ROLLBACK_ROW_ID');
  check(id !== null && id > 0 && op.empresa_id === TENANT_ID, 'ROLLBACK_ROW_ID');
  const qid = nullableInt(op.qualificacao_id, 'ROLLBACK_ROW_MODEL');
  check(qid !== null && qid > 0, 'ROLLBACK_ROW_MODEL');
  check(typeof op.expected_status === 'string' && REALIZED_STATUSES.has(op.expected_status), 'ROLLBACK_ROW_STATUS');
  check(validDate(op.expected_completion_date), 'ROLLBACK_ROW_COMPLETION');
  check(validDate(op.from_expiry), 'ROLLBACK_ROW_FROM_EXPIRY');
  const fromValidity = nullableInt(op.from_validity_months, 'ROLLBACK_ROW_FROM_VALIDITY');
  check(fromValidity !== null && fromValidity >= 1 && fromValidity <= 600, 'ROLLBACK_ROW_FROM_VALIDITY');
  const toExpiry = op.to_expiry ?? null;
  check(toExpiry === null || (typeof toExpiry === 'string' && RAW_TEXT_RE.test(toExpiry)), 'ROLLBACK_ROW_TO_EXPIRY');
  return {
    id, empresa_id: TENANT_ID, qualificacao_id: qid,
    expected_status: op.expected_status, expected_completion_date: op.expected_completion_date,
    from_expiry: op.from_expiry, from_validity_months: fromValidity,
    to_expiry: toExpiry, to_validity_months: nullableInt(op.to_validity_months ?? null, 'ROLLBACK_ROW_TO_VALIDITY'),
  };
}

export function validateRollbackManifest(manifest, { expectedPlanHash, expectedCount }) {
  check(HASH_RE.test(String(expectedPlanHash ?? '')), 'EXPECTED_PLAN_HASH_REQUIRED');
  check(Number.isSafeInteger(expectedCount) && expectedCount > 0, 'EXPECTED_COUNT_REQUIRED');
  check(manifest?.kind === ROLLBACK_KIND && manifest.empresa_id === TENANT_ID, 'ROLLBACK_MANIFEST_INVALID');
  check(HASH_RE.test(String(manifest.forward_plan_sha256 ?? '')), 'ROLLBACK_FORWARD_HASH_INVALID');
  check(Array.isArray(manifest.rows) && manifest.rows.length > 0 && manifest.rows.length <= MAX_ROWS,
    'ROLLBACK_ROW_COUNT');
  const ops = manifest.rows.map(canonicalRollbackOp);
  for (let i = 1; i < ops.length; i++) check(ops[i - 1].id < ops[i].id, 'ROLLBACK_NOT_SORTED_OR_DUPLICATE');
  const sourceSha = manifest.source_sha ?? null;
  check(sourceSha === null || SHA_RE.test(String(sourceSha)), 'ROLLBACK_SOURCE_SHA_INVALID');
  const hash = hashRollback(sourceSha, ops);
  check(manifest.rollback_plan_sha256 === hash && hash === expectedPlanHash, 'ROLLBACK_HASH_MISMATCH');
  check(ops.length === expectedCount, 'EXPECTED_ROW_COUNT_MISMATCH');
  return { ops, planSha256: hash, forwardPlanSha256: manifest.forward_plan_sha256, sourceSha };
}

// ---------- operations (direction-neutral CAS description) ----------
function forwardOps(rows) {
  return rows.map((r) => ({
    id: r.id, qualificacao_id: r.qualificacao_id, status: r.expected_status,
    completion: r.expected_completion_date,
    from: { expiry: r.old_expiry, validity: r.old_validity_months },
    to: { expiry: r.next_expiry, validity: r.next_validity_months },
    model: { code: r.expected_model_code, validity: r.next_validity_months, endOfMonth: r.model_end_of_month },
    row: r,
  }));
}
function rollbackOps(ops) {
  return ops.map((o) => ({
    id: o.id, qualificacao_id: o.qualificacao_id, status: o.expected_status,
    completion: o.expected_completion_date,
    from: { expiry: o.from_expiry, validity: o.from_validity_months },
    to: { expiry: o.to_expiry, validity: o.to_validity_months },
    model: null,
    row: null,
  }));
}

/** One CAS UPDATE; touches only data_vencimento, validade_meses, updated_at. */
export function casUpdateSql(op) {
  return `UPDATE qualificacoes_historico
   SET data_vencimento = ${sqlNullableText(op.to.expiry)},
       validade_meses = ${sqlNullableInt(op.to.validity)},
       updated_at = datetime('now')
 WHERE id = ${sqlInt(op.id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND qualificacao_id = ${sqlInt(op.qualificacao_id)}
   AND data_vencimento IS ${sqlNullableText(op.from.expiry)}
   AND validade_meses IS ${sqlNullableInt(op.from.validity)}
   AND substr(data_conclusao, 1, 10) = ${sqlStrictText(op.completion, DATE_RE, 'SQL_DATE_INVALID')}
   AND UPPER(TRIM(status)) = ${sqlStrictText(op.status, /^[A-Z]{1,20}$/, 'SQL_STATUS_INVALID')}
   AND certificado_arquivo_id IS NULL
   AND (arquivo_url IS NULL OR TRIM(arquivo_url) = '')${modelGuardSql(op)}`;
}

/** Forward only: the model rule the manifest was computed from must still hold at write time. */
function modelGuardSql(op) {
  if (!op.model) return '';
  return `
   AND EXISTS (SELECT 1 FROM qualificacoes_tipos t
     WHERE t.id = qualificacoes_historico.qualificacao_id
       AND t.empresa_id = ${TENANT_ID}
       AND t.deleted_at IS NULL
       AND UPPER(TRIM(t.codigo)) = ${sqlStrictText(op.model.code, MODEL_RE, 'SQL_MODEL_INVALID')}
       AND t.validade = ${sqlInt(op.model.validity)}
       AND COALESCE(t.vencimento_fim_mes, 0) = ${sqlInt(op.model.endOfMonth)})`;
}

/** Audit row written only if the preceding UPDATE changed a row (changes() > 0). */
export function auditInsertSql(op, { action, planSha256, sourceSha, actor, direction }) {
  check(ACTOR_RE.test(actor ?? ''), 'ACTOR_INVALID');
  check(SHA_RE.test(sourceSha ?? ''), 'SOURCE_SHA_INVALID');
  check(HASH_RE.test(planSha256), 'PLAN_HASH_INVALID');
  return `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, empresa_id, created_at)
SELECT NULL, '${action}', 'qualificacoes_historico', ${sqlInt(op.id)},
  json_object('data_vencimento', ${sqlNullableText(op.from.expiry)}, 'validade_meses', ${sqlNullableInt(op.from.validity)}),
  json_object('data_vencimento', ${sqlNullableText(op.to.expiry)}, 'validade_meses', ${sqlNullableInt(op.to.validity)},
    'actor', '${actor}', 'plan_sha256', '${planSha256}', 'source_sha', '${sourceSha}', 'direction', '${direction}'),
  ${TENANT_ID}, datetime('now')
WHERE changes() > 0`;
}

// ---------- live state ----------
function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : Number.NaN;
}
function stateMatches(live, state) {
  return (live.data_vencimento ?? null) === state.expiry && intOrNull(live.historical_months) === state.validity;
}
function guardsMatch(live, op) {
  return Number(live.qualificacao_id) === op.qualificacao_id
    && String(live.status ?? '').trim().toUpperCase() === op.status
    && String(live.data_conclusao ?? '').slice(0, 10) === op.completion
    && live.certificado_arquivo_id == null
    && Number(live.has_uploaded_certificate) !== 1;
}

function modelMatches(live, model) {
  return !model
    || (String(live.model_code ?? '').trim().toUpperCase() === model.code
      && intOrNull(live.model_months) === model.validity
      && Number(live.model_end_of_month ?? 0) === model.endOfMonth);
}

function readLive(port, ids) {
  const live = new Map();
  for (const row of port.query(buildInventorySelectSql(ids))) {
    if (Number(row.empresa_id) === TENANT_ID) live.set(Number(row.id), row);
  }
  return live;
}
function readAudits(port, ids, actions) {
  const list = actions.map((a) => sqlStrictText(a, /^[A-Z0-9_]{1,64}$/, 'ACTION_INVALID')).join(',');
  const map = new Map();
  const rows = port.query(`SELECT entity_id, action, json_extract(new_values, '$.plan_sha256') AS plan_sha256
 FROM audit_logs
 WHERE empresa_id = ${TENANT_ID} AND entity_type = 'qualificacoes_historico'
   AND action IN (${list}) AND entity_id IN (${ids.map(sqlInt).join(',')})`);
  for (const r of rows) map.set(`${r.entity_id}|${r.action}|${r.plan_sha256}`, true);
  return map;
}

function firstBlockedReason(live) {
  const plan = buildPlan([live]);
  return Object.keys(plan.blocked)[0] ?? 'consistent_or_changed';
}

function classify({ ops, live, audits, direction, planSha256, forwardPlanSha256 }) {
  const out = { pending: [], already: [], skipped: [], conflicts: [] };
  for (const op of ops) {
    const row = live.get(op.id);
    if (!row) { out.conflicts.push({ id: op.id, reason: 'row_missing_deleted_or_out_of_scope' }); continue; }
    const doneAction = direction === 'forward' ? AUDIT_ACTION_APPLY : AUDIT_ACTION_ROLLBACK;
    const doneHash = planSha256;
    if (stateMatches(row, op.to) && guardsMatch(row, op)) {
      if (!modelMatches(row, op.model)) out.conflicts.push({ id: op.id, reason: 'model_changed_since_plan' });
      else if (audits.has(`${op.id}|${doneAction}|${doneHash}`)) out.already.push(op.id);
      else if (direction === 'rollback' && !audits.has(`${op.id}|${AUDIT_ACTION_APPLY}|${forwardPlanSha256}`)) {
        out.skipped.push(op.id); // never changed by the forward plan: nothing to restore
      } else out.conflicts.push({ id: op.id, reason: 'target_state_without_audit' });
      continue;
    }
    if (!guardsMatch(row, op)) { out.conflicts.push({ id: op.id, reason: 'guard_fields_changed_or_certificate_present' }); continue; }
    if (!stateMatches(row, op.from)) { out.conflicts.push({ id: op.id, reason: 'row_changed_since_plan' }); continue; }
    if (direction === 'forward') {
      const candidate = buildPlan([row]).candidates[0];
      if (!candidate || JSON.stringify(canonicalRow(candidate)) !== JSON.stringify(op.row)) {
        out.conflicts.push({ id: op.id, reason: 'eligibility_changed:' + firstBlockedReason(row) });
        continue;
      }
    } else if (!audits.has(`${op.id}|${AUDIT_ACTION_APPLY}|${forwardPlanSha256}`)) {
      out.conflicts.push({ id: op.id, reason: 'not_applied_by_forward_plan' });
      continue;
    }
    out.pending.push(op);
  }
  return out;
}

/**
 * Plan/apply a forward or rollback manifest.
 *  - apply !== true  => dry-run: reads only, port.exec is never called.
 *  - any preflight conflict aborts BEFORE the first write (no partial application by default).
 *  - every write is "CAS UPDATE + audit INSERT (changes()>0)" for one row, scoped by empresa_id.
 *  - the result is verified by re-reading; applied/rolled_back are counted from reads, not from the port.
 */
export function executeManifest({
  port, manifest, direction = 'forward', apply = false,
  expectedPlanHash, expectedCount, actor, sourceSha,
}) {
  check(direction === 'forward' || direction === 'rollback', 'DIRECTION_INVALID');
  check(port && typeof port.query === 'function' && typeof port.exec === 'function', 'PORT_INVALID');
  let ops; let planSha256; let forwardPlanSha256 = null; let manifestSha = null;
  if (direction === 'forward') {
    const validated = validateManifest(manifest, { expectedPlanHash, expectedCount });
    ops = forwardOps(validated.rows); planSha256 = validated.planSha256; forwardPlanSha256 = planSha256;
    manifestSha = validated.sourceSha;
  } else {
    const validated = validateRollbackManifest(manifest, { expectedPlanHash, expectedCount });
    ops = rollbackOps(validated.ops); planSha256 = validated.planSha256;
    forwardPlanSha256 = validated.forwardPlanSha256;
    manifestSha = validated.sourceSha;
  }
  if (apply) {
    check(ACTOR_RE.test(actor ?? ''), 'ACTOR_INVALID');
    check(SHA_RE.test(sourceSha ?? ''), 'SOURCE_SHA_INVALID');
    check(manifestSha !== null && manifestSha === sourceSha, 'MANIFEST_SOURCE_SHA_MISMATCH');
  }
  const ids = ops.map((o) => o.id);
  const action = direction === 'forward' ? AUDIT_ACTION_APPLY : AUDIT_ACTION_ROLLBACK;
  const audits = readAudits(port, ids, [AUDIT_ACTION_APPLY, AUDIT_ACTION_ROLLBACK]);
  const state = classify({ ops, live: readLive(port, ids), audits, direction, planSha256, forwardPlanSha256 });

  const report = {
    tenant: TENANT_ID, direction, mode: apply ? 'apply' : 'dry-run',
    plan_sha256: planSha256, row_count: ops.length,
    pending: state.pending.length, already_applied: state.already.length,
    skipped_not_applied: state.skipped.length,
    conflicts: state.conflicts, cas_conflicts: [],
    changed: 0, writes_attempted: 0, postconditions_verified: false,
  };
  if (!apply) { report.postconditions_verified = state.conflicts.length === 0; return report; }
  if (state.conflicts.length > 0) {
    const error = new Error('CAS_PREFLIGHT_CONFLICTS_ABORTED_BEFORE_ANY_WRITE');
    error.report = report;
    throw error;
  }

  const meta = { action, planSha256, sourceSha, actor, direction };
  for (const op of state.pending) {
    port.exec(`${casUpdateSql(op)};\n${auditInsertSql(op, meta)}`);
    report.writes_attempted++;
  }

  // Post-verification by re-reading (never trusts exec results).
  const after = classify({
    ops, live: readLive(port, ids), audits: readAudits(port, ids, [AUDIT_ACTION_APPLY, AUDIT_ACTION_ROLLBACK]),
    direction, planSha256, forwardPlanSha256,
  });
  const alreadyAfter = new Set(after.already);
  report.changed = state.pending.filter((o) => alreadyAfter.has(o.id)).length;
  report.cas_conflicts = state.pending.filter((o) => !alreadyAfter.has(o.id)).map((o) => o.id);
  report.already_applied = after.already.length;
  report.skipped_not_applied = after.skipped.length;
  report.pending = 0;
  report.conflicts = after.conflicts;
  report.postconditions_verified = report.cas_conflicts.length === 0
    && after.already.length + after.skipped.length === ops.length && after.conflicts.length === 0;
  return report;
}
