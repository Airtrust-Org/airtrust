/**
 * fix-renovadas.ts — authorization, tenant isolation and atomicity regression
 * coverage. fix-renovadas.test.ts already covers the renovation-detection
 * logic (the 6 canonical scenarios) with auth/rbac stubbed as pass-through;
 * this file exercises the guard rails those tests don't touch.
 */
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

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
  toError: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
}));

import fixRenovadasApp from '../../routes/fix-renovadas';

type Row = Record<string, unknown>;
type GrupoRow = { funcionario_id: number; qualificacao_codigo: string; total: number };
type Dataset = { groups: GrupoRow[]; recordsByKey: Record<string, Row[]> };

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', fixRenovadasApp);
  return app;
}

function createMockDb(dataByTenant: Record<number, Dataset>) {
  const idToTenant = new Map<number, number>();
  for (const [tenantIdText, dataset] of Object.entries(dataByTenant)) {
    const tenantId = Number(tenantIdText);
    for (const rows of Object.values(dataset.recordsByKey)) {
      for (const row of rows) idToTenant.set(Number(row.id), tenantId);
    }
  }

  const updateCalls: Array<{ kind: 'RENOVADA' | 'LINK'; id: number; empresaId: number }> = [];
  const batchSizes: number[] = [];

  const db = {
    prepare: (query: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => {
          if (query.includes('GROUP BY qh.funcionario_id')) {
            const empresaId = Number(args[0]);
            return { results: dataByTenant[empresaId]?.groups ?? [] };
          }
          // per-group fetch binds (funcionario_id, qualificacao_codigo, empresaId, ...)
          const empresaId = Number(args[2]);
          const key = `${args[0]}|${args[1]}`;
          return { results: dataByTenant[empresaId]?.recordsByKey[key] ?? [] };
        },
        run: async () => {
          if (query.includes('SET renovada = 1')) {
            const empresaId = Number(args[0]);
            const ids = args.slice(1).map((value) => Number(value));
            let changes = 0;
            for (const id of ids) {
              updateCalls.push({ kind: 'RENOVADA', id, empresaId });
              if (idToTenant.get(id) === empresaId) changes++;
            }
            return { meta: { changes } };
          }
          if (query.includes('SET renovacao_de')) {
            const idsCount = (query.match(/WHEN \d+ THEN \?/g) || []).length;
            const empresaId = Number(args[idsCount]);
            const ids = args.slice(idsCount + 1).map((value) => Number(value));
            let changes = 0;
            for (const id of ids) {
              updateCalls.push({ kind: 'LINK', id, empresaId });
              if (idToTenant.get(id) === empresaId) changes++;
            }
            return { meta: { changes } };
          }
          return { meta: { changes: 0 } };
        },
      }),
    }),
    batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
      batchSizes.push(statements.length);
      return Promise.all(statements.map((statement) => statement.run()));
    },
  } as unknown as D1Database;

  return { db, updateCalls, batchSizes };
}

function makeTwoTenantDataset(): Record<number, Dataset> {
  return {
    1: {
      groups: [{ funcionario_id: 10, qualificacao_codigo: 'MNT_MEL', total: 2 }],
      recordsByKey: {
        '10|MNT_MEL': [
          {
            id: 1001,
            data_conclusao: '2021-01-01',
            data_vencimento: '2022-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Tenant1',
            setor_nome: 'Ops',
          },
          {
            id: 1002,
            data_conclusao: '2023-01-01',
            data_vencimento: '2027-01-01',
            status: 'VALIDA',
            renovada: 0,
            funcionario_nome: 'Tenant1',
            setor_nome: 'Ops',
          },
        ],
      },
    },
    2: {
      groups: [{ funcionario_id: 20, qualificacao_codigo: 'MNT_MEL', total: 2 }],
      recordsByKey: {
        '20|MNT_MEL': [
          {
            id: 2001,
            data_conclusao: '2021-01-01',
            data_vencimento: '2022-01-01',
            status: 'VENCIDA',
            renovada: 0,
            funcionario_nome: 'Tenant2',
            setor_nome: 'Ops',
          },
          {
            id: 2002,
            data_conclusao: '2023-01-01',
            data_vencimento: '2027-01-01',
            status: 'VALIDA',
            renovada: 0,
            funcionario_nome: 'Tenant2',
            setor_nome: 'Ops',
          },
        ],
      },
    },
  };
}

describe('fix-renovadas — autorização negativa', () => {
  it('POST / retorna 403 e não escreve nada para role não-admin', async () => {
    const { db, updateCalls, batchSizes } = createMockDb(makeTwoTenantDataset());
    const app = createApp();

    const res = await app.request(
      '/',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '1' },
        body: JSON.stringify({ dry_run: false }),
      },
      { DB: db } as Env,
    );

    expect(res.status).toBe(403);
    expect(updateCalls).toHaveLength(0);
    expect(batchSizes).toHaveLength(0);
  });

  it('GET /preview retorna 403 para role não-admin', async () => {
    const { db } = createMockDb(makeTwoTenantDataset());
    const app = createApp();

    const res = await app.request(
      '/preview',
      { method: 'GET', headers: { 'x-role': 'user', 'x-empresa-id': '1' } },
      { DB: db } as Env,
    );

    expect(res.status).toBe(403);
  });
});

describe('fix-renovadas — isolamento de tenant na aplicação', () => {
  it('POST / aplica renovação somente nos registros do tenant autenticado', async () => {
    const { db, updateCalls } = createMockDb(makeTwoTenantDataset());
    const app = createApp();

    const res = await app.request(
      '/',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'admin', 'x-empresa-id': '1' },
        body: JSON.stringify({ dry_run: false }),
      },
      { DB: db } as Env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { total_renovadas: number } };
    expect(body.data.total_renovadas).toBe(1);

    // Only tenant 1's row (1001) may be touched; tenant 2's row (2001) must never appear.
    expect(updateCalls.every((call) => call.empresaId === 1)).toBe(true);
    expect(updateCalls.some((call) => call.id === 2001 || call.id === 2002)).toBe(false);
    expect(updateCalls.some((call) => call.id === 1001)).toBe(true);
  });
});

describe('fix-renovadas — atomicidade', () => {
  it('aplica as duas mutações (RENOVADA + LINK) em um único db.batch, não em awaits sequenciais soltos', async () => {
    const { db, batchSizes } = createMockDb(makeTwoTenantDataset());
    const app = createApp();

    const res = await app.request(
      '/',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'admin', 'x-empresa-id': '1' },
        body: JSON.stringify({ dry_run: false }),
      },
      { DB: db } as Env,
    );

    expect(res.status).toBe(200);
    // Exactly one db.batch call for the whole apply — both the RENOVADA bulk
    // update and the renovacao_de link update travel in the same transaction.
    expect(batchSizes).toHaveLength(1);
    expect(batchSizes[0]).toBe(2);
  });
});
