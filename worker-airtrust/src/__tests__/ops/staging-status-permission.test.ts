import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

describe('staging release GitHub token permissions', () => {
  it('grants read access to commit check runs used by the release guard', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');
    const permissions = workflow.slice(
      workflow.indexOf('\npermissions:'),
      workflow.indexOf('\nenv:'),
    );
    const releaseGateVerifier = readFileSync(
      join(ROOT, 'scripts/ci/verify-release-gates.mjs'),
      'utf8',
    );

    expect(workflow).toContain('verify-release-gates.mjs');
    expect(releaseGateVerifier).toContain('/commits/${encodedSha}/check-runs');
    expect(permissions).toContain('checks: read');
  });

  it('limits the release ledger preflight to the exact approved release migrations', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(workflow).toContain('APPROVED_MIGRATIONS: ${{ inputs.approved_migrations }}');
    expect(workflow).toContain('--migrations-dir=release/worker-airtrust/migrations');
    expect(workflow).toContain('--scope="$scope_csv"');
    expect(workflow).toContain('release/worker-airtrust/migrations/$migration');
    expect(workflow).not.toContain(
      'migration-ledger-preflight.mjs --scope=0467,0468,0469,0470,0472,0475,0476,0477,0478,0479,0480',
    );
  });

  it('supplies the explicit backup confirmation for each governed migration backup', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');
    const applyMigrations = workflow.slice(
      workflow.indexOf('  apply-migrations:'),
      workflow.indexOf('  postconditions:'),
    );

    expect(applyMigrations).toContain('CONFIRM_STAGING_BACKUP: AIRTRUST_STAGING_BACKUP');
  });
});
