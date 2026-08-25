import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');

describe('staging release GitHub token permissions', () => {
  it('grants read access to classic commit statuses used by the release guard', () => {
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
    expect(releaseGateVerifier).toContain('/commits/${encodedSha}/status');
    expect(permissions).toContain('statuses: read');
  });

  it('limits the release ledger preflight to the explicitly approved migrations', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(workflow).toContain(
      'node scripts/staging/migration-ledger-preflight.mjs --scope=0467,0468,0469',
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
