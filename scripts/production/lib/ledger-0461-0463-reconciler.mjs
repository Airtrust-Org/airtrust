// Core, executor-driven reconciler for migrations 0461, 0462, and 0463 ledger entries.
//
// source_reference: Post-release reconciliation audit 2026-08-21.
// operational_decision: Registrar SOMENTE as três linhas de ledger
//   (0461_refresh_tokens_empresa_id.sql,
//    0462_qualificacoes_tipos_codigo_tenant_active_unique.sql,
//    0463_frms_iogp_schema_v2.sql)
//   em `d1_migrations` via INSERTs idempotentes (WHERE NOT EXISTS),
//   condicionados à validação integral de todas as postconditions físicas.
// dry_run_required: Padrão DRY-RUN; escrita somente sob --apply com gates explícitos.
// rollback_plan_required: DELETE FROM d1_migrations WHERE name IN (...)

export const RECONCILIATION_TARGET_MIGRATIONS = Object.freeze([
  {
    name: '0461_refresh_tokens_empresa_id.sql',
    expectedSha256: '184633b6aa4ace6d67c056a29d19a0ca97cf990416cfdf6bd0a4378e9dffc0d7',
  },
  {
    name: '0462_qualificacoes_tipos_codigo_tenant_active_unique.sql',
    expectedSha256: '2ad1cfb7bce8030d94b6de4ad656eee3432f7182ff3e8bae050717f57387083a',
  },
  {
    name: '0463_frms_iogp_schema_v2.sql',
    expectedSha256: '794b5dec55e6fcaf790f2bc0a73002ce9ea40942ff33217b26743e507ee2650d',
  },
]);

function firstRow(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : undefined;
}

function scalar(rows) {
  const row = firstRow(rows);
  if (!row) return undefined;
  const values = Object.values(row);
  return values.length ? Number(values[0]) : undefined;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Discover the real column layout of d1_migrations.
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

/**
 * Check if a migration name is already in d1_migrations.
 */
export function getLedgerCount(executor, name) {
  const rows = executor.query(
    `SELECT COUNT(*) AS c FROM d1_migrations WHERE name = ${sqlString(name)}`,
  );
  return scalar(rows) || 0;
}

/**
 * Audit physical postconditions of migrations 0461, 0462, 0463.
 */
export function auditPostconditions(executor) {
  const errors = [];
  const details = {};

  // --- 0461 Postconditions ---
  const refreshCols = executor.query("PRAGMA table_info('refresh_tokens')") || [];
  const hasEmpresaId = refreshCols.some(
    (c) => String(c.name).toLowerCase() === 'empresa_id' && String(c.type).toUpperCase() === 'INTEGER',
  );
  if (!hasEmpresaId) {
    errors.push('0461 FAIL: coluna refresh_tokens.empresa_id INTEGER não encontrada');
  }

  const refreshIdx = executor.query(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='refresh_tokens' AND name='idx_refresh_tokens_empresa'",
  );
  if (!Array.isArray(refreshIdx) || refreshIdx.length === 0) {
    errors.push('0461 FAIL: índice idx_refresh_tokens_empresa não encontrado');
  }

  let legacyUnrevoked = null;
  if (hasEmpresaId) {
    legacyUnrevoked = scalar(
      executor.query(
        'SELECT COUNT(*) AS c FROM refresh_tokens WHERE empresa_id IS NULL AND revoked_at IS NULL',
      ),
    );
    if (legacyUnrevoked !== 0) {
      errors.push(`0461 FAIL: existem ${legacyUnrevoked} refresh tokens legados ativos sem empresa_id`);
    }
  }
  details['0461'] = {
    hasEmpresaIdColumn: hasEmpresaId,
    hasIndex: Array.isArray(refreshIdx) && refreshIdx.length > 0,
    legacyUnrevokedTokens: legacyUnrevoked,
    state: hasEmpresaId && Array.isArray(refreshIdx) && refreshIdx.length > 0 && legacyUnrevoked === 0 ? 'INTEGRALMENTE_APLICADA' : 'INCOMPLETA',
  };

  // --- 0462 Postconditions ---
  const qualifIdx = executor.query(
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='qualificacoes_tipos' AND name='idx_qualificacoes_tipos_codigo_empresa_active'",
  );
  const has0462Index = Array.isArray(qualifIdx) && qualifIdx.length > 0;
  const sql0462 = has0462Index ? String(qualifIdx[0].sql || '') : '';
  const is0462UniquePartial =
    sql0462.includes('UNIQUE') &&
    sql0462.includes('empresa_id') &&
    sql0462.includes('codigo') &&
    sql0462.includes('deleted_at IS NULL');

  if (!has0462Index || !is0462UniquePartial) {
    errors.push('0462 FAIL: índice idx_qualificacoes_tipos_codigo_empresa_active UNIQUE parcial não encontrado');
  }

  const activeDupes = scalar(
    executor.query(
      'SELECT COUNT(*) AS c FROM (SELECT empresa_id, codigo FROM qualificacoes_tipos WHERE deleted_at IS NULL GROUP BY empresa_id, codigo COLLATE NOCASE HAVING COUNT(*) > 1)',
    ),
  );
  if (activeDupes !== 0) {
    errors.push(`0462 FAIL: existem ${activeDupes} grupos duplicados ativos em qualificacoes_tipos`);
  }
  details['0462'] = {
    hasIndex: has0462Index,
    isUniquePartial: is0462UniquePartial,
    activeDuplicateGroups: activeDupes,
    state: has0462Index && is0462UniquePartial && activeDupes === 0 ? 'INTEGRALMENTE_APLICADA' : 'INCOMPLETA',
  };

  // --- 0463 Postconditions ---
  const frmsTables = executor.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('frms_regulatory_profiles', 'frms_location_catalog', 'frms_jornada_avaliacoes')",
  ) || [];
  const foundTableNames = new Set(frmsTables.map((t) => t.name));
  const missingTables = ['frms_regulatory_profiles', 'frms_location_catalog', 'frms_jornada_avaliacoes'].filter(
    (t) => !foundTableNames.has(t),
  );
  if (missingTables.length > 0) {
    errors.push(`0463 FAIL: tabelas FRMS ausentes: ${missingTables.join(', ')}`);
  }

  const frmsIdx = executor.query(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('frms_regulatory_profiles', 'frms_location_catalog', 'frms_jornada_avaliacoes')",
  ) || [];
  const foundIdxNames = new Set(frmsIdx.map((i) => i.name));
  const expectedIndexes = [
    'idx_frms_reg_profiles_empresa_effective',
    'idx_frms_location_catalog_empresa_code_active',
    'idx_frms_jornada_avaliacoes_empresa_jornada',
    'idx_frms_jornada_avaliacoes_empresa_level',
  ];
  const missingIndexes = expectedIndexes.filter((i) => !foundIdxNames.has(i));
  if (missingIndexes.length > 0) {
    errors.push(`0463 FAIL: índices FRMS ausentes: ${missingIndexes.join(', ')}`);
  }
  details['0463'] = {
    foundTables: Array.from(foundTableNames),
    missingTables,
    foundIndexes: Array.from(foundIdxNames),
    missingIndexes,
    state: missingTables.length === 0 && missingIndexes.length === 0 ? 'INTEGRALMENTE_APLICADA' : 'INCOMPLETA',
  };

  return {
    ok: errors.length === 0,
    errors,
    details,
  };
}

/**
 * Plan idempotent INSERT statements for missing ledger entries.
 */
export function planLedgerWrites({ ledgerSchema, migrationNames }) {
  const insertCols = ['name'];
  const appliedAt = ledgerSchema.columns.find((c) => String(c.name).toLowerCase() === 'applied_at');
  if (appliedAt) {
    const hasDefault = appliedAt.dflt_value !== null && appliedAt.dflt_value !== undefined;
    if (!hasDefault && Number(appliedAt.notnull) === 1) {
      insertCols.push('applied_at');
    }
  }

  const writes = [];
  for (const name of migrationNames) {
    const insertVals = [sqlString(name)];
    if (insertCols.includes('applied_at')) {
      insertVals.push('CURRENT_TIMESTAMP');
    }
    const sql =
      `INSERT INTO d1_migrations (${insertCols.join(', ')}) ` +
      `SELECT ${insertVals.join(', ')} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name = ${sqlString(name)})`;
    writes.push({ name, sql });
  }
  return writes;
}

/**
 * Main reconciliation orchestrator.
 */
export function reconcile0461To0463({
  executor,
  fkCheckBaseline,
  apply = false,
}) {
  const result = {
    apply,
    ledgerSchema: null,
    initialCounts: {},
    audit: null,
    plannedWrites: [],
    wrote: false,
    finalCounts: {},
    fkCheck: null,
    ok: false,
    refusedReason: null,
  };

  // 1. Discover ledger schema
  const ledgerSchema = discoverLedgerSchema(executor);
  result.ledgerSchema = ledgerSchema.columns.map((c) => c.name);

  // 2. Initial ledger counts
  for (const m of RECONCILIATION_TARGET_MIGRATIONS) {
    result.initialCounts[m.name] = getLedgerCount(executor, m.name);
  }

  // 3. Audit physical postconditions
  const audit = auditPostconditions(executor);
  result.audit = audit;

  if (!audit.ok) {
    result.refusedReason = `auditoria de postconditions falhou: ${audit.errors.join('; ')}`;
    return result;
  }

  // 4. Determine migrations needing ledger insert
  const needed = RECONCILIATION_TARGET_MIGRATIONS.filter(
    (m) => result.initialCounts[m.name] === 0,
  ).map((m) => m.name);

  const planned = planLedgerWrites({ ledgerSchema, migrationNames: needed });
  result.plannedWrites = planned.map((p) => p.sql);

  if (!apply) {
    // DRY-RUN
    result.ok = true;
    return result;
  }

  if (needed.length === 0) {
    // Already reconciled
    result.ok = true;
    for (const m of RECONCILIATION_TARGET_MIGRATIONS) {
      result.finalCounts[m.name] = getLedgerCount(executor, m.name);
    }
    return result;
  }

  // 5. Execute writes
  for (const w of planned) {
    executor.exec(w.sql);
  }
  result.wrote = true;

  // 6. Post-write verification
  for (const m of RECONCILIATION_TARGET_MIGRATIONS) {
    const c = getLedgerCount(executor, m.name);
    result.finalCounts[m.name] = c;
    if (c !== 1) {
      result.refusedReason = `pós-escrita: esperado exatamente 1 registro para ${m.name}, encontrado ${c}`;
      return result;
    }
  }

  // 7. Post-write audit revalidation
  const auditAfter = auditPostconditions(executor);
  if (!auditAfter.ok) {
    result.refusedReason = `pós-escrita: postconditions divergiram: ${auditAfter.errors.join('; ')}`;
    return result;
  }

  // 8. Foreign key integrity check
  const fkRows = executor.query('PRAGMA foreign_key_check') || [];
  result.fkCheck = fkRows.length;
  if (typeof fkCheckBaseline === 'number' && Number.isFinite(fkCheckBaseline)) {
    if (fkRows.length !== fkCheckBaseline) {
      result.refusedReason = `pós-escrita: contagem de foreign_key_check divergiu: ${fkRows.length} (esperado ${fkCheckBaseline})`;
      return result;
    }
  }

  result.ok = true;
  return result;
}

export default {
  RECONCILIATION_TARGET_MIGRATIONS,
  discoverLedgerSchema,
  getLedgerCount,
  auditPostconditions,
  planLedgerWrites,
  reconcile0461To0463,
};
