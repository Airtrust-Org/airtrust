import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  join(process.cwd(), '..', '.github', 'workflows', 'deploy-staging.yml'),
  'utf8',
);

describe('staging backup secret gate', () => {
  it('does not start the backup job until the secret readiness gate passes', () => {
    const backupJob = workflow.slice(
      workflow.indexOf('\n  backup:'),
      workflow.indexOf('\n  preflight:'),
    );

    expect(backupJob).toContain(
      'needs: [guard, production-target-guard, cloudflare-secret-readiness-gate]',
    );
    expect(backupJob).toContain(
      "needs.cloudflare-secret-readiness-gate.outputs.secret_gate_ok == 'true'",
    );
  });
});
