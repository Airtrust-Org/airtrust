import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const migration = readFileSync(join(ROOT, 'migrations/0451_cron_job_resilience_state.sql'), 'utf8');

function runSqlite(dbPath: string, sql: string) {
  return spawnSync('sqlite3', ['-bail', dbPath], {
    input: sql,
    encoding: 'utf8',
  });
}

describe('migration 0451 cron job resilience state', () => {
  it('is idempotent and creates the durable state, item ledger, and run history tables', () => {
    const directory = mkdtempSync(join(tmpdir(), 'airtrust-migration-0451-'));
    const dbPath = join(directory, 'state.sqlite');

    try {
      const first = runSqlite(dbPath, migration);
      expect(first.status, first.stderr).toBe(0);

      const second = runSqlite(dbPath, migration);
      expect(second.status, second.stderr).toBe(0);

      const tables = runSqlite(
        dbPath,
        `SELECT name FROM sqlite_master
          WHERE type = 'table'
            AND name IN ('cron_job_state', 'cron_job_items', 'cron_job_runs')
          ORDER BY name;`,
      );
      expect(tables.status, tables.stderr).toBe(0);
      expect(tables.stdout.trim().split('\n')).toEqual([
        'cron_job_items',
        'cron_job_runs',
        'cron_job_state',
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
