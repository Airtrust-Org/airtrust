import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('staging migrations 0467-0469 governance', () => {
  const migrations = [
    '0467_sigvoos_shadow_parallel_v1.sql',
    '0468_sigvoos_shadow_leg_crew_v1.sql',
    '0469_lms_completion_pendencias_snapshots.sql',
  ] as const;
  const legacyApplyScript = read('scripts/staging/apply-approved-migrations.sh');
  const recoveryApplyScript = read(
    'scripts/staging/apply-approved-migration-with-recovery-point.sh',
  );

  it('allowlists 0467-0469 and keeps recovery preflight scoped to its migration', () => {
    for (const migrationName of migrations) {
      expect(legacyApplyScript).toContain(`"${migrationName}"`);
      expect(recoveryApplyScript).toContain(`"${migrationName}"`);
    }
    expect(legacyApplyScript).toContain(
      'RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453,0454,0457,0459,0467,0468,0469,0470,0472,0475,0476,0481,0482"',
    );
    expect(recoveryApplyScript).toContain(
      'RELEASE_PREFLIGHT_SCOPE="${migration_basename%%_*}"',
    );
  });

  it('routes 0467-0469 through the atomic recovery-point runner', () => {
    expect(legacyApplyScript).toContain('0467_sigvoos_shadow_parallel_v1.sql');
    expect(legacyApplyScript).toContain('0468_sigvoos_shadow_leg_crew_v1.sql');
    expect(legacyApplyScript).toContain('0469_lms_completion_pendencias_snapshots.sql');
    expect(legacyApplyScript).toContain(
      'exec bash "$ROOT/scripts/staging/apply-approved-migration-with-recovery-point.sh"',
    );
    expect(recoveryApplyScript).toContain('buildLedgerAppliedSql');
    expect(recoveryApplyScript).toContain('d1 time-travel info');
    expect(recoveryApplyScript).toContain('LEDGER_ENTRY_CONFIRMED=');
    expect(recoveryApplyScript).toContain(
      'bash scripts/staging/validate-0467-postconditions.sh --target="$db_name"',
    );
    expect(recoveryApplyScript).toContain(
      'bash scripts/staging/validate-0468-postconditions.sh --target="$db_name"',
    );
    expect(recoveryApplyScript).toContain(
      'bash scripts/staging/validate-0469-postconditions.sh --target="$db_name"',
    );
  });

  it.each([
    ['0467', 'scripts/staging/validate-0467-postconditions.sh'],
    ['0468', 'scripts/staging/validate-0468-postconditions.sh'],
    ['0469', 'scripts/staging/validate-0469-postconditions.sh'],
  ])('keeps %s postconditions read-only and staging-only', (_prefix, path) => {
    const validator = read(path);
    expect(validator).toContain('ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"');
    expect(validator).toContain('BLOCKED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"');
    expect(validator).toContain('POSTCONDITIONS_OK');
    expect(validator).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
  });

  it('proves 0467 is additive and tenant-scoped', () => {
    const migration = read('worker-airtrust/migrations/0467_sigvoos_shadow_parallel_v1.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS sigvoos_shadow_runs');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS sigvoos_shadow_legs');
    expect(migration).toContain('empresa_id INTEGER NOT NULL');
    expect(migration).not.toMatch(/\b(DROP|DELETE|UPDATE|ALTER)\b/i);
  });

  it('proves 0468 is additive and tenant-scoped', () => {
    const migration = read('worker-airtrust/migrations/0468_sigvoos_shadow_leg_crew_v1.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS sigvoos_shadow_leg_crews');
    expect(migration).toContain('empresa_id INTEGER NOT NULL');
    expect(migration).toContain('crew_identity_key TEXT NOT NULL');
    expect(migration).not.toMatch(/\b(DROP|DELETE|UPDATE|ALTER)\b/i);
  });

  it('does not treat SQLite TEXT PRIMARY KEY as pragma notnull=1', () => {
    const validator = read('scripts/staging/validate-0468-postconditions.sh');
    expect(validator).toContain('shadow crew id is the declared primary key');
    expect(validator).toContain("WHERE name='id'");
    expect(validator).toContain('r?.pk!==1');
    expect(validator).not.toContain("'id','empresa_id','leg_id','run_id'");
  });

  it('proves 0469 is additive and tenant-scoped', () => {
    const migration = read('worker-airtrust/migrations/0469_lms_completion_pendencias_snapshots.sql');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS lms_completion_diagnostics_snapshots');
    expect(migration).toContain('empresa_id INTEGER NOT NULL');
    expect(migration).toContain('matricula_id INTEGER NOT NULL');
    expect(migration).toContain('curso_id INTEGER NOT NULL');
    expect(migration).toContain('diagnostics_json TEXT NOT NULL');
    expect(migration).toContain(
      'ON lms_completion_diagnostics_snapshots (empresa_id, matricula_id, curso_id, tentativa)',
    );
    expect(migration).not.toMatch(/\b(DROP|DELETE|UPDATE|ALTER)\b/i);
  });
});
