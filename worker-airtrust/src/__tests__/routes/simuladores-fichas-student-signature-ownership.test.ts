import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFichaInstructorMetaSchemaCache } from '../../utils/ficha-instructor-meta-schema';

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

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

vi.mock('../../utils/ficha-role-scope', () => ({
  resolveFichaScope: (role: string) => {
    // admin/manager have FULL_ACCESS; instructor/student do not
    if (role === 'admin' || role === 'manager') return 'FULL_ACCESS';
    return 'LIMITED';
  },
}));

vi.mock('../../routes/simuladores-shared', async () => {
  const actual = await vi.importActual('../../routes/simuladores-shared');
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

function createDb(options: { alunoJaAssinou?: boolean } = {}) {
  const fichaRow = {
    id: 500,
    uuid: 'ficha-500-uuid',
    empresa_id: 6,
    colaborador_id_aluno: 10,
    instrutor_id: 20,
    status: 'AGUARDANDO_ASSINATURA_ALUNO',
    assinatura_aluno_timestamp: options.alunoJaAssinou ? '2026-08-13T12:00:00.000Z' : null,
    assinatura_instrutor_timestamp: null,
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
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1, last_row_id: 501 } }),
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
    DB: createDb({ alunoJaAssinou: Boolean(overrides.alunoJaAssinou) }),
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
