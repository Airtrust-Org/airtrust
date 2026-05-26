import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', c.req.header('x-role') ?? 'manager');
    c.set('empresaId', Number(c.req.header('x-empresa-id') ?? 1));
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

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') ?? 0),
}));

vi.mock('../../routes/escalas-alocacoes-helpers-internal', () => ({
  verificarHabilitacaoModelo: vi.fn(async () => ({ habilitado: true })),
}));

import evdRoutes from '../../routes/escalas-evd';

type QueryCall = { query: string; args: unknown[]; method: 'first' | 'all' | 'run' };
type QueryHandler = {
  match: (query: string) => boolean;
  first?: (args: unknown[]) => unknown;
  all?: (args: unknown[]) => unknown;
  run?: (args: unknown[]) => unknown;
};

function createMockDb(handlers: QueryHandler[]) {
  const calls: QueryCall[] = [];

  const db = {
    prepare: (query: string) => {
      const handler = handlers.find((h) => h.match(query));
      if (!handler) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        const result = handler.all ? handler.all(args) : { results: [] };
        return result as { results: unknown[] };
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { changes: 1 } };
      };

      return {
        first: async () => executeFirst([]),
        all: async () => executeAll([]),
        run: async () => executeRun([]),
        bind: (...boundArgs: unknown[]) => ({
          first: async () => executeFirst(boundArgs),
          all: async () => executeAll(boundArgs),
          run: async () => executeRun(boundArgs),
        }),
      };
    },
  } as unknown as D1Database;

  return { db, calls };
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/evd', evdRoutes);
  return app;
}

describe('EVD operational regression coverage', () => {
  it('bloqueia POST /evd/publicacoes com conflito operacional crítico de tripulação', async () => {
    const dailyRows = [
      {
        id: 'evd-1',
        escala_id: 'esc-1',
        status: 'RASCUNHO',
        data: '2026-07-10',
        pic_id: 101,
        sic_id: 202,
        pic_nome: 'PIC A',
        pic_guerra: 'PA',
        sic_nome: 'SIC B',
        sic_guerra: 'SB',
        pic_funcao: 'PIC',
        sic_funcao: 'SIC',
        aeronave_prefixo: null,
        aeronave_modelo: null,
        hora_apresentacao: '08:00',
        hora_decolagem_prevista: '08:30',
        hora_pouso_previsto: '09:30',
        hora_decolagem_real: null,
        hora_pouso_real: null,
        hora_corte_motor: null,
        repouso_minimo_ok: 1,
        origem: 'SBSP',
        destino: 'SBGL',
        tipo_missao: 'OFFSHORE',
        observacoes: null,
        aprovado_em: null,
      },
    ];

    const { db, calls } = createMockDb([
      {
        match: (q) => q.includes('FROM escala_voo_diaria e') && q.includes('ORDER BY COALESCE(e.hora_apresentacao'),
        all: () => ({ results: dailyRows }),
      },
      {
        match: (q) => q.includes('FROM escala_voo_diaria_justificativas') && q.includes('escala_voo_diaria_id IN ('),
        all: () => ({ results: [] }),
      },
      {
        match: (q) => q.includes('pic_id IN (') && q.includes('OR sic_id IN ('),
        all: () => ({
          results: [
            {
              id: 'evd-2',
              pic_id: 101,
              sic_id: 999,
              hora_apresentacao: '08:10',
              hora_decolagem_prevista: '08:40',
              hora_pouso_previsto: '09:40',
            },
          ],
        }),
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/evd/publicacoes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-role': 'manager',
          'x-empresa-id': '1',
        },
        body: JSON.stringify({ data_ref: '2026-07-10' }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'DUPLICATE_CREW',
      voo_id: 'evd-1',
    });
    expect(calls.some((c) => c.method === 'run' && c.query.includes('INSERT INTO escala_voo_diaria_publicacoes'))).toBe(false);
  });

  it('publica com sucesso via /evd/publicacoes preservando empresa_id no fluxo', async () => {
    const dailyRows = [
      {
        id: 'evd-10',
        escala_id: 'esc-10',
        status: 'RASCUNHO',
        data: '2026-07-11',
        pic_id: 101,
        sic_id: 202,
        pic_nome: 'PIC A',
        pic_guerra: 'PA',
        sic_nome: 'SIC B',
        sic_guerra: 'SB',
        pic_funcao: 'PIC',
        sic_funcao: 'SIC',
        aeronave_prefixo: null,
        aeronave_modelo: null,
        hora_apresentacao: '09:00',
        hora_decolagem_prevista: '09:30',
        hora_pouso_previsto: '10:30',
        hora_decolagem_real: null,
        hora_pouso_real: null,
        hora_corte_motor: null,
        repouso_minimo_ok: 1,
        origem: 'SBSP',
        destino: 'SBGL',
        tipo_missao: 'OFFSHORE',
        observacoes: 'ok para publicar',
        aprovado_em: null,
      },
    ];

    const { db, calls } = createMockDb([
      {
        match: (q) => q.includes('FROM escala_voo_diaria e') && q.includes('ORDER BY COALESCE(e.hora_apresentacao'),
        all: () => ({ results: dailyRows }),
      },
      {
        match: (q) => q.includes('FROM escala_voo_diaria_justificativas') && q.includes('escala_voo_diaria_id IN ('),
        all: () => ({ results: [] }),
      },
      {
        match: (q) => q.includes('pic_id IN (') && q.includes('OR sic_id IN ('),
        all: () => ({ results: [] }),
      },
      {
        match: (q) => q.includes('FROM funcionario_ferias'),
        first: () => null,
      },
      {
        match: (q) => q.includes('FROM escala_alocacoes ea'),
        all: () => ({ results: [] }),
      },
      {
        match: (q) => q.includes('SELECT funcao, cargo') && q.includes('FROM funcionarios'),
        first: () => null,
      },
      {
        match: (q) => q.includes('COALESCE(MAX(revisao), -1) + 1 AS next_revisao'),
        first: () => ({ next_revisao: 2 }),
      },
      {
        match: (q) => q.includes('INSERT INTO escala_voo_diaria_publicacoes'),
        run: () => ({ meta: { changes: 1 } }),
      },
      {
        match: (q) => q.includes("UPDATE escala_voo_diaria") && q.includes("SET status = 'PUBLICADA'") && q.includes('AND data = ?'),
        run: () => ({ meta: { changes: 1 } }),
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/evd/publicacoes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-role': 'manager',
          'x-empresa-id': '77',
        },
        body: JSON.stringify({ data_ref: '2026-07-11', observacoes: 'publicacao oficial' }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success: boolean; data: { empresa_id: string; revisao: number } };
    expect(payload.success).toBe(true);
    expect(payload.data.empresa_id).toBe('77');
    expect(payload.data.revisao).toBe(2);

    const dayQueryCall = calls.find(
      (c) => c.method === 'all' && c.query.includes('FROM escala_voo_diaria e') && c.query.includes('ORDER BY COALESCE(e.hora_apresentacao'),
    );
    expect(dayQueryCall?.args[0]).toBe(77);
    expect(dayQueryCall?.args[1]).toBe('2026-07-11');

    const insertCall = calls.find((c) => c.method === 'run' && c.query.includes('INSERT INTO escala_voo_diaria_publicacoes'));
    expect(insertCall?.args[1]).toBe('77');

    const updateCall = calls.find((c) => c.method === 'run' && c.query.includes("UPDATE escala_voo_diaria") && c.query.includes("SET status = 'PUBLICADA'"));
    expect(updateCall?.args[2]).toBe(77);
    expect(updateCall?.args[3]).toBe('2026-07-11');
  });

  it('rejeita criação em POST /evd quando conflito de tripulação é detectado', async () => {
    const { db, calls } = createMockDb([
      {
        match: (q) => q.includes('pic_id IN (') && q.includes('OR sic_id IN ('),
        all: () => ({
          results: [
            {
              id: 'evd-existing',
              pic_id: 777,
              sic_id: 202,
              hora_apresentacao: '08:00',
              hora_decolagem_prevista: '08:30',
              hora_pouso_previsto: '09:30',
            },
          ],
        }),
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/evd', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-role': 'manager',
          'x-empresa-id': '1',
        },
        body: JSON.stringify({
          data: '2026-07-12',
          pic_id: 777,
          sic_id: 202,
          hora_apresentacao: '08:00',
          hora_decolagem_prevista: '08:30',
          hora_pouso_previsto: '09:30',
          tipo_missao: 'OFFSHORE',
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Tripulante já alocado em outra escala diária na mesma data/intervalo.',
    });
    expect(calls.some((c) => c.method === 'run' && c.query.includes('INSERT INTO escala_voo_diaria'))).toBe(false);
  });

  it('exige justificativa estruturada em /evd/:id/publicar quando require_justificativa=true', async () => {
    const { db, calls } = createMockDb([
      {
        match: (q) => q.includes('SELECT id, status, data, escala_id, pic_id, sic_id, aeronave_prefixo'),
        first: () => ({
          id: 'evd-pub-1',
          status: 'RASCUNHO',
          data: '2026-07-13',
          escala_id: 'esc-13',
          pic_id: 101,
          sic_id: 202,
          aeronave_prefixo: null,
          aeronave_modelo: null,
          repouso_minimo_ok: 1,
          observacoes: '',
          hora_apresentacao: '07:00',
          hora_decolagem_prevista: '07:30',
          hora_pouso_previsto: '08:30',
        }),
      },
      {
        match: (q) => q.includes('pic_id IN (') && q.includes('OR sic_id IN ('),
        all: () => ({ results: [] }),
      },
      {
        match: (q) => q.includes('FROM funcionario_ferias'),
        first: () => null,
      },
      {
        match: (q) => q.includes('FROM escala_alocacoes ea'),
        all: () => ({ results: [] }),
      },
      {
        match: (q) => q.includes('SELECT funcao, cargo') && q.includes('FROM funcionarios'),
        first: () => null,
      },
      {
        match: (q) => q.includes('FROM escala_voo_diaria_justificativas') && q.includes('LIMIT 1'),
        first: () => null,
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/evd/evd-pub-1/publicar', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-role': 'manager',
          'x-empresa-id': '1',
        },
        body: JSON.stringify({ require_justificativa: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'JUSTIFICATIVA_OPERACIONAL_OBRIGATORIA',
      requires_justificativa: true,
    });
    expect(calls.some((c) => c.method === 'run' && c.query.includes("SET status = 'PUBLICADA'"))).toBe(false);
  });

  it('lista EVD por data com filtro de tenant preservado em bind', async () => {
    const { db, calls } = createMockDb([
      {
        match: (q) => q.includes('FROM escala_voo_diaria e') && q.includes('ORDER BY e.hora_apresentacao ASC'),
        all: () => ({ results: [{ id: 'evd-tenant-1', data: '2026-07-14' }] }),
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/evd?data=2026-07-14', {
        method: 'GET',
        headers: { 'x-empresa-id': '88' },
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [{ id: 'evd-tenant-1', data: '2026-07-14' }],
    });

    const queryCall = calls.find(
      (c) => c.method === 'all' && c.query.includes('FROM escala_voo_diaria e') && c.query.includes('WHERE e.empresa_id = ? AND e.data = ?'),
    );
    expect(queryCall?.args).toEqual([88, '2026-07-14']);
  });
});
