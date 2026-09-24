import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = join(workerRoot, '..');
const migrationsDir = join(workerRoot, 'migrations');
const productionDisabledMigrationsDir = join(workerRoot, 'migrations_production_disabled');
const migrationsDirPattern = /^\s*migrations_dir\s*=\s*"([^"]+)"/gm;
const experimentalMigrationPath = join(
  workerRoot,
  'migrations_experimental',
  '0410_experimental_regulated_records_core.sql',
);
const wranglerConfigPaths = [
  join(workerRoot, 'wrangler.toml'),
  join(workerRoot, 'wrangler.dev.toml'),
] as const;
const historicalFilenameExceptions = [
  '0098-indices-performance.sql',
  '132_add_funcionario_ativo.sql',
] as const;
const expectedTempTableFiles = [
  '0062_consolidate_ssot_preserve_data.sql',
  '0091_restore_diversidade_qualificacoes.sql',
  '0424_examiner_universal_training_fichas.sql',
] as const;
const expectedForeignKeysOffFiles = [
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

function readMigration(file: string): string {
  return readFileSync(join(migrationsDir, file), 'utf8');
}

function readConfiguredMigrationDirs(configPath: string): string[] {
  const config = readFileSync(configPath, 'utf8');
  return [...config.matchAll(migrationsDirPattern)].map(([, value]) => value);
}

function readPurityReport() {
  const guard = join(repoRoot, 'scripts', 'guard-migrations-dir-purity.mjs');
  const output = execFileSync(process.execPath, [guard, '--dry-run'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return JSON.parse(output) as {
    ok: boolean;
    candidateFiles: string[];
    violations: unknown[];
  };
}

describe('migration governance', () => {
  const files = listCanonicalMigrationFiles();

  it('accepts the real canonical directory through the shared purity guard', () => {
    const report = readPurityReport();
    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.candidateFiles).toEqual(files);
  });

  it('keeps only the immutable historical filename exceptions', () => {
    const canonicalName = /^[0-9]{4}_[a-z0-9_]+\.sql$/;
    const nonStandard = files.filter((file) => !canonicalName.test(file));
    expect(nonStandard).toEqual([...historicalFilenameExceptions]);
  });

  it('keeps the regular chain ratcheted and 9999 as the only high sentinel', () => {
    const regularPrefixes = files
      .map((file) => /^([0-9]{4})_/.exec(file)?.[1] ?? null)
      .filter((prefix): prefix is string => prefix !== null && prefix !== '9999');
    // Ratchet raised 2026-09-09: 0488_controle_voos_pilot_offline_sync_receipts.sql
    // adds the durable idempotency authority for Pilot offline synchronization.
    // Historical #110 numbers 0477-0480 are intentionally not backfilled.
    // 0489 adds tenant-scoped natural keys; 0490 restores simulator planning curriculum metadata.
    // 0491 adds the canonical training-compliance requirements matrix.
    // 0492 normalizes the canonical sector/function organization.
    // 0493 adds annual simulator curriculum cycles with a 2026=C2 rotation base.
    // 0494 adds tenant-scoped LMS enrollment reconciliation acknowledgements.
    // 0495 separates qualification identity from Initial/Periodic/Semiannual training programs.
    // 0496 completes the 120-minute durations required by Initial/Semiannual simulator curricula.
    // 0497 adds the optional aircraft-model qualifier used by training compliance rules.
    // 0498 adds FRMS V2; 0499 its historical backfill; 0500 adds the governed Controle de Voos navigation-point catalog.
    // 0501 adds the governed per-leg operational weight fields used by the Pilot RDV.
    // 0502 adds the governed Controle de Voos fueling-company catalog.
    // 0503 adds the governed Conhecimento Ativo foundation and XLSX import lineage.
    // 0504 adds the governed Controle de Voos operational model catalogs and flight identifiers.
    // 0505 adds the governed Conhecimento Ativo challenge cadence schema.
    // 0506 adds the governed Controle de Voos planning-deviation justification schema.
    // 0508 adds governed daily training-compliance snapshots.
    // 0509 adds the governed structured Controle de Voos flight-plan schema.
    // 0510 adds the governed Petrobras RVE daily-export identifiers.
    // 0511 adds tenant-scoped FRMS duty-boundary configuration.
    const expectedLatest = 511;
    expect(Math.max(...regularPrefixes.map(Number))).toBe(expectedLatest);

    const highSentinels = files.filter(
      (file) => /^([0-9]{4})_/.test(file) && !/^0[0-9]{3}_/.test(file),
    );
    expect(highSentinels).toEqual(['9999_add_modelo_sessao_id_to_agendamentos.sql']);
  });

  it('keeps experimental migrations outside the canonical chain', () => {
    expect(files.filter((file) => /experimental/i.test(file))).toEqual([]);
    expect(existsSync(experimentalMigrationPath)).toBe(true);
  });

  it('keeps dev canonical while staging/production are isolated from historical migrations', () => {
    const remoteConfigured = readConfiguredMigrationDirs(join(workerRoot, 'wrangler.toml'));
    expect(remoteConfigured).toEqual([
      './migrations',
      './migrations_staging_disabled',
      './migrations_production_disabled',
    ]);

    const localConfigured = readConfiguredMigrationDirs(join(workerRoot, 'wrangler.dev.toml'));
    expect(localConfigured.length).toBeGreaterThan(0);
    expect(localConfigured.every((value) => value === './migrations')).toBe(true);

    expect(
      readdirSync(productionDisabledMigrationsDir).filter((file) => file.endsWith('.sql')),
    ).toEqual([]);
    expect(remoteConfigured).not.toContain('./migrations_experimental');
  });

  it('keeps CREATE TEMP TABLE confined to its historical allowlist', () => {
    const pattern = /\bCREATE\s+TEMP\s+TABLE\b/i;
    const offenders = files.filter((file) => pattern.test(readMigration(file)));
    expect(offenders).toEqual([...expectedTempTableFiles]);
  });

  it('keeps PRAGMA foreign_keys = OFF confined to its historical allowlist', () => {
    const pattern = /\bPRAGMA\s+foreign_keys\s*=\s*OFF\b/i;
    const offenders = files.filter((file) => pattern.test(readMigration(file)));
    expect(offenders).toEqual([...expectedForeignKeysOffFiles]);
  });

  it('keeps operational and destructive SQL outside canonical migrations', () => {
    const forbiddenName = /rollback|purge|preflight|manual|diagnostic|diagnostico/i;
    const noGoMarker = /^\s*--\s*NO_GO_MIGRATION_PRODUCAO\s*$/m;
    const forbiddenNames = files.filter((file) => forbiddenName.test(file));
    const noGoFiles = files.filter((file) => noGoMarker.test(readMigration(file)));

    expect(forbiddenNames).toEqual([]);
    expect(noGoFiles).toEqual([]);
    expect(existsSync(join(repoRoot, 'scripts', 'sql', 'manual', 'destructive'))).toBe(true);
    expect(existsSync(join(repoRoot, 'scripts', 'sql', 'manual', 'no-go'))).toBe(true);
    expect(existsSync(join(repoRoot, 'scripts', 'sql', 'manual', 'archive'))).toBe(true);
  });
});
