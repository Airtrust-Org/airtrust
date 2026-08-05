import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationsDir = join(workerRoot, 'migrations');
const repoRoot = join(workerRoot, '..');
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
  '0068': [
    '0068_enrich_and_fk.sql',
    '0068_reintroduce_fk_qualificacoes_historico.sql',
  ],
  '0069': [
    '0069_create_view_qualificacoes_historico_v.sql',
    '0069_repoint_view_qualificacoes.sql',
  ],
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
  '0145': [
    '0145_cleanup_obsolete_simuladores_tables.sql',
    '0145_integracao_edapp_dados_teste.sql',
  ],
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
  '0200': [
    '0200_performance_composite_indexes.sql',
    '0200_remove_unused_columns_historico.sql',
  ],
  '0215': ['0215_frms_notas_resolucao.sql', '0215_frms_visual_thresholds.sql'],
  '0246': [
    '0246_enforce_tripulacao_unique_aeronave.sql',
    '0246_fix_vw_tripulante_operacional_guerra.sql',
  ],
  '0263': [
    '0263_backfill_manobras_descricao.sql',
    '0263_frms_effectiveness_thresholds.sql',
  ],
  '0284': ['0284_fix_sk76_loft_check_0303.sql', '0284_frat_multilevel_bowtie_risk.sql'],
  '0320': [
    '0320_alertas_whatsapp_delivery_tracking.sql',
    '0320_treinamentos_convocacao_email.sql',
  ],
  '0332': [
    '0332_create_audit_logs_compatible.sql',
    '0332_normalize_edapp_historical_renewals.sql',
  ],
  '0340': ['0340_lms_cursos_ead_metadata.sql', '0340_perfis_permissoes.sql'],
  '0347': ['0347_lms_cursos_content_filename.sql', '0347_lms_edapp_tenant_indexes.sql'],
  '0362': ['0362_fichas_edicao_pos_finalizacao.sql', '0362_frms_daily_fatigue_v01.sql'],
  '0367': [
    '0367_classificar_dificuldade_sk76_restantes.sql',
    '0367_sk76_reaquisicao_experiencia_recente.sql',
  ],
} as const;

const EXPECTED_NON_STANDARD_FILES = [
  '0098-indices-performance.sql',
  '132_add_funcionario_ativo.sql',
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
  '0455_aeronaves_codigo_tenant_active_unique.sql',
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
      const prefix = /^([0-9]{4})_/.exec(file)?.[1];
      if (!prefix) continue;
      prefixMap.set(prefix, [...(prefixMap.get(prefix) || []), file]);
    }
    const duplicates = Object.fromEntries(
      [...prefixMap.entries()]
        .filter(([, migrationFiles]) => migrationFiles.length > 1)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    expect(duplicates).toEqual(EXPECTED_DUPLICATE_PREFIXES);
  });

  it('keeps only the two immutable historical filename exceptions', () => {
    const nonStandard = files.filter(
      (file) => !/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(file),
    );
    expect(nonStandard).toEqual([...EXPECTED_NON_STANDARD_FILES]);
  });

  it('keeps the regular chain ratcheted and 9999 as the only high sentinel', () => {
    const regularPrefixes = files
      .map((file) => /^([0-9]{4})_/.exec(file)?.[1] || null)
      .filter((prefix): prefix is string => prefix !== null && prefix !== '9999');
    const expectedLatest = files.includes('0456_lms_h5p_course_binding.sql') ? 456 : 455;
    expect(Math.max(...regularPrefixes.map(Number))).toBe(expectedLatest);
    expect(
      files.filter((file) => /^([0-9]{4})_/.test(file) && !/^0[0-9]{3}_/.test(file)),
    ).toEqual(['9999_add_modelo_sessao_id_to_agendamentos.sql']);
  });

  it('keeps experimental migrations outside the canonical production chain', () => {
    expect(files.filter((file) => /experimental/i.test(file))).toEqual([]);
    expect(existsSync(experimentalMigrationPath)).toBe(true);
  });

  it('keeps Wrangler configured to the canonical migrations folder', () => {
    for (const configPath of wranglerConfigPaths) {
      const configured = [
        ...readFileSync(configPath, 'utf8').matchAll(
          /^\s*migrations_dir\s*=\s*"([^"]+)"/gm,
        ),
      ].map(([, value]) => value);
      expect(configured.length).toBeGreaterThan(0);
      expect(configured.every((value) => value === './migrations')).toBe(true);
      expect(configured).not.toContain('./migrations_experimental');
    }
  });

  it('keeps CREATE TEMP TABLE confined to its historical allowlist', () => {
    const offenders = files.filter((file) =>
      /\bCREATE\s+TEMP\s+TABLE\b/i.test(readFileSync(join(migrationsDir, file), 'utf8')),
    );
    expect(offenders).toEqual([...EXPECTED_CREATE_TEMP_TABLE_FILES]);
  });

  it('keeps PRAGMA foreign_keys = OFF confined to its historical allowlist', () => {
    const offenders = files.filter((file) =>
      /\bPRAGMA\s+foreign_keys\s*=\s*OFF\b/i.test(
        readFileSync(join(migrationsDir, file), 'utf8'),
      ),
    );
    expect(offenders).toEqual([...EXPECTED_FOREIGN_KEYS_OFF_FILES]);
  });

  it('keeps rollback, purge, preflight, manual and NO_GO SQL outside canonical migrations', () => {
    const forbiddenName = /rollback|purge|preflight|manual|diagnostic|diagnostico/i;
    const noGoMarker = /^\s*--\s*NO_GO_MIGRATION_PRODUCAO\s*$/m;
    expect(files.filter((file) => forbiddenName.test(file))).toEqual([]);
    expect(
      files.filter((file) => noGoMarker.test(readFileSync(join(migrationsDir, file), 'utf8'))),
    ).toEqual([]);
    expect(existsSync(join(repoRoot, 'scripts', 'sql', 'manual', 'destructive'))).toBe(true);
    expect(existsSync(join(repoRoot, 'scripts', 'sql', 'manual', 'no-go'))).toBe(true);
  });
});
