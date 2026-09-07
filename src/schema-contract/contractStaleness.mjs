/**
 * Schema-contract staleness / provenance guard.
 *
 * This module is repo-only: it never touches a database. It answers one
 * question: "has a Schema V2 change landed in the repository without the
 * production schema contract being reconciled against it?".
 *
 * It is shared by:
 *   - src/schema-contract/checkSchemaContract.ts  (production apply path)
 *   - scripts/schema-contract/check-contract-staleness.mjs  (lint gate)
 *   - the vitest / node:test suites
 *
 * Design constraints (HEALTH P1-07 / issue #485):
 *   - a migration/change file existing in the repo is NEVER, by itself,
 *     evidence that the change is in production;
 *   - every *.sql under the Schema V2 changes directory MUST be explicitly
 *     classified in the contract, or the contract is considered stale;
 *   - provenance is tracked with four explicit states:
 *       REPO_EXPECTED, STAGING_APPLIED, PRODUCTION_CONFIRMED, REMOTE_APPLY_PENDING.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const PROVENANCE_STATES = Object.freeze([
  'REPO_EXPECTED',
  'STAGING_APPLIED',
  'PRODUCTION_CONFIRMED',
  'REMOTE_APPLY_PENDING',
]);

/** Governance states that mean "a reviewed manifest wires this for a real apply". */
export const GOVERNED_STATES = Object.freeze(['STAGING_APPLIED', 'PRODUCTION_CONFIRMED', 'REMOTE_APPLY_PENDING']);

/** Governance states that assert the change already reached a live database. */
export const APPLIED_STATES = Object.freeze(['STAGING_APPLIED', 'PRODUCTION_CONFIRMED']);

export const COVERAGE_CLASSES = Object.freeze([
  'REFLECTED_IN_CONTRACT',
  'OUT_OF_CONTRACT_SCOPE',
  'RUNTIME_CRITICAL_UNCOVERED',
]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stripSqlNoise(sqlText) {
  return sqlText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

function unquoteIdentifier(raw) {
  const value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === '`' && last === '`') ||
      (first === '[' && last === ']')
    ) {
      return value.slice(1, -1).replace(/""/g, '"');
    }
  }
  return value;
}

function normalizeTableName(raw) {
  const withoutSchema = unquoteIdentifier(raw).split('.').pop() ?? '';
  return unquoteIdentifier(withoutSchema).toLowerCase();
}

/** Scratch / preflight / rollback guard tables that are created and dropped inside one change. */
export function isScratchTable(name) {
  const lowered = name.toLowerCase();
  return (
    lowered.startsWith('_') ||
    lowered.endsWith('_guard') ||
    lowered.endsWith('guard') ||
    lowered.includes('_preflight_') ||
    lowered.includes('_postseed_') ||
    lowered.includes('_rollback_')
  );
}

const IDENT = `(?:"[^"]+"|\`[^\`]+\`|\\[[^\\]]+\\]|[A-Za-z_][A-Za-z0-9_$]*)`;

/**
 * Extract the set of real (non-scratch) tables that a DDL script touches.
 * Index/trigger targets resolve to the table after ON, never the index/trigger name.
 */
export function extractDdlTargets(sqlText, { includeScratch = false } = {}) {
  const sql = stripSqlNoise(sqlText);
  const found = new Set();

  const add = (raw) => {
    if (!raw) return;
    const name = normalizeTableName(raw);
    if (!name) return;
    if (!includeScratch && isScratchTable(name)) return;
    found.add(name);
  };

  const patterns = [
    new RegExp(`\\bCREATE\\s+(?:TEMP(?:ORARY)?\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT}(?:\\.${IDENT})?)`, 'gi'),
    new RegExp(`\\bALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${IDENT}(?:\\.${IDENT})?)`, 'gi'),
    new RegExp(`\\bDROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(${IDENT}(?:\\.${IDENT})?)`, 'gi'),
    new RegExp(`\\bCREATE\\s+VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT}(?:\\.${IDENT})?)`, 'gi'),
    new RegExp(`\\bDROP\\s+VIEW\\s+(?:IF\\s+EXISTS\\s+)?(${IDENT}(?:\\.${IDENT})?)`, 'gi'),
    new RegExp(
      `\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT}(?:\\.${IDENT})?\\s+ON\\s+(${IDENT}(?:\\.${IDENT})?)`,
      'gi',
    ),
    new RegExp(
      `\\bCREATE\\s+(?:TEMP(?:ORARY)?\\s+)?TRIGGER\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT}(?:\\.${IDENT})?\\s+(?:BEFORE\\s+|AFTER\\s+|INSTEAD\\s+OF\\s+)?(?:INSERT|UPDATE|DELETE)(?:\\s+OF\\s+[\\s\\S]*?)?\\s+ON\\s+(${IDENT}(?:\\.${IDENT})?)`,
      'gi',
    ),
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      add(match[1]);
    }
  }

  return [...found].sort((left, right) => left.localeCompare(right));
}

function listSqlFiles(dirAbs) {
  if (!existsSync(dirAbs) || !statSync(dirAbs).isDirectory()) {
    return [];
  }
  return readdirSync(dirAbs)
    .filter((name) => name.toLowerCase().endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));
}

/** Digest over the ordered (file, sha256) pairs of every Schema V2 change on disk. */
export function computeSchemaV2Digest(entries) {
  const canonical = entries
    .map((entry) => `${entry.change_file}:${entry.sha256}`)
    .sort((left, right) => left.localeCompare(right))
    .join('\n');
  return sha256(canonical);
}

/** Reviewed manifests under worker-airtrust/schema-v2/*.json keyed by the SQL path they wire. */
function loadReviewedManifests(manifestsDirAbs) {
  const byFilePath = new Map();
  if (!existsSync(manifestsDirAbs) || !statSync(manifestsDirAbs).isDirectory()) {
    return byFilePath;
  }
  for (const name of readdirSync(manifestsDirAbs)) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(path.join(manifestsDirAbs, name), 'utf8'));
      if (parsed && typeof parsed.filePath === 'string') {
        byFilePath.set(parsed.filePath.replace(/\\/g, '/'), name);
      }
    } catch {
      // A malformed manifest is a separate concern (build-reviewed-schema-apply guards it).
    }
  }
  return byFilePath;
}

const DEFAULT_CHANGES_DIR = 'worker-airtrust/schema-v2/changes';
const DEFAULT_MANIFESTS_DIR = 'worker-airtrust/schema-v2';

/**
 * Evaluate the contract's staleness / provenance sections against the repo tree.
 * Returns { status: 'PASS' | 'FAIL', issues: [...] }. WARNING is never emitted here:
 * an unreconciled schema change is a hard failure by design.
 */
export function evaluateStaleness({ contract, rootDir }) {
  const issues = [];
  const fail = (code, message, extra = {}) => issues.push({ severity: 'FAIL', code, message, ...extra });

  const guard = contract.staleness_guard;
  if (!guard || typeof guard !== 'object') {
    fail('STALENESS_MISSING_SECTION', 'Contrato sem secao staleness_guard.');
    return { status: 'FAIL', issues };
  }

  if (!contract.provenance || typeof contract.provenance !== 'object') {
    fail('PROVENANCE_MISSING_SECTION', 'Contrato sem secao provenance.');
  } else {
    for (const field of ['baseline_state', 'confirmed_via', 'snapshot_generated_at']) {
      if (!contract.provenance[field]) {
        fail('PROVENANCE_MISSING_FIELD', `provenance.${field} obrigatorio.`);
      }
    }
    if (
      contract.provenance.baseline_state &&
      !PROVENANCE_STATES.includes(contract.provenance.baseline_state)
    ) {
      fail(
        'PROVENANCE_INVALID_ENUM',
        `provenance.baseline_state invalido: ${contract.provenance.baseline_state}.`,
      );
    }
  }

  const changesDir = guard.schema_v2_changes_dir || DEFAULT_CHANGES_DIR;
  const manifestsDir = guard.reviewed_manifests_dir || DEFAULT_MANIFESTS_DIR;
  const changesDirAbs = path.resolve(rootDir, changesDir);
  const manifestsDirAbs = path.resolve(rootDir, manifestsDir);

  const sqlFiles = listSqlFiles(changesDirAbs);
  if (sqlFiles.length === 0) {
    fail('STALENESS_NO_CHANGES_DIR', `Nenhum arquivo .sql encontrado em ${changesDir}.`);
    return { status: 'FAIL', issues };
  }

  const onDisk = sqlFiles.map((name) => {
    const content = readFileSync(path.join(changesDirAbs, name), 'utf8');
    return {
      change_file: name,
      sha256: sha256(content),
      targets: extractDdlTargets(content),
    };
  });
  const onDiskByFile = new Map(onDisk.map((entry) => [entry.change_file, entry]));

  const manifestByFilePath = loadReviewedManifests(manifestsDirAbs);
  const scopedTables = new Set((contract.scoped_tables ?? []).map((name) => name.toLowerCase()));

  const ledger = Array.isArray(contract.schema_v2_since_baseline)
    ? contract.schema_v2_since_baseline
    : null;
  if (!ledger) {
    fail('STALENESS_MISSING_LEDGER', 'Contrato sem array schema_v2_since_baseline.');
    return { status: 'FAIL', issues };
  }

  const ledgerByFile = new Map();
  for (const entry of ledger) {
    if (!entry || typeof entry.change_file !== 'string') {
      fail('STALENESS_INVALID_ENTRY', 'Entrada de schema_v2_since_baseline sem change_file.');
      continue;
    }
    if (ledgerByFile.has(entry.change_file)) {
      fail('STALENESS_DUPLICATE_ENTRY', `Entrada duplicada para ${entry.change_file}.`, {
        change_file: entry.change_file,
      });
      continue;
    }
    ledgerByFile.set(entry.change_file, entry);
  }

  // 1. Every change file on disk must be classified.
  for (const disk of onDisk) {
    const entry = ledgerByFile.get(disk.change_file);
    if (!entry) {
      fail(
        'STALENESS_UNCLASSIFIED_CHANGE',
        `Schema V2 change ${disk.change_file} nao esta classificado em schema_v2_since_baseline. ` +
          'Contrato obsoleto: adicione a entrada com coverage + governance_state.',
        { change_file: disk.change_file },
      );
      continue;
    }

    if (entry.sha256 !== disk.sha256) {
      fail(
        'STALENESS_CONTENT_DRIFT',
        `Conteudo de ${disk.change_file} mudou (sha256 ${disk.sha256}) e diverge da entrada do contrato (${entry.sha256}). Revise e reconcilie.`,
        { change_file: disk.change_file },
      );
    }

    const declaredTargets = Array.isArray(entry.targets)
      ? [...entry.targets].map((name) => String(name).toLowerCase()).sort((a, b) => a.localeCompare(b))
      : null;
    if (!declaredTargets || declaredTargets.join('|') !== disk.targets.join('|')) {
      fail(
        'STALENESS_TARGET_DRIFT',
        `targets declarados para ${disk.change_file} divergem do DDL real. Esperado [${disk.targets.join(', ')}].`,
        { change_file: disk.change_file },
      );
    }

    if (!COVERAGE_CLASSES.includes(entry.coverage)) {
      fail('STALENESS_INVALID_ENUM', `coverage invalido em ${disk.change_file}: ${entry.coverage}.`, {
        change_file: disk.change_file,
      });
    }
    if (!PROVENANCE_STATES.includes(entry.governance_state)) {
      fail(
        'STALENESS_INVALID_ENUM',
        `governance_state invalido em ${disk.change_file}: ${entry.governance_state}.`,
        { change_file: disk.change_file },
      );
    }

    const touchesScoped = disk.targets.filter((name) => scopedTables.has(name));

    // 2. A change touching a contract-scoped table must be marked reflected.
    if (touchesScoped.length > 0 && entry.coverage !== 'REFLECTED_IN_CONTRACT') {
      fail(
        'STALENESS_SCOPED_TABLE_CHANGED',
        `${disk.change_file} altera tabela(s) do contrato [${touchesScoped.join(', ')}] mas coverage=${entry.coverage}. ` +
          'O contrato precisa refletir a mudanca (tables/relevant_indexes/schema_hash) e a entrada deve ser REFLECTED_IN_CONTRACT.',
        { change_file: disk.change_file },
      );
    }

    // 3. A "reflected" claim must be backed by scoped_tables coverage.
    if (entry.coverage === 'REFLECTED_IN_CONTRACT') {
      const uncovered = disk.targets.filter((name) => !scopedTables.has(name));
      if (uncovered.length > 0) {
        fail(
          'STALENESS_FALSE_COVERAGE',
          `${disk.change_file} declara REFLECTED_IN_CONTRACT mas [${uncovered.join(', ')}] nao esta em scoped_tables.`,
          { change_file: disk.change_file },
        );
      }
    }

    // 4. Governance floor: a reviewed manifest means it is at least apply-pending.
    const wiredManifest = manifestByFilePath.get(`${changesDir}/${disk.change_file}`);
    if (wiredManifest && !GOVERNED_STATES.includes(entry.governance_state)) {
      fail(
        'STALENESS_GOVERNANCE_FLOOR',
        `${disk.change_file} tem manifesto revisado (${wiredManifest}) mas governance_state=${entry.governance_state}. ` +
          'Deve ser REMOTE_APPLY_PENDING ou superior.',
        { change_file: disk.change_file },
      );
    }

    // 5. Claiming an applied state requires an in-repo evidence pointer that exists.
    if (APPLIED_STATES.includes(entry.governance_state)) {
      if (typeof entry.evidence !== 'string' || entry.evidence.trim() === '') {
        fail(
          'STALENESS_MISSING_EVIDENCE',
          `${disk.change_file} declara ${entry.governance_state} sem campo evidence.`,
          { change_file: disk.change_file },
        );
      } else if (!existsSync(path.resolve(rootDir, entry.evidence))) {
        fail(
          'STALENESS_MISSING_EVIDENCE',
          `${disk.change_file} aponta evidence inexistente: ${entry.evidence}.`,
          { change_file: disk.change_file },
        );
      }
    }
  }

  // 6. No ledger entry may point at a file that is not on disk.
  for (const entry of ledgerByFile.values()) {
    if (!onDiskByFile.has(entry.change_file)) {
      fail(
        'STALENESS_ORPHAN_ENTRY',
        `schema_v2_since_baseline referencia ${entry.change_file}, que nao existe em ${changesDir}.`,
        { change_file: entry.change_file },
      );
    }
  }

  // 7. Global digest pins the exact reviewed set + content.
  const digest = computeSchemaV2Digest(onDisk);
  if (guard.schema_v2_digest !== digest) {
    fail(
      'STALENESS_DIGEST_MISMATCH',
      `staleness_guard.schema_v2_digest divergente. Esperado no contrato ${guard.schema_v2_digest ?? '(ausente)'}, ` +
        `calculado do repo ${digest}. Reconcilie o contrato e atualize o digest.`,
    );
  }

  // 8. runtime_critical_uncovered entries must be well-formed and genuinely uncovered.
  const rcu = contract.runtime_critical_uncovered;
  if (rcu !== undefined) {
    if (!Array.isArray(rcu)) {
      fail('RCU_INVALID', 'runtime_critical_uncovered deve ser um array.');
    } else {
      for (const item of rcu) {
        for (const field of ['table', 'introduced_by', 'why_critical', 'blocked_on', 'tracking']) {
          if (!item || !item[field]) {
            fail('RCU_MISSING_FIELD', `runtime_critical_uncovered: campo ${field} obrigatorio.`);
          }
        }
        if (item && item.table && scopedTables.has(String(item.table).toLowerCase())) {
          fail(
            'RCU_ALREADY_COVERED',
            `runtime_critical_uncovered lista ${item.table}, que ja esta em scoped_tables.`,
          );
        }
        if (item && item.introduced_by && !onDiskByFile.has(item.introduced_by)) {
          fail(
            'RCU_UNKNOWN_SOURCE',
            `runtime_critical_uncovered: introduced_by ${item.introduced_by} nao existe em ${changesDir}.`,
          );
        }
      }
    }
  }

  return { status: issues.length > 0 ? 'FAIL' : 'PASS', issues };
}
