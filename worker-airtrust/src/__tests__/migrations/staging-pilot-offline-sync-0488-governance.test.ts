import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = join(workerRoot, '..');
const readRepo = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('staging governance for Pilot offline sync receipts 0488', () => {
  it('allowlists 0488 only through its dedicated reviewed runner', () => {
    const dispatcher = readRepo('scripts/staging/apply-approved-migrations.sh');

    expect(dispatcher).toContain('"0488_controle_voos_pilot_offline_sync_receipts.sql"');
    expect(dispatcher).toContain('apply-0488-pilot-offline-sync-receipts.sh');
    expect(dispatcher).toContain(',0481,0482,0488"');
    expect(dispatcher).toContain('drift allowlist/dispatch');
  });

  it('pins staging apply to official staging, exact Schema V2 artifacts and dry-run default', () => {
    const runner = readRepo('scripts/staging/apply-0488-pilot-offline-sync-receipts.sh');

    expect(runner).toContain('ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"');
    expect(runner).toContain('ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"');
    expect(runner).toContain('BLOCKED_PRODUCTION_DB_ID=');
    expect(runner).toContain('SCHEMA_CHANGE_ID="controle-voos-pilot-offline-sync-receipts-0488"');
    expect(runner).toContain('cmp -s "$migration_arg" "$schema_sql_path"');
    expect(runner).toContain('SCHEMA_V2_FILE_HASH_MISMATCH');
    expect(runner).toContain('SCHEMA_V2_PLAN_HASH_MISMATCH');
    expect(runner).toContain('migration-ledger-preflight.mjs --scope="0488"');
    expect(runner).toContain('CV_OFFLINE_SYNC_RECEIPTS_SCHEMA_DRIFT');
    expect(runner).toContain('buildLedgerAppliedSql');
    expect(runner).toContain('DRY_RUN=true');
    expect(runner).toContain('REMOTE_WRITE_EXECUTED=false');
    expect(runner).toContain('CONFIRM_STAGING_SCHEMA_CHANGE');
    expect(runner).toContain('d1 time-travel info');
    expect(runner).toContain('TIME_TRAVEL_BOOKMARK_NOT_CONFIRMED');
    expect(runner).toContain('LEDGER_ENTRY_CONFIRMED=');
    expect(runner).toContain('validate-0488-pilot-offline-sync-receipts.sh');
    expect(runner).not.toContain('--env production');
  });

  it('requires existing Controle de Voos prerequisites before any 0488 apply', () => {
    const runner = readRepo('scripts/staging/apply-0488-pilot-offline-sync-receipts.sh');

    expect(runner).toContain('for prerequisite in cv_voos cv_rdv_operacional cv_voo_etapas usuarios');
    expect(runner).toContain('PREREQUISITE_TABLES_VALIDATED=true');
    expect(runner).toContain("table_count");
    expect(runner).toContain("ledger_count");
  });

  it('keeps 0488 staging postconditions strictly read-only and staging-only', () => {
    const validator = readRepo('scripts/staging/validate-0488-pilot-offline-sync-receipts.sh');

    expect(validator).toContain('ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"');
    expect(validator).toContain('cv_offline_sync_receipts');
    expect(validator).toContain('uq_cv_offline_sync_receipts_empresa_operation');
    expect(validator).toContain('idx_cv_offline_sync_receipts_voo_received');
    expect(validator).toContain('idx_cv_offline_sync_receipts_actor_device');
    expect(validator).toContain('GROUP BY empresa_id, client_operation_id HAVING COUNT(*) > 1');
    expect(validator).not.toContain('--file=');
    expect(validator).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
  });
});
