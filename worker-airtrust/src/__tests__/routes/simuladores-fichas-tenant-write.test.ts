import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'manager');
    c.set('empresaId', Number(c.env?.__mockEmpresaId ?? 6));
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

vi.mock('../../utils/ficha-role-scope', () => ({
  resolveFichaScope: () => 'FULL_ACCESS',
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

vi.mock('../../shared/handlers/horasVooFromSimulador.handler', () => ({
  syncHorasVooFromSimulador: vi.fn(async () => undefined),
}));

vi.mock('../../lib/fichaEmails', () => ({
  enviarEmailFichaSessao: vi.fn(async () => undefined),
}));

vi.mock('../../routes/simuladores-fichas-helpers', () => ({
  gerarQualificacaoDaFicha: vi.fn(),
  getQualificacaoGeracaoErrorStatus: vi.fn(),
  marcarNotificacoesFichaComoResolvidas: vi.fn(),
  listarManobrasPendentes: vi.fn(async () => []),
}));

import simuladoresFichasRoutes from '../../routes/simuladores-fichas';

function createDbMock(options?: {
  invalidTenantLink?: boolean;
  manobrasCount?: number;
  sessionDate?: string;
  sessionTime?: string;
}) {
  const runs: Array<{ query: string; args: unknown[] }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('COALESCE(sa.data, fs.data_sessao) as data_sessao')) {
            return {
              data_sessao: options?.sessionDate || '2026-06-16',
              hora_inicio: options?.sessionTime || '00:00',
            };
          }
          if (query.includes('SELECT COUNT(DISTINCT id) AS total') && query.includes('FROM funcionarios')) {
            return { total: options?.invalidTenantLink ? 1 : 2 };
          }
          // getFichaWithInstructorMeta() (introduced in PR #307, simuladores-fichas.ts
          // and simuladores-fichas-acoes.ts) joins fichas_sessao_instrutor_meta instead
          // of the plain SELECT below. Match on the stable tenant-scoped WHERE clause
          // rather than the whole SQL text, since column/JOIN formatting is expected
          // to keep evolving independently of this fixture.
          if (
            query.includes('FROM fichas_sessao fs') &&
            query.includes('WHERE fs.id = ? AND fs.empresa_id = ? AND fs.deleted_at IS NULL')
          ) {
            return {
              id: 901,
              uuid: 'fs-901',
              colaborador_id_aluno: 10,
              instrutor_id: 11,
              tipo_sessao: 'PER',
              status: 'AGUARDANDO_ASSINATURA_ALUNO',
              empresa_id: Number(args[1] || 6),
              deleted_at: null,
              equipamento_utilizado: null,
              dispositivo_identificacao: null,
              assento_instrucao_utilizado: null,
              assinatura_aluno_timestamp: null,
              assinatura_instrutor_timestamp: null,
              resultado_final: null,
            };
          }
          if (query.includes('SELECT * FROM fichas_sessao WHERE id=? AND empresa_id = ? AND deleted_at IS NULL')) {
            return {
              id: 901,
              uuid: 'fs-901',
              colaborador_id_aluno: 10,
              instrutor_id: 11,
              tipo_sessao: 'PER',
              empresa_id: Number(args[1] || 6),
              deleted_at: null,
            };
          }
          if (query.includes('SELECT * FROM fichas_sessao WHERE id=? AND deleted_at IS NULL')) {
            return {
              id: 901,
              uuid: 'fs-901',
              colaborador_id_aluno: 10,
              instrutor_id: 11,
              tipo_sessao: 'PER',
              empresa_id: 6,
              status: 'AGUARDANDO_ASSINATURA_ALUNO',
              deleted_at: null,
            };
          }
          if (query.includes('SELECT COUNT(1) as total FROM fichas_sessao_manobras')) {
            return { total: options?.manobrasCount ?? 0 };
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => {
          runs.push({ query, args });
          return { meta: { changes: 1, last_row_id: 901 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
  } as unknown as D1Database;

  return { db, runs };
}

describe('simuladores fichas tenant-aware writes', () => {
  it('POST /fichas grava empresa_id explicitamente', async () => {
    const { db, runs } = createDbMock();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaborador_id_aluno: 10,
          instrutor_id: 11,
          tipo_sessao: 'PER',
          tipo_aeronave: 'AW139',
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    const insert = runs.find((item) => item.query.includes('INSERT INTO fichas_sessao'));
    expect(insert).toBeDefined();
    expect(insert?.query).toContain('empresa_id');
    expect(insert?.args.at(-1)).toBe(6);
  });

  it('POST /fichas bloqueia aluno/instrutor fora do tenant', async () => {
    const { db, runs } = createDbMock({ invalidTenantLink: true });

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colaborador_id_aluno: 10,
          instrutor_id: 11,
          tipo_sessao: 'PER',
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Aluno ou instrutor fora do tenant',
    });
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao'))).toBe(false);
  });

  it('PUT /fichas/:id bloqueia recálculo quando ficha não tem manobras', async () => {
    const { db, runs } = createDbMock({ manobrasCount: 0 });

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recalculate_status: true,
          observacoes: 'Avaliação sem itens não deve avançar',
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FICHA_SEM_MANOBRAS',
    });
    expect(runs.some((item) => item.query.includes('UPDATE fichas_sessao SET status='))).toBe(
      false,
    );
  });

  it('POST /fichas/:id/assinar bloqueia assinatura quando ficha não tem manobras', async () => {
    const { db, runs } = createDbMock({ manobrasCount: 0 });

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/assinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'ALUNO' }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FICHA_SEM_MANOBRAS',
    });
    expect(
      runs.some((item) =>
        item.query.includes('assinatura_aluno_ip=?,assinatura_aluno_timestamp=?'),
      ),
    ).toBe(false);
  });

  it('PUT /fichas/:id bloqueia avaliação de sessão futura', async () => {
    const { db, runs } = createDbMock({
      manobrasCount: 22,
      sessionDate: '2999-01-01',
      sessionTime: '08:00',
    });

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recalculate_status: true,
          observacoes: 'Tentativa antecipada',
          manobras: [{ ordem: 1, resultado: 8, observacoes: '' }],
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FICHA_NOT_AVAILABLE_YET',
      error: 'Ficha disponível no dia da sessão',
    });
    expect(runs.some((item) => item.query.includes('UPDATE fichas_sessao_manobras'))).toBe(false);
    expect(runs.some((item) => item.query.includes('UPDATE fichas_sessao SET status='))).toBe(
      false,
    );
  });

  it('POST /fichas/:id/assinar bloqueia assinatura de sessão futura', async () => {
    const { db, runs } = createDbMock({
      manobrasCount: 22,
      sessionDate: '2999-01-01',
      sessionTime: '08:00',
    });

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901/assinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'ALUNO' }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FICHA_NOT_AVAILABLE_YET',
      error: 'Ficha disponível no dia da sessão',
    });
    expect(
      runs.some((item) =>
        item.query.includes('assinatura_aluno_ip=?,assinatura_aluno_timestamp=?'),
      ),
    ).toBe(false);
  });

  it('PUT /fichas-simulador/:fichaId/manobras/:ordem bloqueia edição de sessão futura', async () => {
    const { db, runs } = createDbMock({
      sessionDate: '2999-01-01',
      sessionTime: '08:00',
    });

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas-simulador/901/manobras/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultado: 8, observacoes: 'Tentativa antecipada' }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FICHA_NOT_AVAILABLE_YET',
      error: 'Ficha disponível no dia da sessão',
    });
    expect(runs.some((item) => item.query.includes('UPDATE fichas_sessao_manobras SET resultado='))).toBe(false);
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao_manobras'))).toBe(false);
  });

  it('POST /fichas-simulador/:id/popular-manobras bloqueia sessão futura', async () => {
    const { db, runs } = createDbMock({
      sessionDate: '2999-01-01',
      sessionTime: '08:00',
    });

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas-simulador/901/popular-manobras', {
        method: 'POST',
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'FICHA_NOT_AVAILABLE_YET',
      error: 'Ficha disponível no dia da sessão',
    });
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao_manobras'))).toBe(false);
  });
});
