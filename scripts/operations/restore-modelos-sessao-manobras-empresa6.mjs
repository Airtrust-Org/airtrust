#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SOURCE_MAP_PATH = path.join(ROOT, 'scripts', 'operations', 'modelos-sessao-manobras-empresa6-source-map.json');
const EXPECTED_MODELS_TOTAL = 51;
const EXPECTED_RELATIONS_PER_MODEL = 22;
const EXPECTED_RELATIONS_TOTAL = EXPECTED_MODELS_TOTAL * EXPECTED_RELATIONS_PER_MODEL;
const EXPECTED_BLOCKED_MODELS = [];
const BLOCKED_A139 = 'BLOQUEADO - A139_I_11_12_NAO_DETERMINISTICO';
const BLOCKED_CLASSIFICACAO = 'BLOQUEADO - CLASSIFICACAO A_B_AB NAO DETERMINISTICA';
const BLOCKED_RESTORE = 'BLOQUEADO — RESTORE MODELO_MANOBRA INSEGURO';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function buildValuesSql(rows) {
  return rows
    .map(
      (row) =>
        `('${escapeSql(row.modelo_codigo)}','${escapeSql(row.manobra_codigo)}',${row.ordem},'${escapeSql(row.classificacao_tripulante ?? row.tripulante ?? 'AB')}')`,
    )
    .join(',\n    ');
}

function buildSqlStringArray(values) {
  return values.map((value) => `'${escapeSql(value)}'`).join(', ');
}

function buildRestoreSql(rows, allowlistModels, blockedModels) {
  const valuesSql = buildValuesSql(rows);
  const allowlistSql = buildSqlStringArray(allowlistModels);
  const blockedSql = buildSqlStringArray(blockedModels);
  const blockedModelsGuard =
    blockedModels.length > 0
      ? `SELECT COUNT(*) AS total
  FROM modelos_sessao
  WHERE deleted_at IS NULL
    AND COALESCE(ativo, 1) = 1
    AND empresa_id = 6
    AND codigo IN (${blockedSql})`
      : 'SELECT 0 AS total';
  return `
WITH source_rows(modelo_codigo, manobra_codigo, ordem, tripulante) AS (
  VALUES
    ${valuesSql}
),
guard_allowlist_models AS (
  SELECT COUNT(*) AS total
  FROM modelos_sessao
  WHERE deleted_at IS NULL
    AND COALESCE(ativo, 1) = 1
    AND empresa_id = 6
    AND codigo IN (${allowlistSql})
),
guard_blocked_models AS (
  ${blockedModelsGuard}
),
validated_rows AS (
  SELECT
    ms.id AS modelo_id,
    m.id AS manobra_id,
    sr.ordem,
    sr.tripulante
  FROM source_rows sr
  INNER JOIN modelos_sessao ms
    ON ms.codigo = sr.modelo_codigo
   AND ms.deleted_at IS NULL
   AND COALESCE(ms.ativo, 1) = 1
   AND ms.empresa_id = 6
  INNER JOIN manobras m
    ON m.codigo = sr.manobra_codigo
   AND m.deleted_at IS NULL
   AND m.empresa_id = 6
),
insertion_rows AS (
  SELECT
    vr.modelo_id,
    vr.manobra_id,
    vr.ordem,
    vr.tripulante
  FROM validated_rows vr
  WHERE NOT EXISTS (
    SELECT 1
    FROM modelos_sessao_manobras msm
    WHERE msm.modelo_id = vr.modelo_id
      AND msm.manobra_id = vr.manobra_id
      AND msm.deleted_at IS NULL
  )
)
INSERT INTO modelos_sessao_manobras (
  modelo_id,
  manobra_id,
  ordem,
  obrigatoria,
  observacoes,
  created_at,
  updated_at,
  tripulante
)
SELECT
  ir.modelo_id,
  ir.manobra_id,
  ir.ordem,
  1,
  NULL,
  datetime('now'),
  datetime('now'),
  ir.tripulante
FROM insertion_rows ir
WHERE (SELECT total FROM guard_allowlist_models) = ${EXPECTED_MODELS_TOTAL}
  AND (SELECT total FROM guard_blocked_models) = ${EXPECTED_BLOCKED_MODELS.length};
`.trim();
}

function validateSourceMap(sourceMap) {
  const abortReasons = [];
  const rows = sourceMap.rows ?? [];
  const unresolvedModels = sourceMap.unresolved_models ?? [];
  const allowlistModels = sourceMap.allowlist_models ?? [];
  const blockedModels = sourceMap.blocked_models ?? [];

  if (!sourceMap.meta.ready_for_full_restore) {
    abortReasons.push('source_map_not_ready_for_full_restore');
  }

  if (sourceMap.meta.restorableModels !== EXPECTED_MODELS_TOTAL) {
    abortReasons.push(
      `restorableModels_expected_${EXPECTED_MODELS_TOTAL}_got_${sourceMap.meta.restorableModels}`,
    );
  }

  if (sourceMap.meta.modelsWithExpected22 !== EXPECTED_MODELS_TOTAL) {
    abortReasons.push(
      `modelsWithExpected22_expected_${EXPECTED_MODELS_TOTAL}_got_${sourceMap.meta.modelsWithExpected22}`,
    );
  }

  if (sourceMap.meta.relation_rows !== EXPECTED_RELATIONS_TOTAL) {
    abortReasons.push(
      `relation_rows_expected_${EXPECTED_RELATIONS_TOTAL}_got_${sourceMap.meta.relation_rows}`,
    );
  }

  const resolvedClassification = sourceMap.classification_summary?.resolved_rows ?? null;
  if (!resolvedClassification) {
    abortReasons.push('missing_resolved_classification_summary');
  } else {
    if (resolvedClassification.total_rows !== EXPECTED_RELATIONS_TOTAL) {
      abortReasons.push(
        `resolved_classification_total_rows_expected_${EXPECTED_RELATIONS_TOTAL}_got_${resolvedClassification.total_rows}`,
      );
    }
    if (resolvedClassification.with_classificacao !== EXPECTED_RELATIONS_TOTAL) {
      abortReasons.push(
        `resolved_classification_present_rows_expected_${EXPECTED_RELATIONS_TOTAL}_got_${resolvedClassification.with_classificacao}`,
      );
    }
    if (resolvedClassification.missing !== 0) {
      abortReasons.push(`resolved_classification_missing_rows_expected_0_got_${resolvedClassification.missing}`);
    }
    if (resolvedClassification.ambiguous !== 0) {
      abortReasons.push(`resolved_classification_ambiguous_rows_expected_0_got_${resolvedClassification.ambiguous}`);
    }
  }

  if (rows.length !== EXPECTED_RELATIONS_TOTAL) {
    abortReasons.push(`row_payload_expected_${EXPECTED_RELATIONS_TOTAL}_got_${rows.length}`);
  }

  if (allowlistModels.length !== EXPECTED_MODELS_TOTAL) {
    abortReasons.push(`allowlist_models_expected_${EXPECTED_MODELS_TOTAL}_got_${allowlistModels.length}`);
  }

  if (
    blockedModels.length !== EXPECTED_BLOCKED_MODELS.length ||
    blockedModels.some((model, index) => model !== EXPECTED_BLOCKED_MODELS[index])
  ) {
    abortReasons.push(`blocked_models_expected_${EXPECTED_BLOCKED_MODELS.join(',')}_got_${blockedModels.join(',')}`);
  }

  if (sourceMap.meta.classification_missing_rows !== 0) {
    abortReasons.push(
      `classification_missing_rows_expected_0_got_${sourceMap.meta.classification_missing_rows}`,
    );
  }

  if (sourceMap.meta.classification_ambiguous_rows !== 0) {
    abortReasons.push(
      `classification_ambiguous_rows_expected_0_got_${sourceMap.meta.classification_ambiguous_rows}`,
    );
  }

  if (unresolvedModels.length !== 0) {
    abortReasons.push(`unresolved_models_expected_0_got_${unresolvedModels.length}`);
  }

  return abortReasons;
}

function selectBlockedStatus(abortReasons) {
  if (abortReasons.some((reason) => reason.includes('A139-I-11/12'))) {
    return BLOCKED_A139;
  }

  if (
    abortReasons.some(
      (reason) =>
        reason === 'source_map_not_ready_for_full_restore' ||
        reason.startsWith('restorableModels_') ||
        reason.startsWith('modelsWithExpected22_') ||
        reason.startsWith('candidate_relation_rows_') ||
        reason.startsWith('unresolved_models_present:'),
    )
  ) {
    return BLOCKED_RESTORE;
  }

  if (abortReasons.some((reason) => reason.startsWith('classification_'))) {
    return BLOCKED_CLASSIFICACAO;
  }

  return BLOCKED_RESTORE;
}

function parseArgs(argv) {
  const args = new Set(argv);
  const snapshotIndex = argv.indexOf('--snapshot-path');
  return {
    dryRun: args.has('--dry-run'),
    apply: args.has('--apply'),
    allowProductionWrite: args.has('--i-understand-production-write'),
    snapshotPath: snapshotIndex === -1 ? null : argv[snapshotIndex + 1] ?? null,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if ((options.dryRun && options.apply) || (!options.dryRun && !options.apply)) {
    process.stderr.write('Usage: node scripts/operations/restore-modelos-sessao-manobras-empresa6.mjs --dry-run|--apply\n');
    process.exit(2);
  }

  const sourceMap = readJson(SOURCE_MAP_PATH);
  const abortReasons = validateSourceMap(sourceMap);

  if (abortReasons.length > 0) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: selectBlockedStatus(abortReasons),
          mode: options.dryRun ? 'dry-run' : 'apply',
          abort_reasons: abortReasons,
        },
        null,
        2,
      )}\n`,
    );
    process.exit(1);
  }

  const sql = buildRestoreSql(sourceMap.rows, sourceMap.allowlist_models ?? [], sourceMap.blocked_models ?? []);

  if (options.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          status: 'READY_FOR_FULL_RESTORE',
          mode: 'dry-run',
          expected_models: EXPECTED_MODELS_TOTAL,
          expected_relations_per_model: EXPECTED_RELATIONS_PER_MODEL,
          expected_relations_total: EXPECTED_RELATIONS_TOTAL,
          blocked_models: sourceMap.blocked_models ?? [],
          allowlist_models: sourceMap.allowlist_models ?? [],
          sql_preview: sql,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (!options.snapshotPath) {
    process.stderr.write('Missing required --snapshot-path for --apply\n');
    process.exit(2);
  }

  if (!fs.existsSync(options.snapshotPath)) {
    process.stderr.write(`Snapshot path not found: ${options.snapshotPath}\n`);
    process.exit(2);
  }

  if (!options.allowProductionWrite) {
    process.stderr.write('Missing --i-understand-production-write for --apply\n');
    process.exit(2);
  }

  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'airtrust-db', '--env', 'production', '--remote', '--command', sql, '--json'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  process.stdout.write(output);
}

main();
