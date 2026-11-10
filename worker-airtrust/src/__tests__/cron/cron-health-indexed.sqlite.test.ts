import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { buildReadyFrmsQueueScopesQuery, buildStaleFrmsQueueScopesQuery } from '../../cron/resilient/sigvoos-frms';
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
  it('não varre histórico concluído ao descobrir filas elegíveis, e mantém retomada por estado durável', () => {
    const db = fixture();
    const items = db.database.prepare(`INSERT INTO cron_job_items
      (job_name, scope_key, item_key, status, available_at)
      VALUES (?, ?, ?, ?, ?)`);
    // A grande maioria dos itens de cron é histórico já concluído.
    for (let i = 0; i < 5000; i++) {
      items.run('frms-reprocess', 'empresa:0001', String(i), 'SUCCEEDED', '2026-01-01 00:00:00');
    }
    items.run('frms-reprocess', 'empresa:0002', 'ready', 'PENDING', '2026-01-01 00:00:00');
    items.run('frms-reprocess', 'empresa:0003', 'delayed', 'FAILED', '2999-01-01 00:00:00');
    items.run('frms-reprocess', 'empresa:0004', 'stale', 'PROCESSING', '2026-01-01 00:00:00');
    db.database.prepare(`INSERT INTO cron_job_state (job_name, scope_key, last_started_at, last_success_at)
      VALUES ('frms-reprocess', 'empresa:0004', datetime('now', '-40 minutes'), datetime('now', '-1 hour'))`).run();

    // A historical failed state without stale PROCESSING must never consume
    // the two-scope recovery budget or starve ready work.
    db.database.prepare(`INSERT INTO cron_job_state (job_name, scope_key, last_started_at, last_success_at)
      VALUES ('frms-reprocess', 'empresa:0001', datetime('now', '-40 minutes'), NULL)`).run();

    const readyPlan = db.database.prepare(`EXPLAIN QUERY PLAN ${buildReadyFrmsQueueScopesQuery()}`)
      .all('frms-reprocess', 2) as Array<{ detail: string }>;
    const stalePlan = db.database.prepare(`EXPLAIN QUERY PLAN ${buildStaleFrmsQueueScopesQuery()}`)
      .all('frms-reprocess', 2) as Array<{ detail: string }>;
    expect(readyPlan.map((row) => row.detail).join(' ')).toContain('idx_cron_job_items_pending');
    expect(stalePlan.map((row) => row.detail).join(' ')).toContain('PRIMARY KEY');

    const ready = db.database.prepare(buildReadyFrmsQueueScopesQuery())
      .all('frms-reprocess', 2) as Array<{ scope_key: string }>;
    const stale = db.database.prepare(buildStaleFrmsQueueScopesQuery())
      .all('frms-reprocess', 2) as Array<{ scope_key: string }>;
    expect(ready.map((row) => row.scope_key)).toEqual(['empresa:0002']);
    expect(stale.map((row) => row.scope_key)).toEqual(['empresa:0004']);
  });

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
