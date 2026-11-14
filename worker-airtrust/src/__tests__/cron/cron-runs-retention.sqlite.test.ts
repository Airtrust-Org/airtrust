/** P13-08: retencao de cron_job_runs contra SQLite com as colunas reais de producao. */
import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { CRON_RUNS_PURGE_SQL, purgeOldCronJobRuns } from '../../cron/resilient/cron-runs-retention';

const opened: SqliteD1Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE cron_job_runs (
      id TEXT PRIMARY KEY, job_name TEXT NOT NULL, scope_key TEXT NOT NULL,
      lease_owner TEXT, outcome TEXT, started_at TEXT, finished_at TEXT, duration_ms INTEGER,
      processed_count INTEGER, failed_count INTEGER, cursor_before TEXT, cursor_after TEXT,
      error_code TEXT, metadata_json TEXT, created_at TEXT, updated_at TEXT
    );
    -- Mirror both indices in production migration 0451. The query's INDEXED BY
    -- guard intentionally fails closed if the governed index is absent.
    CREATE INDEX idx_cron_job_runs_lookup
      ON cron_job_runs(job_name, scope_key, started_at DESC);
    CREATE INDEX idx_cron_job_runs_outcome
      ON cron_job_runs(outcome, started_at DESC);
  `);
  return db;
}

// Como em producao (migration 0451): `id` e UUID TEXT, sem ordem cronologica.
function addRun(
  db: SqliteD1Database,
  job: string,
  scope: string,
  ageDays: number,
  finished = true,
  id: string = crypto.randomUUID(),
) {
  const ts = `datetime('now','-${ageDays} days')`;
  db.database.exec(
    `INSERT INTO cron_job_runs (id, job_name, scope_key, outcome, started_at, finished_at, created_at)
     VALUES ('${id}','${job}','${scope}','SUCCEEDED',${ts},${finished ? ts : 'NULL'},${ts})`,
  );
}

const count = (db: SqliteD1Database) =>
  (db.database.prepare('SELECT COUNT(*) n FROM cron_job_runs').get() as { n: number }).n;

describe('P13-08 retencao de cron_job_runs', () => {

  it('uses the 0451 scope/date lookup index instead of scanning every newer run', () => {
    const db = fixture();
    const plan = db.database.prepare('EXPLAIN QUERY PLAN ' + CRON_RUNS_PURGE_SQL)
      .all('-60 days', 5000) as Array<{ detail: string }>;
    const details = plan.map((step) => step.detail).join('\n');
    expect(details).toMatch(/SEARCH n USING INDEX idx_cron_job_runs_lookup/);
    expect(details).toMatch(/started_at[>=? ]/);
    expect(details).not.toMatch(/SCAN (?:TABLE )?n\\b/);
  });

  it('preserves UUID ordering only as a tie-breaker when timestamps are identical', async () => {
    const db = fixture();
    addRun(db, 'same-time', 'same-scope', 120, true, 'aaaaaaaa-0000-4000-8000-000000000000');
    addRun(db, 'same-time', 'same-scope', 120, true, 'bbbbbbbb-0000-4000-8000-000000000000');
    const removed = await purgeOldCronJobRuns(db as unknown as D1Database, 60, 5000);
    expect(removed).toBe(1);
    const retained = db.database.prepare('SELECT id FROM cron_job_runs').all() as Array<{ id: string }>;
    expect(retained).toEqual([{ id: 'bbbbbbbb-0000-4000-8000-000000000000' }]);
  });
  it('remove execucoes antigas e preserva as recentes', async () => {
    const db = fixture();
    for (let i = 0; i < 5; i += 1) addRun(db, 'ead-renewal', '1', 100 + i); // antigas
    addRun(db, 'ead-renewal', '1', 1); // recente (tambem e a ultima do escopo)
    addRun(db, 'ead-renewal', '1', 10);
    const removed = await purgeOldCronJobRuns(db as unknown as D1Database, 60);
    expect(removed).toBe(5);
    expect(count(db)).toBe(2);
  });

  it('preserva a ultima execucao de cada escopo mesmo quando e antiga', async () => {
    const db = fixture();
    addRun(db, 'rare-job', 'A', 300);
    addRun(db, 'rare-job', 'A', 200);
    addRun(db, 'rare-job', 'B', 250);
    const removed = await purgeOldCronJobRuns(db as unknown as D1Database, 60);
    expect(removed).toBe(1); // so a mais antiga de A
    const kept = db.database
      .prepare('SELECT scope_key, COUNT(*) n FROM cron_job_runs GROUP BY scope_key ORDER BY scope_key')
      .all() as Array<{ scope_key: string; n: number }>;
    expect(kept).toEqual([
      { scope_key: 'A', n: 1 },
      { scope_key: 'B', n: 1 },
    ]);
  });

  it('a ultima execucao e a mais recente por data, nao a de maior UUID', async () => {
    const db = fixture();
    // A mais antiga tem UUID lexicograficamente MAIOR que a mais recente.
    addRun(db, 'rare', 'S', 200, true, 'ffffffff-0000-4000-8000-000000000001');
    addRun(db, 'rare', 'S', 100, true, '00000000-0000-4000-8000-000000000001');
    const removed = await purgeOldCronJobRuns(db as unknown as D1Database, 60);
    expect(removed).toBe(1);
    const kept = db.database.prepare('SELECT id FROM cron_job_runs').all() as Array<{ id: string }>;
    expect(kept).toEqual([{ id: '00000000-0000-4000-8000-000000000001' }]);
  });

  it('nunca remove execucao ainda em andamento (sem finished_at)', async () => {
    const db = fixture();
    addRun(db, 'job', 'S', 400, false);
    addRun(db, 'job', 'S', 399);
    addRun(db, 'job', 'S', 398);
    await purgeOldCronJobRuns(db as unknown as D1Database, 60);
    const open = db.database
      .prepare('SELECT COUNT(*) n FROM cron_job_runs WHERE finished_at IS NULL')
      .get() as { n: number };
    expect(open.n).toBe(1);
  });

  it('respeita o tamanho do lote e continua no proximo tick', async () => {
    const db = fixture();
    for (let i = 0; i < 12; i += 1) addRun(db, 'job', 'S', 100 + i);
    addRun(db, 'job', 'S', 0);
    expect(await purgeOldCronJobRuns(db as unknown as D1Database, 60, 5)).toBe(5);
    expect(await purgeOldCronJobRuns(db as unknown as D1Database, 60, 5)).toBe(5);
    expect(await purgeOldCronJobRuns(db as unknown as D1Database, 60, 5)).toBe(2);
    expect(count(db)).toBe(1);
  });

  it('retencao minima de 7 dias: argumento absurdo nao apaga historico recente', async () => {
    const db = fixture();
    addRun(db, 'job', 'S', 3);
    addRun(db, 'job', 'S', 2);
    addRun(db, 'job', 'S', 1);
    expect(await purgeOldCronJobRuns(db as unknown as D1Database, 0)).toBe(0);
    expect(count(db)).toBe(3);
  });
});
