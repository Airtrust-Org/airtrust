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
    Boolean(
      record && !record.deleted_at && ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(record.status)),
    ),
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

function makeScormEnrollment(
  overrides: Partial<{
    id: number;
    curso_id: number;
    funcionario_id: number;
    status: string;
    progresso_pct: number | null;
    ultimo_slide: number | null;
    data_inicio: string | null;
    data_conclusao: string | null;
    qualificacao_historico_id: number | null;
    curso_titulo: string;
    tipo_conteudo: string | null;
    scorm_id: number | null;
    lesson_status: string | null;
    completion_status: string | null;
    success_status: string | null;
    score_raw: number | null;
    score_max: number | null;
    score_min: number | null;
    score_scaled: number | null;
    session_time: string | null;
    total_time: string | null;
    session_count: number | null;
    suspend_data: string | null;
    launch_data: string | null;
    cmi_json: string | null;
  }> = {},
) {
  return {
    id: 332,
    curso_id: 9,
    funcionario_id: 77,
    status: 'EM_ANDAMENTO',
    progresso_pct: 20,
    ultimo_slide: 80,
    data_inicio: '2026-06-20T12:00:00Z',
    data_conclusao: null,
    qualificacao_historico_id: null,
    curso_titulo: 'AW139 - Manutencao',
    tipo_conteudo: 'scorm',
    scorm_id: 901,
    lesson_status: 'incomplete',
    completion_status: null,
    success_status: null,
    score_raw: 95,
    score_max: 100,
    score_min: 0,
    score_scaled: 0.95,
    session_time: '00:10:00',
    total_time: '00:40:00',
    session_count: 4,
    suspend_data: 'checkpoint-m03',
    launch_data: null,
    cmi_json: JSON.stringify({
      'cmi.location': '80/405',
      'cmi.core.lesson_location': '80/405',
      'cmi.suspend_data': 'checkpoint-m03',
    }),
    ...overrides,
  };
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    const status =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? Number((error as unknown as { statusCode: number }).statusCode)
        : 500;
    return c.json(
      {
        success: false,
        error: (error as { message?: string }).message ?? 'Erro interno',
      },
      status as 200 | 400 | 401 | 403 | 404 | 422 | 500,
    );
  });
  app.route('/', lmsMatriculasRoutes);
  return app;
}

function makeDryRunRequest(body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
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

function makeApplyRequest(body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  return new Request('http://localhost/332/progresso-recuperacao/apply', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function makeRollbackRequest(
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
  matriculaId = 332,
) {
  return new Request(`http://localhost/${matriculaId}/progresso-recuperacao/rollback`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

async function fetchDryRunReference(app: Hono<{ Bindings: Env }>, db: D1Database, body?: Record<string, unknown>) {
  const response = await app.fetch(
    makeDryRunRequest({
      target_lesson_location: '113/405',
      target_progress_pct: 28,
      reason: 'Restaurar checkpoint do modulo 4',
      evidence_source: 'payload-bruno-aw139-m04',
      ...body,
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
  const payload = (await response.json()) as { data: { dry_run_reference: string } };
  return payload.data.dry_run_reference;
}

describe('lms matriculas progress recovery apply and rollback endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureMatriculaCycleMock.mockResolvedValue(undefined);
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
    createLmsQualificationOnCompletionMock.mockResolvedValue(null);
    logAuditMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(true);
  });

  it('apply valido altera apenas progresso, location e cmi_json permitidos', async () => {
    const state = { enrollment: makeScormEnrollment() };
    const { db, calls } = createMockDb([
      ['FROM lms_matriculas m', { first: () => state.enrollment }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 7001 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
    ]);
    const app = createApp(db);
    const dryRunReference = await fetchDryRunReference(app, db);

    const response = await app.fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restore progress only',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: dryRunReference,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        mode: 'apply',
        writes_executed: true,
        audit_log_id: 7001,
        rollback_available: true,
        before: {
          matricula: { progresso_pct: 20, ultimo_slide: 80 },
        },
        after: {
          matricula: { status: 'EM_ANDAMENTO', progresso_pct: 28, ultimo_slide: 113 },
          scorm: { lesson_location: '113/405' },
        },
      },
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO audit_logs'))).toBe(true);
    expect(calls.some((call) => call.query.includes('UPDATE lms_matriculas'))).toBe(true);
    expect(calls.some((call) => call.query.includes('INSERT INTO lms_progresso_scorm'))).toBe(true);
  });

  it('apply nao conclui matricula', async () => {
    const state = { enrollment: makeScormEnrollment({ status: 'NAO_INICIADO' }) };
    const { db, calls } = createMockDb([
      ['FROM lms_matriculas m', { first: () => state.enrollment }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 7001 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
    ]);
    const app = createApp(db);
    const dryRunReference = await fetchDryRunReference(app, db);

    const response = await app.fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restore progress only',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: dryRunReference,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        after: {
          matricula: {
            status: 'EM_ANDAMENTO',
          },
        },
      },
    });
    const updateCall = calls.find((call) => call.query.includes('UPDATE lms_matriculas'));
    expect(updateCall?.args[0]).toBe('EM_ANDAMENTO');
  });

  it('apply nao gera qualificacao', async () => {
    const { db } = createMockDb([
      ['FROM lms_matriculas m', { first: () => makeScormEnrollment() }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 7001 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
    ]);
    const app = createApp(db);
    const dryRunReference = await fetchDryRunReference(app, db);

    const response = await app.fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restore progress only',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: dryRunReference,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(createLmsQualificationOnCompletionMock).not.toHaveBeenCalled();
  });

  it('apply nao altera score', async () => {
    const { db, calls } = createMockDb([
      ['FROM lms_matriculas m', { first: () => makeScormEnrollment({ score_raw: 91, score_scaled: 0.91 }) }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 7001 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
    ]);
    const app = createApp(db);
    const dryRunReference = await fetchDryRunReference(app, db);

    const response = await app.fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restore progress only',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: dryRunReference,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const upsertCall = calls.find((call) => call.query.includes('INSERT INTO lms_progresso_scorm'));
    expect(upsertCall?.args[5]).toBe(91);
    expect(upsertCall?.args[8]).toBe(0.91);
  });

  it('apply nao altera data_conclusao', async () => {
    const { db, calls } = createMockDb([
      ['FROM lms_matriculas m', { first: () => makeScormEnrollment() }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 7001 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
    ]);
    const app = createApp(db);
    const dryRunReference = await fetchDryRunReference(app, db);

    const response = await app.fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restore progress only',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: dryRunReference,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const updateCall = calls.find((call) => call.query.includes('UPDATE lms_matriculas'));
    expect(updateCall?.query.includes('data_conclusao')).toBe(false);
  });

  it('apply exige admin', async () => {
    const { db } = createMockDb([]);
    const response = await createApp(db).fetch(
      makeApplyRequest(
        {
          target_lesson_location: '113/405',
          target_progress_pct: 28,
          reason: 'Restore progress only',
          evidence_source: 'authorized-2026-06-26',
          operator_note: 'Aplicacao auditavel',
          dry_run_reference: 'prr-v1-test',
        },
        { 'x-test-role': 'manager' },
      ),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
  });

  it('manager recebe 403', async () => {
    const { db } = createMockDb([]);
    const response = await createApp(db).fetch(
      makeApplyRequest(
        {
          target_lesson_location: '113/405',
          target_progress_pct: 28,
          reason: 'Restore progress only',
          evidence_source: 'authorized-2026-06-26',
          operator_note: 'Aplicacao auditavel',
          dry_run_reference: 'prr-v1-test',
        },
        { 'x-test-role': 'manager' },
      ),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
  });

  it('target menor que progresso atual bloqueia apply', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () =>
            makeScormEnrollment({
              progresso_pct: 39,
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
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Regressivo',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: 'prr-v1-stale',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
  });

  it('target menor que location atual bloqueia apply', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () =>
            makeScormEnrollment({
              progresso_pct: 25,
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
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 30,
        reason: 'Regressivo por location',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: 'prr-v1-stale',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
  });

  it('suspend_data forte nao e apagado', async () => {
    const { db, calls } = createMockDb([
      ['FROM lms_matriculas m', { first: () => makeScormEnrollment({ suspend_data: 'forte-123' }) }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 7001 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
    ]);
    const app = createApp(db);
    const dryRunReference = await fetchDryRunReference(app, db);

    const response = await app.fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Preservar suspend_data',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: dryRunReference,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const upsertCall = calls.find((call) => call.query.includes('INSERT INTO lms_progresso_scorm'));
    expect(upsertCall?.args[11]).toBe('forte-123');
  });

  it('estado divergente do dry-run bloqueia apply', async () => {
    const state = { enrollment: makeScormEnrollment() };
    const { db } = createMockDb([
      ['FROM lms_matriculas m', { first: () => state.enrollment }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 7001 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
    ]);
    const app = createApp(db);
    const dryRunReference = await fetchDryRunReference(app, db);

    state.enrollment = makeScormEnrollment({
      progresso_pct: 33,
      ultimo_slide: 120,
      cmi_json: JSON.stringify({
        'cmi.location': '120/405',
        'cmi.core.lesson_location': '120/405',
      }),
    });

    const response = await app.fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Referencia stale',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: dryRunReference,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
  });

  it('audit log e criado no apply', async () => {
    const { db, calls } = createMockDb([
      ['FROM lms_matriculas m', { first: () => makeScormEnrollment() }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 8123 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
    ]);
    const app = createApp(db);
    const dryRunReference = await fetchDryRunReference(app, db);

    const response = await app.fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restore progress only',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: dryRunReference,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const auditCall = calls.find((call) => call.query.includes('INSERT INTO audit_logs'));
    expect(auditCall).toBeTruthy();
    expect(auditCall?.args[1]).toBe('LMS_PROGRESS_RECOVERY_APPLY');
  });

  it('rollback restaura estado anterior', async () => {
    const beforeSnapshot = {
      matricula: {
        id: 332,
        curso_id: 9,
        funcionario_id: 77,
        status: 'EM_ANDAMENTO',
        progresso_pct: 20,
        ultimo_slide: 80,
        data_inicio: '2026-06-20T12:00:00Z',
        data_conclusao: null,
        qualificacao_historico_id: null,
      },
      scorm: {
        row_present: true,
        id: 901,
        lesson_location: '80/405',
        lesson_status: 'incomplete',
        completion_status: null,
        success_status: null,
        score_raw: 95,
        score_max: 100,
        score_min: 0,
        score_scaled: 0.95,
        session_time: '00:10:00',
        total_time: '00:40:00',
        session_count: 4,
        suspend_data: 'checkpoint-m03',
        launch_data: null,
        cmi_json: JSON.stringify({
          'cmi.location': '80/405',
          'cmi.core.lesson_location': '80/405',
          'cmi.suspend_data': 'checkpoint-m03',
        }),
      },
    };
    const appliedSnapshot = {
      ...beforeSnapshot,
      matricula: {
        ...beforeSnapshot.matricula,
        progresso_pct: 28,
        ultimo_slide: 113,
      },
      scorm: {
        ...beforeSnapshot.scorm,
        lesson_location: '113/405',
        cmi_json: JSON.stringify({
          'cmi.location': '113/405',
          'cmi.core.lesson_location': '113/405',
          'cmi.suspend_data': 'checkpoint-m03',
        }),
      },
    };
    const { db, calls } = createMockDb([
      ['FROM lms_matriculas m', { first: () => makeScormEnrollment({ progresso_pct: 28, ultimo_slide: 113, cmi_json: appliedSnapshot.scorm.cmi_json }) }],
      [
        'FROM audit_logs',
        {
          first: () => ({
            id: 7001,
            action: 'LMS_PROGRESS_RECOVERY_APPLY',
            entity_type: 'lms_matriculas',
            entity_id: 332,
            old_values: JSON.stringify(beforeSnapshot),
            new_values: JSON.stringify(appliedSnapshot),
            detalhes: JSON.stringify({ mode: 'RESTORE_PROGRESS_ONLY' }),
          }),
        },
      ],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) }],
      ['INSERT INTO audit_logs', { run: () => ({ meta: { changes: 1, last_row_id: 9002 } }) }],
    ]);

    const response = await createApp(db).fetch(
      makeRollbackRequest({
        audit_log_id: 7001,
        reason: 'Rollback controlado',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        mode: 'rollback',
        writes_executed: true,
        audit_log_id: 9002,
        rolled_back_audit_log_id: 7001,
        after: {
          matricula: {
            progresso_pct: 20,
            ultimo_slide: 80,
          },
          scorm: {
            lesson_location: '80/405',
          },
        },
      },
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO audit_logs'))).toBe(true);
  });

  it('rollback bloqueia se estado atual divergiu', async () => {
    const beforeSnapshot = {
      matricula: {
        id: 332,
        curso_id: 9,
        funcionario_id: 77,
        status: 'EM_ANDAMENTO',
        progresso_pct: 20,
        ultimo_slide: 80,
        data_inicio: '2026-06-20T12:00:00Z',
        data_conclusao: null,
        qualificacao_historico_id: null,
      },
      scorm: {
        row_present: true,
        id: 901,
        lesson_location: '80/405',
        lesson_status: 'incomplete',
        completion_status: null,
        success_status: null,
        score_raw: 95,
        score_max: 100,
        score_min: 0,
        score_scaled: 0.95,
        session_time: '00:10:00',
        total_time: '00:40:00',
        session_count: 4,
        suspend_data: 'checkpoint-m03',
        launch_data: null,
        cmi_json: JSON.stringify({
          'cmi.location': '80/405',
          'cmi.core.lesson_location': '80/405',
          'cmi.suspend_data': 'checkpoint-m03',
        }),
      },
    };
    const appliedSnapshot = {
      ...beforeSnapshot,
      matricula: {
        ...beforeSnapshot.matricula,
        progresso_pct: 28,
        ultimo_slide: 113,
      },
      scorm: {
        ...beforeSnapshot.scorm,
        lesson_location: '113/405',
        cmi_json: JSON.stringify({
          'cmi.location': '113/405',
          'cmi.core.lesson_location': '113/405',
          'cmi.suspend_data': 'checkpoint-m03',
        }),
      },
    };
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () =>
            makeScormEnrollment({
              progresso_pct: 30,
              ultimo_slide: 120,
              cmi_json: JSON.stringify({
                'cmi.location': '120/405',
                'cmi.core.lesson_location': '120/405',
                'cmi.suspend_data': 'checkpoint-m03',
              }),
            }),
        },
      ],
      [
        'FROM audit_logs',
        {
          first: () => ({
            id: 7001,
            action: 'LMS_PROGRESS_RECOVERY_APPLY',
            entity_type: 'lms_matriculas',
            entity_id: 332,
            old_values: JSON.stringify(beforeSnapshot),
            new_values: JSON.stringify(appliedSnapshot),
            detalhes: JSON.stringify({ mode: 'RESTORE_PROGRESS_ONLY' }),
          }),
        },
      ],
    ]);

    const response = await createApp(db).fetch(
      makeRollbackRequest({
        audit_log_id: 7001,
        reason: 'Rollback controlado',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
  });

  it('matricula inexistente retorna 404 no apply', async () => {
    const { db } = createMockDb([['FROM lms_matriculas m', { first: () => null }]]);

    const response = await createApp(db).fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restore progress only',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: 'prr-v1-test',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(404);
  });

  it('curso nao scorm bloqueia apply', async () => {
    const { db } = createMockDb([
      ['FROM lms_matriculas m', { first: () => makeScormEnrollment({ tipo_conteudo: 'pdf' }) }],
    ]);

    const response = await createApp(db).fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        reason: 'Restore progress only',
        evidence_source: 'authorized-2026-06-26',
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: 'prr-v1-test',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
  });

  it('payload sem motivo ou evidencia bloqueia', async () => {
    const { db } = createMockDb([]);

    const response = await createApp(db).fetch(
      makeApplyRequest({
        target_lesson_location: '113/405',
        target_progress_pct: 28,
        operator_note: 'Aplicacao auditavel',
        dry_run_reference: 'prr-v1-test',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
  });
});
