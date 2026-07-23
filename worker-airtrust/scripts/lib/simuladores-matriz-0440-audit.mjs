// Pure, testable auditor for migration
// 0440_simuladores_matriz_versionada_metadata.sql.
//
// It never touches a database. Instead it receives:
//   - the canonical migration SQL text (to derive the expected contract), and
//   - a "schema snapshot" taken from the target database via SELECTs against
//     sqlite_master and PRAGMA table_info / index_list / foreign_key_check.
//
// From those two inputs it classifies the state of 0440 on the target into
// exactly one of four states:
//   - AUSENTE                 — no 0440 artifact is present at all.
//   - INTEGRALMENTE_APLICADA  — every artifact AND every invariant is correct.
//   - PARCIALMENTE_APLICADA   — some, but not all, artifacts are present and
//                                nothing is in a conflicting shape.
//   - CONFLITANTE             — at least one artifact exists with a shape that
//                                differs from the contract, or a data-integrity
//                                invariant is violated (count drift, new
//                                cross-tenant link, FK-check delta, duplicate
//                                current version, residual temp table, or the
//                                legacy UNIQUE(modelo_id, manobra_id) still
//                                present on the rebuilt links table).
//
// The mere existence of modelos_sessao_versionamento is NEVER sufficient on its
// own for INTEGRALMENTE_APLICADA — all artifacts and invariants must hold
// simultaneously.

export const STATES = Object.freeze({
  AUSENTE: 'AUSENTE',
  INTEGRALMENTE_APLICADA: 'INTEGRALMENTE_APLICADA',
  PARCIALMENTE_APLICADA: 'PARCIALMENTE_APLICADA',
  CONFLITANTE: 'CONFLITANTE',
});

// Objects that exist only transiently while the migration runs and MUST be
// absent once it has completed.
export const FORBIDDEN_RESIDUAL_TABLES = Object.freeze([
  '_0440_preflight_guard',
  'modelos_sessao_manobras_0440',
]);
const FORBIDDEN_RESIDUAL_TRIGGERS = Object.freeze(['_0440_preflight_validate']);

// The table rebuilt in place (created as *_0440, then renamed). It has no
// standalone CREATE under its final name in the migration, so it is validated
// by column set + absence of the legacy UNIQUE(modelo_id, manobra_id).
const REBUILT_TABLE = 'modelos_sessao_manobras';
const REBUILT_TABLE_TEMP = 'modelos_sessao_manobras_0440';

// Artifacts whose NAMES 0440 reuses from the pre-0440 schema (the two link
// indexes and the updated_at trigger are dropped and recreated with identical
// names). Their presence is therefore NOT evidence that 0440 has run, so they
// do not contribute to the "footprint" used to distinguish AUSENTE from a
// partial/conflicting apply. Every other expected artifact is strictly new.
const PRE_EXISTING_REUSED_NAMES = new Set([
  'idx_modelos_sessao_manobras_modelo_id',
  'idx_modelos_sessao_manobras_manobra_id',
  'trigger_modelos_sessao_manobras_updated_at',
]);

/**
 * Normalize a CREATE statement for structural comparison:
 * strips SQL line comments, `IF NOT EXISTS`, double-quote identifier quoting,
 * collapses whitespace, tightens punctuation and lowercases. String literals
 * survive identically on both sides (SQLite stores them verbatim), so the
 * tightening is applied uniformly and never changes the comparison outcome.
 */
export function normalizeSql(sql) {
  if (typeof sql !== 'string') return '';
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\bIF\s+NOT\s+EXISTS\b/gi, ' ')
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),;])\s*/g, '$1')
    .replace(/;+/g, ';')
    .replace(/;+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Split a SQL script into top-level statements, aware of trigger bodies. A
 * naive split on `;` breaks trigger bodies (which contain inner `;` and
 * CASE/END). We first split on every `;` outside a string literal, then
 * re-merge fragments while a BEGIN/CASE ... END nesting level is still open.
 */
export function splitStatements(sql) {
  const fragments = [];
  let current = '';
  let inString = false;
  let inLineComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    current += ch;
    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          current += sql[i + 1];
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      inLineComment = true;
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }
    if (ch === ';') {
      fragments.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) fragments.push(current.trim());

  const merged = [];
  let buffer = '';
  let bufferDepth = 0;
  const openRe = /\b(begin|case)\b/gi;
  const endRe = /\bend\b/gi;
  for (const frag of fragments) {
    const withoutStrings = frag.replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, '');
    const opens = (withoutStrings.match(openRe) || []).length;
    const ends = (withoutStrings.match(endRe) || []).length;
    buffer = buffer ? `${buffer};\n${frag}` : frag;
    bufferDepth += opens - ends;
    if (bufferDepth <= 0) {
      merged.push(buffer);
      buffer = '';
      bufferDepth = 0;
    }
  }
  if (buffer.trim()) merged.push(buffer);
  return merged.map((s) => s.trim()).filter(Boolean);
}

function firstMatch(re, text) {
  const m = re.exec(text);
  return m ? m[1] : null;
}

function extractColumnNames(createTableSql) {
  // Strip SQL line comments first: they may contain commas that would
  // otherwise be mistaken for column separators.
  const commentFree = createTableSql.replace(/--[^\n]*/g, ' ');
  const open = commentFree.indexOf('(');
  const close = commentFree.lastIndexOf(')');
  if (open < 0 || close < 0 || close <= open) return [];
  const body = commentFree.slice(open + 1, close);
  const parts = [];
  let depth = 0;
  let cur = '';
  let inString = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      cur += ch;
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") {
      inString = true;
      cur += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const constraintKeywords = new Set(['foreign', 'primary', 'unique', 'check', 'constraint']);
  const cols = [];
  for (const raw of parts) {
    const cleaned = raw.trim();
    if (!cleaned) continue;
    // Leading identifier word (strip any trailing "(" from CHECK(/UNIQUE( etc).
    const lead = (cleaned.match(/^["`]?([a-z_][a-z0-9_]*)/i) || [])[1];
    if (!lead) continue;
    const token = lead.toLowerCase();
    if (constraintKeywords.has(token)) continue;
    cols.push(token);
  }
  return cols;
}

/**
 * Derive the expected 0440 contract from the canonical migration SQL. This is
 * the single source of truth: the auditor never hard-codes trigger/index
 * bodies, it reads them from the migration the reconciler is about to record.
 */
export function deriveExpectedContract(migrationSql) {
  const statements = splitStatements(migrationSql);
  const indexes = {};
  const triggers = {};
  const tables = {};
  let rebuiltColumns = [];

  for (const stmt of statements) {
    const normalized = normalizeSql(stmt);
    const tableName = firstMatch(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_]+)["`]?/i,
      stmt,
    );
    if (tableName) {
      if (tableName === REBUILT_TABLE_TEMP) {
        rebuiltColumns = extractColumnNames(stmt);
        continue;
      }
      if (FORBIDDEN_RESIDUAL_TABLES.includes(tableName)) continue;
      tables[tableName] = { columns: extractColumnNames(stmt) };
      continue;
    }
    const indexName = firstMatch(
      /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_]+)["`]?/i,
      stmt,
    );
    if (indexName) {
      indexes[indexName] = {
        normalized,
        unique: /create\s+unique\s+index/i.test(stmt),
        partial: /\bwhere\b/i.test(stmt),
      };
      continue;
    }
    const triggerName = firstMatch(
      /create\s+trigger\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_]+)["`]?/i,
      stmt,
    );
    if (triggerName) {
      if (FORBIDDEN_RESIDUAL_TRIGGERS.includes(triggerName)) continue;
      triggers[triggerName] = { normalized };
      continue;
    }
  }

  return {
    tables,
    indexes,
    triggers,
    rebuiltTable: REBUILT_TABLE,
    rebuiltColumns,
    forbiddenResidualTables: [...FORBIDDEN_RESIDUAL_TABLES],
  };
}

/**
 * @typedef {Object} SchemaSnapshot
 * @property {Array<{type:string,name:string,tbl_name?:string,sql?:string|null}>} objects
 *   Rows from sqlite_master (type in table/index/trigger).
 * @property {Object<string,string[]>} [columns]
 *   table name -> lowercase column names (from PRAGMA table_info).
 * @property {Object} [invariants]
 * @property {number} [invariants.modelosSessaoManobrasBefore]
 * @property {number} [invariants.modelosSessaoManobrasAfter]
 * @property {number} [invariants.modelosSessaoBefore]
 * @property {number} [invariants.modelosSessaoAfter]
 * @property {number} [invariants.duplicateCurrentVersions]  groups (empresa_id, codigo_canonico) with >1 is_current=1
 * @property {number} [invariants.crossTenantLinks]          links whose modelo/manobra tenants differ
 * @property {number} [invariants.legacyVersionRowsMissing]  modelos_sessao (empresa_id not null) lacking a version row
 * @property {number} [invariants.fkCheckBaseline]           reported baseline foreign_key_check violation count
 * @property {number} [invariants.fkCheckCurrent]            currently measured foreign_key_check violation count
 */

function indexObjects(objects) {
  const byType = { table: new Map(), index: new Map(), trigger: new Map() };
  for (const obj of objects || []) {
    const bucket = byType[obj.type];
    if (bucket) bucket.set(obj.name, obj);
  }
  return byType;
}

/**
 * Classify the state of migration 0440 on a target schema.
 * @param {{migrationSql:string, snapshot:SchemaSnapshot}} input
 * @returns {{state:string, present:number, expected:number, conflicts:string[], missing:string[], findings:string[]}}
 */
export function classify0440({ migrationSql, snapshot }) {
  const contract = deriveExpectedContract(migrationSql);
  const objects = indexObjects(snapshot?.objects);
  const columns = snapshot?.columns || {};
  const inv = snapshot?.invariants || {};

  const conflicts = [];
  const missing = [];
  const findings = [];

  const expectedTableNames = [contract.rebuiltTable, ...Object.keys(contract.tables)];
  const expectedIndexNames = Object.keys(contract.indexes);
  const expectedTriggerNames = Object.keys(contract.triggers);
  const expectedTotal =
    expectedTableNames.length + expectedIndexNames.length + expectedTriggerNames.length;

  let present = 0;

  // The rebuilt links table exists pre-migration too; presence of strictly-new
  // artifacts (versionamento/imports/new indexes/new triggers) is what tells us
  // the migration has begun. That "footprint" disambiguates AUSENTE from
  // CONFLITANTE for the legacy UNIQUE constraint.
  const newTableNames = Object.keys(contract.tables);
  let footprint = 0;

  // ---- Tables ----
  const rebuilt = objects.table.get(contract.rebuiltTable);
  let legacyUniquePresent = false;
  if (rebuilt) {
    present += 1;
    if (rebuilt.sql && /unique\s*\(\s*modelo_id\s*,\s*manobra_id\s*\)/i.test(rebuilt.sql)) {
      legacyUniquePresent = true;
    }
    const cols = (columns[contract.rebuiltTable] || []).map((c) => c.toLowerCase());
    if (contract.rebuiltColumns.length && cols.length) {
      const missingCols = contract.rebuiltColumns.filter((c) => !cols.includes(c));
      if (missingCols.length) {
        conflicts.push(
          `tabela ${contract.rebuiltTable} sem colunas esperadas: ${missingCols.join(', ')}`,
        );
      }
    }
  } else {
    missing.push(`tabela ${contract.rebuiltTable}`);
  }

  for (const name of newTableNames) {
    const obj = objects.table.get(name);
    if (obj) {
      present += 1;
      footprint += 1;
      const expectedCols = contract.tables[name].columns;
      const cols = (columns[name] || []).map((c) => c.toLowerCase());
      if (expectedCols.length && cols.length) {
        const missingCols = expectedCols.filter((c) => !cols.includes(c));
        if (missingCols.length) {
          conflicts.push(`tabela ${name} sem colunas esperadas: ${missingCols.join(', ')}`);
        }
      }
    } else {
      missing.push(`tabela ${name}`);
    }
  }

  // ---- Indexes ----
  for (const name of expectedIndexNames) {
    const obj = objects.index.get(name);
    const exp = contract.indexes[name];
    if (obj) {
      present += 1;
      if (!PRE_EXISTING_REUSED_NAMES.has(name)) footprint += 1;
      const norm = normalizeSql(obj.sql || '');
      if (norm !== exp.normalized) {
        conflicts.push(`índice ${name} com definição divergente`);
      }
    } else {
      missing.push(`índice ${name}`);
    }
  }

  // ---- Triggers ----
  for (const name of expectedTriggerNames) {
    const obj = objects.trigger.get(name);
    const exp = contract.triggers[name];
    if (obj) {
      present += 1;
      if (!PRE_EXISTING_REUSED_NAMES.has(name)) footprint += 1;
      const norm = normalizeSql(obj.sql || '');
      if (norm !== exp.normalized) {
        conflicts.push(`trigger ${name} com corpo divergente`);
      }
    } else {
      missing.push(`trigger ${name}`);
    }
  }

  // ---- Residual temp objects must be absent ----
  for (const name of contract.forbiddenResidualTables) {
    if (objects.table.get(name)) {
      conflicts.push(`tabela temporária residual presente: ${name}`);
    }
  }
  for (const name of FORBIDDEN_RESIDUAL_TRIGGERS) {
    if (objects.trigger.get(name)) {
      conflicts.push(`trigger temporário residual presente: ${name}`);
    }
  }

  // ---- AUSENTE short-circuit: no new-shape artifact present at all ----
  if (footprint === 0 && conflicts.length === 0) {
    return {
      state: STATES.AUSENTE,
      present,
      expected: expectedTotal,
      conflicts,
      missing,
      findings,
    };
  }

  // The legacy UNIQUE is a genuine conflict once the migration has footprint.
  if (legacyUniquePresent) {
    conflicts.push(
      `tabela ${contract.rebuiltTable} ainda possui UNIQUE(modelo_id, manobra_id) legado`,
    );
  }

  // ---- Data-integrity invariants (only when provided) ----
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

  const msmBefore = num(inv.modelosSessaoManobrasBefore);
  const msmAfter = num(inv.modelosSessaoManobrasAfter);
  if (msmBefore !== undefined && msmAfter !== undefined && msmBefore !== msmAfter) {
    conflicts.push(
      `contagem de modelos_sessao_manobras divergiu (${msmBefore} -> ${msmAfter}); vínculos perdidos`,
    );
  }

  const msBefore = num(inv.modelosSessaoBefore);
  const msAfter = num(inv.modelosSessaoAfter);
  if (msBefore !== undefined && msAfter !== undefined && msBefore !== msAfter) {
    conflicts.push(`contagem de modelos_sessao divergiu (${msBefore} -> ${msAfter})`);
  }

  const dupCurrent = num(inv.duplicateCurrentVersions);
  if (dupCurrent !== undefined && dupCurrent > 0) {
    conflicts.push(
      `${dupCurrent} grupo(s) (empresa_id, codigo_canonico) com mais de uma versão corrente`,
    );
  }

  const crossTenant = num(inv.crossTenantLinks);
  if (crossTenant !== undefined && crossTenant > 0) {
    conflicts.push(`${crossTenant} vínculo(s) modelo/manobra cross-tenant`);
  }

  const legacyMissing = num(inv.legacyVersionRowsMissing);
  if (legacyMissing !== undefined && legacyMissing > 0) {
    conflicts.push(
      `${legacyMissing} modelos_sessao (empresa_id) sem linha LEGACY em modelos_sessao_versionamento`,
    );
  }

  const fkBaseline = num(inv.fkCheckBaseline);
  const fkCurrent = num(inv.fkCheckCurrent);
  if (fkBaseline !== undefined && fkCurrent !== undefined && fkBaseline !== fkCurrent) {
    conflicts.push(`foreign_key_check divergiu do baseline (${fkBaseline} -> ${fkCurrent})`);
  }

  // ---- Decision ----
  if (conflicts.length > 0) {
    return {
      state: STATES.CONFLITANTE,
      present,
      expected: expectedTotal,
      conflicts,
      missing,
      findings,
    };
  }

  const allArtifactsPresent = missing.length === 0 && present === expectedTotal;
  // The always-measurable invariants must be present to confirm an integral
  // apply. The before/after count pairs are only measurable in the disposable
  // rehearsal (production has no "before" snapshot); when provided they still
  // force CONFLITANTE on divergence above, but they are not required here.
  const requiredInvariants = [dupCurrent, crossTenant, legacyMissing, fkBaseline, fkCurrent];
  const allInvariantsProvided = requiredInvariants.every((v) => v !== undefined);

  if (allArtifactsPresent && allInvariantsProvided) {
    return {
      state: STATES.INTEGRALMENTE_APLICADA,
      present,
      expected: expectedTotal,
      conflicts,
      missing,
      findings,
    };
  }

  return {
    state: STATES.PARCIALMENTE_APLICADA,
    present,
    expected: expectedTotal,
    conflicts,
    missing,
    findings: [
      ...findings,
      ...(allArtifactsPresent && !allInvariantsProvided
        ? ['invariantes de integridade não fornecidas para confirmação']
        : []),
    ],
  };
}

export default { STATES, classify0440, deriveExpectedContract, normalizeSql, splitStatements };
