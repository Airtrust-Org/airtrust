#!/usr/bin/env node
/**
 * Owner decision (follow-up of #2165 / issue #2158): CMA validity by age. Deterministic tenant-6 audit (read-only) of every live
 * qualificacoes_historico row of the CMA type, recomputing validade_meses / data_vencimento with the single rule of
 * src/shared/utils/cma-validity.ts (12 months; 6 months when the crew member has completed >= 60 years on the realization date;
 * no valid birth date => 12 months WITH a warning and the row is NEVER altered here).
 *
 * Only SELECTs. The age is computed inside SQL, so no birth date ever reaches this process or the output; only opaque ids,
 * counters and dates of the qualification row are handled. Classes (each row falls in exactly one):
 *   conforme                      stored validity and expiry already follow the rule
 *   validity_wrong_by_age         valid birth date, stored validity differs from the age rule, expiry is derived (no-dia or legacy
 *                                 end-of-month of the stored/expected validity) => CORRIGIBLE (validity + expiry recomputed no-dia)
 *   expiry_wrong_legacy_eom       validity already right, expiry is the legacy end-of-month value => CORRIGIBLE (expiry only)
 *   explicit_expiry_preserved     stored expiry matches no rule (explicit/documental date) => listed, PRESERVED
 *   no_stored_expiry              no stored expiry => listed, not altered
 *   birth_date_missing            no valid birth date (or employee outside tenant 6 / deleted) => listed, NOT altered
 *   status_not_realized / completion_date_missing_or_invalid  => excluded
 * Issued certificates are never touched. The plan hash covers ONLY the corrigible operations.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wranglerExecutor } from './lib/executors.mjs';
import {
  CMA_CODE, REALIZED_STATUSES, TENANT_ID, ageSql, buildExecutionManifest, classifyCmaRow, isValidDate,
} from './lib/qualification-cma-age-batch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const READONLY_CONFIRMATION = 'AIRTRUST_PRODUCTION_QUALIFICATION_CMA_AGE_READONLY';
const bump = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };
const dateOnly = (value) => {
  const text = typeof value === 'string' ? value.slice(0, 10) : '';
  return isValidDate(text) ? text : null;
};
const asInt = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
};

// ---------- inventory (SELECT only; the age is computed in SQL, birth dates never leave the database) ----------
export function readInventory(port) {
  const types = port.query(`SELECT id, empresa_id, UPPER(TRIM(codigo)) AS codigo, COALESCE(ativo, 1) AS ativo,
  CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END AS deleted
 FROM qualificacoes_tipos WHERE UPPER(TRIM(codigo)) = '${CMA_CODE}' ORDER BY id`);
  const typeIds = types.filter((t) => Number(t.empresa_id) === TENANT_ID && Number(t.deleted) === 0).map((t) => Number(t.id));
  if (typeIds.length === 0) return { types, histories: [] };
  const list = typeIds.join(',');
  const histories = port.query(`SELECT h.id, h.qualificacao_id, UPPER(TRIM(COALESCE(h.status, ''))) AS status,
  substr(h.data_conclusao, 1, 10) AS data_conclusao, h.data_vencimento, h.validade_meses,
  CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS employee_in_tenant,
  ${ageSql('h', 'f')} AS age_years
 FROM qualificacoes_historico h
 LEFT JOIN funcionarios f ON f.id = h.funcionario_id AND f.deleted_at IS NULL AND f.empresa_id = ${TENANT_ID}
 WHERE h.empresa_id = ${TENANT_ID} AND h.deleted_at IS NULL AND h.qualificacao_id IN (${list}) ORDER BY h.id`);
  return { types, histories };
}

// ---------- planning (pure) ----------
export function buildPlan(inventory) {
  const blocked = [];
  const eligible = new Set();
  for (const t of inventory.types) {
    let reason = null;
    if (t.empresa_id === null || t.empresa_id === undefined) reason = 'blocked_global_model';
    else if (Number(t.empresa_id) !== TENANT_ID) reason = 'blocked_other_tenant_model';
    else if (Number(t.deleted) === 1) reason = 'blocked_deleted_model';
    else if (Number(t.ativo) === 0) reason = 'blocked_inactive_model';
    if (reason) blocked.push({ tipo_id: Number(t.id), empresa_id: t.empresa_id ?? null, reason });
    else eligible.add(Number(t.id));
  }

  const classes = {};
  const idsByClass = {};
  const histories = [];
  const birthMissing = { total: 0, stored_validity_not_12: 0, stored_expiry_not_exact_12: 0, by_stored_validity: {} };
  const byStatus = {};
  const byAgeBand = { under_60: 0, age_60_plus: 0, age_unknown: 0 };
  const ids = (cls, id) => { (idsByClass[cls] ??= []).push(id); };
  for (const row of inventory.histories) {
    const tipoId = Number(row.qualificacao_id);
    if (!eligible.has(tipoId)) continue;
    const id = Number(row.id);
    const status = String(row.status ?? '').trim().toUpperCase();
    bump(byStatus, status === '' ? '(empty)' : status);
    const age = row.age_years === null || row.age_years === undefined ? null : asInt(row.age_years);
    if (age === null || age < 0) byAgeBand.age_unknown++;
    else if (age >= 60) byAgeBand.age_60_plus++;
    else byAgeBand.under_60++;
    const result = classifyCmaRow({
      id, qualificacao_id: tipoId, status, completion: dateOnly(row.data_conclusao), old_expiry: row.data_vencimento ?? null,
      old_validity: asInt(row.validade_meses), age_years: age, employee_in_tenant: Number(row.employee_in_tenant) === 1,
    });
    bump(classes, result.cls);
    ids(result.cls, id);
    if (result.cls === 'birth_date_missing') {
      birthMissing.total++;
      const v = asInt(row.validade_meses);
      bump(birthMissing.by_stored_validity, v === null ? 'null' : String(v));
      if (v !== 12) birthMissing.stored_validity_not_12++;
      if (result.exact_expiry_12 && row.data_vencimento !== result.exact_expiry_12) birthMissing.stored_expiry_not_exact_12++;
    }
    if (result.operation) histories.push(result.operation);
  }

  histories.sort((a, b) => a.id - b.id);
  const operationsEmitted = histories.length;
  const manifest = operationsEmitted > 0 ? buildExecutionManifest({ histories }) : null;
  const breakdown = { age_60_plus_validity_to_6: 0, under_60_validity_to_12: 0, expiry_only_legacy_eom: 0, validity_null_filled: 0 };
  for (const op of histories) {
    if (op.reason === 'expiry_wrong_legacy_eom') breakdown.expiry_only_legacy_eom++;
    else if (op.next_validity_months === 6) breakdown.age_60_plus_validity_to_6++;
    else breakdown.under_60_validity_to_12++;
    if (op.old_validity_months === null) breakdown.validity_null_filled++;
  }
  const summary = {
    inventory: 'QUALIFICATION_CMA_AGE_TENANT6',
    empresa_id: TENANT_ID,
    plan_sha256: manifest?.plan_sha256 ?? null,
    row_count: manifest?.row_count ?? 0,
    models: { cma_types_tenant6: [...eligible], blocked_detail: blocked },
    live_rows: Object.values(byStatus).reduce((a, b) => a + b, 0),
    by_status: byStatus,
    by_age_band_at_realization: byAgeBand,
    classes,
    ids_by_class: Object.fromEntries(Object.entries(idsByClass).filter(([cls]) => cls !== 'conforme')),
    corrigible_operations: operationsEmitted,
    corrigible_breakdown: breakdown,
    birth_date_missing: birthMissing,
    certificates_touched: 0,
    writes: 0, pii_emitted: false, production_apply_authorized: false,
  };
  return { manifest, summary };
}

function run() {
  const args = process.argv.slice(2);
  if (args.includes('--apply') || args.some((a) => /--write|--execute|--mutate/i.test(a))) throw new Error('PRODUCTION_WRITE_FORBIDDEN');
  if (process.env.AIRTRUST_CMA_AGE_READONLY_CONFIRMATION !== READONLY_CONFIRMATION) throw new Error('EXPLICIT_READONLY_CONFIRMATION_REQUIRED');
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
    console.error('QUALIFICATION_CMA_AGE_READONLY_PLAN_ERROR:' + (error instanceof Error ? error.message : 'UNKNOWN'));
    process.exitCode = 1;
  }
}
export { REALIZED_STATUSES };
