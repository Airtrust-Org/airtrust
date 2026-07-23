// Core, executor-driven reconciler for the 0440 ledger entry.
//
// This module contains NO production wiring and NO process-level gating. It
// takes an "executor" (an object that can run read-only queries and, only when
// explicitly applying, a single write) plus already-validated inputs, and:
//
//   1. discovers the real shape of d1_migrations (never assumes a fixed shape),
//   2. confirms the 0440 entry is absent from the ledger,
//   3. builds a schema snapshot and runs the pure 0440 auditor,
//   4. refuses to proceed unless the auditor returns INTEGRALMENTE_APLICADA,
//   5. computes exactly the single ledger row it would write (plannedWrites),
//   6. when apply === true, writes ONLY that row idempotently
//      (INSERT ... WHERE NOT EXISTS) and then re-validates everything.
//
// The CLI wrapper (../reconcile-simuladores-0440-ledger.mjs) is responsible for
// the dangerous-operation gates (production target lock, clean main, backup
// hash/size, migration hash, confirmation text) before ever calling reconcile.
//
// OPERATIONAL MARKERS (guard:operational-sql-sources):
// source_reference: schema real de produção lido via SELECT/PRAGMA (read-only)
//   e o contrato derivado da própria migration 0440 versionada no repo; nenhum
//   dado de tenant é lido ou escrito.
// operational_decision: registrar SOMENTE a linha de ledger
//   `0440_simuladores_matriz_versionada_metadata.sql` em `d1_migrations`, via
//   INSERT idempotente (WHERE NOT EXISTS), condicionado ao auditor retornar
//   INTEGRALMENTE_APLICADA; nenhuma tabela de domínio é tocada.
// dry_run_required: o modo padrão é dry-run (sem `--apply`) — imprime
//   plannedWrites e não executa nenhuma escrita; a escrita só ocorre em
//   `--apply` com confirmação textual explícita.
// rollback_plan_required: a única linha inserida pode ser removida com
//   `DELETE FROM d1_migrations WHERE name = '0440_simuladores_matriz_versionada_metadata.sql'`
//   (o schema físico da 0440 permanece intacto; nada de domínio é revertido).

import {
  classify0440,
  STATES,
} from '../../../worker-airtrust/scripts/lib/simuladores-matriz-0440-audit.mjs';

export const LEDGER_ENTRY_NAME = '0440_simuladores_matriz_versionada_metadata.sql';

// Tables whose columns the auditor inspects.
const SNAPSHOT_TABLES = [
  'modelos_sessao_manobras',
  'modelos_sessao_versionamento',
  'modelos_sessao_manobras_contexto',
  'simuladores_matriz_imports',
  'simuladores_matriz_import_changes',
];

function firstRow(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : undefined;
}

function scalar(rows) {
  const row = firstRow(rows);
  if (!row) return undefined;
  const values = Object.values(row);
  return values.length ? Number(values[0]) : undefined;
}

/**
 * Discover the real column layout of d1_migrations.
 * @returns {{columns: Array<{name:string, notnull:number, dflt_value:any, pk:number}>}}
 */
export function discoverLedgerSchema(executor) {
  const rows = executor.query('PRAGMA table_info(d1_migrations)');
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('d1_migrations não existe ou não pôde ser inspecionada no alvo');
  }
  const hasName = rows.some((c) => String(c.name).toLowerCase() === 'name');
  if (!hasName) {
    throw new Error('d1_migrations não possui coluna "name" — shape inesperado');
  }
  return { columns: rows };
}

export function ledgerHasEntry(executor, name) {
  const rows = executor.query(
    `SELECT COUNT(*) AS c FROM d1_migrations WHERE name = ${sqlString(name)}`,
  );
  return (scalar(rows) || 0) > 0;
}

/**
 * Build the schema snapshot the auditor consumes, plus the measurable
 * integrity invariants. The FK baseline is supplied by the caller (it is a
 * reported pre-window fingerprint, not something re-derivable from the DB).
 */
export function buildSnapshot(executor, { fkCheckBaseline } = {}) {
  const objects = executor.query(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','trigger')",
  );

  const columns = {};
  const existingTables = new Set(
    (objects || []).filter((o) => o.type === 'table').map((o) => o.name),
  );
  for (const table of SNAPSHOT_TABLES) {
    if (!existingTables.has(table)) continue;
    const info = executor.query(`PRAGMA table_info(${table})`);
    columns[table] = (info || []).map((c) => String(c.name).toLowerCase());
  }

  const invariants = {};

  if (existingTables.has('modelos_sessao_versionamento')) {
    invariants.duplicateCurrentVersions =
      scalar(
        executor.query(
          'SELECT COUNT(*) AS c FROM (SELECT empresa_id, codigo_canonico FROM modelos_sessao_versionamento WHERE is_current = 1 GROUP BY empresa_id, codigo_canonico HAVING COUNT(*) > 1)',
        ),
      ) ?? undefined;
    invariants.legacyVersionRowsMissing =
      scalar(
        executor.query(
          'SELECT COUNT(*) AS c FROM modelos_sessao ms WHERE ms.empresa_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM modelos_sessao_versionamento v WHERE v.modelo_id = ms.id)',
        ),
      ) ?? undefined;
  }

  if (existingTables.has('modelos_sessao_manobras')) {
    invariants.crossTenantLinks =
      scalar(
        executor.query(
          'SELECT COUNT(*) AS c FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id JOIN manobras m ON m.id = msm.manobra_id WHERE m.empresa_id <> ms.empresa_id',
        ),
      ) ?? undefined;
  }

  // foreign_key_check returns one row per violation; count them.
  const fkRows = executor.query('PRAGMA foreign_key_check');
  invariants.fkCheckCurrent = Array.isArray(fkRows) ? fkRows.length : undefined;
  if (typeof fkCheckBaseline === 'number' && Number.isFinite(fkCheckBaseline)) {
    invariants.fkCheckBaseline = fkCheckBaseline;
  }

  return { objects, columns, invariants };
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Compute the single idempotent INSERT that records the 0440 ledger entry,
 * shaped to the discovered d1_migrations columns.
 */
export function planLedgerWrite({ ledgerSchema, name }) {
  const cols = ledgerSchema.columns.map((c) => String(c.name).toLowerCase());
  const insertCols = [];
  const insertVals = [];

  insertCols.push('name');
  insertVals.push(sqlString(name));

  const appliedAt = ledgerSchema.columns.find((c) => String(c.name).toLowerCase() === 'applied_at');
  if (appliedAt) {
    const hasDefault = appliedAt.dflt_value !== null && appliedAt.dflt_value !== undefined;
    if (!hasDefault && Number(appliedAt.notnull) === 1) {
      // NOT NULL without a default — we must supply a value.
      insertCols.push('applied_at');
      insertVals.push('CURRENT_TIMESTAMP');
    }
  }

  // Any other NOT NULL column without a default (besides the autoincrement pk)
  // would make a bare insert fail — surface it rather than guessing.
  for (const c of ledgerSchema.columns) {
    const cname = String(c.name).toLowerCase();
    if (insertCols.includes(cname)) continue;
    if (Number(c.pk) === 1) continue;
    const hasDefault = c.dflt_value !== null && c.dflt_value !== undefined;
    if (Number(c.notnull) === 1 && !hasDefault) {
      throw new Error(
        `d1_migrations possui coluna NOT NULL sem default não prevista: ${cname}; abortando por segurança`,
      );
    }
  }

  const sql =
    `INSERT INTO d1_migrations (${insertCols.join(', ')}) ` +
    `SELECT ${insertVals.join(', ')} ` +
    `WHERE NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name = ${sqlString(name)})`;

  return { sql, columns: cols, name };
}

/**
 * Orchestrate the full reconciliation against an executor.
 * @param {{executor:object, migrationSql:string, fkCheckBaseline?:number, apply?:boolean, name?:string}} opts
 */
export function reconcile({
  executor,
  migrationSql,
  fkCheckBaseline,
  apply = false,
  name = LEDGER_ENTRY_NAME,
}) {
  const result = {
    apply,
    ledgerEntryName: name,
    ledgerSchema: null,
    ledgerHadEntryBefore: null,
    auditState: null,
    auditConflicts: [],
    auditMissing: [],
    plannedWrites: [],
    wrote: false,
    ledgerHasEntryAfter: null,
    revalidatedState: null,
    ok: false,
    refusedReason: null,
  };

  const ledgerSchema = discoverLedgerSchema(executor);
  result.ledgerSchema = ledgerSchema.columns.map((c) => c.name);

  const hadBefore = ledgerHasEntry(executor, name);
  result.ledgerHadEntryBefore = hadBefore;

  const snapshot = buildSnapshot(executor, { fkCheckBaseline });
  const audit = classify0440({ migrationSql, snapshot });
  result.auditState = audit.state;
  result.auditConflicts = audit.conflicts;
  result.auditMissing = audit.missing;

  if (audit.state !== STATES.INTEGRALMENTE_APLICADA) {
    result.refusedReason = `auditoria retornou ${audit.state}; reconciliação exige INTEGRALMENTE_APLICADA`;
    return result;
  }

  const planned = planLedgerWrite({ ledgerSchema, name });
  // If the entry already exists, the idempotent insert plans to write nothing
  // new; still record the statement so the operator sees exactly what runs.
  result.plannedWrites = [planned.sql];

  if (!apply) {
    result.ok = true;
    return result;
  }

  // ---- APPLY: write only the single ledger row, idempotently ----
  executor.exec(planned.sql);
  result.wrote = true;

  // Revalidate: entry now present, still exactly one row for this name, audit
  // still integral, FK count unchanged.
  const hasAfter = ledgerHasEntry(executor, name);
  result.ledgerHasEntryAfter = hasAfter;
  if (!hasAfter) {
    result.refusedReason = 'pós-escrita: entrada 0440 não encontrada no ledger';
    return result;
  }
  const dupes = scalar(
    executor.query(`SELECT COUNT(*) AS c FROM d1_migrations WHERE name = ${sqlString(name)}`),
  );
  if ((dupes || 0) !== 1) {
    result.refusedReason = `pós-escrita: esperado exatamente 1 registro 0440, encontrado ${dupes}`;
    return result;
  }

  const snapshotAfter = buildSnapshot(executor, { fkCheckBaseline });
  const auditAfter = classify0440({ migrationSql, snapshot: snapshotAfter });
  result.revalidatedState = auditAfter.state;
  if (auditAfter.state !== STATES.INTEGRALMENTE_APLICADA) {
    result.refusedReason = `pós-escrita: auditoria mudou para ${auditAfter.state}`;
    return result;
  }
  if (snapshotAfter.invariants.fkCheckCurrent !== snapshot.invariants.fkCheckCurrent) {
    result.refusedReason = 'pós-escrita: contagem de foreign_key_check mudou';
    return result;
  }

  result.ok = true;
  return result;
}

export default {
  LEDGER_ENTRY_NAME,
  discoverLedgerSchema,
  ledgerHasEntry,
  buildSnapshot,
  planLedgerWrite,
  reconcile,
};
