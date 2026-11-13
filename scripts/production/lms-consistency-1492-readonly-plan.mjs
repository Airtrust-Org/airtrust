#!/usr/bin/env node
/**
 * Issue #1492, owner decisions (groups 1 and 2) - deterministic tenant-6 plan (read-only, SELECT only).
 *  Group 1 (ratify): lms_matriculas 323, 328, 331, 344, 394, 396, 398 (CONCLUIDO, SCORM passed, history created without audit):
 *    current cycle EM_ANDAMENTO -> CONCLUIDO (date/progress copied from the enrollment; no score/lesson_status/suspend_data is written)
 *    and qualificacoes_historico.lms_matricula_ciclo_id filled with that cycle.
 *  Group 2 (clear pointer): lms_matriculas 699, 867, 947, 1135, 1333, 2061 (employee 41, owner test registration) point to soft-deleted
 *    histories 7160, 7154, 7153, 7155, 7152, 7157: the pointer is cleared (and the current cycle's pointer to the same history, #1920 pattern).
 *    The deleted histories are never restored or recreated; the enrollments stay CONCLUIDO.
 *  Groups 3 and 4 of #2161 are NOT part of the plan.
 * FAIL-CLOSED: any listed row whose live state diverges from the expectation (tenant, ids, status, pointers, ownership, dates) blocks the
 * whole plan: no manifest is produced and the process exits non-zero. Reuses the group queries of lms-qualification-consistency-plan-readonly.mjs (#2161)
 * as a cross-check. Only opaque ids, dates and counts are emitted; no names, CPF, e-mail, CMI or suspend_data.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wranglerExecutor } from './lib/executors.mjs';
import { GROUP_QUERIES } from './lms-qualification-consistency-plan-readonly.mjs';
import {
  GROUP1_HISTORY_WINDOW, GROUP1_MATRICULAS, GROUP2_FUNCIONARIO_ID, GROUP2_POINTERS, REALIZED, TENANT_ID,
  buildExecutionManifest, countsByGroup,
} from './lib/lms-consistency-1492-batch.mjs';
import { RAW_TEXT_RE } from './lib/qualification-model-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const READONLY_CONFIRMATION = 'AIRTRUST_PRODUCTION_LMS_CONSISTENCY_1492_READONLY';

const ALL_MATRICULAS = [...GROUP1_MATRICULAS, ...GROUP2_POINTERS.map((p) => p.matricula_id)];
const list = (ids) => ids.join(',');
const asInt = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};
const text = (v) => (v === null || v === undefined ? null : String(v));

// ---------- inventory (SELECT only, opaque ids/dates/counts) ----------
export function readInventory(port) {
  const matriculas = port.query(`SELECT m.id, m.empresa_id, m.funcionario_id, m.curso_id, UPPER(TRIM(COALESCE(m.status, ''))) AS status,
  CASE WHEN m.deleted_at IS NULL THEN 0 ELSE 1 END AS deleted, m.qualificacao_historico_id, m.data_conclusao, m.progresso_pct,
  (SELECT f.empresa_id FROM funcionarios f WHERE f.id = m.funcionario_id) AS funcionario_empresa_id,
  (SELECT COUNT(*) FROM lms_progresso_scorm s WHERE s.empresa_id = m.empresa_id AND s.matricula_id = m.id
     AND LOWER(COALESCE(s.lesson_status, '')) IN ('passed', 'completed')) AS scorm_passed
 FROM lms_matriculas m WHERE m.id IN (${list(ALL_MATRICULAS)}) ORDER BY m.id`);
  const cycles = port.query(`SELECT id, empresa_id, matricula_id, curso_id, funcionario_id, ciclo_atual, status, data_conclusao, progresso_pct,
  qualificacao_historico_id, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM lms_matricula_ciclos WHERE matricula_id IN (${list(ALL_MATRICULAS)}) ORDER BY id`);
  const expectedG2 = GROUP2_POINTERS.map((p) => p.historico_id);
  const historicos = port.query(`SELECT id, empresa_id, funcionario_id, lms_matricula_id, lms_matricula_ciclo_id, UPPER(TRIM(COALESCE(status, ''))) AS status,
  substr(created_at, 1, 10) AS created_day, CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM qualificacoes_historico
 WHERE id IN (SELECT qualificacao_historico_id FROM lms_matriculas WHERE id IN (${list(ALL_MATRICULAS)}))
    OR id IN (${list(expectedG2)}) ORDER BY id`);
  // cross-check with the #2161 read-only classifier queries (groups 1 and 2 only)
  const group1Listed = port.query(GROUP_QUERIES.completed_cycle_open).map((r) => Number(r.id));
  const group2Listed = port.query(GROUP_QUERIES.pointer_to_deleted_history).map((r) => Number(r.id));
  return { matriculas, cycles, historicos, group1Listed, group2Listed };
}

// ---------- planning (pure) ----------
const dateOnly = (v) => (typeof v === 'string' ? v.slice(0, 10) : '');

export function buildPlan(inventory) {
  const mById = new Map(inventory.matriculas.map((m) => [Number(m.id), m]));
  const hById = new Map(inventory.historicos.map((h) => [Number(h.id), h]));
  const cyclesOf = new Map();
  for (const c of inventory.cycles) {
    const k = Number(c.matricula_id);
    if (!cyclesOf.has(k)) cyclesOf.set(k, []);
    cyclesOf.get(k).push(c);
  }
  const blocked = [];
  const block = (group, matriculaId, reason) => blocked.push({ group, matricula_id: matriculaId, reason });
  const cycles = [];
  const links = [];
  const pointers = [];
  const cyclePointers = [];

  // ----- group 1
  for (const id of GROUP1_MATRICULAS) {
    const before = blocked.length;
    const m = mById.get(id);
    if (!m) { block(1, id, 'matricula_missing'); continue; }
    if (Number(m.empresa_id) !== TENANT_ID) block(1, id, 'matricula_wrong_tenant');
    if (asInt(m.funcionario_empresa_id) !== Number(m.empresa_id)) block(1, id, 'funcionario_tenant_mismatch');
    if (Number(m.deleted) !== 0) block(1, id, 'matricula_deleted');
    if (m.status !== 'CONCLUIDO') block(1, id, 'matricula_status_not_concluido');
    if (!(Number(m.scorm_passed) > 0)) block(1, id, 'scorm_not_passed');
    const dc = text(m.data_conclusao);
    if (dc === null || !RAW_TEXT_RE.test(dc)) block(1, id, 'matricula_data_conclusao_invalid');
    const pp = asInt(m.progresso_pct);
    if (pp === null || pp < 0 || pp > 100) block(1, id, 'matricula_progress_invalid');
    const hid = asInt(m.qualificacao_historico_id);
    const h = hid === null ? undefined : hById.get(hid);
    if (hid === null) block(1, id, 'matricula_without_historico_pointer');
    else if (!h) block(1, id, 'historico_missing');
    else {
      if (Number(h.empresa_id) !== TENANT_ID) block(1, id, 'historico_wrong_tenant');
      if (Number(h.deleted) !== 0) block(1, id, 'historico_deleted');
      if (Number(h.funcionario_id) !== Number(m.funcionario_id)) block(1, id, 'historico_owner_mismatch');
      if (asInt(h.lms_matricula_id) !== id) block(1, id, 'historico_not_linked_to_matricula');
      if (!REALIZED.has(String(h.status))) block(1, id, 'historico_status_not_realized');
      if (h.created_day < GROUP1_HISTORY_WINDOW.from || h.created_day > GROUP1_HISTORY_WINDOW.to) block(1, id, 'historico_created_outside_expected_window');
      if (asInt(h.lms_matricula_ciclo_id) !== null) block(1, id, 'historico_cycle_already_set');
    }
    const current = (cyclesOf.get(id) ?? []).filter((c) => Number(c.ciclo_atual) === 1 && Number(c.deleted) === 0);
    if (current.length !== 1) { block(1, id, 'current_cycle_not_unique'); continue; }
    const c = current[0];
    if (Number(c.empresa_id) !== TENANT_ID) block(1, id, 'cycle_wrong_tenant');
    if (Number(c.curso_id) !== Number(m.curso_id) || Number(c.funcionario_id) !== Number(m.funcionario_id)) block(1, id, 'cycle_owner_mismatch');
    if (c.status !== 'EM_ANDAMENTO') block(1, id, 'cycle_status_not_em_andamento');
    const cdc = text(c.data_conclusao);
    if (cdc !== null && !RAW_TEXT_RE.test(cdc)) block(1, id, 'cycle_data_conclusao_not_representable');
    const cpp = asInt(c.progresso_pct);
    if (cpp === null || cpp < 0 || cpp > 100) block(1, id, 'cycle_progress_invalid');
    const cqh = asInt(c.qualificacao_historico_id);
    if (cqh !== null && cqh !== hid) block(1, id, 'cycle_historico_pointer_diverges');
    if (blocked.length !== before) continue;
    cycles.push({
      cycle_id: Number(c.id), matricula_id: id, historico_id: hid, funcionario_id: Number(m.funcionario_id),
      old_status: 'EM_ANDAMENTO', next_status: 'CONCLUIDO', old_data_conclusao: cdc, next_data_conclusao: dc,
      old_progresso_pct: cpp, next_progresso_pct: pp, old_historico_id: cqh,
    });
    links.push({ historico_id: hid, matricula_id: id, cycle_id: Number(c.id) });
  }

  // ----- group 2
  for (const { matricula_id: id, historico_id: expectedH } of GROUP2_POINTERS) {
    const before = blocked.length;
    const m = mById.get(id);
    if (!m) { block(2, id, 'matricula_missing'); continue; }
    if (Number(m.empresa_id) !== TENANT_ID) block(2, id, 'matricula_wrong_tenant');
    if (Number(m.funcionario_id) !== GROUP2_FUNCIONARIO_ID) block(2, id, 'matricula_not_owner_test_employee');
    if (asInt(m.funcionario_empresa_id) !== Number(m.empresa_id)) block(2, id, 'funcionario_tenant_mismatch');
    if (Number(m.deleted) !== 0) block(2, id, 'matricula_deleted');
    if (m.status !== 'CONCLUIDO') block(2, id, 'matricula_status_not_concluido');
    const hid = asInt(m.qualificacao_historico_id);
    if (hid === null) block(2, id, 'pointer_already_cleared');
    else if (hid !== expectedH) block(2, id, 'pointer_diverges_from_expected');
    const h = hById.get(expectedH);
    if (!h) block(2, id, 'historico_missing');
    else {
      if (Number(h.empresa_id) !== TENANT_ID) block(2, id, 'historico_wrong_tenant');
      if (Number(h.funcionario_id) !== GROUP2_FUNCIONARIO_ID) block(2, id, 'historico_owner_mismatch');
      if (Number(h.deleted) !== 1) block(2, id, 'historico_not_soft_deleted');
    }
    const all = cyclesOf.get(id) ?? [];
    const holding = all.filter((c) => asInt(c.qualificacao_historico_id) === expectedH);
    const current = all.filter((c) => Number(c.ciclo_atual) === 1 && Number(c.deleted) === 0);
    let cptr = null;
    for (const c of holding) {
      if (Number(c.empresa_id) !== TENANT_ID) block(2, id, 'cycle_wrong_tenant');
      else if (!current.includes(c)) block(2, id, 'non_current_cycle_points_to_deleted_historico');
      else cptr = c;
    }
    for (const c of current) {
      const cq = asInt(c.qualificacao_historico_id);
      if (cq !== null && cq !== expectedH) block(2, id, 'cycle_pointer_diverges');
    }
    if (blocked.length !== before) continue;
    pointers.push({ matricula_id: id, historico_id: expectedH, funcionario_id: GROUP2_FUNCIONARIO_ID });
    if (cptr) cyclePointers.push({ cycle_id: Number(cptr.id), matricula_id: id, historico_id: expectedH });
  }

  const g1Set = new Set(GROUP1_MATRICULAS);
  const g2Set = new Set(GROUP2_POINTERS.map((p) => p.matricula_id));
  const crossCheck = {
    group1_query_rows: inventory.group1Listed.length,
    group2_query_rows: inventory.group2Listed.length,
    group1_owner_ids_not_listed: GROUP1_MATRICULAS.filter((id) => !inventory.group1Listed.includes(id)),
    group2_owner_ids_not_listed: [...g2Set].filter((id) => !inventory.group2Listed.includes(id)),
    outside_owner_scope_untouched: {
      group1: inventory.group1Listed.filter((id) => !g1Set.has(id)).length,
      group2: inventory.group2Listed.filter((id) => !g2Set.has(id)).length,
    },
  };
  for (const id of crossCheck.group1_owner_ids_not_listed) block(1, id, 'not_listed_by_consistency_query');
  for (const id of crossCheck.group2_owner_ids_not_listed) block(2, id, 'not_listed_by_consistency_query');

  const summary = {
    inventory: 'LMS_CONSISTENCY_1492_TENANT6', empresa_id: TENANT_ID,
    excluded_groups: { group3: 'no action (owner decision)', group4: 'no action (owner decision)' },
    cross_check_2161: crossCheck,
    blocked: blocked.length, blocked_detail: blocked,
    fail_closed: blocked.length > 0,
    writes: 0, pii_emitted: false, production_apply_authorized: false,
  };
  if (blocked.length > 0) return { manifest: null, summary: { ...summary, plan_sha256: null, row_count: 0, groups: null } };
  const byId = (key) => (a, b) => a[key] - b[key];
  const manifest = buildExecutionManifest({
    cycles: cycles.sort(byId('cycle_id')), links: links.sort(byId('historico_id')),
    pointers: pointers.sort(byId('matricula_id')), cycle_pointers: cyclePointers.sort(byId('cycle_id')),
  });
  return {
    manifest,
    summary: { ...summary, plan_sha256: manifest.plan_sha256, row_count: manifest.row_count, groups: countsByGroup(manifest) },
  };
}

function run() {
  const args = process.argv.slice(2);
  if (args.includes('--apply') || args.some((a) => /--write|--execute|--mutate/i.test(a))) throw new Error('PRODUCTION_WRITE_FORBIDDEN');
  if (process.env.AIRTRUST_LMS_CONSISTENCY_1492_READONLY_CONFIRMATION !== READONLY_CONFIRMATION) throw new Error('EXPLICIT_READONLY_CONFIRMATION_REQUIRED');
  const manifestFlag = args.find((a) => a.startsWith('--manifest='));
  if (args.some((a) => !a.startsWith('--manifest='))) throw new Error('UNRECOGNIZED_ARGUMENT');
  const port = wranglerExecutor({ database: 'airtrust-db', env: 'production', remote: true, allowWrites: false, cwd: path.join(ROOT, 'worker-airtrust') });
  const plan = buildPlan(readInventory(port));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  process.stdout.write(JSON.stringify({ ...plan.summary, source_sha: sha }, null, 2) + '\n');
  if (!plan.manifest) { process.exitCode = 2; return; }
  if (manifestFlag) {
    const destination = manifestFlag.slice('--manifest='.length);
    if (!path.isAbsolute(destination) || destination.startsWith(ROOT + path.sep)) throw new Error('MANIFEST_MUST_BE_ABSOLUTE_OUTSIDE_REPO');
    writeFileSync(destination, JSON.stringify({ ...plan.manifest, source_sha: sha }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) {
    console.error('LMS_CONSISTENCY_1492_READONLY_PLAN_ERROR:' + (error instanceof Error ? error.message : 'UNKNOWN'));
    process.exitCode = 1;
  }
}
