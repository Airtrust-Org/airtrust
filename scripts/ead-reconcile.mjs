#\!/usr/bin/env node
/**
 * EAD Category Reconciliation Executor
 *
 * source_reference: PR #548/#550/#551 — EAD category resolution incident.
 *   Canonical EAD category: id=13, nome='EAD', cor='#EABA0C', empresa=6.
 *   Rômulo Harfield Castanheira de Menezes historic IDs: 5305,5307,5308
 *   (wrong: Teórico id=3), 5321,5323,5373,5374,5375,5440 (EAD id=13 inactive).
 * operational_decision: this script generates allowlisted, tenant-scoped SQL
 *   with pre-condition WHERE clauses. Dry-run queries the DB for affected
 *   counts. Apply mode outputs SQL for remote execution via wrangler d1 execute.
 * dry_run_required: YES — always run with --dry-run first.
 * rollback_plan_required: YES — use --rollback-output to generate rollback SQL.
 *
 * Usage:
 *   node scripts/ead-reconcile.mjs --db-file <path> --dry-run --apply-sql-output <file> --manifest <file> --rollback-output <file>
 *   node scripts/ead-reconcile.mjs --db-file <path> --apply --apply-sql-output <file> ...
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const COSTA_DO_SOL_ID = 6;
const CANONICAL_EAD_CATEGORY_ID = 13;
const CANONICAL_EAD_NAME = 'EAD';
const CANONICAL_EAD_COLOR = '#EABA0C';

const ROMULO_HISTORICOS_TEORICO = [5305, 5307, 5308];
const ROMULO_HISTORICOS_EAD_INACTIVE = [5321, 5323, 5373, 5374, 5375, 5440];

function sqlite(dbFile, sql) {
  try {
    return execSync(`sqlite3 -json "${dbFile}" "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024
    }).trim();
  } catch (e) {
    return '';
  }
}

function query(dbFile, sql) {
  const raw = sqlite(dbFile, sql);
  if (\!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function queryOne(dbFile, sql) {
  const rows = query(dbFile, sql);
  return rows.length > 0 ? rows[0] : null;
}

function main() {
  const args = process.argv.slice(2);
  const dbFile = args[args.indexOf('--db-file') + 1];
  const manifestFile = args.includes('--manifest') ? args[args.indexOf('--manifest') + 1] : null;
  const applySqlFile = args.includes('--apply-sql-output') ? args[args.indexOf('--apply-sql-output') + 1] : null;
  const rollbackFile = args.includes('--rollback-output') ? args[args.indexOf('--rollback-output') + 1] : null;
  const dryRun = \!args.includes('--apply');

  if (\!dbFile) {
    console.error('Usage: --db-file <path> [--dry-run|--apply] --apply-sql-output <file> [--manifest <file>] [--rollback-output <file>]');
    process.exit(1);
  }

  console.log(`EAD Reconciliation — Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`DB: ${dbFile}`);

  // ── Phase 1: Validate ────────────────────────────────────────────────
  console.log('\n=== Phase 1: Validate ===');
  const empresa = queryOne(dbFile, `SELECT id, nome FROM empresas WHERE id = ${COSTA_DO_SOL_ID}`);
  if (\!empresa) { console.error('✗ Empresa 6 not found'); process.exit(1); }
  console.log(`✓ Empresa: ${empresa.nome} (id=${empresa.id})`);

  const cat = queryOne(dbFile,
    `SELECT id, nome, cor, ativo, deleted_at FROM qualificacoes_categorias WHERE id = ${CANONICAL_EAD_CATEGORY_ID} AND empresa_id = ${COSTA_DO_SOL_ID}`);
  if (\!cat) { console.error('✗ Category 13 not found'); process.exit(1); }
  console.log(`✓ Category: nome="${cat.nome}" cor="${cat.cor}" ativo=${cat.ativo}`);

  // ── Phase 2: Count affected ──────────────────────────────────────────
  console.log('\n=== Phase 2: Count ===');
  const counts = {};

  counts.tipos_ead_null = Number(queryOne(dbFile,
    `SELECT COUNT(*) as c FROM qualificacoes_tipos WHERE empresa_id=${COSTA_DO_SOL_ID} AND deleted_at IS NULL AND UPPER(TRIM(categoria))='EAD' AND categoria_id IS NULL`)?.c || 0);
  counts.tipos_ead_wrong = Number(queryOne(dbFile,
    `SELECT COUNT(*) as c FROM qualificacoes_tipos WHERE empresa_id=${COSTA_DO_SOL_ID} AND deleted_at IS NULL AND UPPER(TRIM(categoria))='EAD' AND categoria_id IS NOT NULL AND categoria_id \!= ${CANONICAL_EAD_CATEGORY_ID}`)?.c || 0);
  counts.categoria_inactive = Number(queryOne(dbFile,
    `SELECT COUNT(*) as c FROM qualificacoes_categorias WHERE id=${CANONICAL_EAD_CATEGORY_ID} AND empresa_id=${COSTA_DO_SOL_ID} AND ativo=0 AND deleted_at IS NULL`)?.c || 0);

  console.log(`  Tipos EAD with NULL categoria_id: ${counts.tipos_ead_null}`);
  console.log(`  Tipos EAD with wrong categoria_id: ${counts.tipos_ead_wrong}`);
  console.log(`  Category 13 inactive: ${counts.categoria_inactive}`);

  // Count Romulo historicos
  for (const id of ROMULO_HISTORICOS_TEORICO) {
    const h = queryOne(dbFile, `SELECT id, categoria_id FROM qualificacoes_historico WHERE id=${id} AND empresa_id=${COSTA_DO_SOL_ID} AND deleted_at IS NULL`);
    if (h) console.log(`  Romulo ${id}: categoria_id=${h.categoria_id} (should be 13, is ${h.categoria_id === 3 ? 'TEORICO' : 'other'})`);
    else console.log(`  Romulo ${id}: NOT FOUND`);
  }
  for (const id of ROMULO_HISTORICOS_EAD_INACTIVE) {
    const h = queryOne(dbFile, `SELECT id, categoria_id FROM qualificacoes_historico WHERE id=${id} AND empresa_id=${COSTA_DO_SOL_ID} AND deleted_at IS NULL`);
    if (h) console.log(`  Romulo ${id}: categoria_id=${h.categoria_id}`);
    else console.log(`  Romulo ${id}: NOT FOUND`);
  }

  // ── Phase 3: Generate SQL ────────────────────────────────────────────
  console.log('\n=== Phase 3: Generate SQL ===');
  const applyLines = ['-- EAD Category Reconciliation — Apply SQL', `-- Generated: ${new Date().toISOString()}`, `-- Environment: ${process.env.ENVIRONMENT || 'local'}`, ''];
  const rollbackLines = ['-- EAD Category Reconciliation — Rollback SQL', `-- Generated: ${new Date().toISOString()}`, ''];

  // 1. Reactivate category 13
  if (counts.categoria_inactive > 0) {
    applyLines.push('-- 1. Reactivate canonical EAD category');
    applyLines.push(`UPDATE qualificacoes_categorias SET ativo = 1, updated_at = datetime('now') WHERE id = 13 AND empresa_id = 6 AND ativo = 0 AND deleted_at IS NULL;`);
    applyLines.push('');
    rollbackLines.push('-- Rollback: deactivate category 13');
    rollbackLines.push(`UPDATE qualificacoes_categorias SET ativo = 0, updated_at = datetime('now') WHERE id = 13 AND empresa_id = 6;`);
    rollbackLines.push('');
  }

  // 2. Ensure canonical color
  applyLines.push('-- 2. Ensure canonical EAD color');
  applyLines.push(`UPDATE qualificacoes_categorias SET cor = '#EABA0C', updated_at = datetime('now') WHERE id = 13 AND empresa_id = 6 AND cor \!= '#EABA0C' AND deleted_at IS NULL;`);
  applyLines.push('');
  rollbackLines.push('-- Rollback: color was auto-managed, restore manually if needed');
  rollbackLines.push('');

  // 3. Fix tipos with NULL categoria_id
  const tiposNull = query(dbFile,
    `SELECT id, codigo, nome FROM qualificacoes_tipos WHERE empresa_id=${COSTA_DO_SOL_ID} AND deleted_at IS NULL AND UPPER(TRIM(categoria))='EAD' AND categoria_id IS NULL`);
  if (tiposNull.length > 0) {
    applyLines.push('-- 3. Fix tipos EAD with NULL categoria_id');
    for (const t of tiposNull) {
      applyLines.push(`UPDATE qualificacoes_tipos SET categoria_id = 13, updated_at = datetime('now') WHERE id = ${t.id} AND empresa_id = 6 AND categoria_id IS NULL AND deleted_at IS NULL; -- ${t.codigo}: ${t.nome}`);
      rollbackLines.push(`UPDATE qualificacoes_tipos SET categoria_id = NULL, updated_at = datetime('now') WHERE id = ${t.id} AND empresa_id = 6;`);
    }
    applyLines.push('');
    rollbackLines.push('');
  }

  // 4. Fix tipos with wrong categoria_id
  const tiposWrong = query(dbFile,
    `SELECT id, codigo, nome, categoria_id FROM qualificacoes_tipos WHERE empresa_id=${COSTA_DO_SOL_ID} AND deleted_at IS NULL AND UPPER(TRIM(categoria))='EAD' AND categoria_id IS NOT NULL AND categoria_id \!= ${CANONICAL_EAD_CATEGORY_ID}`);
  if (tiposWrong.length > 0) {
    applyLines.push('-- 4. Fix tipos EAD with wrong categoria_id');
    for (const t of tiposWrong) {
      applyLines.push(`UPDATE qualificacoes_tipos SET categoria_id = 13, updated_at = datetime('now') WHERE id = ${t.id} AND empresa_id = 6 AND categoria_id = ${t.categoria_id} AND deleted_at IS NULL; -- ${t.codigo}: ${t.nome}`);
      rollbackLines.push(`UPDATE qualificacoes_tipos SET categoria_id = ${t.categoria_id}, updated_at = datetime('now') WHERE id = ${t.id} AND empresa_id = 6;`);
    }
    applyLines.push('');
    rollbackLines.push('');
  }

  // 5. Fix Romulo Teorico → EAD
  const romuloTeorico = query(dbFile,
    `SELECT id, categoria_id FROM qualificacoes_historico WHERE id IN (${ROMULO_HISTORICOS_TEORICO.join(',')}) AND empresa_id=${COSTA_DO_SOL_ID} AND categoria_id = ${3} AND deleted_at IS NULL`);
  if (romuloTeorico.length > 0) {
    applyLines.push('-- 5. Fix Romulo historicos: Teorico → EAD');
    for (const h of romuloTeorico) {
      applyLines.push(`UPDATE qualificacoes_historico SET categoria_id = 13, updated_at = datetime('now') WHERE id = ${h.id} AND empresa_id = 6 AND categoria_id = 3 AND deleted_at IS NULL;`);
      rollbackLines.push(`UPDATE qualificacoes_historico SET categoria_id = 3, updated_at = datetime('now') WHERE id = ${h.id} AND empresa_id = 6;`);
    }
    applyLines.push('');
    rollbackLines.push('');
  }

  // 6. Fix Romulo EAD inactive
  const romuloEad = query(dbFile,
    `SELECT id, categoria_id FROM qualificacoes_historico WHERE id IN (${ROMULO_HISTORICOS_EAD_INACTIVE.join(',')}) AND empresa_id=${COSTA_DO_SOL_ID} AND deleted_at IS NULL AND (categoria_id IS NULL OR categoria_id = ${CANONICAL_EAD_CATEGORY_ID})`);
  if (romuloEad.length > 0) {
    applyLines.push('-- 6. Fix Romulo historicos: EAD inactive');
    for (const h of romuloEad) {
      applyLines.push(`UPDATE qualificacoes_historico SET categoria_id = 13, updated_at = datetime('now') WHERE id = ${h.id} AND empresa_id = 6 AND deleted_at IS NULL;`);
      rollbackLines.push(`UPDATE qualificacoes_historico SET categoria_id = ${h.categoria_id ?? 'NULL'}, updated_at = datetime('now') WHERE id = ${h.id} AND empresa_id = 6;`);
    }
    applyLines.push('');
    rollbackLines.push('');
  }

  // 7. Fill NULL categoria_id for other EAD historicos
  const otherNull = query(dbFile,
    `SELECT qh.id FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id WHERE qh.empresa_id=${COSTA_DO_SOL_ID} AND qh.deleted_at IS NULL AND UPPER(TRIM(qt.categoria))='EAD' AND qh.categoria_id IS NULL AND qh.id NOT IN (${[...ROMULO_HISTORICOS_TEORICO, ...ROMULO_HISTORICOS_EAD_INACTIVE].join(',')})`);
  if (otherNull.length > 0) {
    applyLines.push('-- 7. Fill NULL categoria_id for other EAD historicos');
    for (const h of otherNull) {
      applyLines.push(`UPDATE qualificacoes_historico SET categoria_id = 13, updated_at = datetime('now') WHERE id = ${h.id} AND empresa_id = 6 AND categoria_id IS NULL AND deleted_at IS NULL;`);
      rollbackLines.push(`UPDATE qualificacoes_historico SET categoria_id = NULL, updated_at = datetime('now') WHERE id = ${h.id} AND empresa_id = 6;`);
    }
    applyLines.push('');
    rollbackLines.push('');
  }

  const applySql = applyLines.join('\n') + '\n';
  const rollbackSql = rollbackLines.join('\n') + '\n';

  // ── Phase 4: Output ──────────────────────────────────────────────────
  const totalOps = applyLines.filter(l => l.trim().toUpperCase().startsWith('UPDATE')).length;

  if (applySqlFile) {
    writeFileSync(applySqlFile, applySql);
    console.log(`✓ Apply SQL written to ${applySqlFile} (${totalOps} operations)`);
  }
  if (rollbackFile) {
    writeFileSync(rollbackFile, rollbackSql);
    console.log(`✓ Rollback SQL written to ${rollbackFile}`);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'apply',
    empresa_id: COSTA_DO_SOL_ID,
    canonical_category: { id: CANONICAL_EAD_CATEGORY_ID, nome: CANONICAL_EAD_NAME, cor: CANONICAL_EAD_COLOR },
    counts,
    total_operations: totalOps,
    romulo_teorico_ids: romuloTeorico.map(h => h.id),
    romulo_ead_ids: romuloEad.map(h => h.id),
  };

  if (manifestFile) {
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest written to ${manifestFile}`);
  }

  console.log(`\n✓ Done — ${totalOps} operations generated (${dryRun ? 'DRY-RUN' : 'APPLY'})`);
  if (totalOps === 0) console.log('Database is already reconciled.');
}

main().catch(err => { console.error(err); process.exit(1); });
