import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const authMode = String(c.env?.__authMode || 'ok');

    if (authMode === 'missing') {
      return c.json(
        {
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Token de autenticação não fornecido',
        },
        401,
      );
    }

    c.set('userId', 101);
    c.set('userRole', String(c.env?.__mockRole || 'admin'));

    if (authMode !== 'no-tenant') {
      c.set('empresaId', Number(c.env?.__mockEmpresaId ?? 77));
      c.set('tenantContext', {
        empresaId: Number(c.env?.__mockEmpresaId ?? 77),
        empresaCodigo: 'acme',
        empresaNome: 'Acme Air',
        role: 'manager',
        plano: 'pro',
        permissions: ['read', 'write'],
      });
    }

    await next();
  },
  optionalAuth: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

import simuladoresSessoesRoutes from '../../routes/simuladores-sessoes';
import simuladoresFichasRoutes from '../../routes/simuladores-fichas';

type SessionDbOptions = {
  throwOnSelect?: boolean;
};

function createSessionDb(opts: SessionDbOptions = {}) {
  const db = {
    prepare: vi.fn((query: string) => {
      if (query.includes('SELECT * FROM simulador_agendamentos WHERE id=? AND deleted_at IS NULL')) {
        return {
          bind: (_id: unknown) => ({
            first: async () => {
              if (opts.throwOnSelect) {
                throw new Error('db unavailable');
              }

              return {
                id: 10,
                simulador_id: 2,
                data: '2026-05-26',
                hora_inicio: '08:00',
                hora_fim: '10:00',
                duracao_minutos: 120,
                instrutor_id: null,
                tipo_sessao: 'PER',
                template_id: 88,
                status: 'AGENDADO',
                observacoes: null,
                nome: 'Sessão de Verificação',
                is_check: 0,
                examinador_id: null,
              };
            },
          }),
        };
      }

      return {
        bind: (..._args: unknown[]) => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
        }),
      };
    }),
  } as unknown as D1Database;

  return db;
}

function createEmptyDb() {
  return {
    prepare: vi.fn((_query: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
      }),
    })),
  } as unknown as D1Database;
}

describe('simuladores sessões/fichas guards', () => {
  it('bloqueia PUT /sessoes/:id sem autenticação', async () => {
    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/10', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo_aeronave: 'AW139' }),
      }),
      { DB: createSessionDb(), __authMode: 'missing' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('bloqueia DELETE /sessoes/:id para role sem permissão', async () => {
    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/10', { method: 'DELETE' }),
      { DB: createSessionDb(), __authMode: 'ok', __mockRole: 'user' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Acesso negado'),
    });
  });

  it('retorna erro explícito para horário inválido em PUT /sessoes/:id', async () => {
    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/10', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_aeronave: 'AW139',
          horario_inicio: '08:00',
          horario_fim: '08:00',
        }),
      }),
      { DB: createSessionDb(), __authMode: 'ok', __mockRole: 'manager' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Horário final deve ser diferente'),
    });
  });

  it('retorna success:false quando DB falha no PUT /sessoes/:id', async () => {
    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes/10', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_aeronave: 'AW139',
          horario_inicio: '08:00',
          horario_fim: '09:00',
        }),
      }),
      {
        DB: createSessionDb({ throwOnSelect: true }),
        __authMode: 'ok',
        __mockRole: 'manager',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.any(String),
    });
  });

  it('falha fechado em /fichas quando tenant não está presente', async () => {
    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas', { method: 'GET' }),
      {
        DB: createEmptyDb(),
        __authMode: 'no-tenant',
        __mockRole: 'manager',
      } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.any(String),
    });
  });
});
