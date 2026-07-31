#!/usr/bin/env node
/**
 * EAD Category Reconciliation Executor
 *
 * source_reference: PR #548/#550/#551 — EAD category resolution incident.
 *   Canonical EAD category: id=13, nome='EAD', cor='#EABA0C', empresa=6.
 *   Rômulo Harfield Castanheira de Menezes historic IDs: 5305,5307,5308
 *   (wrong: Teórico id=3), 5321,5323,5373,5374,5375,5440 (EAD id=13 inactive).
 * operational_decision: this script reactivates the canonical EAD category,
 *   fixes tipos/historicos pointing to wrong categories, and reconciles
 *   Rômulo's 9 records. All operations are tenant-scoped (empresa_id=6),
 *   idempotent, and use allowlisted SQL with pre-condition validation.
 * dry_run_required: YES — always run with --dry-run first. Only use --apply
 *   after reviewing the manifest and confirming no unexpected changes.
 * rollback_plan_required: YES — use --rollback-output to generate rollback
 *   SQL before applying. Rollback restores previous categoria_id values.
 *
 * Fixes EAD category data for Costa do Sol (empresa 6):
 * 1. Reativates canonical EAD category (id=13, nome='EAD', cor='#EABA0C')
 * 2. Updates tipos pointing to wrong category
 * 3. Updates historicos pointing to wrong category
 * 4. Handles Rômulo's 9 records specifically
 *
 * Modes: --dry-run (default), --apply
 *
 * Usage:
 *   node scripts/ead-reconcile.mjs --db-file <path> --dry-run
 *   node scripts/ead-reconcile.mjs --db-file <path> --apply --manifest <path> --rollback-output <path>
 */

import { readFileSync, writeFileSync } from 'node:fs';
import Database from 'better-sqlite3';

// ── Constants ────────────────────────────────────────────────────────────────
const COSTA_DO_SOL_ID = 6;
const CANONICAL_EAD_CATEGORY_ID = 13;
const CANONICAL_EAD_NAME = 'EAD';
const CANONICAL_EAD_COLOR = '#EABA0C';
const THEORICO_CATEGORY_ID = 3;

// ── Rômulo's known historico IDs ─────────────────────────────────────────────
const ROMULO_HISTORICOS_TEORICO = [5305, 5307, 5308]; // wrong: Teórico id=3
const ROMULO_HISTORICOS_EAD_INACTIVE = [5321, 5323, 5373, 5374, 5375, 5440]; // EAD id=13 inactive

// ── SQL Helpers ──────────────────────────────────────────────────────────────
function runStatements(db, statements, dryRun) {
  const results = [];
  for (const stmt of statements) {
    if (dryRun) {
      results.push({ sql: stmt.sql, params: stmt.params, would_affect: 'unknown (dry-run)' });
    } else {
      try {
        const info = db.prepare(stmt.sql).run(...stmt.params);
        results.push({ sql: stmt.sql, params: stmt.params, changes: info.changes });
      } catch (err) {
        results.push({ sql: stmt.sql, params: stmt.params, error: err.message });
        throw err;
      }
    }
  }
  return results;
}

// ── Validation ───────────────────────────────────────────────────────────────
function validatePrerequisites(db) {
  const errors = [];
  const warnings = [];

  // Check empresa 6 exists
  const empresa = db.prepare('SELECT id, nome FROM empresas WHERE id = ?').get(COSTA_DO_SOL_ID);
  if (!empresa) errors.push(`Empresa ${COSTA_DO_SOL_ID} não encontrada`);
  else console.log(`✓ Empresa: ${empresa.nome} (id=${empresa.id})`);

  // Check EAD category 13
  const cat = db
    .prepare(
      'SELECT id, nome, cor, ativo, deleted_at FROM qualificacoes_categorias WHERE id = ? AND empresa_id = ?',
    )
    .get(CANONICAL_EAD_CATEGORY_ID, COSTA_DO_SOL_ID);

  if (!cat) {
    errors.push(
      `Categoria EAD id=${CANONICAL_EAD_CATEGORY_ID} não encontrada para empresa ${COSTA_DO_SOL_ID}`,
    );
  } else {
    console.log(
      `✓ Categoria EAD: nome="${cat.nome}" cor="${cat.cor}" ativo=${cat.ativo} deleted=${cat.deleted_at}`,
    );
    if (cat.nome !== CANONICAL_EAD_NAME)
      warnings.push(`Nome da categoria: "${cat.nome}" (esperado "${CANONICAL_EAD_NAME}")`);
    if (cat.cor !== CANONICAL_EAD_COLOR)
      warnings.push(`Cor da categoria: "${cat.cor}" (esperado "${CANONICAL_EAD_COLOR}")`);
    if (cat.deleted_at) errors.push('Categoria EAD está soft-deleted');
  }

  // Check Teórico category 3
  const teorico = db
    .prepare('SELECT id, nome FROM qualificacoes_categorias WHERE id = ? AND empresa_id = ?')
    .get(THEORICO_CATEGORY_ID, COSTA_DO_SOL_ID);
  if (teorico) console.log(`✓ Categoria Teórico: id=${teorico.id} nome="${teorico.nome}"`);

  // Check Rômulo's records exist
  for (const id of [...ROMULO_HISTORICOS_TEORICO, ...ROMULO_HISTORICOS_EAD_INACTIVE]) {
    const h = db
      .prepare(
        'SELECT id, categoria_id, qualificacao_codigo FROM qualificacoes_historico WHERE id = ? AND deleted_at IS NULL',
      )
      .get(id);
    if (!h) warnings.push(`Histórico ${id} não encontrado ou deletado`);
    else
      console.log(
        `  Histórico ${id}: categoria_id=${h.categoria_id} codigo="${h.qualificacao_codigo}"`,
      );
  }

  return { errors, warnings };
}

// ── Count affected records ───────────────────────────────────────────────────
function countAffected(db) {
  const counts = {};

  counts.tipos_ead_inactive =
    db
      .prepare(
        `SELECT COUNT(*) as c FROM qualificacoes_tipos
     WHERE empresa_id = ? AND deleted_at IS NULL
       AND categoria_id = ?`,
      )
      .get(COSTA_DO_SOL_ID, CANONICAL_EAD_CATEGORY_ID)?.c || 0;

  counts.tipos_ead_wrong =
    db
      .prepare(
        `SELECT COUNT(*) as c FROM qualificacoes_tipos
     WHERE empresa_id = ? AND deleted_at IS NULL
       AND UPPER(TRIM(categoria)) = 'EAD'
       AND categoria_id IS NOT NULL
       AND categoria_id != ?`,
      )
      .get(COSTA_DO_SOL_ID, CANONICAL_EAD_CATEGORY_ID)?.c || 0;

  counts.historico_cat_null =
    db
      .prepare(
        `SELECT COUNT(*) as c FROM qualificacoes_historico qh
     JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
     WHERE qh.empresa_id = ? AND qh.deleted_at IS NULL
       AND UPPER(TRIM(COALESCE(qt.categoria, qh.categoria))) = 'EAD'
       AND qh.categoria_id IS NULL`,
      )
      .get(COSTA_DO_SOL_ID)?.c || 0;

  counts.historico_cat_wrong =
    db
      .prepare(
        `SELECT COUNT(*) as c FROM qualificacoes_historico qh
     WHERE qh.empresa_id = ? AND qh.deleted_at IS NULL
       AND qh.categoria_id IS NOT NULL
       AND qh.categoria_id != ?
       AND qh.categoria_id IN (SELECT id FROM qualificacoes_categorias WHERE empresa_id = ? AND UPPER(nome) = 'EAD' AND ativo = 0)`,
      )
      .get(COSTA_DO_SOL_ID, CANONICAL_EAD_CATEGORY_ID, COSTA_DO_SOL_ID)?.c || 0;

  counts.romulo_teorico =
    db
      .prepare(
        `SELECT COUNT(*) as c FROM qualificacoes_historico
     WHERE id IN (${ROMULO_HISTORICOS_TEORICO.join(',')})
       AND deleted_at IS NULL AND empresa_id = ?`,
      )
      .get(COSTA_DO_SOL_ID)?.c || 0;

  counts.romulo_ead =
    db
      .prepare(
        `SELECT COUNT(*) as c FROM qualificacoes_historico
     WHERE id IN (${ROMULO_HISTORICOS_EAD_INACTIVE.join(',')})
       AND deleted_at IS NULL AND empresa_id = ?`,
      )
      .get(COSTA_DO_SOL_ID)?.c || 0;

  return counts;
}

// ── Build reconciliation statements ──────────────────────────────────────────
function buildReconciliationStatements(db) {
  const statements = [];

  // 1. Reactivate canonical EAD category
  statements.push({
    step: 'reativar_categoria_ead',
    sql: `UPDATE qualificacoes_categorias SET ativo = 1, updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND ativo = 0`,
    params: [CANONICAL_EAD_CATEGORY_ID, COSTA_DO_SOL_ID],
  });

  // 2. Ensure canonical EAD color
  statements.push({
    step: 'corrigir_cor_ead',
    sql: `UPDATE qualificacoes_categorias SET cor = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND cor != ?`,
    params: [CANONICAL_EAD_COLOR, CANONICAL_EAD_CATEGORY_ID, COSTA_DO_SOL_ID, CANONICAL_EAD_COLOR],
  });

  // 3. Fix tipos EAD pointing to wrong category
  const tiposWrong = db
    .prepare(
      `SELECT id, codigo, nome, categoria_id FROM qualificacoes_tipos
     WHERE empresa_id = ? AND deleted_at IS NULL
       AND UPPER(TRIM(categoria)) = 'EAD'
       AND (categoria_id IS NULL OR categoria_id != ?)`,
    )
    .all(COSTA_DO_SOL_ID, CANONICAL_EAD_CATEGORY_ID);

  for (const t of tiposWrong) {
    statements.push({
      step: 'corrigir_tipo_ead',
      sql: `UPDATE qualificacoes_tipos SET categoria_id = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?`,
      params: [CANONICAL_EAD_CATEGORY_ID, t.id, COSTA_DO_SOL_ID],
      before: { tipo_id: t.id, codigo: t.codigo, nome: t.nome, old_categoria_id: t.categoria_id },
    });
  }

  // 4. Fix Rômulo historicos pointing to Teórico (id=3)
  for (const id of ROMULO_HISTORICOS_TEORICO) {
    const h = db
      .prepare(
        'SELECT id, categoria_id, qualificacao_codigo FROM qualificacoes_historico WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
      )
      .get(id, COSTA_DO_SOL_ID);
    if (h && h.categoria_id === THEORICO_CATEGORY_ID) {
      statements.push({
        step: 'corrigir_historico_romulo_teorico',
        sql: `UPDATE qualificacoes_historico SET categoria_id = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?`,
        params: [CANONICAL_EAD_CATEGORY_ID, id, COSTA_DO_SOL_ID],
        before: { historico_id: id, old_categoria_id: h.categoria_id },
      });
    }
  }

  // 5. Fix Rômulo historicos pointing to EAD (id=13) but category inactive
  for (const id of ROMULO_HISTORICOS_EAD_INACTIVE) {
    const h = db
      .prepare(
        'SELECT id, categoria_id, qualificacao_codigo FROM qualificacoes_historico WHERE id = ? AND deleted_at IS NULL AND empresa_id = ?',
      )
      .get(id, COSTA_DO_SOL_ID);
    if (h) {
      statements.push({
        step: 'reativar_historico_romulo_ead',
        sql: `UPDATE qualificacoes_historico SET categoria_id = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND (categoria_id IS NULL OR categoria_id = ?)`,
        params: [CANONICAL_EAD_CATEGORY_ID, id, COSTA_DO_SOL_ID, CANONICAL_EAD_CATEGORY_ID],
        before: { historico_id: id, old_categoria_id: h.categoria_id },
      });
    }
  }

  // 6. Fill NULL categoria_id for EAD historicos
  const nullHistoricos = db
    .prepare(
      `SELECT qh.id, qh.qualificacao_codigo FROM qualificacoes_historico qh
     JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
     WHERE qh.empresa_id = ? AND qh.deleted_at IS NULL
       AND UPPER(TRIM(COALESCE(qt.categoria, qh.categoria))) = 'EAD'
       AND qh.categoria_id IS NULL
       AND qh.id NOT IN (${[...ROMULO_HISTORICOS_TEORICO, ...ROMULO_HISTORICOS_EAD_INACTIVE].join(',')})`,
    )
    .all(COSTA_DO_SOL_ID);

  for (const h of nullHistoricos) {
    statements.push({
      step: 'preencher_categoria_id_null',
      sql: `UPDATE qualificacoes_historico SET categoria_id = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND categoria_id IS NULL`,
      params: [CANONICAL_EAD_CATEGORY_ID, h.id, COSTA_DO_SOL_ID],
      before: { historico_id: h.id, qualificacao_codigo: h.qualificacao_codigo },
    });
  }

  return statements;
}

// ── Generate rollback SQL ─────────────────────────────────────────────────────
function generateRollback(statements, db) {
  const rollbackLines = [
    '-- ROLLBACK SQL — EAD Category Reconciliation',
    `-- Generated: ${new Date().toISOString()}`,
    '',
  ];
  for (const stmt of statements) {
    if (stmt.step === 'reativar_categoria_ead') {
      rollbackLines.push(`-- Rollback: deactivate category ${CANONICAL_EAD_CATEGORY_ID}`);
      rollbackLines.push(
        `UPDATE qualificacoes_categorias SET ativo = 0, updated_at = datetime('now') WHERE id = ${CANONICAL_EAD_CATEGORY_ID} AND empresa_id = ${COSTA_DO_SOL_ID};`,
      );
    } else if (stmt.step === 'corrigir_tipo_ead' && stmt.before) {
      const oldId = stmt.before.old_categoria_id ?? 'NULL';
      rollbackLines.push(`-- Rollback: restore tipo ${stmt.before.tipo_id} categoria_id`);
      rollbackLines.push(
        `UPDATE qualificacoes_tipos SET categoria_id = ${oldId}, updated_at = datetime('now') WHERE id = ${stmt.before.tipo_id} AND empresa_id = ${COSTA_DO_SOL_ID};`,
      );
    } else if (stmt.before?.historico_id) {
      const oldId = stmt.before.old_categoria_id ?? 'NULL';
      rollbackLines.push(`-- Rollback: restore historico ${stmt.before.historico_id} categoria_id`);
      rollbackLines.push(
        `UPDATE qualificacoes_historico SET categoria_id = ${oldId}, updated_at = datetime('now') WHERE id = ${stmt.before.historico_id} AND empresa_id = ${COSTA_DO_SOL_ID};`,
      );
    }
  }
  return rollbackLines.join('\n') + '\n';
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dbFile = args[args.indexOf('--db-file') + 1];
  const manifestFile = args.includes('--manifest') ? args[args.indexOf('--manifest') + 1] : null;
  const rollbackFile = args.includes('--rollback-output')
    ? args[args.indexOf('--rollback-output') + 1]
    : null;
  const dryRun = !args.includes('--apply');

  if (!dbFile) {
    console.error(
      'Usage: node scripts/ead-reconcile.mjs --db-file <path> [--dry-run|--apply] [--manifest <path>] [--rollback-output <path>]',
    );
    process.exit(1);
  }

  console.log(`EAD Reconciliation Executor — Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`DB: ${dbFile}`);

  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');

  try {
    // Phase 1: Validate prerequisites
    console.log('\n=== Phase 1: Validate Prerequisites ===');
    const { errors, warnings } = validatePrerequisites(db);
    if (warnings.length) warnings.forEach((w) => console.warn(`⚠ ${w}`));
    if (errors.length) {
      errors.forEach((e) => console.error(`✗ ${e}`));
      console.error('Prerequisites not met. Aborting.');
      process.exit(1);
    }
    console.log('✓ All prerequisites met');

    // Phase 2: Count affected
    console.log('\n=== Phase 2: Count Affected Records ===');
    const counts = countAffected(db);
    console.log(`  Tipos EAD apontando para categoria 13: ${counts.tipos_ead_inactive}`);
    console.log(`  Tipos EAD com categoria errada: ${counts.tipos_ead_wrong}`);
    console.log(`  Históricos EAD com categoria_id NULL: ${counts.historico_cat_null}`);
    console.log(`  Históricos EAD com categoria errada: ${counts.historico_cat_wrong}`);
    console.log(`  Rômulo - Teórico: ${counts.romulo_teorico}`);
    console.log(`  Rômulo - EAD inativa: ${counts.romulo_ead}`);

    // Phase 3: Build statements
    console.log('\n=== Phase 3: Build Reconciliation Statements ===');
    const statements = buildReconciliationStatements(db);
    console.log(`  Total statements: ${statements.length}`);
    for (const s of statements) {
      console.log(`  [${s.step}] ${s.before ? JSON.stringify(s.before) : ''}`);
    }

    // Phase 4: Generate rollback
    if (rollbackFile) {
      const rollback = generateRollback(statements, db);
      writeFileSync(rollbackFile, rollback);
      console.log(`\n✓ Rollback SQL written to ${rollbackFile}`);
    }

    // Phase 5: Execute
    console.log(
      `\n=== Phase ${dryRun ? '5' : '5'}: ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY'} ===`,
    );
    if (dryRun) {
      console.log('DRY-RUN mode — no changes applied. Use --apply to execute.');
      // Write manifest
      if (manifestFile) {
        const manifest = {
          generated_at: new Date().toISOString(),
          mode: 'dry-run',
          empresa_id: COSTA_DO_SOL_ID,
          canonical_category: {
            id: CANONICAL_EAD_CATEGORY_ID,
            nome: CANONICAL_EAD_NAME,
            cor: CANONICAL_EAD_COLOR,
          },
          counts,
          statements: statements.map((s) => ({
            step: s.step,
            ...(s.before || {}),
            would_affect: 1,
          })),
        };
        writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
        console.log(`✓ Manifest written to ${manifestFile}`);
      }
    } else {
      // Apply
      db.exec('BEGIN TRANSACTION');
      try {
        const results = runStatements(db, statements, false);
        db.exec('COMMIT');
        console.log(`✓ Applied ${results.length} statements`);

        if (manifestFile) {
          const manifest = {
            generated_at: new Date().toISOString(),
            mode: 'apply',
            empresa_id: COSTA_DO_SOL_ID,
            canonical_category: {
              id: CANONICAL_EAD_CATEGORY_ID,
              nome: CANONICAL_EAD_NAME,
              cor: CANONICAL_EAD_COLOR,
            },
            results,
          };
          writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
          console.log(`✓ Manifest written to ${manifestFile}`);
        }

        // Verify
        console.log('\n=== Phase 6: Verify ===');
        const { errors: verifyErrors } = validatePrerequisites(db);
        if (verifyErrors.length) {
          console.error('✗ Verification failed:', verifyErrors);
        } else {
          console.log('✓ Verification passed');
          // Check Rômulo specifically
          for (const id of [...ROMULO_HISTORICOS_TEORICO, ...ROMULO_HISTORICOS_EAD_INACTIVE]) {
            const h = db
              .prepare(
                'SELECT id, categoria_id FROM qualificacoes_historico WHERE id = ? AND deleted_at IS NULL',
              )
              .get(id);
            if (h) {
              const ok = h.categoria_id === CANONICAL_EAD_CATEGORY_ID;
              console.log(
                `  ${ok ? '✓' : '✗'} Histórico ${id}: categoria_id=${h.categoria_id} ${ok ? '(OK)' : `(esperado ${CANONICAL_EAD_CATEGORY_ID})`}`,
              );
            }
          }
        }
      } catch (err) {
        db.exec('ROLLBACK');
        console.error('✗ Transaction rolled back:', err.message);
        process.exit(1);
      }
    }
  } finally {
    db.close();
  }

  console.log('\n✓ Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
