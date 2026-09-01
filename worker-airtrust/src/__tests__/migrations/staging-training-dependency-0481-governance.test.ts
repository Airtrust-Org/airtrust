import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = join(workerRoot, '..');

const readRepo = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('staging governance for training dependency migration 0481', () => {
  it('allowlists 0481 only through the dedicated recovery-point runner', () => {
    const runner = readRepo('scripts/staging/apply-approved-migrations.sh');

    expect(runner).toContain('"0481_training_dependency_planning.sql"');
    expect(runner).toContain('apply-0481-training-dependency-planning.sh');
    expect(runner).toContain('RELEASE_PREFLIGHT_SCOPE=');
    expect(runner).toContain(',0481"');
  });

  it('keeps the 0481 staging apply pinned to staging with dry-run, ledger and Time Travel recovery', () => {
    const runner = readRepo('scripts/staging/apply-0481-training-dependency-planning.sh');

    expect(runner).toContain('ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"');
    expect(runner).toContain('BLOCKED_PRODUCTION_DB_ID=');
    expect(runner).toContain('CONFIRM_STAGING_SCHEMA_CHANGE');
    expect(runner).toContain('migration-ledger-preflight.mjs --scope="0481"');
    expect(runner).toContain('buildLedgerAppliedSql');
    expect(runner).toContain('d1 time-travel info');
    expect(runner).toContain('validate-0481-postconditions.sh');
    expect(runner).not.toContain('--env production');
  });

  it('pins read-only 0481 postconditions to the official staging database', () => {
    const validator = readRepo('scripts/staging/validate-0481-postconditions.sh');

    expect(validator).toContain('ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"');
    expect(validator).toContain('trg_qualificacao_dependencia_after_insert');
    expect(validator).toContain('trg_treinamento_dependencia_evento_recalculate');
    expect(validator).toContain('qualificacao_origem_id=33');
    expect(validator).toContain('qualificacao_destino_id=106');
    expect(validator).toContain("name='0481_training_dependency_planning.sql'");
    expect(validator).not.toContain('--file=');
  });
});
