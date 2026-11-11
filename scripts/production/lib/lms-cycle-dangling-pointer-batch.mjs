// source_reference: finding F1 of the LMS consistency audit (tracking issue #776); template = lib/lms-consistency-1492-batch.mjs ('cptr' kind) and
//   lib/qualification-cma-age-batch.mjs (#2158/#2165 governed-executor pattern). Primitives come from lib/qualification-model-batch.mjs.
// operational_decision: governed per-row CAS executor for tenant 6 only; ONE operation kind (cycle pointer): an active lms_matricula_ciclos row
//   (deleted_at IS NULL) whose qualificacao_historico_id points to a qualificacoes_historico row that is soft-deleted (deleted_at NOT NULL) gets
//   that pointer set to NULL. Histories are NEVER restored.
// Never touched: lms_matricula_ciclos.status/score_final/tentativas/progresso_pct/data_*; lms_matriculas; lms_progresso_scorm (lesson_status,
//   suspend_data, cmi); qualificacoes_historico (not even read-modify); certificate columns.
// dry_run_required: default dry-run (reads only; port.exec is never called). Apply needs plan hash + row count + SHA binding + audit actor.
// rollback_plan_required: buildRollbackManifest embeds the forward manifest; the inverse CAS operations (NULL -> previous pointer) are derived
//   deterministically (reverse order, from/to swapped) and bound to the original source SHA by their own hash.
//
// Domain library over an executor port { query(sql) -> rows, exec(sql) -> void } (scripts/production/lib/executors.mjs).
import {
  ACTOR_RE, HASH_RE, SHA_RE, check, fail, sha256Hex, sqlInt, sqlNullableInt,
} from './qualification-model-batch.mjs';

export { sha256Hex };

export const TENANT_ID = 6;
export const MAX_OPS = 100;
export const MANIFEST_KIND = 'LMS_CYCLE_DANGLING_POINTER_MANIFEST_V1';
export const ROLLBACK_KIND = 'LMS_CYCLE_DANGLING_POINTER_ROLLBACK_MANIFEST_V1';
export const AUDIT_BASE = 'LMS_CYCLE_DANGLING_POINTER_CLEAR';
export const AUDIT_ORIGIN = 'limpeza de ponteiro de ciclo para historico removido (F1, #776)';
export const ENTITY = 'lms_matricula_ciclos';

export function auditAction(direction) {
  return `${AUDIT_BASE}${direction === 'rollback' ? '_ROLLBACK' : ''}`;
}

const posInt = (v, code) => check(Number.isSafeInteger(v) && v > 0, code);

// ---------- canonical rows ----------
/** matricula_id may legitimately be NULL (imported cycles without enrollment); it is part of the CAS identity. */
export function canonicalCyclePointer(row) {
  check(row && typeof row === 'object', 'CPTR_ROW_INVALID');
  posInt(row.cycle_id, 'CPTR_ROW_CYCLE_ID');
  posInt(row.historico_id, 'CPTR_ROW_HISTORICO_ID');
  const matriculaId = row.matricula_id ?? null;
  check(matriculaId === null || (Number.isSafeInteger(matriculaId) && matriculaId > 0), 'CPTR_ROW_MATRICULA_ID');
  return { cycle_id: row.cycle_id, matricula_id: matriculaId, historico_id: row.historico_id };
}

function canonicalBody(source) {
  check(source && typeof source === 'object', 'MANIFEST_INVALID');
  check(Array.isArray(source.cycle_pointers), 'MANIFEST_LISTS_MISSING');
  const cyclePointers = source.cycle_pointers.map(canonicalCyclePointer);
  for (let i = 1; i < cyclePointers.length; i++) {
    check(cyclePointers[i - 1].cycle_id < cyclePointers[i].cycle_id, 'MANIFEST_CPTR_NOT_SORTED_OR_DUPLICATE');
  }
  return { cycle_pointers: cyclePointers };
}

export function hashBody(body) {
  return sha256Hex(JSON.stringify({ cycle_pointers: body.cycle_pointers }));
}

export function countOps(body) {
  return body.cycle_pointers.length;
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
  const forward = body.cycle_pointers.map((c) => ({ id: c.cycle_id, spec: c, from: { qh: c.historico_id }, to: { qh: null } }));
  if (direction === 'forward') return forward.map((op) => ({ ...op, direction }));
  return forward.reverse().map((op) => ({ ...op, direction, from: op.to, to: op.from }));
}

// ---------- CAS statements ----------
const matriculaIs = (id) => (id === null ? 'matricula_id IS NULL' : `matricula_id = ${sqlInt(id)}`);

/** One CAS UPDATE. Writes ONLY qualificacao_historico_id and updated_at of one active cycle row of tenant 6. */
export function casUpdateSql(op) {
  const { spec, from, to } = op;
  const forward = op.direction === 'forward';
  const guard = forward ? `
   AND EXISTS (SELECT 1 FROM qualificacoes_historico h WHERE h.id = ${sqlInt(spec.historico_id)}
         AND h.empresa_id = ${TENANT_ID} AND h.deleted_at IS NOT NULL)` : '';
  return `UPDATE lms_matricula_ciclos
   SET qualificacao_historico_id = ${sqlNullableInt(to.qh)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.cycle_id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND ${matriculaIs(spec.matricula_id)}
   AND qualificacao_historico_id IS ${sqlNullableInt(from.qh)}${guard}`;
}

const auditJson = (state) => `json_object('qualificacao_historico_id', ${sqlNullableInt(state.qh)})`;

/** Audit row written only if the preceding UPDATE changed a row (changes() > 0). */
export function auditInsertSql(op, { planSha256, sourceSha, actor }) {
  check(ACTOR_RE.test(actor ?? ''), 'ACTOR_INVALID');
  check(SHA_RE.test(sourceSha ?? ''), 'SOURCE_SHA_INVALID');
  check(HASH_RE.test(planSha256), 'PLAN_HASH_INVALID');
  return `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, empresa_id, created_at)
SELECT NULL, '${auditAction(op.direction)}', '${ENTITY}', ${sqlInt(op.id)},
  ${auditJson(op.from)},
  json_set(${auditJson(op.to)}, '$.actor', '${actor}', '$.plan_sha256', '${planSha256}', '$.source_sha', '${sourceSha}', '$.direction', '${op.direction}',
    '$.origin', '${AUDIT_ORIGIN}', '$.matricula_id', ${sqlNullableInt(op.spec.matricula_id)}, '$.historico_id', ${sqlInt(op.spec.historico_id)}),
  ${TENANT_ID}, datetime('now')
WHERE changes() > 0`;
}

// ---------- live reads ----------
const idList = (list) => [...new Set(list)].map((n) => sqlInt(n)).join(',');

function readCycles(port, ops) {
  const map = new Map();
  for (const row of port.query(`SELECT id, matricula_id, qualificacao_historico_id, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM lms_matricula_ciclos WHERE empresa_id = ${TENANT_ID} AND id IN (${idList(ops.map((o) => o.id))})`)) map.set(Number(row.id), row);
  return map;
}

function readHistoricos(port, ops) {
  const map = new Map();
  for (const row of port.query(`SELECT id, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM qualificacoes_historico WHERE empresa_id = ${TENANT_ID} AND id IN (${idList(ops.map((o) => o.spec.historico_id))})`)) map.set(Number(row.id), row);
  return map;
}

function readAudits(port, ops) {
  const set = new Set();
  const rows = port.query(`SELECT entity_id, action, json_extract(new_values, '$.plan_sha256') AS plan_sha256
 FROM audit_logs WHERE empresa_id = ${TENANT_ID} AND entity_type = '${ENTITY}'
   AND action IN ('${auditAction('forward')}','${auditAction('rollback')}') AND entity_id IN (${idList(ops.map((o) => o.id))})`);
  for (const r of rows) set.add(`${r.entity_id}|${r.action}|${r.plan_sha256}`);
  return set;
}

/** Independent read of the whole tenant-6 scope: live cycles still pointing to a soft-deleted history (counts only). */
export function countDanglingTotal(port) {
  const row = port.query(`SELECT COUNT(*) AS n FROM lms_matricula_ciclos c
 JOIN qualificacoes_historico h ON h.id = c.qualificacao_historico_id AND h.empresa_id = ${TENANT_ID}
 WHERE c.empresa_id = ${TENANT_ID} AND c.deleted_at IS NULL AND h.deleted_at IS NOT NULL`)[0];
  return Number(row?.n ?? 0);
}

function snapshot(port, ops) {
  return { cycles: readCycles(port, ops), historicos: readHistoricos(port, ops), audits: readAudits(port, ops) };
}

// ---------- classification ----------
const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

function guardsMatch(op, live) {
  return Number(live.deleted) === 0 && num(live.matricula_id) === op.spec.matricula_id;
}

function classify({ ops, snap, direction, planSha256, forwardPlanSha256 }) {
  const out = { pending: [], already: [], skipped: [], conflicts: [] };
  for (const op of ops) {
    const row = snap.cycles.get(op.id);
    if (!row) { out.conflicts.push({ id: op.id, reason: 'row_missing_deleted_or_out_of_scope' }); continue; }
    const key = (hash) => `${op.id}|${auditAction(direction)}|${hash}`;
    const forwardKey = `${op.id}|${auditAction('forward')}|${forwardPlanSha256}`;
    if (!guardsMatch(op, row)) { out.conflicts.push({ id: op.id, reason: 'guard_fields_changed' }); continue; }
    const pointer = num(row.qualificacao_historico_id);
    if (pointer === op.to.qh) {
      if (snap.audits.has(key(planSha256))) out.already.push(op);
      else if (direction === 'rollback' && !snap.audits.has(forwardKey)) out.skipped.push(op);
      else out.conflicts.push({ id: op.id, reason: 'target_state_without_audit' });
      continue;
    }
    if (pointer !== op.from.qh) { out.conflicts.push({ id: op.id, reason: 'row_changed_since_plan' }); continue; }
    if (direction === 'forward') {
      const h = snap.historicos.get(op.spec.historico_id);
      if (!h || Number(h.deleted) !== 1) { out.conflicts.push({ id: op.id, reason: 'historico_not_soft_deleted' }); continue; }
    } else if (!snap.audits.has(forwardKey)) {
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
 *  - any preflight conflict aborts BEFORE the first write.
 *  - every write is "CAS UPDATE + audit INSERT (changes()>0)" for a single row, scoped by empresa_id.
 *  - the result is verified by an independent re-read; counts come from reads, not from the port.
 */
export function executeManifest({
  port, manifest, direction = 'forward', apply = false, expectedPlanHash, expectedCount, actor, sourceSha,
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
  const state = classify({ ops, snap: snapshot(port, ops), direction, planSha256, forwardPlanSha256 });

  const report = {
    tenant: TENANT_ID, direction, mode: apply ? 'apply' : 'dry-run',
    plan_sha256: planSha256, row_count: ops.length,
    pending: state.pending.length,
    already_applied: state.already.length, skipped_not_applied: state.skipped.length,
    conflicts: state.conflicts, cas_conflicts: [],
    changed: 0, writes_attempted: 0, postconditions_verified: false,
    dangling_total_before: countDanglingTotal(port), dangling_total_after: null,
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
  const after = classify({ ops, snap: snapshot(port, ops), direction, planSha256, forwardPlanSha256 });
  const done = new Set(after.already.map((o) => o.id));
  report.changed = state.pending.filter((o) => done.has(o.id)).length;
  report.cas_conflicts = state.pending.filter((o) => !done.has(o.id)).map((o) => ({ id: o.id }));
  report.already_applied = after.already.length;
  report.skipped_not_applied = after.skipped.length;
  report.pending = 0;
  report.conflicts = after.conflicts;
  report.dangling_total_after = countDanglingTotal(port);
  report.postconditions_verified = report.cas_conflicts.length === 0 && after.conflicts.length === 0
    && after.already.length + after.skipped.length === ops.length;
  return report;
}

export { fail };
