import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../scripts/run-dq01-local-copy-backfill-apply.sh',
);

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-dq01-apply-'));
  tempDirs.push(dir);
  return dir;
}

function createLocalCopyDb() {
  const dir = makeTempDir();
  const dbPath = join(dir, 'local-copy.sqlite');
  const snapshotPath = join(dir, 'snapshot.sqlite');
  const rollbackPath = join(dir, 'rollback.md');

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
    VALUES
      (1, 'Redacted One', 'ATIVO', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      (2, 'Redacted Two', 'INATIVO', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      (3, 'Redacted Three', 'ATIVO', 1, NULL, '2026-01-01T00:00:00Z');
  `;

  const init = spawnSync('sqlite3', [dbPath], { input: schema, encoding: 'utf8' });
  expect(init.status, init.stderr).toBe(0);
  writeFileSync(snapshotPath, '', 'utf8');
  writeFileSync(rollbackPath, 'restore snapshot', 'utf8');

  return { dbPath, snapshotPath, rollbackPath };
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

describe('dq01 local-copy backfill apply script', () => {
  it('fails closed without controlled environment variables', () => {
    const result = runScript();

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('DQ01_LOCAL_COPY_BACKFILL_APPLY=BLOCKED');
    expect(result.stdout).toContain('target_must_be_local_copy');
  });

  it('rejects non local-copy targets', () => {
    const { dbPath, snapshotPath, rollbackPath } = createLocalCopyDb();

    const result = runScript({
      AIRTRUST_CONTROLLED_TARGET: 'staging',
      AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
      AIRTRUST_DB_PATH: dbPath,
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toContain('target_must_be_local_copy');
  });

  it('requires approval, snapshot, rollback, and reviewed command', () => {
    const { dbPath, snapshotPath, rollbackPath } = createLocalCopyDb();

    expect(
      runScript({
        AIRTRUST_CONTROLLED_TARGET: 'local-copy',
        AIRTRUST_DB_PATH: dbPath,
        AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
        AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
        AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      }).stdout,
    ).toContain('approval_missing');

    expect(
      runScript({
        AIRTRUST_CONTROLLED_TARGET: 'local-copy',
        AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
        AIRTRUST_DB_PATH: dbPath,
        AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
        AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      }).stdout,
    ).toContain('snapshot_missing');

    expect(
      runScript({
        AIRTRUST_CONTROLLED_TARGET: 'local-copy',
        AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
        AIRTRUST_DB_PATH: dbPath,
        AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
        AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      }).stdout,
    ).toContain('rollback_missing');

    expect(
      runScript({
        AIRTRUST_CONTROLLED_TARGET: 'local-copy',
        AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
        AIRTRUST_DB_PATH: dbPath,
        AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
        AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      }).stdout,
    ).toContain('safe_command_not_reviewed');
  });

  it('aligns active soft-deleted funcionarios and remains idempotent', () => {
    const { dbPath, snapshotPath, rollbackPath } = createLocalCopyDb();
    const env = {
      AIRTRUST_CONTROLLED_TARGET: 'local-copy',
      AIRTRUST_CONTROLLED_APPROVAL: 'approval-1',
      AIRTRUST_DB_PATH: dbPath,
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: snapshotPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
    };

    const result = runScript(env);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('APPLIED | soft_delete_status_alignment | changed=1');
    expect(result.stdout).toContain('REMAINING | soft_delete_status_alignment | count=0');

    const verify = spawnSync(
      'sqlite3',
      [
        dbPath,
        "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';",
      ],
      { encoding: 'utf8' },
    );
    expect(verify.stdout.trim()).toBe('0');

    const second = runScript(env);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).toContain('APPLIED | soft_delete_status_alignment | changed=0');
  });

  it('does not contain remote D1 or production deployment commands', () => {
    const source = spawnSync('sed', ['-n', '1,220p', scriptPath], { encoding: 'utf8' });

    expect(source.stdout).not.toMatch(/--remote/);
    expect(source.stdout).not.toMatch(/wrangler\s+d1/i);
    expect(source.stdout).not.toMatch(/wrangler\s+deploy/i);
  });
});
