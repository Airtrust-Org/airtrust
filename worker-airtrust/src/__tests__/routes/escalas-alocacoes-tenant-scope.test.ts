import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 'user-1');
    c.set('userRole', c.req.header('x-role') || 'manager');
    c.set('empresaId', Number(c.req.header('x-empresa-id') || 1));
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../shared/domainEvents', () => ({
  publishDomainEvent: vi.fn(async () => undefined),
}));

import alocacoesRoutes from '../../routes/escalas-alocacoes';
import { checarSobreposicaoFuncionario } from '../../routes/escalas-alocacoes-helpers-internal';

type QueryLog = { sql: string; binds: unknown[]; method: 'first' | 'all' | 'run' };

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function createEscalasDb() {
  const logs: QueryLog[] = [];
  const escalas = [
    { id: 'esc-a', empresa_id: 1, ano: 2026, mes: 6, status: 'rascunho', deleted_at: null },
    { id: 'esc-b', empresa_id: 2, ano: 2026, mes: 6, status: 'rascunho', deleted_at: null },
  ];
  const alocacoes = [
    {
      id: 'aloc-a',
      escala_id: 'esc-a',
      funcionario_id: 'func-a',
      aeronave_id: 10,
      funcao: 'PIC',
      quinzena_id: 1,
      data_inicio: '2026-06-10',
      data_fim: '2026-06-10',
      status: 'planejado',
      deleted_at: null,
      auto_gerado: 0,
    },
    {
      id: 'aloc-b',
      escala_id: 'esc-b',
      funcionario_id: 'func-b',
      aeronave_id: 20,
      funcao: 'SIC',
      quinzena_id: 1,
      data_inicio: '2026-06-10',
      data_fim: '2026-06-10',
      status: 'planejado',
      deleted_at: null,
      auto_gerado: 0,
    },
  ];

  const db = {
    prepare: vi.fn((sql: string) => {
      const normalized = normalizeSql(sql);
      let binds: unknown[] = [];

      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async <T = unknown>() => {
          logs.push({ sql: normalized, binds, method: 'first' });

          if (
            normalized.includes(
              'SELECT * FROM escalas_mensais WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
            )
          ) {
            const [escalaId, empresaId] = binds as [string, number];
            return (
              escalas.find((item) => item.id === escalaId && item.empresa_id === empresaId) || null
            ) as T | null;
          }

          if (
            normalized.includes(
              'SELECT * FROM escala_alocacoes WHERE id = ? AND escala_id = ? AND deleted_at IS NULL LIMIT 1',
            )
          ) {
            const [alocacaoId, escalaId] = binds as [string, string];
            return (
              alocacoes.find((item) => item.id === alocacaoId && item.escala_id === escalaId) || null
            ) as T | null;
          }

          if (
            normalized.includes(
              'SELECT id, aeronave_id, funcionario_id, funcao, quinzena_id, auto_gerado FROM escala_alocacoes',
            )
          ) {
            const [alocacaoId, escalaId] = binds as [string, string];
            return (
              alocacoes.find((item) => item.id === alocacaoId && item.escala_id === escalaId) || null
            ) as T | null;
          }

          return null as T | null;
        },
        all: async <T = unknown>() => {
          logs.push({ sql: normalized, binds, method: 'all' });

          if (normalized.includes('FROM escala_alocacoes ea') && normalized.includes('ea.escala_id = ?')) {
            const escalaId = String(binds[0] ?? '');
            const rows = alocacoes
              .filter((item) => item.escala_id === escalaId)
              .map((item) => ({
                id: item.id,
                escala_id: item.escala_id,
                funcionario_id: item.funcionario_id,
                aeronave_id: item.aeronave_id,
                funcao: item.funcao,
                situacao_tipo: null,
                situacao_cor: null,
                situacao_nome: null,
                situacao_icone: null,
                situacao_bloqueia_alocacao: null,
                quinzena_id: item.quinzena_id,
                data_inicio: item.data_inicio,
                data_fim: item.data_fim,
                padrao_escala_id: null,
                base: null,
                observacoes: null,
                status: item.status,
                created_by: 'user-1',
                created_at: '2026-06-01T00:00:00.000Z',
                updated_at: '2026-06-01T00:00:00.000Z',
                funcionario_nome: `Nome ${item.funcionario_id}`,
                funcionario_guerra: null,
                funcionario_matricula: null,
                funcionario_role: null,
                funcionario_quinzena: null,
                funcionario_is_instrutor: 0,
                aeronave_prefixo: `PR-${item.aeronave_id}`,
                aeronave_modelo: 'AW139',
                modelo_aeronave: 'AW139',
                funcionario_modelo_aeronave: 'AW139',
              }));
            return { results: rows as T[] };
          }

          return { results: [] as T[] };
        },
        run: async () => {
          logs.push({ sql: normalized, binds, method: 'run' });
          return { meta: { changes: 1 } };
        },
      };

      return statement;
    }),
  } as unknown as D1Database;

  return { db, logs };
}

function createOverlapDb() {
  const calls: QueryLog[] = [];
  const db = {
    prepare: (sql: string) => {
      const normalized = normalizeSql(sql);
      let binds: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          binds = args;
          return statement;
        },
        first: async () => {
          calls.push({ sql: normalized, binds, method: 'first' });
          if (normalized.includes('FROM escala_alocacoes ea')) {
            const empresaId = Number(binds[1]);
            if (empresaId === 2) {
              return {
                id: 'conf-b',
                escala_id: 'esc-b',
                data_inicio: '2026-06-10',
                data_fim: '2026-06-10',
                aeronave_id: 20,
                situacao_tipo: null,
              };
            }
            return null;
          }
          return null;
        },
      };
      return statement;
    },
  } as unknown as D1Database;

  return { db, calls };
}

describe('escalas alocacoes tenant scope', () => {
  it('lista alocacoes apenas da escala/tenant autenticados', async () => {
    const { db } = createEscalasDb();

    const response = await alocacoesRoutes.fetch(
      new Request('http://localhost/esc-a/alocacoes', { method: 'GET', headers: { 'x-empresa-id': '1' } }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as any;
    expect(payload.success).toBe(true);
    expect(payload.data.total).toBe(1);
    expect(payload.data.alocacoes[0].id).toBe('aloc-a');
  });

  it('bloqueia leitura de escala de outro tenant', async () => {
    const { db } = createEscalasDb();

    const response = await alocacoesRoutes.fetch(
      new Request('http://localhost/esc-b/alocacoes', { method: 'GET', headers: { 'x-empresa-id': '1' } }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
  });

  it('bloqueia criacao quando escala_id e de outro tenant', async () => {
    const { db } = createEscalasDb();

    const response = await alocacoesRoutes.fetch(
      new Request('http://localhost/esc-b/alocacoes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '1' },
        body: JSON.stringify({
          funcionario_id: 'func-a',
          funcao: 'PIC',
          data_inicio: '2026-06-10',
          data_fim: '2026-06-10',
        }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
  });

  it('bloqueia update de alocacao de outro tenant', async () => {
    const { db } = createEscalasDb();

    const response = await alocacoesRoutes.fetch(
      new Request('http://localhost/esc-a/alocacoes/aloc-b', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '1' },
        body: JSON.stringify({ observacoes: 'teste' }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
  });

  it('bloqueia delete de alocacao de outro tenant', async () => {
    const { db } = createEscalasDb();

    const response = await alocacoesRoutes.fetch(
      new Request('http://localhost/esc-a/alocacoes/aloc-b', {
        method: 'DELETE',
        headers: { 'x-role': 'manager', 'x-empresa-id': '1' },
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
  });

  it('escopa checagem de sobreposicao por tenant (ignora conflito de outro tenant)', async () => {
    const { db, calls } = createOverlapDb();

    const tenantAConflict = await checarSobreposicaoFuncionario(
      db,
      1,
      'func-x',
      '2026-06-10',
      '2026-06-10',
      undefined,
      null,
    );
    const tenantBConflict = await checarSobreposicaoFuncionario(
      db,
      2,
      'func-x',
      '2026-06-10',
      '2026-06-10',
      undefined,
      null,
    );

    expect(tenantAConflict).toBeNull();
    expect(tenantBConflict).toMatchObject({ id: 'conf-b', escala_id: 'esc-b' });
    const overlapSql = calls.find((item) => item.sql.includes('FROM escala_alocacoes ea'));
    expect(overlapSql?.sql).toContain('em.empresa_id = ?');
  });
});

