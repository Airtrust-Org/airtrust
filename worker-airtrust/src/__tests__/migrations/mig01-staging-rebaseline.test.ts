import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(
  new URL('../../../../scripts/run-mig01-staging-rebaseline.sh', import.meta.url),
);

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-mig01-rebaseline-'));
  tempDirs.push(dir);
  return dir;
}

function createSqliteDb(sql: string) {
  const dir = makeTempDir();
  const dbPath = join(dir, 'snapshot.sqlite');
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return { dir, dbPath };
}

function runScript(env: Record<string, string>) {
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
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('mig01 staging rebaseline wrapper', () => {
  it('generates a schema-only baseline from a staging snapshot', () => {
    const { dir, dbPath } = createSqliteDb(`
      CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE funcionarios(id INTEGER PRIMARY KEY, nome TEXT);
      CREATE INDEX idx_funcionarios_nome ON funcionarios(nome);
      CREATE VIEW vw_funcionarios AS SELECT id FROM funcionarios;
    `);
    const rollbackPath = join(dir, 'rollback.md');
    const baselinePath = join(dir, 'baseline.sql');
    const summaryPath = join(dir, 'summary.txt');
    writeFileSync(rollbackPath, 'rollback', 'utf8');

    const result = runScript({
      AIRTRUST_CONTROLLED_TARGET: 'staging',
      AIRTRUST_CONTROLLED_APPROVAL: 'MIG01-STAGING-TEST',
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: dbPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      AIRTRUST_MIG01_BASELINE_OUTPUT_PATH: baselinePath,
      AIRTRUST_MIG01_SUMMARY_OUTPUT_PATH: summaryPath,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('MIG01_STAGING_REBASELINE=COMPLETED');
    expect(result.stdout).toContain('D1_MIGRATIONS_EXCLUDED=YES');
    expect(existsSync(baselinePath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const baseline = readFileSync(baselinePath, 'utf8');
    expect(baseline).toContain('CREATE TABLE funcionarios');
    expect(baseline).toContain('CREATE INDEX idx_funcionarios_nome');
    expect(baseline).toContain('CREATE VIEW vw_funcionarios');
    expect(baseline).not.toContain('CREATE TABLE d1_migrations');
  });

  it('blocks snapshots that already contain the 0389 support foundation objects', () => {
    const { dir, dbPath } = createSqliteDb(`
      CREATE TABLE user_platform_roles(id INTEGER PRIMARY KEY);
    `);
    const rollbackPath = join(dir, 'rollback.md');
    writeFileSync(rollbackPath, 'rollback', 'utf8');

    const result = runScript({
      AIRTRUST_CONTROLLED_TARGET: 'staging',
      AIRTRUST_CONTROLLED_APPROVAL: 'MIG01-STAGING-TEST',
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: dbPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      AIRTRUST_MIG01_BASELINE_OUTPUT_PATH: join(dir, 'baseline.sql'),
      AIRTRUST_MIG01_SUMMARY_OUTPUT_PATH: join(dir, 'summary.txt'),
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('snapshot_contains_0389_objects');
  });

  it('blocks non-staging targets', () => {
    const { dir, dbPath } = createSqliteDb('CREATE TABLE funcionarios(id INTEGER PRIMARY KEY);');
    const rollbackPath = join(dir, 'rollback.md');
    writeFileSync(rollbackPath, 'rollback', 'utf8');

    const result = runScript({
      AIRTRUST_CONTROLLED_TARGET: 'production',
      AIRTRUST_CONTROLLED_APPROVAL: 'MIG01-STAGING-TEST',
      AIRTRUST_CONTROLLED_SNAPSHOT_PATH: dbPath,
      AIRTRUST_CONTROLLED_ROLLBACK_PATH: rollbackPath,
      AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED: 'YES',
      AIRTRUST_MIG01_BASELINE_OUTPUT_PATH: join(dir, 'baseline.sql'),
      AIRTRUST_MIG01_SUMMARY_OUTPUT_PATH: join(dir, 'summary.txt'),
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('target_must_be_staging');
  });
});
