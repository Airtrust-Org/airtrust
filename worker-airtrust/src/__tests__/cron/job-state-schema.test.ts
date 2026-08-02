import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { buildCronScopeKey, createCronLeaseOwner } from '../../cron/job-state';

const ROOT = process.cwd();
const migration = readFileSync(join(ROOT, 'migrations/0451_cron_job_resilience_state.sql'), 'utf8');

function runSqlite(dbPath: string, sql: string) {
  return spawnSync('sqlite3', ['-bail', dbPath], {
    input: sql,
    encoding: 'utf8',
  });
}

function queryValue(dbPath: string, sql: string): string {
  const result = spawnSync('sqlite3', ['-bail', dbPath], {
    input: sql,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

describe('cron job resilience schema', () => {
  it('applies twice and enforces one state row per job and scope', () => {
    const directory = mkdtempSync(join(tmpdir(), 'airtrust-cron-state-'));
    const dbPath = join(directory, 'state.sqlite');

    const first = runSqlite(dbPath, migration);
    expect(first.status, first.stderr).toBe(0);
    const second = runSqlite(dbPath, migration);
    expect(second.status, second.stderr).toBe(0);

    const insert = runSqlite(
      dbPath,
      `INSERT INTO cron_job_state (job_name, scope_key) VALUES ('ead-renewal', 'global');`,
    );
    expect(insert.status, insert.stderr).toBe(0);

    const duplicate = runSqlite(
      dbPath,
      `INSERT INTO cron_job_state (job_name, scope_key) VALUES ('ead-renewal', 'global');`,
    );
    expect(duplicate.status).not.toBe(0);
    expect(queryValue(dbPath, 'SELECT COUNT(*) FROM cron_job_state;')).toBe('1');

    rmSync(directory, { recursive: true, force: true });
  });

  it('prevents duplicate durable items and validates lifecycle states', () => {
    const directory = mkdtempSync(join(tmpdir(), 'airtrust-cron-items-'));
    const dbPath = join(directory, 'items.sqlite');
    expect(runSqlite(dbPath, migration).status).toBe(0);

    expect(
      runSqlite(
        dbPath,
        `INSERT INTO cron_job_items (job_name, scope_key, item_key)
         VALUES ('frms-reprocess', 'empresa:6', '2026-08-02:123');`,
      ).status,
    ).toBe(0);

    expect(
      runSqlite(
        dbPath,
        `INSERT INTO cron_job_items (job_name, scope_key, item_key)
         VALUES ('frms-reprocess', 'empresa:6', '2026-08-02:123');`,
      ).status,
    ).not.toBe(0);

    expect(
      runSqlite(
        dbPath,
        `INSERT INTO cron_job_items (job_name, scope_key, item_key, status)
         VALUES ('frms-reprocess', 'empresa:6', 'invalid', 'UNKNOWN');`,
      ).status,
    ).not.toBe(0);

    rmSync(directory, { recursive: true, force: true });
  });
});

describe('cron job state helpers', () => {
  it('builds tenant-scoped keys without personal data', () => {
    expect(buildCronScopeKey(6)).toBe('empresa:6');
    expect(buildCronScopeKey(null)).toBe('global');
    expect(buildCronScopeKey(-1)).toBe('global');
  });

  it('creates sanitized unique lease owners', () => {
    const first = createCronLeaseOwner('ead renewal / unsafe');
    const second = createCronLeaseOwner('ead renewal / unsafe');
    expect(first).toMatch(/^ead_renewal___unsafe:/);
    expect(second).not.toBe(first);
    expect(first).not.toContain('\n');
  });
});
