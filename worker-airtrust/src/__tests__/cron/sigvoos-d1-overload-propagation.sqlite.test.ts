import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { runSigvoosFrmsJobs } from '../../cron/resilient/sigvoos-frms';

const opened: SqliteD1Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

describe('sigvoos durable runner overload propagation (#2149)', () => {
  it('does not fan out to FRMS queues when the durable dispatcher persisted FAILED/D1 overloaded', async () => {
    const db = new SqliteD1Database();
    opened.push(db);
    db.database.exec(readFileSync(resolve(process.cwd(), 'schema-v2/changes/0451_cron_job_resilience_state_v2.sql'), 'utf8'));
    let queueDiscoveryAttempts = 0;
    const d1 = {
      prepare(sql: string) {
        if (sql.includes('FROM integracoes_sigvoos_config')) {
          throw new Error('D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window');
        }
        if (sql.includes('SELECT DISTINCT scope_key') && sql.includes('cron_job_items')) {
          queueDiscoveryAttempts++;
        }
        return db.prepare(sql);
      },
    } as unknown as D1Database;
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await expect(
      runSigvoosFrmsJobs(d1, { DB: d1, ENVIRONMENT: 'test' } as unknown as Env, logger, new Date('2026-11-09T19:00:00Z')),
    ).rejects.toThrow('D1_DB_IS_OVERLOADED');
    const persisted = db.database.prepare("SELECT outcome,error_code FROM cron_job_runs WHERE job_name='sigvoos-dispatch'").get() as {outcome:string;error_code:string};
    expect(persisted.outcome).toBe('FAILED');
    expect(persisted.error_code).toContain('D1_DB_IS_OVERLOADED');
    expect(queueDiscoveryAttempts).toBe(0);
  });
});
