/**
 * Costa do Sol cadastral frente (2026-08-26): centro_custo is an
 * informational-only reference field on setores — it must round-trip
 * through GET/POST/PUT and must never influence RBAC/tenant scoping. This
 * exercises the real route handlers against a fake D1 binding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', Number(c.req.header('x-test-user-id') || 1));
    c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 1));
    c.set('userRole', c.req.header('x-test-role') || 'admin');
    await next();
  },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue(undefined),
  extrairUsuarioAuditoria: () => ({ usuario_id: 1, usuario_nome: 'teste' }),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn().mockResolvedValue({ mode: 'all', setorIds: [] }),
}));

import router from '../../routes/setores';

type SetorRow = {
  id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  responsavel: string | null;
  centro_custo: string | null;
  ativo: number;
  empresa_id: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function buildApp(setores: SetorRow[]) {
  const db = {
    prepare: vi.fn((query: string) => {
      let bound: unknown[] = [];
      const api = {
        bind: (...args: unknown[]) => {
          bound = args;
          return api;
        },
        all: async () => {
          if (query.includes('FROM setores') && query.includes('WHERE id = ?')) {
            const [id, empresaId] = bound as [number, number];
            const row = setores.find(
              (s) => s.id === Number(id) && s.empresa_id === Number(empresaId) && !s.deleted_at,
            );
            return { results: row ? [row] : [] };
          }
          if (query.includes('FROM setores')) {
            const [empresaId] = bound as [number];
            return {
              results: setores.filter((s) => s.empresa_id === Number(empresaId) && !s.deleted_at),
            };
          }
          return { results: [] };
        },
        first: async () => null,
        run: async () => {
          if (query.trim().startsWith('INSERT INTO setores')) {
            const [codigo, nome, descricao, responsavel, centro_custo, empresa_id] =
              bound as [string, string, string | null, string | null, string | null, number];
            const id = setores.length + 1;
            setores.push({
              id,
              codigo,
              nome,
              descricao,
              responsavel,
              centro_custo,
              ativo: 1,
              empresa_id,
              deleted_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            return { meta: { last_row_id: id } };
          }
          if (query.trim().startsWith('UPDATE setores')) {
            const id = Number(bound[bound.length - 2]);
            const empresaId = Number(bound[bound.length - 1]);
            const row = setores.find((s) => s.id === id && s.empresa_id === empresaId);
            if (row) {
              const fieldOrder = query
                .match(/SET (.+) WHERE/)?.[1]
                .split(',')
                .map((f) => f.trim().split(' = ')[0].trim())
                .filter((f) => f !== 'updated_at');
              fieldOrder?.forEach((field, i) => {
                (row as any)[field] = bound[i];
              });
            }
            return { meta: {} };
          }
          return { meta: {} };
        },
      };
      return api;
    }),
  };

  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/setores', router);
  return { app, db, setores };
}

const baseHeaders = {
  'x-test-empresa-id': '1',
  'x-test-role': 'admin',
};

describe('setores centro_custo', () => {
  let setores: SetorRow[];

  beforeEach(() => {
    setores = [
      {
        id: 10,
        codigo: 'TRI',
        nome: 'Tripulação',
        descricao: null,
        responsavel: null,
        centro_custo: 'AW139 RATEIO CC 330',
        ativo: 1,
        empresa_id: 1,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 20,
        codigo: 'OUTRO',
        nome: 'Outro Tenant',
        descricao: null,
        responsavel: null,
        centro_custo: 'X',
        ativo: 1,
        empresa_id: 2,
        deleted_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
  });

  it('GET /api/setores retorna centro_custo', async () => {
    const { app, db } = buildApp(setores);
    const res = await app.request(
      '/api/setores',
      { headers: baseHeaders },
      { DB: db } as unknown as Env,
    );
    const body = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].centro_custo).toBe('AW139 RATEIO CC 330');
  });

  it('GET /api/setores não vaza setor de outro tenant', async () => {
    const { app, db } = buildApp(setores);
    const res = await app.request(
      '/api/setores',
      { headers: baseHeaders },
      { DB: db } as unknown as Env,
    );
    const body = (await res.json()) as any;
    expect(body.data.map((s: SetorRow) => s.id)).toEqual([10]);
  });

  it('POST /api/setores persiste centro_custo no tenant correto', async () => {
    const { app, db, setores: rows } = buildApp(setores);
    const res = await app.request(
      '/api/setores',
      {
        method: 'POST',
        headers: { ...baseHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
          codigo: 'COMERCIAL',
          nome: 'Comercial',
          centro_custo: 'COMERCIAL CC 205',
        }),
      },
      { DB: db } as unknown as Env,
    );
    const body = (await res.json()) as any;
    expect(res.status).toBe(201);
    expect(body.data.centro_custo).toBe('COMERCIAL CC 205');
    const created = rows.find((r) => r.codigo === 'COMERCIAL');
    expect(created?.empresa_id).toBe(1);
  });

  it('PUT /api/setores/:id atualiza centro_custo mantendo tenant isolation', async () => {
    const { app, db, setores: rows } = buildApp(setores);
    const res = await app.request(
      '/api/setores/10',
      {
        method: 'PUT',
        headers: { ...baseHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ centro_custo: 'NOVO CC' }),
      },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(200);
    expect(rows.find((r) => r.id === 10)?.centro_custo).toBe('NOVO CC');
  });

  it('PUT /api/setores/:id não atualiza setor de outro tenant', async () => {
    const { app, db, setores: rows } = buildApp(setores);
    const res = await app.request(
      '/api/setores/20',
      {
        method: 'PUT',
        headers: { ...baseHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ centro_custo: 'TENTATIVA' }),
      },
      { DB: db } as unknown as Env,
    );
    expect(res.status).toBe(404);
    expect(rows.find((r) => r.id === 20)?.centro_custo).toBe('X');
  });

  it('centro_custo não é usado para calcular acesso/role (RBAC segue via getEmployeeSectorAccess, não por centro_custo)', async () => {
    const { getEmployeeSectorAccess } = await import('../../services/employee-sector-access');
    const { app, db } = buildApp(setores);
    await app.request('/api/setores', { headers: baseHeaders }, { DB: db } as unknown as Env);
    const call = (getEmployeeSectorAccess as any).mock.calls[0];
    expect(call[1]).toBe(1);
    expect(JSON.stringify(call)).not.toContain('centro_custo');
  });
});
