#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationsDir = path.join(root, 'worker-airtrust', 'migrations');
const HISTORICAL_DUPLICATE_PREFIX_ALLOWLIST = {
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
  '0172': ['0172_create_treinamentos_planejados.sql', '0172_rollback_treinamentos.sql'],
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
  '0420': [
    '0420_notificacoes_log_add_empresa_id.sql',
    '0420_notificacoes_log_add_empresa_id_preflight_audit.sql',
    '0420_notificacoes_log_add_empresa_id_rollback.sql',
  ],
  '0437': [
    '0437_setores_gestores_gestor_id_optional.sql',
    '0437_setores_gestores_gestor_id_optional_rollback.sql',
  ],
  '0444': ['0444_controle_voos_versao.sql', '0444_controle_voos_versao_rollback.sql'],
  '0445': [
    '0445_simuladores_matriz_aw139_reconciliacao.sql',
    '0445_simuladores_matriz_aw139_reconciliacao_rollback.sql',
  ],
  '0446': [
    '0446_simuladores_matriz_aw139_reconciliacao_followup.sql',
    '0446_simuladores_matriz_aw139_reconciliacao_followup_rollback.sql',
  ],
  '0447': [
    '0447_simuladores_matriz_aw139_sk76_tipo_modelo.sql',
    '0447_simuladores_matriz_aw139_sk76_tipo_modelo_rollback.sql',
  ],
  '0448': [
    '0448_simuladores_matriz_aw139_sk76_gera_qualificacao.sql',
    '0448_simuladores_matriz_aw139_sk76_gera_qualificacao_rollback.sql',
  ],
  '0449': [
    '0449_simuladores_check_faps_reconciliacao.sql',
    '0449_simuladores_check_faps_reconciliacao_rollback.sql',
  ],
};

// Sufixos que denunciam um arquivo operacional (consulta manual read-only:
// preflight, auditoria de decisão, validação) disfarçado de migration —
// nunca deve viver em worker-airtrust/migrations/, pois o runner de
// migrations aplica todo arquivo .sql do diretório em sequência e o
// registra no ledger d1_migrations. Ver worker-airtrust/migrations_experimental
// para o padrão já usado para conteúdo fora da cadeia canônica, e
// scripts/validation/ para onde este tipo de arquivo deve viver (ex.:
// 0438's preflight, movido para
// scripts/validation/controle-voos-rdv-0438-preflight.sql).
//
// Deliberadamente casado como SUFIXO do nome (não substring livre): migrations
// reais e legítimas criam tabelas/colunas/índices de auditoria de negócio
// (ex.: 0102_admin_actions_audit.sql, 0332_create_audit_logs_compatible.sql)
// e não devem ser confundidas com um arquivo read-only de preflight.
const NON_MIGRATION_FILENAME_SUFFIXES = [
  '_preflight_audit.sql',
  '_preflight.sql',
  '_validation_only.sql',
  '_readonly.sql',
  '_read_only.sql',
];

// Arquivos anteriores a este guard, fora do escopo desta correção (PR #419
// cobre apenas 0438) — não renumerar/mover migrations antigas aqui. Registrado
// para que o guard não regrida silenciosamente se alguém reintroduzir o
// padrão em uma migration nova.
const HISTORICAL_NON_MIGRATION_FILENAME_ALLOWLIST = [
  '0420_notificacoes_log_add_empresa_id_preflight_audit.sql',
];

function findNonMigrationFiles(migrationFiles) {
  return migrationFiles.filter(
    (file) =>
      NON_MIGRATION_FILENAME_SUFFIXES.some((suffix) => file.toLowerCase().endsWith(suffix)) &&
      !HISTORICAL_NON_MIGRATION_FILENAME_ALLOWLIST.includes(file),
  );
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

function getChangedMigrationFiles() {
  const changed = new Set();

  try {
    const baseRef = execFileSync('git', ['rev-parse', '--verify', 'origin/main'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const diff = execFileSync(
      'git',
      [
        'diff',
        '--name-only',
        '--diff-filter=AMR',
        `${baseRef}...HEAD`,
        '--',
        'worker-airtrust/migrations',
      ],
      { encoding: 'utf8' },
    );
    diff
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => changed.add(path.basename(line)));
  } catch {
    // Fallback to local working tree only when origin/main is not available.
  }

  const status = execFileSync('git', ['status', '--short', '--', 'worker-airtrust/migrations'], {
    encoding: 'utf8',
  });
  status
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => changed.add(path.basename(line.slice(3))));

  return changed;
}

const byPrefix = new Map();

for (const file of files) {
  const match = file.match(/^(\d+)_/);
  if (!match) continue;
  const prefix = match[1];
  const bucket = byPrefix.get(prefix) || [];
  bucket.push(file);
  byPrefix.set(prefix, bucket);
}

const nonMigrationFiles = findNonMigrationFiles(files);
if (nonMigrationFiles.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        reason: 'non_migration_file_in_migrations_dir',
        files: nonMigrationFiles,
        hint: 'Preflight/audit/validation/read-only .sql files must live outside worker-airtrust/migrations/ (e.g. scripts/validation/) — they are not migrations and must never be applied or ledgered by the runner.',
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const changedFiles = getChangedMigrationFiles();
const duplicates = [...changedFiles]
  .map((file) => {
    const match = file.match(/^(\d+)_/);
    if (!match) return null;
    const siblings = byPrefix.get(match[1]) || [];
    if (siblings.length <= 1) return null;
    const allowlisted = HISTORICAL_DUPLICATE_PREFIX_ALLOWLIST[match[1]];
    if (
      allowlisted &&
      JSON.stringify([...siblings].sort()) === JSON.stringify([...allowlisted].sort())
    ) {
      return null;
    }
    return { prefix: match[1], files: siblings, allowlisted: allowlisted || null };
  })
  .filter(Boolean);

if (duplicates.length > 0) {
  console.error(JSON.stringify({ ok: false, duplicates }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checkedChangedFiles: [...changedFiles],
      total: files.length,
      historicalAllowlistPrefixes: Object.keys(HISTORICAL_DUPLICATE_PREFIX_ALLOWLIST).length,
    },
    null,
    2,
  ),
);
