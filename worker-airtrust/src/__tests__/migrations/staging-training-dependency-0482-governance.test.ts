import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = join(workerRoot, '..');
const readRepo = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('staging governance for training dependency migration 0482', () => {
  it('allowlists 0482 only through its dedicated reviewed Schema V2 runner', () => {
    const dispatcher = readRepo('scripts/staging/apply-approved-migrations.sh');

    expect(dispatcher).toContain('"0482_training_dependency_complete_curriculum.sql"');
    expect(dispatcher).toContain('apply-0482-training-dependency-complete-curriculum.sh');
    expect(dispatcher).toContain(',0481,0482"');
  });

  it('pins 0482 staging apply to official staging, exact reviewed SQL and 0481 prerequisite', () => {
    const runner = readRepo('scripts/staging/apply-0482-training-dependency-complete-curriculum.sh');

    expect(runner).toContain('ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"');
    expect(runner).toContain('BLOCKED_PRODUCTION_DB_ID=');
    expect(runner).toContain('CONFIRM_STAGING_SCHEMA_CHANGE');
    expect(runner).toContain('PREREQUISITE_MIGRATION="0481_training_dependency_planning.sql"');
    expect(runner).toContain('PREREQUISITE_0481_VALIDATED=true');
    expect(runner).toContain('SCHEMA_CHANGE_ID="training-dependency-complete-curriculum-0482"');
    expect(runner).toContain('schema-v2/changes/$MIGRATION_BASENAME');
    expect(runner).toContain('cmp -s "$migration_arg" "$schema_sql_path"');
    expect(runner).toContain('SCHEMA_V2_FILE_HASH_MISMATCH');
    expect(runner).toContain('migration-ledger-preflight.mjs --scope="0482"');
    expect(runner).toContain('buildLedgerAppliedSql');
    expect(runner).toContain('d1 time-travel info');
    expect(runner).toContain('TIME_TRAVEL_BOOKMARK_NOT_CONFIRMED');
    expect(runner).toContain('LEDGER_ENTRY_CONFIRMED=');
    expect(runner).toContain('validate-0482-postconditions.sh');
    expect(runner).not.toContain('--env production');
  });

  it('keeps 0482 postconditions read-only, staging-only and curriculum-complete', () => {
    const validator = readRepo('scripts/staging/validate-0482-postconditions.sh');

    expect(validator).toContain('ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"');
    expect(validator).toContain("name='0481_training_dependency_planning.sql'");
    expect(validator).toContain("name='trg_training_dependency_plan_enrich'");
    expect(validator).toContain("name='0482_training_dependency_complete_curriculum.sql'");
    expect(validator).toContain("'$.materialization_strategy'");
    expect(validator).toContain("'TRAINING_PLAN_REQUIRED'");
    expect(validator).toContain("'$.curriculum_total_sessions'");
    expect(validator).toContain("'$.curriculum_model_ids'");
    expect(validator).toContain("'$.participants[0].session_model_ids'");
    expect(validator).not.toContain('--file=');
    expect(validator).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
  });
});
