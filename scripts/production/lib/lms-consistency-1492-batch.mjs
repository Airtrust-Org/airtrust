// source_reference: issue #1492 owner decisions (groups 1 and 2), planner lms-consistency-1492-readonly-plan.mjs, read-only classifier
//   lms-qualification-consistency-plan-readonly.mjs (#2161) and the executor pattern of lib/qualification-validity-no-dia-batch.mjs
//   (PR #2141/#2153/#2158). The shared primitives (sha256Hex, SQL literal rendering, regexes) come from lib/qualification-model-batch.mjs.
// operational_decision: governed per-statement CAS executor for tenant 6 only. Four operation kinds, applied in this order:
//   cycle    (group 1) lms_matricula_ciclos current cycle EM_ANDAMENTO -> CONCLUIDO, aligned to the enrollment (date/progress);
//   link     (group 1) qualificacoes_historico.lms_matricula_ciclo_id NULL -> cycle id;
//   pointer  (group 2) lms_matriculas.qualificacao_historico_id (soft-deleted history) -> NULL (#1920 pattern);
//   cptr     (group 2) lms_matricula_ciclos.qualificacao_historico_id (same soft-deleted history) -> NULL, only when the current cycle holds it.
// Never touched: score_final, tentativas, lms_progresso_scorm (lesson_status, suspend_data, cmi), qualificacoes_historico rows beyond the link
//   column (no re-creation, no restore, no score/date change), lms_matriculas.status/data_conclusao, certificate columns. Enrollments stay CONCLUIDO.
// dry_run_required: default dry-run (reads only; port.exec is never called). Apply needs plan hash + row count + SHA binding + audit actor.
// rollback_plan_required: buildRollbackManifest embeds the forward manifest; the inverse CAS operations are derived deterministically
//   (reverse order, from/to swapped) and are bound to the original source SHA by their own hash.
//
// Domain library over an executor port { query(sql) -> rows, exec(sql) -> void } (scripts/production/lib/executors.mjs).
import {
  ACTOR_RE, HASH_RE, RAW_TEXT_RE, SHA_RE, check, fail, intOrNull, nullableText, sha256Hex, sqlInt, sqlNullableInt, sqlNullableText,
} from './qualification-model-batch.mjs';

export const TENANT_ID = 6;
export const MAX_OPS = 200;
export const MANIFEST_KIND = 'LMS_CONSISTENCY_1492_MANIFEST_V1';
export const ROLLBACK_KIND = 'LMS_CONSISTENCY_1492_ROLLBACK_MANIFEST_V1';
export const AUDIT_BASE = 'LMS_CONSISTENCY_1492';
export const KINDS = ['cycle', 'link', 'pointer', 'cptr'];
const KIND_LABEL = { cycle: 'CYCLE_RATIFY', link: 'LINK_RATIFY', pointer: 'POINTER_CLEAR', cptr: 'CYCLE_POINTER_CLEAR' };
const ENTITY = { cycle: 'lms_matricula_ciclos', link: 'qualificacoes_historico', pointer: 'lms_matriculas', cptr: 'lms_matricula_ciclos' };
export const GROUP_OF = { cycle: 1, link: 1, pointer: 2, cptr: 2 };
export const ORIGIN = { 1: 'ratificação do dono #1492 grupo 1', 2: 'limpeza de ponteiro por decisão do dono #1492 grupo 2' };

/** Owner scope (binding). Group 1: ratify; group 2: clear pointer to soft-deleted history. Groups 3 and 4: no action. */
export const GROUP1_MATRICULAS = [323, 328, 331, 344, 394, 396, 398];
export const GROUP2_FUNCIONARIO_ID = 41;
export const GROUP2_POINTERS = [
  { matricula_id: 699, historico_id: 7160 },
  { matricula_id: 867, historico_id: 7154 },
  { matricula_id: 947, historico_id: 7153 },
  { matricula_id: 1135, historico_id: 7155 },
  { matricula_id: 1333, historico_id: 7152 },
  { matricula_id: 2061, historico_id: 7157 },
];
/** Group-1 histories were created without audit between these dates (owner statement); anything else is divergence. */
export const GROUP1_HISTORY_WINDOW = { from: '2026-06-27', to: '2026-07-03' };
const REALIZED = new Set(['CONCLUIDA', 'CONCLUIDO', 'RENOVADA', 'VALIDA', 'VENCIDA', 'PROXIMA_VENCIMENTO']);
export { REALIZED, sha256Hex };

export function auditAction(kind, direction) {
  return `${AUDIT_BASE}_${KIND_LABEL[kind]}${direction === 'rollback' ? '_ROLLBACK' : ''}`;
}

const posInt = (v, code) => check(Number.isSafeInteger(v) && v > 0, code);

// ---------- canonical rows ----------
export function canonicalCycle(row) {
  check(row && typeof row === 'object', 'CYCLE_ROW_INVALID');
  for (const k of ['cycle_id', 'matricula_id', 'historico_id', 'funcionario_id']) posInt(row[k], `CYCLE_ROW_${k.toUpperCase()}`);
  check(row.old_status === 'EM_ANDAMENTO' && row.next_status === 'CONCLUIDO', 'CYCLE_ROW_STATUS');
  const oldDc = nullableText(row.old_data_conclusao, RAW_TEXT_RE, 'CYCLE_ROW_OLD_DATA_CONCLUSAO');
  const nextDc = nullableText(row.next_data_conclusao, RAW_TEXT_RE, 'CYCLE_ROW_NEXT_DATA_CONCLUSAO');
  check(nextDc !== null, 'CYCLE_ROW_NEXT_DATA_CONCLUSAO_REQUIRED');
  const oldPp = intOrNull(row.old_progresso_pct, 'CYCLE_ROW_OLD_PROGRESS');
  const nextPp = intOrNull(row.next_progresso_pct, 'CYCLE_ROW_NEXT_PROGRESS');
  check(oldPp !== null && oldPp >= 0 && oldPp <= 100 && nextPp !== null && nextPp >= 0 && nextPp <= 100, 'CYCLE_ROW_PROGRESS_RANGE');
  const oldQh = intOrNull(row.old_historico_id ?? null, 'CYCLE_ROW_OLD_HISTORICO');
  check(oldQh === null || oldQh === row.historico_id, 'CYCLE_ROW_OLD_HISTORICO_MISMATCH');
  return {
    cycle_id: row.cycle_id, matricula_id: row.matricula_id, historico_id: row.historico_id, funcionario_id: row.funcionario_id,
    old_status: 'EM_ANDAMENTO', next_status: 'CONCLUIDO', old_data_conclusao: oldDc, next_data_conclusao: nextDc,
    old_progresso_pct: oldPp, next_progresso_pct: nextPp, old_historico_id: oldQh,
  };
}

export function canonicalLink(row) {
  check(row && typeof row === 'object', 'LINK_ROW_INVALID');
  for (const k of ['historico_id', 'matricula_id', 'cycle_id']) posInt(row[k], `LINK_ROW_${k.toUpperCase()}`);
  return { historico_id: row.historico_id, matricula_id: row.matricula_id, cycle_id: row.cycle_id };
}

export function canonicalPointer(row) {
  check(row && typeof row === 'object', 'POINTER_ROW_INVALID');
  for (const k of ['matricula_id', 'historico_id', 'funcionario_id']) posInt(row[k], `POINTER_ROW_${k.toUpperCase()}`);
  return { matricula_id: row.matricula_id, historico_id: row.historico_id, funcionario_id: row.funcionario_id };
}

export function canonicalCyclePointer(row) {
  check(row && typeof row === 'object', 'CPTR_ROW_INVALID');
  for (const k of ['cycle_id', 'matricula_id', 'historico_id']) posInt(row[k], `CPTR_ROW_${k.toUpperCase()}`);
  return { cycle_id: row.cycle_id, matricula_id: row.matricula_id, historico_id: row.historico_id };
}

function sortedBy(rows, key, code) {
  for (let i = 1; i < rows.length; i++) check(rows[i - 1][key] < rows[i][key], code);
  return rows;
}

function canonicalBody(source) {
  check(source && typeof source === 'object', 'MANIFEST_INVALID');
  for (const list of ['cycles', 'links', 'pointers', 'cycle_pointers']) check(Array.isArray(source[list]), 'MANIFEST_LISTS_MISSING');
  const cycles = sortedBy(source.cycles.map(canonicalCycle), 'cycle_id', 'MANIFEST_CYCLES_NOT_SORTED_OR_DUPLICATE');
  const links = sortedBy(source.links.map(canonicalLink), 'historico_id', 'MANIFEST_LINKS_NOT_SORTED_OR_DUPLICATE');
  const pointers = sortedBy(source.pointers.map(canonicalPointer), 'matricula_id', 'MANIFEST_POINTERS_NOT_SORTED_OR_DUPLICATE');
  const cyclePointers = sortedBy(source.cycle_pointers.map(canonicalCyclePointer), 'cycle_id', 'MANIFEST_CPTR_NOT_SORTED_OR_DUPLICATE');

  const g1 = new Set(GROUP1_MATRICULAS);
  const cycleByMatricula = new Map();
  for (const c of cycles) {
    check(g1.has(c.matricula_id), 'MANIFEST_CYCLE_OUTSIDE_OWNER_SCOPE');
    check(!cycleByMatricula.has(c.matricula_id), 'MANIFEST_CYCLE_DUPLICATE_MATRICULA');
    cycleByMatricula.set(c.matricula_id, c);
  }
  const linkMatriculas = new Set();
  for (const l of links) {
    check(g1.has(l.matricula_id), 'MANIFEST_LINK_OUTSIDE_OWNER_SCOPE');
    check(!linkMatriculas.has(l.matricula_id), 'MANIFEST_LINK_DUPLICATE_MATRICULA');
    linkMatriculas.add(l.matricula_id);
    const c = cycleByMatricula.get(l.matricula_id);
    check(c && c.cycle_id === l.cycle_id && c.historico_id === l.historico_id, 'MANIFEST_LINK_WITHOUT_MATCHING_CYCLE');
  }
  check(linkMatriculas.size === cycleByMatricula.size, 'MANIFEST_CYCLE_WITHOUT_LINK');

  const g2 = new Map(GROUP2_POINTERS.map((p) => [p.matricula_id, p.historico_id]));
  const pointerByMatricula = new Map();
  for (const p of pointers) {
    check(g2.get(p.matricula_id) === p.historico_id && p.funcionario_id === GROUP2_FUNCIONARIO_ID, 'MANIFEST_POINTER_OUTSIDE_OWNER_SCOPE');
    pointerByMatricula.set(p.matricula_id, p);
  }
  for (const c of cyclePointers) {
    check(g2.get(c.matricula_id) === c.historico_id && pointerByMatricula.has(c.matricula_id), 'MANIFEST_CPTR_OUTSIDE_OWNER_SCOPE');
  }
  return { cycles, links, pointers, cycle_pointers: cyclePointers };
}

export function hashBody(body) {
  return sha256Hex(JSON.stringify({ cycles: body.cycles, links: body.links, pointers: body.pointers, cycle_pointers: body.cycle_pointers }));
}

export function countOps(body) {
  return body.cycles.length + body.links.length + body.pointers.length + body.cycle_pointers.length;
}

/** Operation and matricula counts per owner group. */
export function countsByGroup(body) {
  return {
    group1: { matriculas: body.cycles.length, cycle_ops: body.cycles.length, link_ops: body.links.length, ops: body.cycles.length + body.links.length },
    group2: {
      matriculas: body.pointers.length, pointer_ops: body.pointers.length, cycle_pointer_ops: body.cycle_pointers.length,
      ops: body.pointers.length + body.cycle_pointers.length,
    },
  };
}

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
  const cycles = body.cycles.map((c) => ({
    kind: 'cycle', id: c.cycle_id, spec: c,
    from: { status: c.old_status, dc: c.old_data_conclusao, pp: c.old_progresso_pct, qh: c.old_historico_id },
    to: { status: c.next_status, dc: c.next_data_conclusao, pp: c.next_progresso_pct, qh: c.historico_id },
  }));
  const links = body.links.map((l) => ({ kind: 'link', id: l.historico_id, spec: l, from: { cycle: null }, to: { cycle: l.cycle_id } }));
  const pointers = body.pointers.map((p) => ({ kind: 'pointer', id: p.matricula_id, spec: p, from: { qh: p.historico_id }, to: { qh: null } }));
  const cptrs = body.cycle_pointers.map((c) => ({ kind: 'cptr', id: c.cycle_id, spec: c, from: { qh: c.historico_id }, to: { qh: null } }));
  const forward = [...cycles, ...links, ...pointers, ...cptrs];
  if (direction === 'forward') return forward.map((op) => ({ ...op, direction }));
  return forward.reverse().map((op) => ({ ...op, direction, from: op.to, to: op.from }));
}

// ---------- CAS statements ----------
const STATUS_LITERAL = { EM_ANDAMENTO: "'EM_ANDAMENTO'", CONCLUIDO: "'CONCLUIDO'" };
const statusSql = (s) => { check(STATUS_LITERAL[s], 'SQL_STATUS_INVALID'); return STATUS_LITERAL[s]; };

const scormPassed = (mid) => `EXISTS (SELECT 1 FROM lms_progresso_scorm s WHERE s.empresa_id = ${TENANT_ID} AND s.matricula_id = ${sqlInt(mid)}
         AND LOWER(COALESCE(s.lesson_status, '')) IN ('passed', 'completed'))`;

const historicoSoftDeleted = (spec, funcionarioId) => `EXISTS (SELECT 1 FROM qualificacoes_historico h WHERE h.id = ${sqlInt(spec.historico_id)}
       AND h.empresa_id = ${TENANT_ID} AND h.funcionario_id = ${sqlInt(funcionarioId)} AND h.deleted_at IS NOT NULL)`;

/** One CAS UPDATE. Never writes scores, scorm tables, enrollment status/date, history rows other than the link column. */
export function casUpdateSql(op) {
  const { spec, from, to } = op;
  const forward = op.direction === 'forward';
  if (op.kind === 'cycle') {
    const guard = forward ? `
   AND EXISTS (SELECT 1 FROM lms_matriculas m WHERE m.id = ${sqlInt(spec.matricula_id)} AND m.empresa_id = ${TENANT_ID}
         AND m.deleted_at IS NULL AND UPPER(TRIM(m.status)) = 'CONCLUIDO' AND m.funcionario_id = ${sqlInt(spec.funcionario_id)}
         AND m.qualificacao_historico_id = ${sqlInt(spec.historico_id)}
         AND m.data_conclusao IS ${sqlNullableText(to.dc)} AND m.progresso_pct = ${sqlInt(to.pp)}
         AND ${scormPassed(spec.matricula_id)})` : '';
    return `UPDATE lms_matricula_ciclos
   SET status = ${statusSql(to.status)}, data_conclusao = ${sqlNullableText(to.dc)}, progresso_pct = ${sqlInt(to.pp)},
       qualificacao_historico_id = ${sqlNullableInt(to.qh)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.cycle_id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND matricula_id = ${sqlInt(spec.matricula_id)}
   AND ciclo_atual = 1
   AND status = ${statusSql(from.status)}
   AND data_conclusao IS ${sqlNullableText(from.dc)}
   AND progresso_pct = ${sqlInt(from.pp)}
   AND qualificacao_historico_id IS ${sqlNullableInt(from.qh)}${guard}`;
  }
  if (op.kind === 'link') {
    const guard = forward ? `
   AND EXISTS (SELECT 1 FROM lms_matricula_ciclos c WHERE c.id = ${sqlInt(spec.cycle_id)} AND c.empresa_id = ${TENANT_ID}
         AND c.matricula_id = ${sqlInt(spec.matricula_id)} AND c.deleted_at IS NULL AND c.ciclo_atual = 1
         AND c.status = 'CONCLUIDO' AND c.qualificacao_historico_id = ${sqlInt(spec.historico_id)})` : '';
    return `UPDATE qualificacoes_historico
   SET lms_matricula_ciclo_id = ${sqlNullableInt(to.cycle)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.historico_id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND lms_matricula_id = ${sqlInt(spec.matricula_id)}
   AND lms_matricula_ciclo_id IS ${sqlNullableInt(from.cycle)}${guard}`;
  }
  if (op.kind === 'pointer') {
    const guard = forward ? `\n   AND ${historicoSoftDeleted(spec, spec.funcionario_id)}` : '';
    return `UPDATE lms_matriculas
   SET qualificacao_historico_id = ${sqlNullableInt(to.qh)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.matricula_id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND funcionario_id = ${sqlInt(spec.funcionario_id)}
   AND UPPER(TRIM(status)) = 'CONCLUIDO'
   AND qualificacao_historico_id IS ${sqlNullableInt(from.qh)}${guard}`;
  }
  const guard = forward ? `\n   AND ${historicoSoftDeleted(spec, GROUP2_FUNCIONARIO_ID)}` : '';
  return `UPDATE lms_matricula_ciclos
   SET qualificacao_historico_id = ${sqlNullableInt(to.qh)}, updated_at = datetime('now')
 WHERE id = ${sqlInt(spec.cycle_id)}
   AND empresa_id = ${TENANT_ID}
   AND deleted_at IS NULL
   AND matricula_id = ${sqlInt(spec.matricula_id)}
   AND ciclo_atual = 1
   AND qualificacao_historico_id IS ${sqlNullableInt(from.qh)}${guard}`;
}

function auditJson(op, state) {
  if (op.kind === 'cycle') {
    return `json_object('status', ${statusSql(state.status)}, 'data_conclusao', ${sqlNullableText(state.dc)}, 'progresso_pct', ${sqlInt(state.pp)}, 'qualificacao_historico_id', ${sqlNullableInt(state.qh)})`;
  }
  if (op.kind === 'link') return `json_object('lms_matricula_ciclo_id', ${sqlNullableInt(state.cycle)})`;
  return `json_object('qualificacao_historico_id', ${sqlNullableInt(state.qh)})`;
}

/** Audit row written only if the preceding UPDATE changed a row (changes() > 0). */
export function auditInsertSql(op, { planSha256, sourceSha, actor }) {
  check(ACTOR_RE.test(actor ?? ''), 'ACTOR_INVALID');
  check(SHA_RE.test(sourceSha ?? ''), 'SOURCE_SHA_INVALID');
  check(HASH_RE.test(planSha256), 'PLAN_HASH_INVALID');
  const group = GROUP_OF[op.kind];
  return `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, empresa_id, created_at)
SELECT NULL, '${auditAction(op.kind, op.direction)}', '${ENTITY[op.kind]}', ${sqlInt(op.id)},
  ${auditJson(op, op.from)},
  json_set(${auditJson(op, op.to)}, '$.actor', '${actor}', '$.plan_sha256', '${planSha256}', '$.source_sha', '${sourceSha}', '$.direction', '${op.direction}',
    '$.origin', '${ORIGIN[group]}', '$.matricula_id', ${sqlInt(op.spec.matricula_id)}, '$.group', ${group}),
  ${TENANT_ID}, datetime('now')
WHERE changes() > 0`;
}

// ---------- live reads ----------
const idList = (list) => [...new Set(list)].map((n) => sqlInt(n)).join(',');

function readMap(port, sql) {
  const map = new Map();
  for (const row of port.query(sql)) map.set(Number(row.id), row);
  return map;
}

function snapshot(port, ops) {
  const cycleIds = ops.filter((o) => o.kind === 'cycle' || o.kind === 'cptr').map((o) => o.id);
  const matriculaIds = ops.filter((o) => o.kind === 'cycle' || o.kind === 'pointer').map((o) => o.spec.matricula_id);
  const historicoIds = ops.map((o) => o.spec.historico_id);
  const linkOrCycle = ops.filter((o) => o.kind === 'link').map((o) => o.spec.cycle_id);
  const allCycles = [...cycleIds, ...linkOrCycle];
  return {
    cycles: allCycles.length === 0 ? new Map() : readMap(port, `SELECT id, matricula_id, ciclo_atual, status, data_conclusao, progresso_pct,
  qualificacao_historico_id, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM lms_matricula_ciclos WHERE empresa_id = ${TENANT_ID} AND id IN (${idList(allCycles)})`),
    historicos: historicoIds.length === 0 ? new Map() : readMap(port, `SELECT id, funcionario_id, lms_matricula_id, lms_matricula_ciclo_id,
  CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM qualificacoes_historico WHERE empresa_id = ${TENANT_ID} AND id IN (${idList(historicoIds)})`),
    matriculas: matriculaIds.length === 0 ? new Map() : readMap(port, `SELECT m.id, m.funcionario_id, UPPER(TRIM(COALESCE(m.status, ''))) AS status,
  m.qualificacao_historico_id, m.data_conclusao, m.progresso_pct, CASE WHEN m.deleted_at IS NULL THEN 0 ELSE 1 END AS deleted,
  (SELECT COUNT(*) FROM lms_progresso_scorm s WHERE s.empresa_id = m.empresa_id AND s.matricula_id = m.id
     AND LOWER(COALESCE(s.lesson_status, '')) IN ('passed', 'completed')) AS scorm_passed
 FROM lms_matriculas m WHERE m.empresa_id = ${TENANT_ID} AND m.id IN (${idList(matriculaIds)})`),
    audits: readAudits(port, ops),
  };
}

function readAudits(port, ops) {
  const set = new Set();
  const list = [...new Set(ops.map((o) => o.id))];
  if (list.length === 0) return set;
  const actions = KINDS.flatMap((k) => [auditAction(k, 'forward'), auditAction(k, 'rollback')]);
  const rows = port.query(`SELECT entity_type, entity_id, action, json_extract(new_values, '$.plan_sha256') AS plan_sha256
 FROM audit_logs WHERE empresa_id = ${TENANT_ID} AND action IN (${actions.map((a) => `'${a}'`).join(',')})
   AND entity_id IN (${idList(list)})`);
  for (const r of rows) set.add(`${r.entity_type}|${r.entity_id}|${r.action}|${r.plan_sha256}`);
  return set;
}

// ---------- classification ----------
const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value));
const txt = (value) => (value === null || value === undefined ? null : String(value));

function liveRow(op, snap) {
  if (op.kind === 'cycle' || op.kind === 'cptr') return snap.cycles.get(op.id);
  if (op.kind === 'link') return snap.historicos.get(op.id);
  return snap.matriculas.get(op.id);
}

function stateMatches(op, live, state) {
  if (op.kind === 'cycle') {
    return txt(live.status) === state.status && txt(live.data_conclusao) === state.dc && num(live.progresso_pct) === state.pp
      && num(live.qualificacao_historico_id) === state.qh;
  }
  if (op.kind === 'link') return num(live.lms_matricula_ciclo_id) === state.cycle;
  return num(live.qualificacao_historico_id) === state.qh;
}

function guardsMatch(op, live) {
  const spec = op.spec;
  if (Number(live.deleted) !== 0) return false;
  if (op.kind === 'cycle' || op.kind === 'cptr') return Number(live.matricula_id) === spec.matricula_id && Number(live.ciclo_atual) === 1;
  if (op.kind === 'link') return Number(live.lms_matricula_id) === spec.matricula_id;
  return Number(live.funcionario_id) === spec.funcionario_id && live.status === 'CONCLUIDO';
}

/** Forward-only dependency on the rest of the live state (mirrors the EXISTS guards in casUpdateSql). */
function forwardExtraConflict(op, snap, pending) {
  const spec = op.spec;
  if (op.kind === 'cycle') {
    const m = snap.matriculas.get(spec.matricula_id);
    const ok = m && Number(m.deleted) === 0 && m.status === 'CONCLUIDO' && Number(m.funcionario_id) === spec.funcionario_id
      && num(m.qualificacao_historico_id) === spec.historico_id && txt(m.data_conclusao) === op.to.dc
      && num(m.progresso_pct) === op.to.pp && Number(m.scorm_passed) > 0;
    return ok ? null : 'matricula_not_in_expected_state';
  }
  if (op.kind === 'link') {
    const c = snap.cycles.get(spec.cycle_id);
    const cycleDone = c && Number(c.deleted) === 0 && Number(c.ciclo_atual) === 1 && txt(c.status) === 'CONCLUIDO'
      && num(c.qualificacao_historico_id) === spec.historico_id;
    return cycleDone || pending.has(`cycle:${spec.cycle_id}`) ? null : 'cycle_not_in_expected_state';
  }
  const h = snap.historicos.get(spec.historico_id);
  const funcionarioId = op.kind === 'pointer' ? spec.funcionario_id : GROUP2_FUNCIONARIO_ID;
  return h && Number(h.deleted) === 1 && Number(h.funcionario_id) === funcionarioId ? null : 'historico_not_soft_deleted';
}

function classify({ ops, snap, direction, planSha256, forwardPlanSha256 }) {
  const out = { pending: [], already: [], skipped: [], conflicts: [] };
  const pending = new Set();
  for (const op of ops) {
    const row = liveRow(op, snap);
    if (!row) { out.conflicts.push({ kind: op.kind, id: op.id, reason: 'row_missing_deleted_or_out_of_scope' }); continue; }
    const key = (hash) => `${ENTITY[op.kind]}|${op.id}|${auditAction(op.kind, direction)}|${hash}`;
    const forwardKey = `${ENTITY[op.kind]}|${op.id}|${auditAction(op.kind, 'forward')}|${forwardPlanSha256}`;
    if (!guardsMatch(op, row)) { out.conflicts.push({ kind: op.kind, id: op.id, reason: 'guard_fields_changed' }); continue; }
    if (stateMatches(op, row, op.to)) {
      if (snap.audits.has(key(planSha256))) out.already.push(op);
      else if (direction === 'rollback' && !snap.audits.has(forwardKey)) out.skipped.push(op);
      else out.conflicts.push({ kind: op.kind, id: op.id, reason: 'target_state_without_audit' });
      continue;
    }
    if (!stateMatches(op, row, op.from)) { out.conflicts.push({ kind: op.kind, id: op.id, reason: 'row_changed_since_plan' }); continue; }
    if (direction === 'forward') {
      const reason = forwardExtraConflict(op, snap, pending);
      if (reason) { out.conflicts.push({ kind: op.kind, id: op.id, reason }); continue; }
    } else if (!snap.audits.has(forwardKey)) {
      out.conflicts.push({ kind: op.kind, id: op.id, reason: 'not_applied_by_forward_plan' });
      continue;
    }
    if (op.kind === 'cycle') pending.add(`cycle:${op.id}`);
    out.pending.push(op);
  }
  return out;
}

function countByKind(list) {
  const out = {};
  for (const k of KINDS) out[k] = list.filter((o) => o.kind === k).length;
  return out;
}

function countByGroup(list) {
  return { group1: list.filter((o) => GROUP_OF[o.kind] === 1).length, group2: list.filter((o) => GROUP_OF[o.kind] === 2).length };
}

/**
 * Plan/apply a forward or rollback manifest.
 *  - apply !== true  => dry-run: reads only, port.exec is never called.
 *  - any preflight conflict aborts BEFORE the first write.
 *  - every write is "CAS UPDATE + audit INSERT (changes()>0)" for a single row, scoped by empresa_id.
 *  - the result is verified by re-reading; counts come from reads, not from the port.
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
    plan_sha256: planSha256, row_count: ops.length, ops_by_group: countByGroup(ops),
    pending: state.pending.length, pending_by_kind: countByKind(state.pending), pending_by_group: countByGroup(state.pending),
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
  const after = classify({ ops, snap: snapshot(port, ops), direction, planSha256, forwardPlanSha256 });
  const done = new Set(after.already.map((o) => `${o.kind}:${o.id}`));
  report.changed = state.pending.filter((o) => done.has(`${o.kind}:${o.id}`)).length;
  report.cas_conflicts = state.pending.filter((o) => !done.has(`${o.kind}:${o.id}`)).map((o) => ({ kind: o.kind, id: o.id }));
  report.already_applied = after.already.length;
  report.skipped_not_applied = after.skipped.length;
  report.pending = 0;
  report.pending_by_kind = countByKind([]);
  report.pending_by_group = countByGroup([]);
  report.conflicts = after.conflicts;
  report.postconditions_verified = report.cas_conflicts.length === 0 && after.conflicts.length === 0
    && after.already.length + after.skipped.length === ops.length;
  return report;
}

export { fail };
