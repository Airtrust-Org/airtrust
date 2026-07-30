/**
 * Regression suite for the LMS visibility/isolation fix:
 *
 * GET /matriculas/:id, PATCH /matriculas/:id/status and DELETE /matriculas/:id
 * previously let ANY admin-or-manager caller view/cancel/change the status of
 * a matrícula for ANY employee in the tenant, ignoring the manager's
 * sector-restricted scope (unlike GET /matriculas/curso/:curso_id and
 * POST /matriculas, which already enforced it). A manager assigned only to
 * "Operações" could therefore read or mutate a "Manutenção" employee's
 * matrícula just by knowing/guessing its id.
 *
 * These tests confirm the sector guard now applies consistently across all
 * three endpoints, while leaving admins (mode "all") and in-scope managers
 * unaffected.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

type TestEmployeeSectorAccess =
  | { mode: 'all'; setorIds: number[] }
  | { mode: 'restricted'; setorIds: number[] }
  | { mode: 'self'; setorIds: number[] };

const {
  hasRoleMock,
  getEmployeeSectorAccessMock,
  assertFuncionarioInScopeMock,
  syncMatriculaCycleFromMatriculaMock,
  logAuditMock,
} = vi.hoisted(() => ({
  hasRoleMock: vi.fn().mockReturnValue(true),
  getEmployeeSectorAccessMock: vi.fn(
    async (): Promise<TestEmployeeSectorAccess> => ({
      mode: 'all',
      setorIds: [],
    }),
  ),
  assertFuncionarioInScopeMock: vi.fn(async () => undefined),
  syncMatriculaCycleFromMatriculaMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', 'manager');
    c.set('funcionarioId', null);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  hasRole: hasRoleMock,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../services/lms-matricula-cycle', () => ({
  ensureMatriculaCycle: vi.fn(),
  hasActiveMatriculaCycle: () => false,
  syncMatriculaCycleFromMatricula: syncMatriculaCycleFromMatriculaMock,
}));

vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: assertFuncionarioInScopeMock,
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: getEmployeeSectorAccessMock,
}));

vi.mock('../../utils/db', () => ({
  logAudit: logAuditMock,
}));

vi.mock('../../lib/email', () => ({ sendEmail: vi.fn() }));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';
import { errorHandler } from '../../middleware/error-handler';
import { forbidden } from '../../middleware/error-handler';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const writes: string[] = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) throw new Error(`Unhandled query: ${query.slice(0, 160)}`);

      const handler = entry[1];
      return {
        bind: (...args: unknown[]) => ({
          first: async () => (handler.first ? handler.first(args) : null),
          run: async () => {
            writes.push(query.slice(0, 60));
            return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
          },
          all: async () => (handler.all ? handler.all(args) : { results: [] }),
        }),
        first: async () => (handler.first ? handler.first([]) : null),
        run: async () => {
          writes.push(query.slice(0, 60));
          return { meta: { changes: 1, last_row_id: 0 } };
        },
        all: async () => (handler.all ? handler.all([]) : { results: [] }),
      };
    }),
  } as unknown as D1Database;

  return { db, writes };
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', lmsMatriculasRoutes);
  app.onError(errorHandler);
  return app;
}

function getDetalhe(app: Hono<{ Bindings: Env }>, db: D1Database, id: number) {
  return app.fetch(
    new Request(`http://localhost/${id}`, { method: 'GET' }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

function patchStatus(app: Hono<{ Bindings: Env }>, db: D1Database, id: number, body: object) {
  return app.fetch(
    new Request(`http://localhost/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

function deleteMatricula(app: Hono<{ Bindings: Env }>, db: D1Database, id: number) {
  return app.fetch(
    new Request(`http://localhost/${id}`, { method: 'DELETE' }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

const matriculaOutOfScope = {
  id: 500,
  status: 'EM_ANDAMENTO',
  progresso_pct: 40,
  funcionario_id: 999, // employee in a sector the manager does NOT manage
  qualificacao_historico_id: null,
  curso_id: 5,
  curso_titulo: 'Manutenção Elétrica',
  tipo_conteudo: 'pdf',
  scorm_launch_file: null,
  scorm_package_r2_prefix: null,
  scorm_mastery_score: null,
  gerar_qualificacao_ao_concluir: 0,
  qualificacao_tipo_id: null,
  funcionario_nome: 'Fulano Manutencao',
};

describe('LMS matrículas — manager sector-scope enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate a manager (not admin) by default: hasRole(c, 'admin', 'manager')
    // must resolve true (route-level canManage / rbac checks), while
    // hasRole(c, 'admin') alone must resolve false (admin-only gates).
    hasRoleMock.mockImplementation((..._args: unknown[]) => {
      const roles = _args.slice(1) as string[];
      return roles.includes('manager');
    });
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'all', setorIds: [] });
    assertFuncionarioInScopeMock.mockResolvedValue(undefined);
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
    logAuditMock.mockResolvedValue(undefined);
  });

  // ── GET /matriculas/:id ──────────────────────────────────────────────────

  it('GET /:id: bloqueia manager restrito quando o funcionário está fora do escopo setorial', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [1] });
    assertFuncionarioInScopeMock.mockImplementation(async () => {
      forbidden('Acesso negado ao funcionário solicitado', 'FUNCIONARIO_OUT_OF_SCOPE');
    });

    const { db } = createMockDb([['FROM lms_matriculas m', { first: () => matriculaOutOfScope }]]);

    const res = await getDetalhe(makeApp(), db, 500);

    expect(res.status).toBe(403);
    expect(assertFuncionarioInScopeMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      999,
      expect.objectContaining({ mode: 'restricted' }),
    );
  });

  it('GET /:id: permite manager restrito quando o funcionário está dentro do escopo setorial', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [1] });
    assertFuncionarioInScopeMock.mockResolvedValue(undefined);

    const { db } = createMockDb([['FROM lms_matriculas m', { first: () => matriculaOutOfScope }]]);

    const res = await getDetalhe(makeApp(), db, 500);

    expect(res.status).toBe(200);
  });

  it('GET /:id: admin (mode all) nunca consulta o escopo setorial', async () => {
    hasRoleMock.mockReturnValue(true); // admin
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'all', setorIds: [] });

    const { db } = createMockDb([['FROM lms_matriculas m', { first: () => matriculaOutOfScope }]]);

    const res = await getDetalhe(makeApp(), db, 500);

    expect(res.status).toBe(200);
    expect(assertFuncionarioInScopeMock).not.toHaveBeenCalled();
  });

  // ── PATCH /matriculas/:id/status ─────────────────────────────────────────

  it('PATCH /:id/status: bloqueia manager restrito fora do escopo setorial e não escreve', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [1] });
    assertFuncionarioInScopeMock.mockImplementation(async () => {
      forbidden('Acesso negado ao funcionário solicitado', 'FUNCIONARIO_OUT_OF_SCOPE');
    });

    const { db, writes } = createMockDb([
      [
        'c.tipo_conteudo, c.scorm_mastery_score',
        { first: () => ({ ...matriculaOutOfScope, id: 500 }) },
      ],
    ]);

    const res = await patchStatus(makeApp(), db, 500, { status: 'EM_ANDAMENTO' });

    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('PATCH /:id/status: permite manager restrito dentro do escopo setorial', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [1] });
    assertFuncionarioInScopeMock.mockResolvedValue(undefined);

    const updated = { ...matriculaOutOfScope, status: 'EM_ANDAMENTO' };
    const { db } = createMockDb([
      ['c.tipo_conteudo, c.scorm_mastery_score', { first: () => matriculaOutOfScope }],
      ['data_conclusao = COALESCE', {}],
      ['SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?', { first: () => updated }],
    ]);

    const res = await patchStatus(makeApp(), db, 500, { status: 'EM_ANDAMENTO' });

    expect(res.status).toBe(200);
  });

  // ── DELETE /matriculas/:id ───────────────────────────────────────────────

  it('DELETE /:id: bloqueia manager restrito fora do escopo setorial e não cancela', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [1] });
    assertFuncionarioInScopeMock.mockImplementation(async () => {
      forbidden('Acesso negado ao funcionário solicitado', 'FUNCIONARIO_OUT_OF_SCOPE');
    });

    const { db, writes } = createMockDb([
      ['FROM lms_matriculas m', { first: () => matriculaOutOfScope }],
    ]);

    const res = await deleteMatricula(makeApp(), db, 500);

    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('DELETE /:id: permite admin cancelar independente do setor', async () => {
    hasRoleMock.mockReturnValue(true); // admin

    const { db, writes } = createMockDb([
      ['FROM lms_matriculas m', { first: () => matriculaOutOfScope }],
      ["SET status = 'CANCELADO'", {}],
      ['INSERT OR IGNORE INTO notificacoes_inapp', {}],
    ]);

    const res = await deleteMatricula(makeApp(), db, 500);

    expect(res.status).toBe(200);
    expect(assertFuncionarioInScopeMock).not.toHaveBeenCalled();
    expect(writes.some((q) => q.includes('CANCELADO'))).toBe(true);
  });
});
