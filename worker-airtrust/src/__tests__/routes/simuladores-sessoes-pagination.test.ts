import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 1);
    c.set('userId', 1);
    c.set('userRole', String(c.env?.__mockRole || 'admin'));
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `tenant-${empresaId}`,
      empresaNome: `Tenant ${empresaId}`,
      role: 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    });
    await next();
  },
  optionalAuth: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

import simuladoresSessoesRoutes from '../../routes/simuladores-sessoes';

type QueryArgs = {
  agendamentos: unknown[][];
  instrutores: unknown[][];
  sessoes: unknown[][];
  sessoesSummary: unknown[][];
  sessoesRawQueries: string[];
};

function createPaginationDb() {
  const binds: QueryArgs = {
    agendamentos: [],
    instrutores: [],
    sessoes: [],
    sessoesSummary: [],
    sessoesRawQueries: [],
  };

  const db = {
    prepare: vi.fn((query: string) => {
      if (query === 'PRAGMA table_info(simulador_agendamentos)') {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({
              results: [{ name: 'tipo_dispositivo' }, { name: 'aeronave_id' }],
            }),
            first: async () => null,
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('FROM simulador_agendamentos sa') && query.includes('sa.uuid')) {
        binds.sessoesRawQueries.push(query);

        if (query.includes('json_group_array')) {
          return {
            bind: (...args: unknown[]) => {
              binds.sessoes.push(args);
              return {
                all: async () => ({
                  results: [
                    {
                      id: 10,
                      data: '2026-05-26',
                      horario_inicio: '08:00',
                      horario_fim: '10:00',
                      participantes_json: '[]',
                      fichas_json: '[]',
                    },
                  ],
                }),
              };
            },
          };
        }

        return {
          bind: (...args: unknown[]) => {
            binds.sessoesSummary.push(args);
            return {
              all: async () => ({
                results: [
                  {
                    id: 11,
                    uuid: 'summary-uuid',
                    data: '2026-05-26',
                    horario_inicio: '08:00',
                    horario_fim: '10:00',
                    simulador_nome: 'SIM A',
                    instrutor_nome: 'Instrutor A',
                    status: 'AGENDADO',
                  },
                ],
              }),
            };
          },
        };
      }

      if (query.includes('FROM simulador_agendamentos sa')) {
        return {
          bind: (...args: unknown[]) => {
            binds.agendamentos.push(args);
            return {
              all: async () => ({
                results: [
                  {
                    id: 1,
                    data: '2026-05-26',
                    hora_inicio: '08:00',
                    hora_fim: '10:00',
                    participantes: '[]',
                  },
                ],
              }),
            };
          },
        };
      }

      if (query.includes('FROM funcionarios') && query.includes('is_instrutor = 1')) {
        return {
          bind: (...args: unknown[]) => {
            binds.instrutores.push(args);
            return {
              all: async () => ({
                results: [
                  {
                    id: 1,
                    nome: 'Instrutor A',
                    codigo_anac: 'ANAC1',
                    matricula: 'M1',
                  },
                ],
              }),
            };
          },
        };
      }

      throw new Error(`Unhandled query in test: ${query}`);
    }),
  } as unknown as D1Database;

  return { db, binds };
}

describe('simuladores pagination caps', () => {
  it('agendamentos aplica default limit/offset e mantém resposta compatível', async () => {
    const { db, binds } = createPaginationDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/agendamentos', { method: 'GET' }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: unknown[];
      pagination: { limit: number; offset: number };
    };
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.pagination).toMatchObject({ limit: 100, offset: 0 });
    expect(binds.agendamentos.at(-1)?.slice(-2)).toEqual([100, 0]);
  });

  it('agendamentos respeita cap máximo e normaliza offset inválido', async () => {
    const { db, binds } = createPaginationDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/agendamentos?limit=999&offset=-10', { method: 'GET' }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      pagination: {
        limit: 200,
        offset: 0,
      },
    });
    expect(binds.agendamentos.at(-1)?.slice(-2)).toEqual([200, 0]);
  });

  it('instrutores aplica default em parâmetro inválido e cap em parâmetro alto', async () => {
    const defaultResponse = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/instrutores?limit=abc&offset=2', { method: 'GET' }),
      { DB: createPaginationDb().db } as unknown as Env,
      {} as ExecutionContext,
    );
    expect(defaultResponse.status).toBe(200);
    await expect(defaultResponse.json()).resolves.toMatchObject({
      success: true,
      pagination: { limit: 100, offset: 2 },
    });

    const { db, binds } = createPaginationDb();
    const cappedResponse = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/instrutores?limit=999&offset=3', { method: 'GET' }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(cappedResponse.status).toBe(200);
    await expect(cappedResponse.json()).resolves.toMatchObject({
      success: true,
      pagination: { limit: 200, offset: 3 },
    });
    expect(binds.instrutores.at(-1)).toEqual([1, 200, 3]);
  });

  it('sessoes parametriza limite com cap e preserva formato da resposta', async () => {
    const { db, binds } = createPaginationDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes?limit=999&offset=5', { method: 'GET' }),
      { DB: db, __mockRole: 'admin' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: Array<{ participantes?: unknown[]; fichas?: unknown[] }>;
      pagination: { limit: number; offset: number };
    };
    expect(payload.success).toBe(true);
    expect(Array.isArray(payload.data)).toBe(true);
    expect(Array.isArray(payload.data[0]?.participantes)).toBe(true);
    expect(Array.isArray(payload.data[0]?.fichas)).toBe(true);
    expect(payload.pagination).toMatchObject({
      limit: 200,
      offset: 5,
    });
    expect(binds.sessoes.at(-1)?.slice(-2)).toEqual([200, 5]);
  });

  it('sessoes view=summary evita agregações JSON e mantém contrato de resposta', async () => {
    const { db, binds } = createPaginationDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes?view=summary&limit=50&offset=2', { method: 'GET' }),
      { DB: db, __mockRole: 'admin' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      success: boolean;
      data: Array<{ participantes?: unknown[]; fichas?: unknown[] }>;
      pagination: { limit: number; offset: number };
    };

    expect(payload.success).toBe(true);
    expect(payload.pagination).toMatchObject({ limit: 50, offset: 2 });
    expect(Array.isArray(payload.data)).toBe(true);
    expect(Array.isArray(payload.data[0]?.participantes)).toBe(true);
    expect(Array.isArray(payload.data[0]?.fichas)).toBe(true);
    expect(payload.data[0]?.participantes).toEqual([]);
    expect(payload.data[0]?.fichas).toEqual([]);

    expect(binds.sessoesSummary.at(-1)?.slice(-2)).toEqual([50, 2]);
    const usedQuery = binds.sessoesRawQueries.at(-1) || '';
    expect(usedQuery.includes('json_group_array')).toBe(false);
  });

  it('sessoes aceita filtro de status com order asc para lista de próximos', async () => {
    const { db, binds } = createPaginationDb();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request(
        'http://localhost/sessoes?view=summary&status=agendado,pendente&order=asc&data_inicio=2026-05-01&limit=10&offset=0',
        { method: 'GET' },
      ),
      { DB: db, __mockRole: 'admin' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      pagination: { limit: 10, offset: 0 },
    });

    const usedQuery = binds.sessoesRawQueries.at(-1) || '';
    expect(usedQuery.includes("UPPER(COALESCE(sa.status, '')) IN (?,?)")).toBe(true);
    expect(usedQuery.includes('ORDER BY sa.data ASC, sa.hora_inicio ASC')).toBe(true);
    expect(binds.sessoesSummary.at(-1)).toEqual(['2026-05-01', 'AGENDADO', 'PENDENTE', 1, 10, 0]);
  });
});
