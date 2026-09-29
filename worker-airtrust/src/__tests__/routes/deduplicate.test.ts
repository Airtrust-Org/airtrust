import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 99);
    c.set('userRole', c.req.header('x-role') ?? 'user');
    c.set('empresaId', Number(c.req.header('x-empresa-id') ?? 0));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...roles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!roles.includes(role)) {
        return c.json({ success: false, error: 'forbidden', code: 'RBAC_FORBIDDEN' }, 403);
      }
      await next();
    },
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: (c: any) => Number(c.get('empresaId') ?? 0),
}));

import deduplicateRoutes from '../../routes/deduplicate';

type DedupGroup = {
  funcionario_id: number;
  qualificacao_chave: string;
  qualificacao_id: number | null;
  qualificacao_codigo: string | null;
  data_conclusao_dia: string;
  total: number;
};

type DedupRecord = {
  id: number;
  data_conclusao: string | null;
  created_at: string | null;
};

type TenantDataset = {
  groups: DedupGroup[];
  recordsByKey: Record<string, DedupRecord[]>;
};

type QueryCall = { query: string; args: unknown[]; method: 'all' | 'run' };

function asObject(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function buildGroupKey(group: {
  funcionario_id: number;
  qualificacao_chave: string;
  data_conclusao_dia: string;
}): string {
  return `${group.funcionario_id}|${group.qualificacao_chave}|${group.data_conclusao_dia}`;
}

function createMockDb(dataByTenant: Record<number, TenantDataset>) {
  const calls: QueryCall[] = [];
  const updateCalls: Array<{ id: number; empresaId: number }> = [];
  const batchSizes: number[] = [];
  const idToTenant = new Map<number, number>();

  for (const [tenantIdText, dataset] of Object.entries(dataByTenant)) {
    const tenantId = Number(tenantIdText);
    for (const records of Object.values(dataset.recordsByKey)) {
      for (const record of records) {
        idToTenant.set(record.id, tenantId);
      }
    }
  }

  const db = {
    prepare: (query: string) => ({
      bind: (...args: unknown[]) => {
        const stmt = {
          all: async () => {
            calls.push({ query, args, method: 'all' });
            if (query.includes('date(data_conclusao)') && query.includes('GROUP BY')) {
              const empresaId = Number(args[0]);
              return { results: dataByTenant[empresaId]?.groups ?? [] };
            }
            if (query.includes('SELECT id, data_conclusao, created_at')) {
              const empresaId = Number(args[0]);
              const key = buildGroupKey({
                funcionario_id: Number(args[1]),
                qualificacao_chave: String(args[2] ?? ''),
                data_conclusao_dia: String(args[3] ?? ''),
              });
              return { results: dataByTenant[empresaId]?.recordsByKey[key] ?? [] };
            }
            return { results: [] };
          },
          run: async () => {
            calls.push({ query, args, method: 'run' });
            if (query.includes('UPDATE qualificacoes_historico') && query.includes('id IN (')) {
              // bind order for the batched removal is (empresaId, ...ids) — see
              // softDeleteManyByEmpresa in routes/deduplicate.ts.
              const empresaId = Number(args[0]);
              const ids = args.slice(1).map((value) => Number(value));
              let changes = 0;
              for (const id of ids) {
                updateCalls.push({ id, empresaId });
                if (idToTenant.get(id) === empresaId) changes++;
              }
              return { meta: { changes } };
            }
            return { meta: { changes: 0 } };
          },
        };
        return stmt;
      },
    }),
    batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
      batchSizes.push(statements.length);
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;

  return { db, calls, updateCalls, batchSizes };
}

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/deduplicate', deduplicateRoutes);
  return app;
}

function makeDataset(): Record<number, TenantDataset> {
  const tenant1Group: DedupGroup = {
    funcionario_id: 11,
    qualificacao_chave: 'SIM',
    qualificacao_id: 7,
    qualificacao_codigo: 'SIM',
    data_conclusao_dia: '2026-01-03',
    total: 3,
  };
  const tenant2Group: DedupGroup = {
    funcionario_id: 22,
    qualificacao_chave: 'SIM',
    qualificacao_id: 7,
    qualificacao_codigo: 'SIM',
    data_conclusao_dia: '2026-01-02',
    total: 2,
  };
  return {
    1: {
      groups: [tenant1Group],
      recordsByKey: {
        [buildGroupKey(tenant1Group)]: [
          { id: 101, data_conclusao: '2026-01-03T08:00:00Z', created_at: '2026-01-03T10:00:00Z' },
          { id: 102, data_conclusao: '2026-01-03T08:00:00Z', created_at: '2026-01-03T09:00:00Z' },
          { id: 103, data_conclusao: '2026-01-03T08:00:00Z', created_at: '2026-01-03T08:30:00Z' },
        ],
      },
    },
    2: {
      groups: [tenant2Group],
      recordsByKey: {
        [buildGroupKey(tenant2Group)]: [
          { id: 201, data_conclusao: '2026-01-02T08:00:00Z', created_at: '2026-01-02T10:00:00Z' },
          { id: 202, data_conclusao: '2026-01-02T08:00:00Z', created_at: '2026-01-02T09:00:00Z' },
        ],
      },
    },
  };
}

describe('deduplicate route guards', () => {
  it('executes dry-run by default without update/delete writes', async () => {
    const { db, updateCalls } = createMockDb(makeDataset());
    const app = createTestApp();

    const response = await app.fetch(
      new Request('http://localhost/deduplicate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'admin', 'x-empresa-id': '1' },
        body: JSON.stringify({}),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = asObject(await response.json());
    const data = asObject(payload.data);
    expect(payload.success).toBe(true);
    expect(data.mode).toBe('dry_run');
    expect(data.empresa_id).toBe(1);
    expect(data.total_grupos_candidatos).toBe(1);
    expect(data.total_registros_a_remover).toBe(2);
    expect(data.total_registros_removidos).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('applies deduplicate only inside the authenticated tenant', async () => {
    const { db, updateCalls } = createMockDb(makeDataset());
    const app = createTestApp();

    const response = await app.fetch(
      new Request('http://localhost/deduplicate?apply=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'admin', 'x-empresa-id': '1' },
        body: JSON.stringify({ apply: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = asObject(await response.json());
    const data = asObject(payload.data);
    expect(payload.success).toBe(true);
    expect(data.mode).toBe('apply');
    expect(data.total_registros_removidos).toBe(2);
    expect((data.grupos as unknown[] | undefined)?.length).toBe(1);

    expect(updateCalls.map((call) => call.id).sort((a, b) => a - b)).toEqual([102, 103]);
    expect(updateCalls.every((call) => call.empresaId === 1)).toBe(true);
    expect(updateCalls.some((call) => call.id === 201 || call.id === 202)).toBe(false);
  });

  it('fails closed on apply when tenant is missing or invalid', async () => {
    const { db, updateCalls } = createMockDb(makeDataset());
    const app = createTestApp();

    const response = await app.fetch(
      new Request('http://localhost/deduplicate?apply=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'admin' },
        body: JSON.stringify({ apply: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    const payload = asObject(await response.json());
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('EMPRESA_ID_REQUIRED');
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 403 for non-admin role and performs no writes', async () => {
    const { db, updateCalls } = createMockDb(makeDataset());
    const app = createTestApp();

    const response = await app.fetch(
      new Request('http://localhost/deduplicate?apply=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '1' },
        body: JSON.stringify({ apply: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    const payload = asObject(await response.json());
    expect(payload.success).toBe(false);
    expect(payload.code).toBe('RBAC_FORBIDDEN');
    expect(updateCalls).toHaveLength(0);
  });

  it('keeps tenant filter in select and update SQL paths', async () => {
    const { db, calls } = createMockDb(makeDataset());
    const app = createTestApp();

    const response = await app.fetch(
      new Request('http://localhost/deduplicate?apply=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'admin', 'x-empresa-id': '1' },
        body: JSON.stringify({ apply: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const groupQuery = calls.find(
      (call) => call.query.includes('date(data_conclusao)') && call.query.includes('GROUP BY'),
    );
    const recordsQuery = calls.find((call) =>
      call.query.includes('SELECT id, data_conclusao, created_at'),
    );
    const deleteQuery = calls.find(
      (call) =>
        call.query.includes('UPDATE qualificacoes_historico') && call.query.includes('id IN ('),
    );
    const repointQuery = calls.find((call) => call.query.includes('renovacao_de = ?'));

    expect(groupQuery?.query).toContain('AND empresa_id = ?');
    expect(recordsQuery?.query).toContain('WHERE empresa_id = ?');
    expect(deleteQuery?.query).toContain('empresa_id = ?');
    expect(deleteQuery?.query).toContain('id IN (');
    // The renovacao_de repoint (dangling-pointer fix) is also tenant-scoped.
    expect(repointQuery?.query).toContain('empresa_id = ?');
  });

  it('removes duplicates through a single atomic db.batch, not per-row sequential writes', async () => {
    const { db, batchSizes } = createMockDb(makeDataset());
    const app = createTestApp();

    const response = await app.fetch(
      new Request('http://localhost/deduplicate?apply=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'admin', 'x-empresa-id': '1' },
        body: JSON.stringify({ apply: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    // One group (repoint + self-null renovacao_de guard + one delete chunk,
    // ids 102/103 well under the 200-per-statement limit): three statements,
    // still exactly one atomic db.batch call — not per-row sequential writes.
    expect(batchSizes).toHaveLength(1);
    expect(batchSizes[0]).toBe(3);
  });
});
