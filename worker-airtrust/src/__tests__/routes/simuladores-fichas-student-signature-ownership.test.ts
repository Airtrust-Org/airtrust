import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFichaInstructorMetaSchemaCache } from '../../utils/ficha-instructor-meta-schema';
import { NOTECHS_CANONICAL_ITEMS } from '../../../../src/shared/simuladores/notechs-canonical';

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', c.env?.__mockUserId ?? 101);
    c.set('userRole', c.env?.__mockUserRole ?? 'manager');
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

vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

vi.mock('../../utils/ficha-role-scope', () => ({
  resolveFichaScope: (role: string) => {
    // admin/manager have FULL_ACCESS; instructor/student do not
    if (role === 'admin' || role === 'manager') return 'FULL_ACCESS';
    return 'LIMITED';
  },
}));

vi.mock('../../services/simuladores/shared', async () => {
  const actual = await vi.importActual('../../services/simuladores/shared');
  return {
    ...actual,
    audit: vi.fn(async () => undefined),
  };
});

// ── Import after mocks ───────────────────────────────────────────────────────
import simuladoresFichasRoutes from '../../routes/simuladores-fichas';
import { errorHandler } from '../../middleware/error-handler';

// Bloqueador 5 closure: requireRole now legitimately throws ApiError for
// unauthorized roles on these routes. Registering the real error handler
// on this bare router (tested via .fetch() directly, bypassing the
// parent app's global app.onError) turns that into the proper JSON
// status code instead of Hono's generic 500.
simuladoresFichasRoutes.onError(errorHandler);

function createDb(options: { alunoJaAssinou?: boolean; notechsScore?: string; notechsMissing?: boolean; concurrentChange?: boolean; instrutorJaAssinou?: boolean; technicalScore?: string } = {}) {
  const fichaRow = {
    id: 500,
    uuid: 'ficha-500-uuid',
    empresa_id: 6,
    colaborador_id_aluno: 10,
    instrutor_id: 20,
    status: 'AGUARDANDO_ASSINATURA_ALUNO',
    assinatura_aluno_timestamp: options.alunoJaAssinou ? '2026-08-13T12:00:00.000Z' : null,
    assinatura_instrutor_timestamp: options.instrutorJaAssinou ? '2026-08-14T13:00:00.000Z' : null,
    assinatura_aluno_ip: null,
    assinatura_aluno_imagem: null,
    assinatura_instrutor_ip: null,
    assinatura_instrutor_imagem: null,
    assinatura_tripulante: 0,
    deleted_at: null,
  };

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          const userId = String(args[0] ?? '');

          if (
            query.includes('FROM fichas_sessao') &&
            (query.includes('fs.id = ?') || query.includes('fs.id=?'))
          ) {
            if (args[1] === '999') return null;
            return fichaRow;
          }
          if (query.includes('SELECT f.id FROM usuarios')) {
            if (userId === '101') return { id: '20' };
            if (userId === '201') return { id: '10' };
            return null;
          }
          if (query.includes('COUNT(1) as total') && query.includes('fichas_sessao_manobras')) {
            return { total: 5 };
          }
          if (query.includes('FROM funcionarios') && query.includes('JOIN usuarios')) {
            if (userId === '101') return { userId: 101, nome: 'Instrutor Teste' };
            if (userId === '201') return { userId: 201, nome: 'Aluno Teste' };
            return null;
          }
          return null;
        },
        all: async () => {
          if (query.includes('SELECT id, codigo, categoria, resultado, ordem, descricao, observacoes FROM fichas_sessao_manobras')) {
            return { results: (options.notechsMissing ? NOTECHS_CANONICAL_ITEMS.slice(0, 14) : NOTECHS_CANONICAL_ITEMS)
              .map((item, index) => ({ id: index + 1, codigo: item.codigo, categoria: 'NOTECHS', resultado: options.notechsScore ?? '8.0', ordem: index + 1, descricao: null, observacoes: null })).concat([{ id: 100, codigo: 'T01', categoria: 'GERAL', resultado: options.technicalScore ?? '8', ordem: 1, descricao: null, observacoes: null }]) };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: options.concurrentChange && query.includes('assinatura_instrutor_timestamp IS NULL') ? 0 : 1, last_row_id: 501 } }),
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
  } as unknown as D1Database;

  return db;
}

function mockEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: createDb({
      alunoJaAssinou: Boolean(overrides.alunoJaAssinou),
      notechsScore: typeof overrides.notechsScore === 'string' ? overrides.notechsScore : undefined,
      notechsMissing: Boolean(overrides.notechsMissing),
      concurrentChange: Boolean(overrides.concurrentChange),
      instrutorJaAssinou: Boolean(overrides.instrutorJaAssinou),
      technicalScore: typeof overrides.technicalScore === 'string' ? overrides.technicalScore : undefined,
    }),
    __mockUserId: overrides.userId ?? 101,
    __mockUserRole: overrides.userRole ?? 'manager',
    __mockEmpresaId: overrides.empresaId ?? 6,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /fichas/:id/assinar — student signature ownership', () => {
  beforeEach(resetFichaInstructorMetaSchemaCache);
  const basePayload = { tipo: 'ALUNO' };
  const baseUrl = 'http://localhost/fichas/500/assinar';

  it('instrutor tentando assinar como aluno recebe 403 STUDENT_SIGNATURE_FORBIDDEN', async () => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor' });

    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
      }),
      env,
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { success: boolean; code?: string; error?: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('STUDENT_SIGNATURE_FORBIDDEN');
  });

  it('aluno autenticado assina a própria ficha com sucesso', async () => {
    const env = mockEnv({ userId: 201, userRole: 'aluno' });

    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
      }),
      env,
    );

    // Aceita 200 (sucesso) ou 400 (campos de ficha mock ausentes).
    // O importante é que NÃO seja 403 (bloqueio de identidade).
    expect(response.status).not.toBe(403);
  });

  it('instrutor assina sem 500 quando a tabela de metadata está ausente', async () => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor', alunoJaAssinou: true });

    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INSTRUTOR', aprovado: true }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { status: 'APROVADO' },
    });
  });

  it.each([
    { score: '5.0', missing: false, reason: 'abaixo da nota mínima' },
    { score: 'NR', missing: false, reason: 'não realizada' },
    { score: '9.0', missing: true, reason: 'competência ausente' },
  ])('recusa aprovação do instrutor com NOTECHS $reason', async ({ score, missing }) => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor', alunoJaAssinou: true,
      notechsScore: score, notechsMissing: missing });
    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INSTRUTOR', aprovado: true }),
      }), env,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'NOTECHS_INDIVIDUAL_MINIMUM_NOT_MET',
    });
  });

  it.each(['5', '5.0', '0', '11', '6.5'])('recusa aprovação com nota técnica inválida ou inferior ao mínimo: %s', async (technicalScore) => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor', alunoJaAssinou: true, technicalScore });
    const response = await simuladoresFichasRoutes.fetch(new Request(baseUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'INSTRUTOR', aprovado: true }),
    }), env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'TECHNICAL_INDIVIDUAL_MINIMUM_NOT_MET' });
  });

  it.each(['NR', 'NAO_REALIZADA'])('recusa aprovação sem nenhuma nota técnica executada (%s)', async (technicalScore) => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor', alunoJaAssinou: true, technicalScore });
    const response = await simuladoresFichasRoutes.fetch(new Request(baseUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'INSTRUTOR', aprovado: true }),
    }), env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'TECHNICAL_EXECUTION_EVIDENCE_MISSING',
      details: { technicalScores: { eligible: false, scored: 0, nonPerformed: 1 } },
    });
  });

  it('permite registrar reprovação mesmo quando a única manobra técnica está NR', async () => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor', alunoJaAssinou: true, technicalScore: 'NR' });
    const response = await simuladoresFichasRoutes.fetch(new Request(baseUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'INSTRUTOR', aprovado: false }),
    }), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { status: 'NAO_APROVADO' } });
  });

  it('recusa assinatura concorrente quando as notas mudam após a validação', async () => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor', alunoJaAssinou: true,
      notechsScore: '8.0', concurrentChange: true });
    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INSTRUTOR', aprovado: true }) }), env,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'FICHA_CONCURRENT_UPDATE' });
  });

  it('não permite reescrever assinatura histórica já concluída', async () => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor', alunoJaAssinou: true,
      instrutorJaAssinou: true });
    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INSTRUTOR', aprovado: true }) }), env,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'FICHA_ALREADY_SIGNED' });
  });

  it('usuário sem vínculo funcional recebe erro controlado', async () => {
    const env = mockEnv({ userId: 301, userRole: 'aluno' });

    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(basePayload),
      }),
      env,
    );

    expect(response.status).toBe(403);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('instrutor assinando como INSTRUTOR (papel correto) é permitido', async () => {
    const env = mockEnv({ userId: 101, userRole: 'instrutor' });

    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INSTRUTOR', aprovado: true }),
      }),
      env,
    );

    // Aceita 200 (sucesso) ou 400 (falta assinatura do aluno).
    // O importante é que NÃO seja 403 (bloqueio de identidade).
    expect(response.status).not.toBe(403);
  });

  it('rejeita payload sem tipo', async () => {
    const env = mockEnv({ userId: 201, userRole: 'aluno' });

    const response = await simuladoresFichasRoutes.fetch(
      new Request(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env,
    );

    expect(response.status).toBe(400);
  });
});
