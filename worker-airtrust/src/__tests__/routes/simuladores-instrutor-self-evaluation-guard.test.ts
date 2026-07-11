import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { instrutorEstaEntreParticipantes } from '../../routes/simuladores-shared';

describe('instrutorEstaEntreParticipantes (pure helper)', () => {
  it('returns true when instrutorId matches a participant funcionario_id', () => {
    expect(
      instrutorEstaEntreParticipantes(11, [{ funcionario_id: 10 }, { funcionario_id: 11 }]),
    ).toBe(true);
  });

  it('returns false when instrutorId does not match any participant', () => {
    expect(
      instrutorEstaEntreParticipantes(99, [{ funcionario_id: 10 }, { funcionario_id: 11 }]),
    ).toBe(false);
  });

  it('handles string/number coercion consistently', () => {
    expect(instrutorEstaEntreParticipantes('11', [{ funcionario_id: '11' }])).toBe(true);
  });

  it('returns false for invalid/absent instrutorId', () => {
    expect(instrutorEstaEntreParticipantes(null, [{ funcionario_id: 10 }])).toBe(false);
    expect(instrutorEstaEntreParticipantes(undefined, [{ funcionario_id: 10 }])).toBe(false);
    expect(instrutorEstaEntreParticipantes(0, [{ funcionario_id: 10 }])).toBe(false);
  });

  it('tolerates an empty or missing participantes array', () => {
    expect(instrutorEstaEntreParticipantes(10, [])).toBe(false);
  });
});

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'manager');
    c.set('empresaId', 6);
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({ empresaId: Number(c.get('empresaId') || 6) }),
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 6),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    getSimuladorModeloAeronave: vi.fn(async () => 'AW139'),
    resolveTemplateIdSessao: vi.fn(async () => null),
    normalizeChecksSessao: vi.fn(async () => []),
    audit: vi.fn(async () => undefined),
  };
});

import simuladoresSessoesRoutes from '../../routes/simuladores-sessoes';

function createDbMock() {
  const runs: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query.includes("PRAGMA table_info('funcionarios')")) return null;
          return null;
        },
        all: async () => {
          if (query.includes("PRAGMA table_info(")) return { results: [] };
          return { results: [] };
        },
        run: async () => {
          runs.push({ query, args });
          return { meta: { changes: 1, last_row_id: 5001 } };
        },
      });
      return { bind, first: () => bind().first(), all: () => bind().all(), run: () => bind().run() };
    }),
  } as unknown as D1Database;
  return { db, runs };
}

describe('POST /sessoes — bloqueio de autoavaliação (EXA-V01)', () => {
  it('rejects when instrutor_id is also listed as a participante', async () => {
    const { db, runs } = createDbMock();

    const response = await simuladoresSessoesRoutes.fetch(
      new Request('http://localhost/sessoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulador_id: 1,
          modelo_sessao_id: 80,
          data: '2026-07-20',
          horario_inicio: '08:00',
          horario_fim: '09:00',
          duracao_minutos: 60,
          instrutor_id: 11,
          tipo_sessao: 'EXA-V01',
          tipo_aeronave: 'AW139',
          participantes: [{ funcionario_id: 11, funcao: 'PIC' }],
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('não pode constar como participante'),
    });
    expect(runs.some((item) => item.query.includes('INSERT INTO simulador_agendamentos'))).toBe(
      false,
    );
  });
});
