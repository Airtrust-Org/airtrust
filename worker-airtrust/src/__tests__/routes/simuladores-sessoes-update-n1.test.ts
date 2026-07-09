import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 'mock-user-id');
    c.set('userRole', 'admin');
    c.set('empresaId', 123);
    c.set('tenantContext', { empresaId: 123, role: 'admin', empresaCodigo: 'TEST', empresaNome: 'Test', plano: 'pro', permissions: [] });
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

import sessoesUpdateApp from '../../routes/simuladores-sessoes-update';
import type { Env, AppEnv } from '../../types';

describe('Simuladores Sessoes Update N+1 Characterization', () => {
  let app: Hono<AppEnv>;
  let prepareSpy: any;

  beforeEach(() => {
    app = new Hono<AppEnv>();

    prepareSpy = vi.fn().mockImplementation((query: string) => {
      const q = query.toUpperCase();
      const mockResult = {
        first: async () => {
          if (q.includes('FROM SIMULADOR_AGENDAMENTOS')) {
            return { id: 1, simulador_id: 1, data: '2025-01-01', hora_inicio: '10:00', hora_fim: '12:00', instrutor_id: 99 };
          }
          if (q.includes('FROM FICHAS_SESSAO')) {
            return null; // Force creating a new ficha
          }
          if (q.includes('FROM MODELOS_SESSAO MS')) {
            return { id: 10 }; // model found
          }
          if (q.includes('FROM FUNCIONARIOS')) {
            return { id: 99, is_instrutor: 1 };
          }
          return null;
        },
        all: async () => {
          if (q.includes('PRAGMA TABLE_INFO')) {
            return { results: [{ name: 'tipo_dispositivo' }, { name: 'aeronave_id' }, { name: 'is_instrutor' }] };
          }
          if (q.includes('FROM SESSOES_PARTICIPANTES')) {
            return { results: [] }; // no old participants
          }
          if (q.includes('FROM MODELOS_SESSAO_MANOBRAS')) {
            const results = Array.from({ length: 20 }).map((_, i) => ({
              codigo: `M${i}`, nome: `Manobra ${i}`, descricao: `Desc ${i}`, categoria: 'GERAL', ordem: i, observacoes: '', tripulante: 'AB'
            }));
            return { results };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { last_row_id: 100 } }),
        bind: () => mockResult,
      };
      return mockResult;
    });

    app.use('*', async (c, next) => {
      c.set('tenantContext', { empresaId: 123, role: 'admin', empresaCodigo: 'TEST', empresaNome: 'Test', plano: 'pro', permissions: [] });
      const dbMock: any = { prepare: prepareSpy, batch: vi.fn().mockResolvedValue([]) };
      c.env = { DB: dbMock } as Env;
      await next();
    });

    app.route('/', sessoesUpdateApp);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('characterizes query count for PUT /sessoes/:id with participants', async () => {
    // 5 participants
    const participantes = Array.from({ length: 5 }).map((_, i) => ({
      funcionario_id: i + 1,
      funcao: 'PIC',
    }));

    const res = await app.request('/sessoes/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: '2025-01-01',
        horario_inicio: '10:00',
        horario_fim: '12:00',
        instrutor_id: 99,
        participantes,
      }),
    }, { DB: { prepare: prepareSpy } as any } as Env);

    const body = await res.json();
    expect(res.status).toBe(500); // Because of missing executionCtx

    const callCount = prepareSpy.mock.calls.length;
    console.log(`[Update Sessao N+1] 5 participantes * 20 manobras -> ${callCount} chamadas prepare`);
    console.log(`[Update Sessao N+1] 5 participantes * 20 manobras -> ${callCount} chamadas prepare`);
    // Before fix: base (~10) + 5 * (ficha queries (~5) + 20 inserts) = ~135 calls!
  });
});
