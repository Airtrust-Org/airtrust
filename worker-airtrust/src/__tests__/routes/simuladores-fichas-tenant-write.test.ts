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

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

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
  manobrasRowsCount?: number;
  sessionDate?: string;
  sessionTime?: string;
}) {
  const runs: Array<{ query: string; args: unknown[] }> = [];
  const batchSizes: number[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (
            query.includes('SELECT id FROM fichas_sessao') &&
            query.includes('empresa_id = ?') &&
            query.includes('deleted_at IS NULL')
          ) {
            return { id: Number(args[0]) };
          }

          // operational-domain-access.ts: isTenantRbacEnabled — legacy tenant.
          if (query.includes('FROM empresas WHERE id')) {
            return { operational_domain_rbac_enabled: 0 };
          }
          if (query.includes('COALESCE(sa.data, fs.data_sessao) as data_sessao')) {
            return {
              data_sessao: options?.sessionDate || '2026-06-16',
              hora_inicio: options?.sessionTime || '00:00',
            };
          }
          if (
            query.includes('SELECT COUNT(DISTINCT id) AS total') &&
            query.includes('FROM funcionarios')
          ) {
            return { total: options?.invalidTenantLink ? 1 : 2 };
          }
          // operational-domain-access-core.ts: pedagogical-bypass — resolves the
          // caller's funcionario_id first; the sessao_id/agendamento_slot_id
          // lookup below is only reached when this returns a real funcionario.
          if (query.includes('SELECT f.id FROM usuarios u') && query.includes('JOIN funcionarios f')) {
            return { id: 999 };
          }
          // operational-domain-access-core.ts: pedagogical-bypass lookup for
          // resourceType 'simulador_ficha'. Mirrors real D1/SQLite behavior —
          // fichas_sessao has no `sessao_id` column (it's `agendamento_slot_id`);
          // referencing the wrong one throws exactly like production did. Must be
          // checked before the broader getFichaWithInstructorMeta match below,
          // since both share the same trailing WHERE clause text.
          if (
            query.includes('sa.instrutor_id, sa.examinador_id, fs.colaborador_id_aluno') &&
            query.includes('FROM fichas_sessao fs')
          ) {
            if (query.includes('fs.sessao_id')) {
              throw new Error('D1_ERROR: no such column: fs.sessao_id: SQLITE_ERROR');
            }
            return { instrutor_id: 11, examinador_id: null, colaborador_id_aluno: 10 };
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
          if (
            query.includes(
              'SELECT * FROM fichas_sessao WHERE id=? AND empresa_id = ? AND deleted_at IS NULL',
            )
          ) {
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
        all: async () => {
          if (query.includes('SELECT ordem, resultado FROM fichas_sessao_manobras')) {
            const rowsCount = options?.manobrasRowsCount ?? 2;
            return {
              results: Array.from({ length: rowsCount }, (_, index) => ({
                ordem: index + 1,
                resultado: null,
              })),
            };
          }
          return { results: [] };
        },
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
    batch: async (statements: unknown[]) => {
      batchSizes.push(statements.length);
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;

  return { db, runs, batchSizes };
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

  it('PUT /fichas/:id aceita rascunho parcial sem avançar o status', async () => {
    const { db } = createDbMock({ manobrasCount: 2 });

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recalculate_status: false,
          observacoes: 'Rascunho parcial',
          manobras: [{ ordem: 1, resultado: 8, observacoes: 'Primeira nota' }],
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { status: 'AGUARDANDO_ASSINATURA_ALUNO' },
    });
  });

  it('PUT /fichas/:id consolida rascunho com 33 manobras sem uma query D1 por linha', async () => {
    const { db, batchSizes } = createDbMock({ manobrasRowsCount: 33 });
    const manobras = Array.from({ length: 33 }, (_, index) => ({
      ordem: index + 1,
      resultado: 9,
      observacoes: '',
    }));

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recalculate_status: false,
          observacoes: 'Rascunho completo',
          manobras,
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(batchSizes).toHaveLength(1);
    // One consolidated maneuver UPDATE + ficha header. Production may add one
    // instructor-meta UPSERT when the compatibility table is present.
    expect(batchSizes[0]).toBeLessThanOrEqual(3);
  });

  it('PUT /fichas/:id nao falha com D1_ERROR no lookup de bypass pedagogico (fs.agendamento_slot_id, nao fs.sessao_id)', async () => {
    const { db } = createDbMock();

    const response = await simuladoresFichasRoutes.fetch(
      new Request('http://localhost/fichas/901', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recalculate_status: false,
          observacoes: 'Rascunho',
          manobras: [],
        }),
      }),
      { DB: db, __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
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
    expect(
      runs.some((item) => item.query.includes('UPDATE fichas_sessao_manobras SET resultado=')),
    ).toBe(false);
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao_manobras'))).toBe(
      false,
    );
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
    expect(runs.some((item) => item.query.includes('INSERT INTO fichas_sessao_manobras'))).toBe(
      false,
    );
  });
});
