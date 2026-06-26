import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

import type { Env } from '../../types';

const {
  ensureMatriculaCycleMock,
  syncMatriculaCycleFromMatriculaMock,
  createLmsQualificationOnCompletionMock,
  logAuditMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  ensureMatriculaCycleMock: vi.fn(),
  syncMatriculaCycleFromMatriculaMock: vi.fn(),
  createLmsQualificationOnCompletionMock: vi.fn(),
  logAuditMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (
    c: {
      req: { header: (name: string) => string | undefined };
      set: (key: string, value: unknown) => void;
      json: (body: unknown, status?: number) => Response;
    },
    next: () => Promise<void>,
  ) => {
    if (!c.req.header('authorization')) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    c.set('userId', 42);
    c.set('userRole', c.req.header('x-test-role') ?? 'admin');
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  hasRole: (rawRole: unknown, ...allowedRoles: string[]) =>
    allowedRoles.some(
      (allowedRole) =>
        String(rawRole ?? '').trim().toLowerCase() === allowedRole.trim().toLowerCase(),
    ),
  requireRole:
    (...allowedRoles: string[]) =>
    async (
      c: {
        get: (key: string) => unknown;
        json: (body: unknown, status?: number) => Response;
      },
      next: () => Promise<void>,
    ) => {
      const role = String(c.get('userRole') ?? '')
        .trim()
        .toLowerCase();
      const allowed = allowedRoles.some(
        (allowedRole) => role === String(allowedRole).trim().toLowerCase(),
      );

      if (!allowed) {
        return c.json({ success: false, error: 'Forbidden' }, 403);
      }

      await next();
    },
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../services/lms-qualification', () => ({
  createLmsQualificationOnCompletion: createLmsQualificationOnCompletionMock,
}));

vi.mock('../../services/lms-matricula-cycle', () => ({
  ensureMatriculaCycle: ensureMatriculaCycleMock,
  hasActiveMatriculaCycle: (record: { status?: string | null; deleted_at?: string | null } | null) =>
    Boolean(record && !record.deleted_at && ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(record.status))),
  syncMatriculaCycleFromMatricula: syncMatriculaCycleFromMatriculaMock,
}));

vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
}));

vi.mock('../../utils/db', () => ({
  logAudit: logAuditMock,
}));

vi.mock('../../lib/email', () => ({
  sendEmail: sendEmailMock,
}));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const handler = entry[1];
      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };
      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
      };
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      return {
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        all: async () => executeAll([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
          all: async () => executeAll(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

function makeScormEnrollment(overrides: Partial<{
  id: number;
  status: string;
  progresso_pct: number | null;
  ultimo_slide: number | null;
  qualificacao_historico_id: number | null;
  curso_titulo: string;
  tipo_conteudo: string | null;
  lesson_status: string | null;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  score_max: number | null;
  score_scaled: number | null;
  suspend_data: string | null;
  cmi_json: string | null;
}> = {}) {
  return {
    id: 332,
    status: 'EM_ANDAMENTO',
    progresso_pct: 20,
    ultimo_slide: 80,
    qualificacao_historico_id: null,
    curso_titulo: 'AW139 - Manutencao',
    tipo_conteudo: 'scorm',
    lesson_status: 'incomplete',
    completion_status: null,
    success_status: null,
    score_raw: null,
    score_max: null,
    score_scaled: null,
    suspend_data: 'checkpoint-m03',
    cmi_json: JSON.stringify({
      'cmi.location': '80/405',
      'cmi.core.lesson_location': '80/405',
    }),
    ...overrides,
  };
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    const status =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode)
        : 500;
    return c.json(
      {
        success: false,
        error: error.message,
      },
      status,
    );
  });
  app.route('/', lmsMatriculasRoutes);
  return app;
}

function makeRequest(body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  return new Request('http://localhost/332/progresso-recuperacao/dry-run', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

describe('lms matriculas progress recovery dry-run endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureMatriculaCycleMock.mockResolvedValue(undefined);
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
    createLmsQualificationOnCompletionMock.mockResolvedValue(null);
    logAuditMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(true);
  });

  it('admin executa dry-run válido e retorna simulacao sem escrita', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => makeScormEnrollment(),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restaurar checkpoint do modulo 4',
        evidence_source: 'payload-bruno-aw139-m04',
        operator_note: 'Dry-run seguro',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        mode: 'dry-run',
        writes_executed: false,
        would_be_allowed_future: true,
        blocked_reason: null,
        current_state: {
          matricula: {
            id: 332,
            status: 'EM_ANDAMENTO',
            progresso_pct: 20,
            ultimo_slide: 80,
          },
        },
        simulated_state: {
          matricula: {
            status: 'EM_ANDAMENTO',
            progresso_pct: 28,
            ultimo_slide: 113,
          },
          scorm: {
            lesson_location: '113/405',
          },
        },
      },
    });
    expect(calls.some((call) => call.method === 'run')).toBe(false);
  });

  it('manager executa dry-run e recebe 403', async () => {
    const { db } = createMockDb([]);

    const response = await createApp(db).fetch(
      makeRequest(
        {
          target_lesson_location: '113/405',
          target_progress_pct: 28,
          reason: 'Restaurar checkpoint do modulo 4',
          evidence_source: 'payload-bruno-aw139-m04',
        },
        { 'x-test-role': 'manager' },
      ),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
  });

  it('sem token recebe 401', async () => {
    const { db } = createMockDb([]);
    const app = createApp(db);

    const response = await app.fetch(
      new Request('http://localhost/332/progresso-recuperacao/dry-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target_lesson_location: '113/405',
          target_progress_pct: 28,
          reason: 'Restaurar checkpoint do modulo 4',
          evidence_source: 'payload-bruno-aw139-m04',
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
  });

  it('matrícula inexistente retorna 404', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => null,
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restaurar checkpoint do modulo 4',
        evidence_source: 'payload-bruno-aw139-m04',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
  });

  it('target menor que o progresso forte atual fica bloqueado', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () =>
            makeScormEnrollment({
              progresso_pct: 38,
              ultimo_slide: 156,
              cmi_json: JSON.stringify({
                'cmi.location': '156/405',
                'cmi.core.lesson_location': '156/405',
              }),
            }),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Tentativa regressiva',
        evidence_source: 'payload-alan-aw139-m06',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        would_be_allowed_future: false,
        blockers: expect.arrayContaining([
          'TARGET_PROGRESS_REGRESSION',
          'TARGET_LOCATION_REGRESSION',
        ]),
      },
    });
  });

  it('target com status de conclusão fica bloqueado', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => makeScormEnrollment(),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        target_lesson_status: 'completed',
        reason: 'Nao pode concluir nesta fase',
        evidence_source: 'payload-aw139-status-completed',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        would_be_allowed_future: false,
        blockers: expect.arrayContaining(['TARGET_LESSON_STATUS_COMPLETION_FORBIDDEN']),
      },
    });
  });

  it('target tentando alterar score fica bloqueado', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => makeScormEnrollment(),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        target_score_raw: 88,
        reason: 'Nao pode alterar score',
        evidence_source: 'payload-aw139-score',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        would_be_allowed_future: false,
        blockers: expect.arrayContaining(['TARGET_SCORE_CHANGE_FORBIDDEN']),
      },
    });
  });

  it('curso não-SCORM fica bloqueado de forma segura', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () =>
            makeScormEnrollment({
              tipo_conteudo: 'pdf',
              curso_titulo: 'Manual PDF',
            }),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Nao deve rodar em curso nao scorm',
        evidence_source: 'payload-pdf',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        would_be_allowed_future: false,
        blockers: expect.arrayContaining(['NON_SCORM_COURSE']),
      },
    });
  });

  it('dry-run não cria qualificação', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => makeScormEnrollment(),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Sem gerar qualificacao',
        evidence_source: 'payload-aw139-dry-run',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(createLmsQualificationOnCompletionMock).not.toHaveBeenCalled();
  });

  it('dry-run não altera matrícula', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => makeScormEnrollment(),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Sem alterar matricula',
        evidence_source: 'payload-aw139-dry-run',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          (call.query.includes('UPDATE lms_matriculas') ||
            call.query.includes('INSERT INTO lms_matriculas')),
      ),
    ).toBe(false);
  });

  it('dry-run não altera lms_progresso_scorm', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => makeScormEnrollment(),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Sem alterar scorm',
        evidence_source: 'payload-aw139-dry-run',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(
      calls.some(
        (call) =>
          call.method === 'run' &&
          (call.query.includes('UPDATE lms_progresso_scorm') ||
            call.query.includes('INSERT INTO lms_progresso_scorm')),
      ),
    ).toBe(false);
  });

  it('payload sem motivo ou evidência retorna 400', async () => {
    const { db } = createMockDb([]);

    const response = await createApp(db).fetch(
      makeRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
  });
});
