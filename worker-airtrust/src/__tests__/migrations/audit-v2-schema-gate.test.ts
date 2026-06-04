import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const gateScript = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../scripts/audit-v2-schema-gate.sh',
);

const tempDirs: string[] = [];

function createTempFile(name: string, contents: string) {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-audit-v2-gate-'));
  tempDirs.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('audit v2 schema gate', () => {
  it('fails closed without approved environment inputs', () => {
    const result = spawnSync('bash', [gateScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
      },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('AUDIT_V2_SCHEMA_GATE=BLOCKED');
    expect(result.stdout).toContain('REASON=mode_must_be_audit_v2_schema');
  });

  it('reports ready when staging evidence and reviewed wrapper are present', () => {
    const snapshotPath = createTempFile('snapshot.sql', '-- schema snapshot');
    const rollbackPath = createTempFile('rollback.md', 'rollback steps');

    const result = spawnSync('bash', [gateScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AIRTRUST_CONTROLLED_MODE: 'audit-v2-schema',
        AIRTRUST_CONTROLLED_TARGET: 'staging',
        AIRTRUST_CONTROLLED_APPROVAL: 'AUDITV2-STAGING-20260604-FILIPE',
        AIRTRUST_CONTROLLED_TARGET_REF:
          'worker-airtrust/wrangler.toml:[env.staging].d1_databases:DB=airtrust-db-staging',
        AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
        AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
        AIRTRUST_CONTROLLED_SAFE_COMMAND: 'bash scripts/run-audit-v2-staging-schema-apply.sh',
        AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
        AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1: 'YES',
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('AUDIT_V2_SCHEMA_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION');
    expect(result.stdout).toContain('TARGET=staging');
    expect(result.stdout).toContain('REMOTE_D1_ALLOWED=YES');
    expect(result.stdout).toContain('SAFE_COMMAND_REVIEWED=YES');
  });
});
