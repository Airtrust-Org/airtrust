import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const workflow = readFileSync(
  join(ROOT, '.github/workflows/staging-d1-schema-change.yml'),
  'utf8',
);
const runner = readFileSync(
  join(ROOT, 'scripts/staging/apply-approved-migration-with-recovery-point.sh'),
  'utf8',
);
const validate0453 = readFileSync(
  join(ROOT, 'scripts/staging/validate-0453-postconditions.sh'),
  'utf8',
);

describe('safe staging D1 schema change', () => {
  it('is manual, staging-gated and limited to the two EAD incident migrations', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('environment: staging');
    expect(workflow).toContain('AIRTRUST_STAGING_SCHEMA_CHANGE');
    expect(workflow).toContain('0453_ead_category_reconciliation_executor.sql');
    expect(workflow).toContain('0454_qualificacoes_tipos_dominio_override.sql');
    expect(workflow).toContain('CLOUDFLARE_D1_MIGRATION_API_TOKEN');
    expect(workflow).not.toContain('CLOUDFLARE_D1_BACKUP_API_TOKEN');
  });

  it('captures Time Travel before the only remote D1 write', () => {
    const recoveryIndex = runner.indexOf('d1 time-travel info');
    const writeIndex = runner.indexOf('--file="$combined_sql"');

    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(recoveryIndex);
    expect(runner).toContain('RECOVERY_POINT_CAPTURED=true');
    expect(runner).toContain('RECOVERY_TIMESTAMP_UTC=');
    expect(runner).not.toContain('d1 export');
    expect(runner).not.toContain('d1 time-travel restore');
    expect(runner).not.toContain('cat "$recovery_output"');
  });

  it('applies migration and ledger together and verifies idempotency', () => {
    expect(runner).toContain('buildLedgerAppliedSql');
    expect(runner).toContain('d1_migrations');
    expect(runner).toContain('MIGRATION_ALREADY_APPLIED_AND_VALIDATED');
    expect(runner).toContain('LEDGER_ENTRY_CONFIRMED');
    expect(runner).not.toContain('--file="../$migration_path"');
  });

  it('reports an already-applied rerun without inventing a recovery point', () => {
    const alreadyAppliedIndex = runner.indexOf('MIGRATION_ALREADY_APPLIED_AND_VALIDATED');
    const recoveryIndex = runner.indexOf('d1 time-travel info');

    expect(alreadyAppliedIndex).toBeGreaterThan(-1);
    expect(alreadyAppliedIndex).toBeLessThan(recoveryIndex);
    expect(runner).toContain('RECOVERY_TIMESTAMP_UTC=NOT_REQUIRED_ALREADY_APPLIED');
    expect(runner).toContain('RECOVERY_POINT_CAPTURED=false');
  });

  it('fails closed on target, path, confirmation and postconditions', () => {
    expect(runner).toContain('BLOCKED_PRODUCTION_DB_ID');
    expect(runner).toContain('expected_path="release/worker-airtrust/migrations/$migration_basename"');
    expect(runner).toContain('CONFIRM_STAGING_SCHEMA_CHANGE');
    expect(runner).toContain('migration-ledger-preflight.mjs');
    expect(runner).toContain('validate-0453-postconditions.sh');
    expect(runner).toContain('validate-0454-postconditions.sh');
  });

  it('validates the canonical qualifications history table name', () => {
    expect(validate0453).toContain("'qualificacoes_historico'");
    expect(validate0453).toContain('"qualificacoes_historico"');
    expect(validate0453).not.toContain('historico_qualificacoes');
  });

  it('keeps the reviewed open-PR anchor and green-check guard', () => {
    expect(workflow).toContain("if (pr.state === 'open')");
    expect(workflow).toContain('OPEN_PR_HEAD_MISMATCH');
    expect(workflow).toContain('RELEASE_CHECKS_NOT_GREEN');
    expect(workflow).toContain('PR_FROM_FORK_REJECTED');
  });
});
