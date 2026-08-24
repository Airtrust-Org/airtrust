/**
 * Snapshot do diagnóstico granular AIRTRUST_COMPLETION_DIAGNOSTICS_V1.
 *
 * Cobre: isolamento por empresa, titularidade (aluno A não lê a matrícula do
 * aluno B), rejeição de payload inválido, e o fato de que ids afirmados pelo
 * payload jamais sobrescrevem o contexto autenticado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { hasRoleMock } = vi.hoisted(() => ({
  hasRoleMock: vi.fn().mockReturnValue(false),
}));

let callerUserId = 500;

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set('userId', callerUserId);
      c.set('userRole', 'student');
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

vi.mock('../../services/lms-completion', async () => {
  const actual = await vi.importActual<typeof import('../../services/lms-completion')>(
    '../../services/lms-completion',
  );
  return { ...actual, completeLmsMatricula: vi.fn() };
});

vi.mock('../../services/lms-matricula-cycle', () => ({
  ensureMatriculaCycle: vi.fn(),
  hasActiveMatriculaCycle: vi.fn(() => true),
  syncMatriculaCycleFromMatricula: vi.fn(),
}));

vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
}));

vi.mock('../../utils/db', () => ({ logAudit: vi.fn() }));
vi.mock('../../lib/email', () => ({ sendEmail: vi.fn() }));

import lmsCompletionDiagnosticsRoutes from '../../routes/lms-matriculas-completion-diagnostics';
import { errorHandler } from '../../middleware/error-handler';

// ── fixtures ─────────────────────────────────────────────────────────────────

/** Matrícula 700 pertence ao funcionário 10 (usuário 500) da empresa 1. */
const MATRICULA = { id: 700, curso_id: 55, funcionario_id: 10 };

const VALID_SNAPSHOT = {
  version: 1,
  courseId: 'curso-55',
  currentSlide: { id: 's3', index: 3, title: 'Motores' },
  slides: {
    totalRequired: 10,
    completedRequired: 7,
    missing: [{ id: 's8', index: 8, title: 'Hidráulico' }],
  },
  assessment: {
    required: true,
    completed: false,
    scoreRaw: null,
    masteryScore: 70,
    passed: null,
    unanswered: [{ id: 'q2', index: 2, title: 'Limites' }],
    incomplete: [],
  },
  packageStatus: { lessonStatus: 'incomplete', finishRequested: false },
  updatedAt: '2026-08-24T12:00:00Z',
};

type Capture = { insertBindings: unknown[] | null; selectBindings: unknown[] | null };

function createMockDb(opts: {
  matricula?: typeof MATRICULA | null;
  funcionarioIdForUser?: number | null;
  storedJson?: string | null;
  capture?: Capture;
}) {
  const {
    matricula = MATRICULA,
    funcionarioIdForUser = 10,
    storedJson = null,
    capture,
  } = opts;

  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM usuarios')) {
            return { funcionario_id: funcionarioIdForUser };
          }
          if (query.includes('FROM lms_matriculas')) {
            // Escopo de empresa é sempre aplicado no SQL: args = [id, empresaId]
            const [id, empresaId] = args as [number, number];
            if (!matricula || id !== matricula.id || empresaId !== 1) return null;
            return matricula;
          }
          if (query.includes('FROM lms_completion_diagnostics_snapshots')) {
            if (capture) capture.selectBindings = args;
            return storedJson
              ? { diagnostics_json: storedJson, updated_at: '2026-08-24T12:00:00Z' }
              : null;
          }
          return null;
        },
        run: async () => {
          if (query.includes('INSERT INTO lms_completion_diagnostics_snapshots') && capture) {
            capture.insertBindings = args;
          }
          return { meta: { changes: 1, last_row_id: 1 } };
        },
      }),
      first: async () => null,
      run: async () => ({ meta: { changes: 1, last_row_id: 1 } }),
      all: async () => ({ results: [] }),
    })),
  } as unknown as D1Database;

  return db;
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', lmsCompletionDiagnosticsRoutes);
  app.onError(errorHandler);
  return app;
}

function putSnapshot(db: D1Database, matriculaId: number, body: unknown) {
  return makeApp().fetch(
    new Request(`http://localhost/${matriculaId}/completion-diagnostics`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

function getSnapshot(db: D1Database, matriculaId: number) {
  return makeApp().fetch(
    new Request(`http://localhost/${matriculaId}/completion-diagnostics`),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('LMS completion diagnostics snapshot', () => {
  beforeEach(() => {
    callerUserId = 500;
    hasRoleMock.mockReturnValue(false);
  });

  it('persiste um snapshot válido do próprio aluno', async () => {
    const capture: Capture = { insertBindings: null, selectBindings: null };
    const res = await putSnapshot(createMockDb({ capture }), 700, {
      diagnostics: VALID_SNAPSHOT,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { stored: true } });
  });

  it('rejeita payload inválido/malformado com 400 (test 6)', async () => {
    for (const bad of [
      { diagnostics: null },
      { diagnostics: 'texto' },
      { diagnostics: { version: 2 } },
      { diagnostics: [] },
      {},
    ]) {
      const res = await putSnapshot(createMockDb({}), 700, bad);
      expect(res.status).toBe(400);
    }
  });

  it('ignora empresa/matrícula/curso afirmados pelo payload — usa o contexto autenticado (test 9)', async () => {
    const capture: Capture = { insertBindings: null, selectBindings: null };
    const res = await putSnapshot(createMockDb({ capture }), 700, {
      diagnostics: {
        ...VALID_SNAPSHOT,
        // Tentativa de forjar contexto.
        empresaId: 999,
        empresa_id: 999,
        matriculaId: 888,
        cursoId: 777,
      },
    });
    expect(res.status).toBe(200);

    // Bindings do INSERT: [empresaId, matriculaId, cursoId, json]
    const [empresaId, matriculaId, cursoId, json] = capture.insertBindings as [
      number,
      number,
      number,
      string,
    ];
    expect(empresaId).toBe(1);
    expect(matriculaId).toBe(700);
    expect(cursoId).toBe(55);

    const stored = JSON.parse(json) as Record<string, unknown>;
    expect(stored).not.toHaveProperty('empresaId');
    expect(stored).not.toHaveProperty('empresa_id');
    expect(stored).not.toHaveProperty('matriculaId');
    expect(stored).not.toHaveProperty('cursoId');
  });

  it('recupera o snapshot persistido via GET (test 12)', async () => {
    const db = createMockDb({ storedJson: JSON.stringify(VALID_SNAPSHOT) });
    const res = await getSnapshot(db, 700);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { diagnostics: typeof VALID_SNAPSHOT | null };
    };
    expect(body.success).toBe(true);
    expect(body.data.diagnostics?.slides.missing).toHaveLength(1);
    expect(body.data.diagnostics?.slides.missing[0].title).toBe('Hidráulico');
  });

  it('devolve diagnostics null quando não há snapshot (pacote legado, test 5)', async () => {
    const res = await getSnapshot(createMockDb({ storedJson: null }), 700);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { diagnostics: null } });
  });

  it('escopa leitura e escrita por empresa_id (test 13)', async () => {
    const capture: Capture = { insertBindings: null, selectBindings: null };
    await getSnapshot(createMockDb({ storedJson: null, capture }), 700);
    // SELECT bindings: [empresaId, matriculaId, cursoId]
    expect((capture.selectBindings as unknown[])[0]).toBe(1);

    // Matrícula de outra empresa não é encontrada (o SQL filtra por empresa_id).
    const res = await getSnapshot(createMockDb({ matricula: null }), 700);
    expect(res.status).toBe(404);
  });

  it('aluno A não acessa o snapshot do aluno B (test 14)', async () => {
    // Usuário 500 está vinculado ao funcionário 99, mas a matrícula 700 é do
    // funcionário 10 → acesso negado.
    const db = createMockDb({ funcionarioIdForUser: 99, storedJson: JSON.stringify(VALID_SNAPSHOT) });

    const getRes = await getSnapshot(db, 700);
    expect(getRes.status).toBe(403);

    const putRes = await putSnapshot(db, 700, { diagnostics: VALID_SNAPSHOT });
    expect(putRes.status).toBe(403);
  });

  it('admin/manager acessa snapshots da própria empresa', async () => {
    hasRoleMock.mockReturnValue(true);
    const db = createMockDb({
      funcionarioIdForUser: null,
      storedJson: JSON.stringify(VALID_SNAPSHOT),
    });
    const res = await getSnapshot(db, 700);
    expect(res.status).toBe(200);
  });

  it('matrícula inexistente devolve 404', async () => {
    const res = await getSnapshot(createMockDb({ matricula: null }), 12345);
    expect(res.status).toBe(404);
  });
});
