import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationsDir = join(workerRoot, 'migrations');
const experimentalMigrationPath = join(
  workerRoot,
  'migrations_experimental',
  '0410_experimental_regulated_records_core.sql',
);
const wranglerConfigPaths = [
  join(workerRoot, 'wrangler.toml'),
  join(workerRoot, 'wrangler.dev.toml'),
] as const;

const EXPECTED_DUPLICATE_PREFIXES = {
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
  '0418': [
    '0418_notechs_codigos_categorizados.sql',
    '0418_notechs_codigos_categorizados_rollback.sql',
  ],
  '0419': [
    '0419_normalizar_nomes_modelos_sessao_ptbr.sql',
    '0419_normalizar_nomes_modelos_sessao_ptbr_rollback.sql',
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
} as const;

const EXPECTED_NON_STANDARD_FILES = [
  '0098-indices-performance.sql',
  '132_add_funcionario_ativo.sql',
  'purge-soft-deleted-qualificacoes.sql',
  // 0438's rollback deliberately does NOT start with digits: it must never
  // be a candidate for duplicate-prefix detection, and must never be picked
  // up by any tool that walks migrations by numeric prefix order.
  'rollback_0438_controle_voos_rdv_coordenacao_workflow.sql',
  // Mesmo padrão para 0439 (guias do instrutor) — renomeado de
  // '0439_guias_instrutor_simulador_rollback.sql' (sufixo, colidia com a
  // detecção de prefixo duplicado) para 'rollback_0439_...' (prefixo).
  'rollback_0439_guias_instrutor_simulador.sql',
] as const;

const EXPECTED_CREATE_TEMP_TABLE_FILES = [
  '0062_consolidate_ssot_preserve_data.sql',
  '0091_restore_diversidade_qualificacoes.sql',
  '0424_examiner_universal_training_fichas.sql',
] as const;

const EXPECTED_FOREIGN_KEYS_OFF_FILES = [
  '0059_funcionarios_schema_parity.sql',
  '0063_align_qualificacoes_tipos_schema.sql',
  '0070_cleanup_funcionarios_old_fk.sql',
  '0133_fix_funcionarios_old_fk_refs.sql',
  '0134_fix_funcionarios_old_nuclear.sql',
  '0135_remove_triggers.sql',
  '0136_rebuild_all_funcionarios_old_refs.sql',
  '0218_frms_fix_check_constraints.sql',
  '0219_frms_notificacao_destinatario_hardening.sql',
  '0227_cleanup_backup_tables.sql',
  '0255_allow_null_aeronave_em_alocacoes.sql',
  '0256_situacoes_sem_aeronave.sql',
  '0276_fix_licencas_funcionario_id_integer.sql',
  '0325_expand_tipo_treinamento_semestral.sql',
  '0341_lms_pdf_pptx.sql',
  '0351_frms_jornada_origem_sigvoos.sql',
  '0396_harden_empresa_id_wave1.sql',
  '0397_harden_empresa_id_wave2.sql',
  '0399_harden_empresa_id_wave3.sql',
  '0402_harden_empresa_id_wave4.sql',
  '0437_setores_gestores_gestor_id_optional.sql',
  '0437_setores_gestores_gestor_id_optional_rollback.sql',
] as const;

function listCanonicalMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

describe('migration governance', () => {
  const files = listCanonicalMigrationFiles();

  it('pins the historical duplicate-prefix allowlist for canonical migrations', () => {
    const prefixMap = new Map<string, string[]>();

    for (const file of files) {
      const match = /^([0-9]{4})_/.exec(file);
      if (!match) continue;
      const prefix = match[1];
      prefixMap.set(prefix, [...(prefixMap.get(prefix) || []), file]);
    }

    const duplicates = Object.fromEntries(
      [...prefixMap.entries()]
        .filter(([, migrationFiles]) => migrationFiles.length > 1)
        .sort(([a], [b]) => a.localeCompare(b)),
    );

    expect(duplicates).toEqual(EXPECTED_DUPLICATE_PREFIXES);
  });

  it('pins the historical non-standard filename allowlist', () => {
    const nonStandard = files.filter((file) => !/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(file));
    expect(nonStandard).toEqual([...EXPECTED_NON_STANDARD_FILES]);
  });

  it('keeps 9999 as the only reserved high-prefix sentinel above the regular chain', () => {
    const numericPrefixes = files
      .map((file) => /^([0-9]{4})_/.exec(file)?.[1] || null)
      .filter((prefix): prefix is string => prefix !== null);

    const regularPrefixes = numericPrefixes.filter((prefix) => prefix !== '9999');
    const highPrefixes = files.filter(
      (file) => /^([0-9]{4})_/.test(file) && !/^0[0-9]{3}_/.test(file),
    );

    // Ratchet raised 2026-07-20: 0438 controle-voos RDV coordenacao workflow.
    // Ratchet raised 2026-07-21: 0439 guias_instrutor_simulador (renumerado de
    // 0438 para nao colidir com a migration do RDV, ja mergeada em main).
    // Ratchet raised 2026-07-21: 0440 simuladores_matriz_versionada_metadata.
    // Ratchet raised 2026-07-22: 0441 simuladores_matriz_manobra_resolution.
    // Ratchet raised 2026-07-22: 0442 simuladores_matriz_guia_relink (separate,
    // small, atomic executor for the 51 guia-instrutor links only).
    // Ratchet raised 2026-07-25: 0443 simuladores_matriz_remediation_compensation
    // (append-only overlay + ledger for the 5 LEGACY_EQUIVALENT compensation).
    // Ratchet raised 2026-07-25: 0444 controle_voos_versao (CAS otimista em
    // cv_voos, append-only ADD COLUMN com DEFAULT constante).
    // Ratchet raised 2026-07-27: 0445 simuladores_matriz_aw139_reconciliacao
    // (rename 30 AW139 current models, retire 7 duplicate-current rows,
    // carry FAP check-links forward — ID-scoped, guarded, additive).
    expect(Math.max(...regularPrefixes.map(Number))).toBe(445);
    expect(highPrefixes).toEqual(['9999_add_modelo_sessao_id_to_agendamentos.sql']);
  });

  it('keeps experimental migrations outside the canonical production migration chain', () => {
    const experimentalFilesInCanonicalChain = files.filter((file) => /experimental/i.test(file));

    expect(experimentalFilesInCanonicalChain).toEqual([]);
    expect(existsSync(experimentalMigrationPath)).toBe(true);
  });

  it('keeps Wrangler D1 migrations configured to the canonical migrations folder', () => {
    for (const configPath of wranglerConfigPaths) {
      const configuredMigrationDirs = [
        ...readFileSync(configPath, 'utf8').matchAll(/^\s*migrations_dir\s*=\s*"([^"]+)"/gm),
      ].map(([, migrationsDir]) => migrationsDir);

      expect(configuredMigrationDirs.length).toBeGreaterThan(0);
      expect(
        configuredMigrationDirs.every((migrationsDir) => migrationsDir === './migrations'),
      ).toBe(true);
      expect(configuredMigrationDirs).not.toContain('./migrations_experimental');
    }
  });

  it('keeps CREATE TEMP TABLE confined to the documented historical allowlist', () => {
    const offenders = files.filter((file) =>
      /\bCREATE\s+TEMP\s+TABLE\b/i.test(readFileSync(`${migrationsDir}/${file}`, 'utf8')),
    );

    expect(offenders).toEqual([...EXPECTED_CREATE_TEMP_TABLE_FILES]);
  });

  it('keeps PRAGMA foreign_keys = OFF confined to the documented historical allowlist', () => {
    const offenders = files.filter((file) =>
      /\bPRAGMA\s+foreign_keys\s*=\s*OFF\b/i.test(readFileSync(`${migrationsDir}/${file}`, 'utf8')),
    );

    expect(offenders).toEqual([...EXPECTED_FOREIGN_KEYS_OFF_FILES]);
  });

  // Achado do PR #419: 0438's preflight (consulta read-only para decisão
  // manual do operador, sem ALTER/CREATE) vivia em worker-airtrust/migrations/
  // e era registrada no ledger d1_migrations como se fosse uma migration de
  // verdade. Movida para scripts/validation/controle-voos-rdv-0438-preflight.sql.
  // Este teste garante que o padrão não volte a aparecer sem passar por uma
  // decisão explícita (a única exceção histórica é 0420, anterior a este guard).
  it('keeps preflight/audit/validation-only read-only files out of the canonical migrations dir', () => {
    const NON_MIGRATION_FILENAME_SUFFIXES = [
      '_preflight_audit.sql',
      '_preflight.sql',
      '_validation_only.sql',
      '_readonly.sql',
      '_read_only.sql',
    ];
    const HISTORICAL_ALLOWLIST = ['0420_notificacoes_log_add_empresa_id_preflight_audit.sql'];

    const offenders = files.filter(
      (file) =>
        NON_MIGRATION_FILENAME_SUFFIXES.some((suffix) => file.toLowerCase().endsWith(suffix)) &&
        !HISTORICAL_ALLOWLIST.includes(file),
    );

    expect(offenders).toEqual([]);
  });
});
