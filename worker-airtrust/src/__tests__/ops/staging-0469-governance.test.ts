import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

describe('staging migration 0469 governance', () => {
  const migrationName = '0469_lms_completion_pendencias_snapshots.sql';
  const legacyApplyScript = read('scripts/staging/apply-approved-migrations.sh');
  const recoveryApplyScript = read(
    'scripts/staging/apply-approved-migration-with-recovery-point.sh',
  );
  const validator = read('scripts/staging/validate-0469-postconditions.sh');
  const migration = read(`worker-airtrust/migrations/${migrationName}`);

  it('allowlists 0469 in both staging runners and preflight scopes', () => {
    expect(legacyApplyScript).toContain(`"${migrationName}"`);
    expect(legacyApplyScript).toContain(
      'RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453,0454,0457,0459,0469"',
    );
    expect(recoveryApplyScript).toContain(`"${migrationName}"`);
    expect(recoveryApplyScript).toContain(
      'RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453,0454,0461,0462,0466,0469"',
    );
  });

  it('routes 0469 through the atomic recovery-point runner', () => {
    expect(legacyApplyScript).toContain(
      'if [[ "$migration_basename" == "0469_lms_completion_pendencias_snapshots.sql" ]]',
    );
    expect(legacyApplyScript).toContain(
      'exec bash "$ROOT/scripts/staging/apply-approved-migration-with-recovery-point.sh"',
    );
    expect(recoveryApplyScript).toContain('buildLedgerAppliedSql');
    expect(recoveryApplyScript).toContain('d1 time-travel info');
    expect(recoveryApplyScript).toContain('LEDGER_ENTRY_CONFIRMED=');
    expect(recoveryApplyScript).toContain(
      'bash scripts/staging/validate-0469-postconditions.sh --target="$db_name"',
    );
  });

  it('runs a read-only validator that proves tenant keys and index uniqueness', () => {
    expect(validator).toContain('ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"');
    expect(validator).toContain('BLOCKED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"');
    expect(validator).toContain("pragma_index_list('lms_completion_diagnostics_snapshots')");
    expect(validator).toContain("name='idx_lms_completion_diag_unique' AND \"unique\"=1");
    expect(validator).toContain("pragma_index_info('idx_lms_completion_diag_unique')");
    expect(validator).toContain('empresa_id,matricula_id,curso_id,tentativa');
    expect(validator).toContain('POSTCONDITIONS_OK');
    expect(validator).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
  });

  it('proves the migration is additive and tenant-scoped', () => {
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
