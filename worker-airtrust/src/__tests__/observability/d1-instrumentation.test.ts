import { describe, expect, it, vi, type Mock } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { createD1RequestStats, instrumentD1 } from '../../observability/d1-instrumentation';
import { createWorkerEntrypoint } from '../../runtime/worker-entrypoint';

interface FakeStatement {
  bind: Mock<(...values: unknown[]) => FakeStatement>;
  first: Mock<() => Promise<unknown>>;
  all: Mock<() => Promise<{ results: unknown[]; success: boolean }>>;
  run: Mock<() => Promise<{ success: boolean; meta: { changes: number } }>>;
  raw: Mock<() => Promise<unknown[][]>>;
}

function fakeStatement(rows: unknown[] = [{ id: 1 }]) {
  const stmt: FakeStatement = {
    bind: vi.fn<(...values: unknown[]) => FakeStatement>(() => stmt),
    first: vi.fn(async () => rows[0] ?? null),
    all: vi.fn(async () => ({ results: rows, success: true })),
    run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
    raw: vi.fn(async () => rows.map((r) => Object.values(r as object))),
  };
  return stmt;
}

function fakeDb() {
  const stmt = fakeStatement();
  const session = {
    prepare: vi.fn<(sql: string) => typeof stmt>(() => stmt),
    batch: vi.fn(async (list: unknown[]) => list.map(() => ({ success: true }))),
    getBookmark: vi.fn(() => 'bm'),
  };
  const db = {
    prepare: vi.fn<(sql: string) => typeof stmt>(() => stmt),
    batch: vi.fn(async (list: unknown[]) => list.map(() => ({ success: true }))),
    exec: vi.fn<(sql: string) => Promise<{ count: number; duration: number }>>(async () => ({
      count: 1,
      duration: 1,
    })),
    withSession: vi.fn<(mode?: string) => typeof session>(() => session),
  };
  return { db, stmt, session };
}

describe('instrumentD1', () => {
  it('conta round-trips e delega sem alterar resultados', async () => {
    const { db, stmt } = fakeDb();
    const stats = createD1RequestStats();
    const wrapped = instrumentD1(db, stats);

    const row = await wrapped.prepare('SELECT 1').bind(1).first();
    const all = await wrapped.prepare('SELECT 2').all();
    await wrapped.prepare('UPDATE x SET a = 1').run();

    expect(row).toEqual({ id: 1 });
    expect(all).toEqual({ results: [{ id: 1 }], success: true });
    expect(stats.roundTrips).toBe(3);
    expect(stats.statements).toBe(3);
    expect(stmt.bind).toHaveBeenCalledWith(1);
    expect(db.prepare).toHaveBeenCalledWith('SELECT 1');
  });

  it('batch conta 1 round-trip e N statements; exec conta 1', async () => {
    const { db } = fakeDb();
    const stats = createD1RequestStats();
    const wrapped = instrumentD1(db, stats);
    await wrapped.batch([
      wrapped.prepare('A'),
      wrapped.prepare('B'),
      wrapped.prepare('C'),
    ] as never);
    await wrapped.exec('PRAGMA x');
    expect(stats.roundTrips).toBe(2);
    expect(stats.statements).toBe(4);
  });

  it('withSession mantém a contagem e passa getBookmark', async () => {
    const { db } = fakeDb();
    const stats = createD1RequestStats();
    const wrapped = instrumentD1(db, stats);
    const session = wrapped.withSession('first-primary');
    await session.prepare('SELECT 1').first();
    expect(session.getBookmark()).toBe('bm');
    expect(stats.roundTrips).toBe(1);
  });

  it('propaga erros e ainda contabiliza o round-trip', async () => {
    const { db, stmt } = fakeDb();
    stmt.first.mockRejectedValueOnce(new Error('D1_ERROR'));
    const stats = createD1RequestStats();
    await expect(instrumentD1(db, stats).prepare('X').first()).rejects.toThrow('D1_ERROR');
    expect(stats.roundTrips).toBe(1);
  });

  it('tolera binding vazio como nos testes legados', () => {
    const stats = createD1RequestStats();
    expect(() => instrumentD1({}, stats)).not.toThrow();
  });
});

describe('worker entrypoint D1 metrics', () => {
  function envWith(db: unknown, overrides: Record<string, unknown> = {}): Env {
    return {
      DB: db as D1Database,
      BUCKET: {} as R2Bucket,
      JWT_SECRET: 'test-secret',
      ENVIRONMENT: 'production',
      API_URL: 'https://api.example.com',
      FRONTEND_URL: 'https://app.example.com',
      DEBUG: 'false',
      LOG_LEVEL: 'info',
      ...overrides,
    } as Env;
  }

  async function runRequest(env: Env) {
    const app = new Hono<{ Bindings: Env }>();
    app.get('/api/x/:id', async (c) => {
      await c.env.DB.prepare('SELECT 1').first();
      await c.env.DB.prepare('SELECT 2').all();
      return c.text('ok');
    });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const entrypoint = createWorkerEntrypoint(app, { onScheduled: async () => undefined });
    const res = await entrypoint.fetch(
      new Request('https://airtrust.test/api/x/7'),
      env,
      {} as ExecutionContext,
    );
    const payload = JSON.parse(String(spy.mock.calls[0][0]));
    spy.mockRestore();
    return { res, payload };
  }

  it('emite d1_round_trips/d1_statements/d1_ms na métrica HTTP sem alterar a resposta', async () => {
    const { db } = fakeDb();
    const { res, payload } = await runRequest(envWith(db));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(payload).toMatchObject({ route: '/api/x/:id', d1_round_trips: 2, d1_statements: 2 });
    expect(typeof payload.d1_ms).toBe('number');
  });

  it('D1_METRICS_DISABLED=true não instrumenta e mantém o binding original', async () => {
    const { db } = fakeDb();
    const { payload } = await runRequest(envWith(db, { D1_METRICS_DISABLED: 'true' }));
    expect(payload.d1_round_trips).toBe(0);
    expect(db.prepare).toHaveBeenCalledTimes(2);
  });
});
