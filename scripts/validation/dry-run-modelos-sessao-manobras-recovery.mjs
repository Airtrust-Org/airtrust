#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SOURCE_MAP_PATH = path.join(
  ROOT,
  'scripts',
  'operations',
  'modelos-sessao-manobras-empresa6-source-map.json',
);

const EXPECTED_MODELS_TOTAL = 51;
const EXPECTED_RELATIONS_PER_MODEL = 22;
const EXPECTED_RELATIONS_TOTAL = EXPECTED_MODELS_TOTAL * EXPECTED_RELATIONS_PER_MODEL;
const EXPECTED_BLOCKED_MODELS = [];
const EXPECTED_PRE_APPLY_RELATIONS_TOTAL = EXPECTED_RELATIONS_TOTAL - EXPECTED_RELATIONS_PER_MODEL;
const OUT_OF_SCOPE_MODELS = new Set(['PILOT-MODELO-001']);
const BLOCKED_A139 = 'BLOQUEADO - A139_I_11_12_NAO_DETERMINISTICO';
const BLOCKED_CLASSIFICACAO = 'BLOQUEADO - CLASSIFICACAO A_B_AB NAO DETERMINISTICA';
const BLOCKED_RESTORE = 'BLOQUEADO — RESTORE MODELO_MANOBRA INSEGURO';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseWranglerJson(rawOutput) {
  const trimmed = rawOutput.trim();
  const arrayIndex = trimmed.indexOf('[');
  const objectIndex = trimmed.indexOf('{');
  const startIndex =
    arrayIndex === -1 ? objectIndex : objectIndex === -1 ? arrayIndex : Math.min(arrayIndex, objectIndex);

  if (startIndex === -1) {
    throw new Error(`Unable to parse Wrangler JSON output:\n${trimmed}`);
  }

  return JSON.parse(trimmed.slice(startIndex));
}

function runProductionQuery(sql) {
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'airtrust-db', '--env', 'production', '--remote', '--command', sql, '--json'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    },
  );

  const parsed = parseWranglerJson(output);
  const result = Array.isArray(parsed) ? parsed[0] : parsed;
  return {
    rows: result.results ?? [],
    meta: result.meta ?? {},
  };
}

function groupRowsByModel(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.modelo_codigo)) {
      grouped.set(row.modelo_codigo, []);
    }
    grouped.get(row.modelo_codigo).push(row);
  }
  return grouped;
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    return String(left).localeCompare(String(right));
  });
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
        reason.startsWith('full_restore_candidate_relations_') ||
        reason.startsWith('unresolved_models_present:') ||
        reason.includes('_preferred_complete_source_'),
    )
  ) {
    return BLOCKED_RESTORE;
  }

  if (abortReasons.some((reason) => reason.startsWith('classification_'))) {
    return BLOCKED_CLASSIFICACAO;
  }

  return BLOCKED_RESTORE;
}

function main() {
  const sourceMap = readJson(SOURCE_MAP_PATH);
  const resolvedRows = sourceMap.rows ?? [];
  const resolvedByModel = groupRowsByModel(resolvedRows);
  const unresolvedModels = sourceMap.unresolved_models ?? [];
  const allowlistModels = sourceMap.allowlist_models ?? [];
  const blockedModels = sourceMap.blocked_models ?? [];

  const { rows: productionModels } = runProductionQuery(`
    SELECT id, codigo, empresa_id
    FROM modelos_sessao
    WHERE deleted_at IS NULL
      AND COALESCE(ativo, 1) = 1
    ORDER BY empresa_id, codigo;
  `);
  const { rows: productionManobras } = runProductionQuery(`
    SELECT codigo, empresa_id
    FROM manobras
    WHERE deleted_at IS NULL
      AND empresa_id = 6
    ORDER BY codigo;
  `);
  const { rows: relationInventory } = runProductionQuery(`
    SELECT
      COUNT(*) AS total_rows,
      SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS active_rows
    FROM modelos_sessao_manobras;
  `);
  const { rows: signedZeroRows } = runProductionQuery(`
    SELECT COUNT(*) AS signed_zero_manobras
    FROM fichas_sessao fs
    LEFT JOIN fichas_sessao_manobras fsm
      ON fsm.ficha_id = fs.id
     AND fsm.deleted_at IS NULL
    WHERE fs.deleted_at IS NULL
      AND UPPER(COALESCE(fs.status, '')) IN ('ASSINADO', 'CONCLUIDO')
    GROUP BY fs.id
    HAVING COUNT(fsm.id) = 0;
  `);

  const company6Models = productionModels.filter((model) => Number(model.empresa_id) === 6);
  const company8Models = productionModels.filter((model) => Number(model.empresa_id) === 8);
  const productionModelCodes = new Set(company6Models.map((model) => model.codigo));
  const productionManobraCodes = new Set(productionManobras.map((manobra) => manobra.codigo));

  const abortReasons = [];
  const relationInventoryRow = relationInventory[0] ?? { total_rows: 0, active_rows: 0 };

  if (company6Models.length !== EXPECTED_MODELS_TOTAL) {
    abortReasons.push(
      `company6_active_models_expected_${EXPECTED_MODELS_TOTAL}_got_${company6Models.length}`,
    );
  }

  if (company8Models.some((model) => OUT_OF_SCOPE_MODELS.has(model.codigo)) === false) {
    abortReasons.push('out_of_scope_tenant8_model_missing_from_production_audit');
  }

  const activeRelationRows = Number(relationInventoryRow.active_rows || 0);
  const totalRelationRows = Number(relationInventoryRow.total_rows || 0);
  if (
    ![EXPECTED_PRE_APPLY_RELATIONS_TOTAL, EXPECTED_RELATIONS_TOTAL].includes(totalRelationRows) ||
    ![EXPECTED_PRE_APPLY_RELATIONS_TOTAL, EXPECTED_RELATIONS_TOTAL].includes(activeRelationRows)
  ) {
    abortReasons.push(
      `modelos_sessao_manobras_not_empty_total_${relationInventoryRow.total_rows}_active_${relationInventoryRow.active_rows}`,
    );
  }

  if ((signedZeroRows ?? []).length !== 0) {
    abortReasons.push(`signed_or_concluded_zero_manobras_expected_0_got_${signedZeroRows.length}`);
  }

  const resolvedModelCodes = sortedUnique([...resolvedByModel.keys()]);
  const resolvedCounts = [];
  const resolvedMissingModels = [];
  const resolvedMissingManobras = [];

  for (const [modelCode, rows] of resolvedByModel.entries()) {
    const ordens = sortedUnique(rows.map((row) => row.ordem));
    resolvedCounts.push({ modelo_codigo: modelCode, relacoes: rows.length });

    if (rows.length !== EXPECTED_RELATIONS_PER_MODEL) {
      abortReasons.push(`${modelCode}_expected_${EXPECTED_RELATIONS_PER_MODEL}_relations_got_${rows.length}`);
    }

    if (!productionModelCodes.has(modelCode)) {
      resolvedMissingModels.push(modelCode);
    }

    for (let index = 0; index < ordens.length; index += 1) {
      if (ordens[index] !== index + 1) {
        abortReasons.push(`${modelCode}_non_contiguous_ordens_${ordens.join('_')}`);
        break;
      }
    }

    for (const row of rows) {
      if (!productionManobraCodes.has(row.manobra_codigo)) {
        resolvedMissingManobras.push(`${modelCode}:${row.manobra_codigo}`);
      }
    }
  }

  if (resolvedModelCodes.length !== sourceMap.meta.restorableModels) {
    abortReasons.push(
      `resolved_model_count_mismatch_meta_${sourceMap.meta.restorableModels}_actual_${resolvedModelCodes.length}`,
    );
  }

  if (sourceMap.meta.modelsWithExpected22 !== resolvedModelCodes.length) {
    abortReasons.push(
      `modelsWithExpected22_mismatch_meta_${sourceMap.meta.modelsWithExpected22}_actual_${resolvedModelCodes.length}`,
    );
  }

  if (sourceMap.meta.relation_rows !== resolvedRows.length) {
    abortReasons.push(`relation_rows_mismatch_meta_${sourceMap.meta.relation_rows}_actual_${resolvedRows.length}`);
  }

  if (sourceMap.meta.relation_rows !== EXPECTED_RELATIONS_TOTAL) {
    abortReasons.push(
      `relation_rows_expected_${EXPECTED_RELATIONS_TOTAL}_got_${sourceMap.meta.relation_rows}`,
    );
  }

  if (sourceMap.meta.candidate_relation_rows !== EXPECTED_RELATIONS_TOTAL) {
    abortReasons.push(
      `candidate_relation_rows_expected_${EXPECTED_RELATIONS_TOTAL}_got_${sourceMap.meta.candidate_relation_rows}`,
    );
  }

  if (sourceMap.meta.classification_present_rows !== EXPECTED_RELATIONS_TOTAL) {
    abortReasons.push(
      `classification_present_rows_expected_${EXPECTED_RELATIONS_TOTAL}_got_${sourceMap.meta.classification_present_rows}`,
    );
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

  if (resolvedRows.length !== EXPECTED_RELATIONS_TOTAL) {
    abortReasons.push(
      `resolved_relation_rows_expected_${EXPECTED_RELATIONS_TOTAL}_got_${resolvedRows.length}`,
    );
  }

  if (resolvedMissingModels.length > 0) {
    abortReasons.push(`resolved_models_missing_in_production:${resolvedMissingModels.join(',')}`);
  }

  if (resolvedMissingManobras.length > 0) {
    abortReasons.push(`resolved_manobras_missing_in_production:${resolvedMissingManobras.join(',')}`);
  }

  if (sourceMap.meta.ready_for_full_restore !== true) {
    abortReasons.push('source_map_not_ready_for_full_restore');
  }

  if (sourceMap.meta.coverage_status !== 'READY_FOR_FULL_RESTORE') {
    abortReasons.push(`coverage_status_expected_READY_FOR_FULL_RESTORE_got_${sourceMap.meta.coverage_status}`);
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

  if (allowlistModels.length !== EXPECTED_MODELS_TOTAL) {
    abortReasons.push(`allowlist_models_expected_${EXPECTED_MODELS_TOTAL}_got_${allowlistModels.length}`);
  }

  if (
    blockedModels.length !== EXPECTED_BLOCKED_MODELS.length ||
    blockedModels.some((model, index) => model !== EXPECTED_BLOCKED_MODELS[index])
  ) {
    abortReasons.push(`blocked_models_expected_${EXPECTED_BLOCKED_MODELS.join(',')}_got_${blockedModels.join(',')}`);
  }

  const missingAllowlistModels = resolvedModelCodes.filter((modelCode) => !allowlistModels.includes(modelCode));
  if (missingAllowlistModels.length > 0) {
    abortReasons.push(`resolved_models_missing_from_allowlist:${missingAllowlistModels.join(',')}`);
  }

  const allowlistWithoutResolvedRows = allowlistModels.filter((modelCode) => !resolvedByModel.has(modelCode));
  if (allowlistWithoutResolvedRows.length > 0) {
    abortReasons.push(`allowlist_models_without_rows:${allowlistWithoutResolvedRows.join(',')}`);
  }

  const preferredConflictDetails = [];
  for (const unresolvedModel of unresolvedModels) {
    const preferred = unresolvedModel.source_candidates?.preferred_complete_source;
    const preferredRows = unresolvedModel.candidate_rows ?? [];
    const isExpectedBlockedModel = blockedModels.includes(unresolvedModel.modelo_codigo);

    if (!preferred) {
      abortReasons.push(`${unresolvedModel.modelo_codigo}_missing_preferred_complete_source_metadata`);
      continue;
    }

    if (!isExpectedBlockedModel && preferred.relation_rows !== EXPECTED_RELATIONS_PER_MODEL) {
      abortReasons.push(
        `${unresolvedModel.modelo_codigo}_preferred_complete_source_expected_${EXPECTED_RELATIONS_PER_MODEL}_got_${preferred.relation_rows}`,
      );
    }

    const missingCurrentManobras = preferredRows
      .filter((row) => !productionManobraCodes.has(row.manobra_codigo))
      .map((row) => row.manobra_codigo);
    const ambiguousCodeRows = preferredRows
      .filter((row) => ['ambiguous', 'missing'].includes(String(row.status_codigo ?? 'missing')))
      .map((row) => `${row.ordem}:${row.manobra_codigo}:${row.status_codigo ?? 'missing'}`);
    const ambiguousClassificationRows = preferredRows
      .filter((row) => ['ambiguous', 'missing'].includes(String(row.status_classificacao ?? 'missing')))
      .map((row) => `${row.ordem}:${row.manobra_codigo}:${row.status_classificacao ?? 'missing'}`);

    const duplicateOrdens = preferredRows
      .map((row) => row.ordem)
      .filter((ordem, index, values) => values.indexOf(ordem) !== index);

    const distinctOrdens = sortedUnique(preferredRows.map((row) => row.ordem));
    const nonContiguous = distinctOrdens.some((ordem, index) => ordem !== index + 1);
    const modelExistsInProduction = productionModelCodes.has(unresolvedModel.modelo_codigo);

    preferredConflictDetails.push({
      modelo_codigo: unresolvedModel.modelo_codigo,
      source: preferred.source,
      relation_rows: preferred.relation_rows,
      model_exists_in_production: modelExistsInProduction,
      missing_current_manobras: sortedUnique(missingCurrentManobras),
      ambiguous_code_rows: sortedUnique(ambiguousCodeRows),
      ambiguous_classification_rows: sortedUnique(ambiguousClassificationRows),
      duplicate_ordens: sortedUnique(duplicateOrdens),
      non_contiguous_ordens: nonContiguous ? distinctOrdens : [],
    });

    if (!modelExistsInProduction) {
      abortReasons.push(`${unresolvedModel.modelo_codigo}_missing_in_production_models_catalog`);
    }

    if (missingCurrentManobras.length > 0) {
      abortReasons.push(
        `${unresolvedModel.modelo_codigo}_preferred_complete_source_missing_current_manobras:${sortedUnique(missingCurrentManobras).join(',')}`,
      );
    }

    if (ambiguousCodeRows.length > 0) {
      abortReasons.push(
        `${unresolvedModel.modelo_codigo}_preferred_complete_source_code_not_deterministic:${sortedUnique(ambiguousCodeRows).join(',')}`,
      );
    }

    if (ambiguousClassificationRows.length > 0) {
      abortReasons.push(
        `${unresolvedModel.modelo_codigo}_preferred_complete_source_classification_not_deterministic:${sortedUnique(ambiguousClassificationRows).join(',')}`,
      );
    }

    if (!isExpectedBlockedModel && duplicateOrdens.length > 0) {
      abortReasons.push(
        `${unresolvedModel.modelo_codigo}_preferred_complete_source_duplicate_ordens:${sortedUnique(duplicateOrdens).join(',')}`,
      );
    }

    if (!isExpectedBlockedModel && nonContiguous) {
      abortReasons.push(
        `${unresolvedModel.modelo_codigo}_preferred_complete_source_non_contiguous_ordens:${distinctOrdens.join(',')}`,
      );
    }
  }

  const fullRestoreCandidateRelations =
    resolvedRows.length +
    preferredConflictDetails.reduce((total, item) => total + item.relation_rows, 0);

  if (
    blockedModels.some((model) => !EXPECTED_BLOCKED_MODELS.includes(model)) &&
    fullRestoreCandidateRelations !== EXPECTED_RELATIONS_TOTAL
  ) {
    abortReasons.push(
      `full_restore_candidate_relations_expected_${EXPECTED_RELATIONS_TOTAL}_got_${fullRestoreCandidateRelations}`,
    );
  }

  const summary = {
    status: abortReasons.length === 0 ? 'READY_FOR_FULL_RESTORE' : selectBlockedStatus(abortReasons),
    production: {
      active_models_company6: company6Models.length,
      active_models_company8: company8Models.length,
      active_manobras_company6: productionManobras.length,
      relation_rows_total: Number(relationInventoryRow.total_rows),
      relation_rows_active: Number(relationInventoryRow.active_rows),
      signed_or_concluded_zero_manobras: signedZeroRows.length,
    },
    source_map: {
      restorableModels: sourceMap.meta.restorableModels,
      modelsWithExpected22: sourceMap.meta.modelsWithExpected22,
      modelsWithSourceConflict: sourceMap.meta.modelsWithSourceConflict,
      allowlist_models: allowlistModels,
      blocked_models: blockedModels,
      ready_for_partial_restore: sourceMap.meta.ready_for_partial_restore,
      outOfScopeModels: sourceMap.meta.outOfScopeModels,
      ready_for_full_restore: sourceMap.meta.ready_for_full_restore,
      relation_rows: sourceMap.meta.relation_rows,
      candidate_relation_rows: sourceMap.meta.candidate_relation_rows,
      classification_present_rows: sourceMap.meta.classification_present_rows,
      classification_missing_rows: sourceMap.meta.classification_missing_rows,
      classification_ambiguous_rows: sourceMap.meta.classification_ambiguous_rows,
      coverage_status: sourceMap.meta.coverage_status,
    },
    dry_run: {
      resolved_models: resolvedModelCodes.length,
      resolved_relation_rows: resolvedRows.length,
      allowlist_models_total: allowlistModels.length,
      expected_models_total: EXPECTED_MODELS_TOTAL,
      expected_relation_rows_per_model: EXPECTED_RELATIONS_PER_MODEL,
      expected_relation_rows_total: EXPECTED_RELATIONS_TOTAL,
      candidate_relation_rows_if_full_restore: fullRestoreCandidateRelations,
      classification_summary: sourceMap.classification_summary ?? null,
      preferred_source_conflicts: preferredConflictDetails,
      resolved_counts_sample: resolvedCounts.slice(0, 8),
    },
    guardrails: {
      company8_relation_rows_expected: 0,
      signed_or_concluded_zero_manobras_expected: 0,
      delete_or_truncate_expected: 0,
      migrations_expected: 0,
    },
    abort_reasons: abortReasons,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (abortReasons.length > 0) {
    process.exitCode = 1;
  }
}

main();
