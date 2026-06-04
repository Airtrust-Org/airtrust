import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const gateScript = fileURLToPath(new URL('../../../../scripts/dq01-controlled-backfill-gate.sh', import.meta.url));

const tempDirs: string[] = [];

function createTempFile(name: string, contents: string) {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-dq01-gate-'));
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

describe('dq01 controlled backfill gate', () => {
  it('fails closed without approved environment inputs', () => {
    const result = spawnSync('bash', [gateScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
      },
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('DQ01_BACKFILL_GATE=BLOCKED_BY_ENVIRONMENT_READINESS');
    expect(result.stdout).toContain('CONTROLLED_EXECUTION_GATE=BLOCKED_BY_ENVIRONMENT_CONTRACT');
    expect(result.stdout).toContain('REASONS=');
  });

  it('reports ready for manual controlled execution when all staging inputs exist', () => {
    const dbPath = createTempFile('staging.sqlite', '');
    const snapshotPath = createTempFile('snapshot.sqlite', '');
    const rollbackPath = createTempFile('rollback.txt', 'restore snapshot');

    const result = spawnSync('bash', [gateScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AIRTRUST_DQ01_TARGET: 'staging',
        AIRTRUST_DQ01_APPROVED_BY: 'audit-owner',
        AIRTRUST_DQ01_DB_PATH: dbPath,
        AIRTRUST_DQ01_SNAPSHOT_PATH: snapshotPath,
        AIRTRUST_DQ01_ROLLBACK_PLAN_PATH: rollbackPath,
        AIRTRUST_DQ01_SAFE_COMMAND: 'bash scripts/run-dq01-staging-backfill-apply.sh',
        AIRTRUST_DQ01_SAFE_COMMAND_REVIEWED: 'YES',
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('DQ01_BACKFILL_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION');
    expect(result.stdout).toContain('CONTROLLED_EXECUTION_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION');
    expect(result.stdout).toContain('TARGET=staging');
    expect(result.stdout).toContain('SNAPSHOT_EVIDENCE=YES');
    expect(result.stdout).toContain('ROLLBACK_EVIDENCE=YES');
  });
});
