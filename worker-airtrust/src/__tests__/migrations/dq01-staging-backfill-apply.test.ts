import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../scripts/run-dq01-staging-backfill-apply.sh',
);

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-dq01-staging-apply-'));
  tempDirs.push(dir);
  return dir;
}

function createDb(name: string, activeSoftDeletedCount: number) {
  const dir = makeTempDir();
  const dbPath = join(dir, name);
  const rows = [];

  for (let index = 1; index <= activeSoftDeletedCount; index += 1) {
    rows.push(
      `(${index}, 'Redacted ${index}', 'ATIVO', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    );
  }

  rows.push(`(999, 'Still Active', 'ATIVO', 1, NULL, '2026-01-01T00:00:00Z')`);

  const schema = `
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      status TEXT,
      ativo INTEGER,
      deleted_at TEXT,
      updated_at TEXT
    );
    INSERT INTO funcionarios (id, nome, status, ativo, deleted_at, updated_at)
    VALUES ${rows.join(',\n')};
  `;

  const init = spawnSync('sqlite3', [dbPath], { input: schema, encoding: 'utf8' });
  expect(init.status, init.stderr).toBe(0);
  return dbPath;
}

function runScript(env: Record<string, string> = {}) {
  return spawnSync('bash', [scriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('dq01 staging backfill apply script', () => {
  it('fails closed without controlled environment variables', () => {
    const result = runScript();

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('DQ01_STAGING_BACKFILL_APPLY=BLOCKED');
    expect(result.stdout).toContain('target_must_be_staging');
  });

  it('requires approval, snapshot, rollback and reviewed command', () => {
    const dir = makeTempDir();
    const snapshotPath = createDb('snapshot.sqlite', 1);
    const rollbackPath = join(dir, 'rollback.md');
    writeFileSync(rollbackPath, 'restore snapshot', 'utf8');

    expect(
      runScript({
        AIRTRUST_CONTROLLED_TARGET: 'staging',
        AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
        AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
        AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      }).stdout,
    ).toContain('approval_missing');

    expect(
      runScript({
        AIRTRUST_CONTROLLED_TARGET: 'staging',
        AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
        AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
        AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      }).stdout,
    ).toContain('snapshot_missing');

    expect(
      runScript({
        AIRTRUST_CONTROLLED_TARGET: 'staging',
        AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
        AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
        AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      }).stdout,
    ).toContain('rollback_missing');

    expect(
      runScript({
        AIRTRUST_CONTROLLED_TARGET: 'staging',
        AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
        AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
        AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      }).stdout,
    ).toContain('safe_command_not_reviewed');
  });

  it('requires remote authorization outside test mode', () => {
    const dir = makeTempDir();
    const snapshotPath = createDb('snapshot.sqlite', 1);
    const rollbackPath = join(dir, 'rollback.md');
    writeFileSync(rollbackPath, 'restore snapshot', 'utf8');

    const result = runScript({
      AIRTRUST_CONTROLLED_TARGET: 'staging',
      AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('remote_d1_not_authorized');
  });

  it('aligns active soft-deleted funcionarios in test mode and blocks reuse of a stale pre-window snapshot', () => {
    const dir = makeTempDir();
    const snapshotPath = createDb('snapshot.sqlite', 2);
    const testDbPath = createDb('staging.sqlite', 2);
    const rollbackPath = join(dir, 'rollback.md');
    writeFileSync(rollbackPath, 'restore snapshot', 'utf8');

    const env = {
      AIRTRUST_CONTROLLED_TARGET: 'staging',
      AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND: 'bash scripts/run-dq01-staging-backfill-apply.sh',
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      AIRTRUST_DQ01_STAGING_TEST_MODE: 'YES',
      AIRTRUST_DQ01_STAGING_TEST_DB_PATH: testDbPath,
    };

    const result = runScript(env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('APPLIED | soft_delete_status_alignment | changed=2');
    expect(result.stdout).toContain('REMAINING | soft_delete_status_alignment | count=0');

    const verify = spawnSync(
      'sqlite3',
      [
        testDbPath,
        "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';",
      ],
      { encoding: 'utf8' },
    );
    expect(verify.stdout.trim()).toBe('0');

    const second = runScript(env);
    expect(second.status).toBe(2);
    expect(second.stdout).toContain('pre_count_mismatch_from_snapshot');
  });

  it('blocks when the staging target diverges from the snapshot count', () => {
    const dir = makeTempDir();
    const snapshotPath = createDb('snapshot.sqlite', 1);
    const testDbPath = createDb('staging.sqlite', 2);
    const rollbackPath = join(dir, 'rollback.md');
    writeFileSync(rollbackPath, 'restore snapshot', 'utf8');

    const result = runScript({
      AIRTRUST_CONTROLLED_TARGET: 'staging',
      AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND: 'bash scripts/run-dq01-staging-backfill-apply.sh',
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      AIRTRUST_DQ01_STAGING_TEST_MODE: 'YES',
      AIRTRUST_DQ01_STAGING_TEST_DB_PATH: testDbPath,
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('pre_count_mismatch_from_snapshot');
  });

  it('does not contain deploy, rebaseline or migrations apply commands', () => {
    const source = spawnSync('sed', ['-n', '1,260p', scriptPath], { encoding: 'utf8' });

    expect(source.stdout).not.toMatch(/wrangler\s+deploy/i);
    expect(source.stdout).not.toMatch(/rebaseline/i);
    expect(source.stdout).not.toMatch(/migrations\s+apply/i);
  });
});
