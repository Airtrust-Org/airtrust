#!/usr/bin/env node
/**
 * Finding F1 (tracking issue #776): deterministic tenant-6 audit (read-only) of lms_matricula_ciclos rows whose
 * qualificacao_historico_id points to a qualificacoes_historico row that is soft-deleted.
 *
 * Only SELECTs. Handles opaque ids only (cycle id, enrollment id, history id); no names, CPF, scores or dates are read.
 * Classes (each active cycle with a non-NULL pointer falls in exactly one):
 *   dangling_soft_deleted_history   pointer targets a soft-deleted history of tenant 6 => CORRIGIBLE (pointer -> NULL)
 *   pointer_to_live_history         pointer targets a live history of tenant 6 => healthy, not listed as an operation
 *   pointer_to_other_tenant_history pointer targets a history of another tenant => listed (count), NOT altered
 *   pointer_to_missing_history      pointer targets no history row at all => listed (count), NOT altered
 * Histories are never restored. The plan hash covers ONLY the corrigible operations.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wranglerExecutor } from './lib/executors.mjs';
import { MAX_OPS, TENANT_ID, buildExecutionManifest } from './lib/lms-cycle-dangling-pointer-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const READONLY_CONFIRMATION = 'AIRTRUST_PRODUCTION_LMS_CYCLE_DANGLING_POINTER_READONLY';
export const READONLY_CONFIRMATION_ENV = 'AIRTRUST_LMS_CYCLE_DANGLING_POINTER_READONLY_CONFIRMATION';
const bump = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };
const asInt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

// ---------- inventory (SELECT only) ----------
export function readInventory(port) {
  const cycles = port.query(`SELECT c.id, c.matricula_id, c.qualificacao_historico_id,
  h.id AS historico_found, h.empresa_id AS historico_empresa_id,
  CASE WHEN h.deleted_at IS NULL THEN 0 ELSE 1 END AS historico_deleted
 FROM lms_matricula_ciclos c
 LEFT JOIN qualificacoes_historico h ON h.id = c.qualificacao_historico_id
 WHERE c.empresa_id = ${TENANT_ID} AND c.deleted_at IS NULL AND c.qualificacao_historico_id IS NOT NULL
 ORDER BY c.id`);
  return { cycles };
}

// ---------- planning (pure) ----------
export function buildPlan(inventory) {
  const classes = {};
  const idsByClass = {};
  const cyclePointers = [];
  const ids = (cls, id) => { (idsByClass[cls] ??= []).push(id); };
  for (const row of inventory.cycles) {
    const id = Number(row.id);
    let cls;
    if (row.historico_found === null || row.historico_found === undefined) cls = 'pointer_to_missing_history';
    else if (Number(row.historico_empresa_id) !== TENANT_ID) cls = 'pointer_to_other_tenant_history';
    else if (Number(row.historico_deleted) === 1) cls = 'dangling_soft_deleted_history';
    else cls = 'pointer_to_live_history';
    bump(classes, cls);
    if (cls !== 'pointer_to_live_history') ids(cls, id);
    if (cls === 'dangling_soft_deleted_history') {
      cyclePointers.push({ cycle_id: id, matricula_id: asInt(row.matricula_id), historico_id: Number(row.qualificacao_historico_id) });
    }
  }
  cyclePointers.sort((a, b) => a.cycle_id - b.cycle_id);
  if (cyclePointers.length > MAX_OPS) throw new Error('PLAN_EXCEEDS_COUNT_CAP');
  const manifest = cyclePointers.length > 0 ? buildExecutionManifest({ cycle_pointers: cyclePointers }) : null;
  const summary = {
    inventory: 'LMS_CYCLE_DANGLING_POINTER_TENANT6',
    empresa_id: TENANT_ID,
    plan_sha256: manifest?.plan_sha256 ?? null,
    row_count: manifest?.row_count ?? 0,
    count_cap: MAX_OPS,
    active_cycles_with_pointer: inventory.cycles.length,
    classes,
    ids_by_class: idsByClass,
    corrigible_cycle_ids: cyclePointers.map((c) => c.cycle_id),
    corrigible_without_matricula: cyclePointers.filter((c) => c.matricula_id === null).length,
    histories_restored: 0,
    writes: 0, pii_emitted: false, production_apply_authorized: false,
  };
  return { manifest, summary };
}

function run() {
  const args = process.argv.slice(2);
  if (args.includes('--apply') || args.some((a) => /--write|--execute|--mutate/i.test(a))) throw new Error('PRODUCTION_WRITE_FORBIDDEN');
  if (process.env[READONLY_CONFIRMATION_ENV] !== READONLY_CONFIRMATION) throw new Error('EXPLICIT_READONLY_CONFIRMATION_REQUIRED');
  const manifestFlag = args.find((a) => a.startsWith('--manifest='));
  if (args.some((a) => !a.startsWith('--manifest='))) throw new Error('UNRECOGNIZED_ARGUMENT');
  const port = wranglerExecutor({ database: 'airtrust-db', env: 'production', remote: true, allowWrites: false, cwd: path.join(ROOT, 'worker-airtrust') });
  const plan = buildPlan(readInventory(port));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (manifestFlag) {
    const destination = manifestFlag.slice('--manifest='.length);
    if (!path.isAbsolute(destination) || destination.startsWith(ROOT + path.sep)) throw new Error('MANIFEST_MUST_BE_ABSOLUTE_OUTSIDE_REPO');
    if (!plan.manifest) throw new Error('NO_CORRIGIBLE_OPERATIONS_NO_MANIFEST');
    writeFileSync(destination, JSON.stringify({ ...plan.manifest, source_sha: sha }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }
  process.stdout.write(JSON.stringify({ ...plan.summary, source_sha: sha }, null, 2) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) {
    console.error('LMS_CYCLE_DANGLING_POINTER_READONLY_PLAN_ERROR:' + (error instanceof Error ? error.message : 'UNKNOWN'));
    process.exitCode = 1;
  }
}
