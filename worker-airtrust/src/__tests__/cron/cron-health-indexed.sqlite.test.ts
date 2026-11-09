import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  buildCronHealthQuery,
  collectCronHealthSnapshot,
  CRON_HEALTH_RETRY_THRESHOLD,
  CRON_HEALTH_STATE_LIMIT,
} from '../../cron/resilient/cron-health';

const opened: SqliteD1Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(readFileSync(resolve(process.cwd(), 'schema-v2/changes/0451_cron_job_resilience_state_v2.sql'), 'utf8'));
  return db;
}

describe('cron health D1 overloaded mitigation (#2149)', () => {
  it('scopes run history to indexed two-run lookups and preserves backlog, exhausted retry and stalled cursor', async () => {
    const db = fixture();
    const states = db.database.prepare(`INSERT INTO cron_job_state (job_name, scope_key, last_started_at, updated_at, consecutive_failures, last_error_code)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const runs = db.database.prepare(`INSERT INTO cron_job_runs (id,job_name,scope_key,lease_owner,outcome,started_at,cursor_after,processed_count)
      VALUES (?,?,?,'test',?,?,?,?)`);
    const items = db.database.prepare(`INSERT INTO cron_job_items (job_name,scope_key,item_key,status,attempts)
      VALUES (?,?,?,?,?)`);
    states.run('frms-reprocess', 'empresa:6', '2026-08-02 07:40:00', '2026-08-02 07:40:00', 3, 'RETRY');
    runs.run('latest', 'frms-reprocess', 'empresa:6', 'PARTIAL', '2026-08-02 07:50:00', '12', 0);
    runs.run('previous', 'frms-reprocess', 'empresa:6', 'PARTIAL', '2026-08-02 07:40:00', '12', 0);
    runs.run('older', 'frms-reprocess', 'empresa:6', 'SUCCEEDED', '2026-08-01 06:00:00', '11', 3);
    items.run('frms-reprocess', 'empresa:6', 'a', 'FAILED', 5);
    items.run('frms-reprocess', 'empresa:6', 'b', 'PENDING', 0);
    items.run('frms-reprocess', 'empresa:6', 'c', 'PROCESSING', 0);
    items.run('frms-reprocess', 'empresa:6', 'd', 'SUCCEEDED', 0);

    // Retained run history for another tenant must not be ranked by this tick.
    // This mimics the production pattern where runs outlive a deleted state.
    for (let i = 0; i < 2400; i++) {
      runs.run(`unrelated-${i}`, 'frms-reprocess', 'empresa:999', 'FAILED', '2026-08-01 06:00:00', null, 0);
    }
    const plan = db.database.prepare(`EXPLAIN QUERY PLAN ${buildCronHealthQuery()}`)
      .all(CRON_HEALTH_STATE_LIMIT, CRON_HEALTH_RETRY_THRESHOLD) as Array<{ detail: string }>;
    const details = plan.map((step) => step.detail).join('\n');
    expect(details).toContain('idx_cron_job_runs_lookup');
    expect(details).toContain('CORRELATED SCALAR SUBQUERY');
    expect(details).not.toMatch(/SCAN (?:TABLE )?r\b/);

    const snapshot = await collectCronHealthSnapshot(db as unknown as D1Database, new Date('2026-08-02T08:00:00Z'));
    expect(snapshot).toMatchObject({
      checkedScopes: 1,
      repeatedFailureScopes: 1,
      pendingItems: 3,
      exhaustedItems: 1,
      exhaustedItemScopes: 1,
      stalledCursorScopes: 1,
      delayedScopes: 0,
    });
    expect(snapshot.affectedScopes[0].signals).toContain('CURSOR_STALLED');
  });

  it('limits source state before touching items and runs while preserving deterministic scope order', async () => {
    const db = fixture();
    const states = db.database.prepare('INSERT INTO cron_job_state (job_name,scope_key) VALUES (?,?)');
    for (let i = 0; i < CRON_HEALTH_STATE_LIMIT + 12; i++) {
      states.run('frms-reprocess', `empresa:${String(i).padStart(4, '0')}`);
    }
    states.run('unrelated-job', 'global');
    const snapshot = await collectCronHealthSnapshot(db as unknown as D1Database);
    expect(snapshot.checkedScopes).toBe(CRON_HEALTH_STATE_LIMIT);
    expect(snapshot.pendingItems).toBe(0);
    expect(snapshot.affectedScopes).toEqual([]);
  });
});
