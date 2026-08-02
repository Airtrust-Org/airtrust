import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const { getEmpresaIdMock, registrarAuditoriaMock } = vi.hoisted(() => ({
  getEmpresaIdMock: vi.fn(() => 77),
  registrarAuditoriaMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: getEmpresaIdMock,
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: registrarAuditoriaMock,
}));

import hospedagemRoutes from '../../routes/hospedagem';

type StoredHospedagem = {
  id: number;
  empresa_id: number;
  funcionario_id: number;
  tipo: 'HOTEL';
  local: string;
  cidade: string | null;
  estado: string | null;
  data_checkin: string;
  data_checkout: string | null;
  numero_quarto: string | null;
  custo_diaria: number | null;
  moeda: 'BRL';
  escala_id: number | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  funcionario_nome: string;
  funcionario_matricula: string;
};

type QueryCall = { query: string; args: unknown[] };

function hospedagem(
  id: number,
  data_checkin: string,
  empresa_id = 77,
  deleted_at: string | null = null,
): StoredHospedagem {
  return {
    id,
    empresa_id,
    funcionario_id: id + 100,
    tipo: 'HOTEL',
    local: `Hotel ${id}`,
    cidade: 'Rio',
    estado: 'RJ',
    data_checkin,
    data_checkout: null,
    numero_quarto: null,
    custo_diaria: null,
    moeda: 'BRL',
    escala_id: null,
    observacoes: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    deleted_at,
    funcionario_nome: `Tripulante ${id}`,
    funcionario_matricula: `MAT-${id}`,
  };
}

function toListPayload(row: StoredHospedagem) {
  const { empresa_id, deleted_at, ...payload } = row;
  void empresa_id;
  void deleted_at;
  return payload;
}

function createDatasetDb(initialRows: StoredHospedagem[]) {
  const rows = [...initialRows];
  const calls: QueryCall[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      if (!query.includes('FROM hospedagem h')) throw new Error(`Unhandled query: ${query}`);

      return {
        bind: (...args: unknown[]) => ({
          all: async () => {
            calls.push({ query, args });
            const empresaId = Number(args[0]);
            const fetchLimit = query.includes('LIMIT ?')
              ? Number(args[args.length - 1])
              : 500;
            const usesCursor = query.includes(
              '(h.data_checkin < ? OR (h.data_checkin = ? AND h.id < ?))',
            );
            const cursorDate = usesCursor ? String(args[args.length - 4]) : null;
            const cursorId = usesCursor ? Number(args[args.length - 2]) : null;

            const results = rows
              .filter((row) => row.empresa_id === empresaId && row.deleted_at === null)
              .filter((row) => {
                if (!usesCursor || cursorDate === null || cursorId === null) return true;
                return (
                  row.data_checkin < cursorDate ||
                  (row.data_checkin === cursorDate && row.id < cursorId)
                );
              })
              .sort(
                (a, b) =>
                  b.data_checkin.localeCompare(a.data_checkin) || b.id - a.id,
              )
              .slice(0, fetchLimit)
              .map(toListPayload);

            return { results };
          },
        }),
      };
    }),
  } as unknown as D1Database;

  return {
    db,
    calls,
    insert: (row: StoredHospedagem) => rows.push(row),
    softDelete: (id: number) => {
      const row = rows.find((item) => item.id === id);
      if (row) row.deleted_at = '2026-08-12T00:00:00Z';
    },
  };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/hospedagem', hospedagemRoutes);
  return app;
}

describe('hospedagem keyset pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmpresaIdMock.mockReturnValue(77);
    registrarAuditoriaMock.mockResolvedValue(undefined);
  });

  it('preserves the legacy data array and fixed default cap when pagination is omitted', async () => {
    const { db, calls } = createDatasetDb([
      hospedagem(2, '2026-08-10'),
      hospedagem(1, '2026-08-09'),
    ]);

    const response = await createApp().request(
      '/hospedagem',
      { method: 'GET' },
      { DB: db } as Env,
    );
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number }>;
      pagination?: { limit: number; has_more: boolean; next_cursor: string | null };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map(({ id }) => id)).toEqual([2, 1]);
    expect(body).not.toHaveProperty('pagination');
    expect(calls[0]?.query).toContain('ORDER BY h.data_checkin DESC, h.id DESC LIMIT 500');
    expect(calls[0]?.args).toEqual([77]);
  });

  it('returns first and next pages deterministically, including equal dates without duplicates or gaps', async () => {
    const { db, calls } = createDatasetDb([
      hospedagem(5, '2026-08-10'),
      hospedagem(4, '2026-08-10'),
      hospedagem(3, '2026-08-09'),
      hospedagem(2, '2026-08-08'),
    ]);
    const app = createApp();

    const firstResponse = await app.request(
      '/hospedagem?limit=2',
      { method: 'GET' },
      { DB: db } as Env,
    );
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()) as {
      data: Array<{ id: number }>;
      pagination: { has_more: boolean; next_cursor: string | null; limit: number };
    };

    expect(first.data.map(({ id }) => id)).toEqual([5, 4]);
    expect(first.pagination).toMatchObject({ limit: 2, has_more: true });
    expect(first.pagination.next_cursor).toEqual(expect.any(String));

    const secondResponse = await app.request(
      `/hospedagem?limit=2&cursor=${first.pagination.next_cursor}`,
      { method: 'GET' },
      { DB: db } as Env,
    );
    expect(secondResponse.status).toBe(200);
    const second = (await secondResponse.json()) as {
      data: Array<{ id: number }>;
      pagination: { has_more: boolean; next_cursor: string | null };
    };

    expect(second.data.map(({ id }) => id)).toEqual([3, 2]);
    expect(second.pagination).toEqual({ limit: 2, has_more: false, next_cursor: null });

    const combined = [...first.data, ...second.data].map(({ id }) => id);
    expect(combined).toEqual([5, 4, 3, 2]);
    expect(new Set(combined).size).toBe(combined.length);
    expect(calls[1]?.query).toContain(
      'AND (h.data_checkin < ? OR (h.data_checkin = ? AND h.id < ?))',
    );
    expect(calls[1]?.query).toContain('ORDER BY h.data_checkin DESC, h.id DESC LIMIT ?');
    expect(calls[1]?.args).toEqual([77, '2026-08-10', '2026-08-10', 4, 3]);
  });

  it('does not duplicate or skip the continuation when a newer record is inserted between requests', async () => {
    const dataset = createDatasetDb([
      hospedagem(4, '2026-08-10'),
      hospedagem(3, '2026-08-09'),
      hospedagem(2, '2026-08-08'),
      hospedagem(1, '2026-08-07'),
    ]);
    const app = createApp();

    const firstResponse = await app.request(
      '/hospedagem?limit=2',
      { method: 'GET' },
      { DB: dataset.db } as Env,
    );
    const first = (await firstResponse.json()) as {
      data: Array<{ id: number }>;
      pagination: { next_cursor: string };
    };

    dataset.insert(hospedagem(5, '2026-08-11'));

    const secondResponse = await app.request(
      `/hospedagem?limit=2&cursor=${first.pagination.next_cursor}`,
      { method: 'GET' },
      { DB: dataset.db } as Env,
    );
    const second = (await secondResponse.json()) as { data: Array<{ id: number }> };

    expect(first.data.map(({ id }) => id)).toEqual([4, 3]);
    expect(second.data.map(({ id }) => id)).toEqual([2, 1]);
    expect([...first.data, ...second.data].map(({ id }) => id)).toEqual([4, 3, 2, 1]);
  });

  it.each(['0', '-1', '501'])('rejects invalid limit %s', async (limit) => {
    const { db, calls } = createDatasetDb([]);
    const response = await createApp().request(
      `/hospedagem?limit=${limit}`,
      { method: 'GET' },
      { DB: db } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Limite deve ser um inteiro entre 1 e 500',
    });
    expect(calls).toHaveLength(0);
  });

  it('rejects a malformed cursor', async () => {
    const { db, calls } = createDatasetDb([]);
    const response = await createApp().request(
      '/hospedagem?cursor=%25%25%25',
      { method: 'GET' },
      { DB: db } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Cursor inválido',
    });
    expect(calls).toHaveLength(0);
  });

  it('excludes a record soft-deleted between pages without duplicating the continuation', async () => {
    const dataset = createDatasetDb([
      hospedagem(4, '2026-08-10'),
      hospedagem(3, '2026-08-09'),
      hospedagem(2, '2026-08-08'),
      hospedagem(1, '2026-08-07'),
    ]);
    const app = createApp();

    const firstResponse = await app.request(
      '/hospedagem?limit=2',
      { method: 'GET' },
      { DB: dataset.db } as Env,
    );
    const first = (await firstResponse.json()) as {
      data: Array<{ id: number }>;
      pagination: { next_cursor: string };
    };

    dataset.softDelete(2);

    const secondResponse = await app.request(
      `/hospedagem?limit=2&cursor=${first.pagination.next_cursor}`,
      { method: 'GET' },
      { DB: dataset.db } as Env,
    );
    const second = (await secondResponse.json()) as {
      data: Array<{ id: number }>;
      pagination: { has_more: boolean; next_cursor: string | null };
    };

    expect(first.data.map(({ id }) => id)).toEqual([4, 3]);
    expect(second.data.map(({ id }) => id)).toEqual([1]);
    expect(second.pagination).toMatchObject({ has_more: false, next_cursor: null });
  });

  it('keeps tenant and soft-delete filtering on paginated lists', async () => {
    const { db } = createDatasetDb([
      hospedagem(1, '2026-08-08', 77),
      hospedagem(2, '2026-08-10', 88),
      hospedagem(3, '2026-08-09', 77, '2026-08-10T00:00:00Z'),
    ]);

    const response = await createApp().request(
      '/hospedagem?limit=10',
      { method: 'GET' },
      { DB: db } as Env,
    );
    const body = (await response.json()) as {
      data: Array<{ id: number }>;
      pagination: { has_more: boolean; next_cursor: string | null };
    };

    expect(response.status).toBe(200);
    expect(body.data.map(({ id }) => id)).toEqual([1]);
    expect(body.pagination).toMatchObject({ has_more: false, next_cursor: null });
  });

  it('returns an empty final page contract for an empty list', async () => {
    const { db } = createDatasetDb([]);
    const response = await createApp().request(
      '/hospedagem?limit=25',
      { method: 'GET' },
      { DB: db } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [],
      pagination: { limit: 25, has_more: false, next_cursor: null },
    });
  });

  it('rejects a cursor issued for another tenant before querying D1', async () => {
    const dataset = createDatasetDb([
      hospedagem(2, '2026-08-10', 88),
      hospedagem(1, '2026-08-09', 88),
    ]);
    const app = createApp();

    getEmpresaIdMock.mockReturnValue(88);
    const tenant88Response = await app.request(
      '/hospedagem?limit=1',
      { method: 'GET' },
      { DB: dataset.db } as Env,
    );
    const tenant88Body = (await tenant88Response.json()) as {
      pagination: { next_cursor: string };
    };
    expect(tenant88Body.pagination.next_cursor).toEqual(expect.any(String));

    const callsBeforeCrossTenantRequest = dataset.calls.length;
    getEmpresaIdMock.mockReturnValue(77);
    const crossTenantResponse = await app.request(
      `/hospedagem?limit=1&cursor=${tenant88Body.pagination.next_cursor}`,
      { method: 'GET' },
      { DB: dataset.db } as Env,
    );

    expect(crossTenantResponse.status).toBe(400);
    await expect(crossTenantResponse.json()).resolves.toMatchObject({
      success: false,
      error: 'Cursor inválido',
    });
    expect(dataset.calls).toHaveLength(callsBeforeCrossTenantRequest);
  });
});
