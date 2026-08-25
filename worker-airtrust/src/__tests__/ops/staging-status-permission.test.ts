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

    expect(workflow).toContain('/commits/${releaseSha}/status');
    expect(permissions).toContain('statuses: read');
  });

  it('limits the release ledger preflight to the explicitly approved migrations', () => {
    const workflow = readFileSync(join(ROOT, '.github/workflows/deploy-staging.yml'), 'utf8');

    expect(workflow).toContain(
      'node scripts/staging/migration-ledger-preflight.mjs --scope=0467,0468,0469',
    );
  });
});
