import fs from 'node:fs';
import path from 'node:path';

export const CANONICAL_MIGRATION_NAME = /^[0-9]{4}_[a-z0-9_]+\.sql$/;
export const NO_GO_MARKER = /^\s*--\s*NO_GO_MIGRATION_PRODUCAO\s*$/m;

// These two files predate the four-digit naming policy and are already part of
// historical ledgers. They remain byte-for-byte untouched; no new exception is
// permitted without changing this exact allowlist in review.
export const HISTORICAL_FORWARD_FILENAME_ALLOWLIST = new Set([
  '0098-indices-performance.sql',
  '132_add_funcionario_ativo.sql',
]);

// Exact historical duplicate sets that already exist in deployed ledgers.
// Rollbacks, preflights and manual SQL are intentionally absent: those files
// belong outside worker-airtrust/migrations and are rejected by this guard.
export const HISTORICAL_DUPLICATE_PREFIX_ALLOWLIST = Object.freeze({
  '0049': ['0049_create_integrated_view.sql', '0049_qualificacoes_view_integrada.sql'],
  '0062': [
    '0062_consolidate_ssot_preserve_data.sql',
    '0062_ssot_extended_tables_triggers_indexes.sql',
  ],
  '0063': [
    '0063_align_qualificacoes_tipos_schema.sql',
    '0063_normalize_qualificacoes_historico_schema.sql',
  ],
  '0068': ['0068_enrich_and_fk.sql', '0068_reintroduce_fk_qualificacoes_historico.sql'],
  '0069': ['0069_create_view_qualificacoes_historico_v.sql', '0069_repoint_view_qualificacoes.sql'],
  '0092': [
    '0092_restore_data_chunk1.sql',
    '0092_restore_data_chunk2.sql',
    '0092_restore_data_chunk3.sql',
    '0092_restore_data_chunk4.sql',
    '0092_restore_data_chunk5.sql',
    '0092_restore_data_chunk6.sql',
    '0092_restore_real_data.sql',
    '0092_restore_real_data_notx.sql',
    '0092_restore_real_data_tipos.sql',
  ],
  '0093': ['0093_create_importacoes_log.sql', '0093_perf_indexes_qualificacoes.sql'],
  '0098': ['0098_add_certificado_arquivo_fk.sql', '0098_add_examinador_checks.sql'],
  '0107': ['0107_fix_historico_fks.sql', '0107_refactor_qualificacoes_historico.sql'],
  '0112': [
    '0112_add_missing_columns_qualificacoes_historico.sql',
    '0112_seed_qualificacoes_tipos_exemplo.sql',
  ],
  '0117': ['0117_create_modelos_aeronave.sql', '0117_fix_qualificacoes_tipos_trigger.sql'],
  '0137': ['0137_add_integrity_checks.sql', '0137_fix_certificados_completo.sql'],
  '0140': ['0140_add_simuladores_indexes.sql', '0140_fix_fk_modelos_sessao_manobras.sql'],
  '0144': ['0144_deprecate_sessoes_template.sql', '0144_integracao_edapp.sql'],
  '0145': ['0145_cleanup_obsolete_simuladores_tables.sql', '0145_integracao_edapp_dados_teste.sql'],
  '0150': [
    '0150_marcar_qualificacoes_renovadas.sql',
    '0150_multi_tenant_empresas.sql',
    '0150_refactor_aeronaves_remove_codigo.sql',
  ],
  '0151': ['0151_add_empresa_id_incremental.sql', '0151_migrate_aeronave_references.sql'],
  '0159': [
    '0159_add_gera_qualificacao_modelos_sessao.sql',
    '0159_remover_tipo_aeronave_modelos_sessao.sql',
  ],
  '0200': ['0200_performance_composite_indexes.sql', '0200_remove_unused_columns_historico.sql'],
  '0215': ['0215_frms_notas_resolucao.sql', '0215_frms_visual_thresholds.sql'],
  '0246': [
    '0246_enforce_tripulacao_unique_aeronave.sql',
    '0246_fix_vw_tripulante_operacional_guerra.sql',
  ],
  '0263': ['0263_backfill_manobras_descricao.sql', '0263_frms_effectiveness_thresholds.sql'],
  '0284': ['0284_fix_sk76_loft_check_0303.sql', '0284_frat_multilevel_bowtie_risk.sql'],
  '0320': ['0320_alertas_whatsapp_delivery_tracking.sql', '0320_treinamentos_convocacao_email.sql'],
  '0332': ['0332_create_audit_logs_compatible.sql', '0332_normalize_edapp_historical_renewals.sql'],
  '0340': ['0340_lms_cursos_ead_metadata.sql', '0340_perfis_permissoes.sql'],
  '0347': ['0347_lms_cursos_content_filename.sql', '0347_lms_edapp_tenant_indexes.sql'],
  '0362': ['0362_fichas_edicao_pos_finalizacao.sql', '0362_frms_daily_fatigue_v01.sql'],
  '0367': [
    '0367_classificar_dificuldade_sk76_restantes.sql',
    '0367_sk76_reaquisicao_experiencia_recente.sql',
  ],
});

function sameSortedMembers(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

export function classifyMigrationFilename(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith('rollback_') || lower.includes('_rollback')) return 'rollback';
  if (lower.includes('purge')) return 'purge';
  if (lower.includes('preflight')) return 'preflight';
  if (lower.includes('manual')) return 'manual_sql';
  if (lower.includes('diagnostic') || lower.includes('diagnostico')) return 'diagnostic_sql';
  return null;
}

export function inspectMigrationsDirectory(
  directory,
  {
    historicalFilenameAllowlist = HISTORICAL_FORWARD_FILENAME_ALLOWLIST,
    historicalDuplicateAllowlist = HISTORICAL_DUPLICATE_PREFIX_ALLOWLIST,
  } = {},
) {
  const absoluteDirectory = path.resolve(directory);
  const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
  const violations = [];
  const candidateFiles = [];
  const historicalFilenameExceptions = [];
  const byPrefix = new Map();

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(absoluteDirectory, entry.name);
    const stats = fs.lstatSync(fullPath);

    if (stats.isSymbolicLink()) {
      violations.push({ type: 'symlink', file: entry.name });
      continue;
    }
    if (!entry.isFile()) {
      violations.push({ type: 'unexpected_entry', file: entry.name });
      continue;
    }
    if (!entry.name.endsWith('.sql')) {
      violations.push({ type: 'non_sql_file', file: entry.name });
      continue;
    }

    const operationalType = classifyMigrationFilename(entry.name);
    if (operationalType) {
      violations.push({ type: operationalType, file: entry.name });
      continue;
    }

    const hasCanonicalName = CANONICAL_MIGRATION_NAME.test(entry.name);
    if (!hasCanonicalName && !historicalFilenameAllowlist.has(entry.name)) {
      violations.push({ type: 'invalid_filename', file: entry.name });
      continue;
    }
    if (!hasCanonicalName) historicalFilenameExceptions.push(entry.name);

    const content = fs.readFileSync(fullPath, 'utf8');
    if (NO_GO_MARKER.test(content)) {
      violations.push({ type: 'no_go_migration', file: entry.name });
      continue;
    }

    candidateFiles.push(entry.name);
    const prefix = entry.name.match(/^(\d{4})_/)?.[1];
    if (prefix) {
      const names = byPrefix.get(prefix) ?? [];
      names.push(entry.name);
      byPrefix.set(prefix, names);
    }
  }

  const historicalDuplicateExceptions = [];
  for (const [prefix, files] of [...byPrefix.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (files.length <= 1) continue;
    const allowed = historicalDuplicateAllowlist[prefix];
    if (allowed && sameSortedMembers(files, allowed)) {
      historicalDuplicateExceptions.push({ prefix, files: [...files].sort() });
      continue;
    }
    violations.push({ type: 'duplicate_prefix', prefix, files: [...files].sort() });
  }

  violations.sort((a, b) => {
    const left = `${a.type}:${a.file ?? a.prefix ?? ''}`;
    const right = `${b.type}:${b.file ?? b.prefix ?? ''}`;
    return left.localeCompare(right);
  });

  return {
    ok: violations.length === 0,
    directory: absoluteDirectory,
    candidateFiles: candidateFiles.sort(),
    historicalFilenameExceptions: historicalFilenameExceptions.sort(),
    historicalDuplicateExceptions,
    violations,
  };
}
