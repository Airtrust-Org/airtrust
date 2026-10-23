import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const mocks = vi.hoisted(() => ({
  detectMismatch: vi.fn(),
  readProposal: vi.fn(),
  writeHandoff: vi.fn(),
}));

vi.mock('../../services/lms-edition-mismatch', () => ({
  detectLmsEditionMismatch: mocks.detectMismatch,
}));
vi.mock('../../services/lms-scorm-active-resume-readonly', () => ({
  readScormActiveResumeProposal: mocks.readProposal,
}));
vi.mock('../../services/lms-scorm-edition-handoff-writer', () => ({
  writeScormEditionHandoff: mocks.writeHandoff,
}));

import { registerLmsScormEditionHandoffRoute } from '../../routes/lms-scorm-edition-handoff';

const packageSha256 = 'a'.repeat(64);
const proposal = {
  status: 'MATCHED_ANCHOR',
  cycleId: 902,
  activePackageSha256: packageSha256,
  previousPackageSha256: 'b'.repeat(64),
  targetSlideId: 'unit-32',
  targetPosition: 32,
  activeTotal: 43,
  matchedNavigationUnitIds: ['unit-32'],
  unmatchedNavigationUnitIds: [],
  pendingReviewUnitIds: Array.from({ length: 43 }, (_, index) => `unit-${index + 1}`),
  reviewRequired: true,
  canTransferScore: false,
  canMarkComplete: false,
} as const;

function createDb(row: Record<string, unknown> | null) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const call = { sql, params: [] as unknown[] };
      calls.push(call);
      const statement = {
        bind(...params: unknown[]) {
          call.params = params;
          return statement;
        },
        async first() { return row; },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { db, calls };
}

function createApp(role = 'admin') {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    const set = c.set as unknown as (key: string, value: unknown) => void;
    set('empresaId', 17);
    set('userId', 81);
    set('userRole', role);
    await next();
  });
  registerLmsScormEditionHandoffRoute(app);
  return app;
}

function createEnv(db: D1Database, handoffEnabled?: string): Env {
  return {
    DB: db,
    BUCKET: {} as R2Bucket,
    JWT_SECRET: 'test-secret',
    ENVIRONMENT: 'development',
    API_URL: 'http://localhost',
    FRONTEND_URL: 'http://localhost',
    DEBUG: 'false',
    LOG_LEVEL: 'error',
    LMS_SCORM_EDITION_HANDOFF_ENABLED: handoffEnabled,
  };
}

describe('POST /:id/scorm-edition-handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detectMismatch.mockResolvedValue({ required: true });
    mocks.readProposal.mockResolvedValue(proposal);
    mocks.writeHandoff.mockResolvedValue({
      id: 441,
      cycleId: 902,
      targetSha256: packageSha256,
      alreadyApplied: false,
    });
  });

  it('bounds eligibility to the authenticated tenant and hands only the verified active-package proposal to the writer', async () => {
    const { db, calls } = createDb({
      id: 74,
      curso_id: 33,
      status: 'EM_ANDAMENTO',
      data_inicio: '2026-10-01T00:00:00Z',
      qualificacao_historico_id: null,
      ciclo_id: 902,
      cycle_started_at: '2026-10-01T00:00:00Z',
      tipo_conteudo: 'scorm',
      scorm_package_r2_prefix: 'lms/scorm/17/33/active/',
      package_sha256: packageSha256,
      cmi_json: '{"cmi.core.lesson_location":"32/37"}',
    });

    const response = await createApp().request(
      '/74/scorm-edition-handoff',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      createEnv(db, 'true'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 441, cycleId: 902, targetSha256: packageSha256 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('m.id=? AND m.empresa_id=?');
    expect(calls[0].sql).toContain('cy.empresa_id=m.empresa_id');
    expect(calls[0].params).toEqual([74, 17]);
    expect(mocks.readProposal).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 17,
      cursoId: 33,
      cycleId: 902,
      activePrefix: 'lms/scorm/17/33/active/',
    }));
    expect(mocks.writeHandoff).toHaveBeenCalledWith(db, expect.objectContaining({
      empresaId: 17,
      matriculaId: 74,
      actorId: 81,
      targetSha256: packageSha256,
      resumePlanJson: JSON.stringify(proposal),
    }));
  });

  it('fails closed when handoff is disabled before reading or writing enrollment data', async () => {
    const { db, calls } = createDb(null);
    const response = await createApp().request(
      '/74/scorm-edition-handoff',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      createEnv(db),
    );

    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
    expect(mocks.writeHandoff).not.toHaveBeenCalled();
  });

  it('rejects a non-admin before reading or writing enrollment data', async () => {
    const { db, calls } = createDb(null);
    const response = await createApp('student').request(
      '/74/scorm-edition-handoff',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      createEnv(db, 'true'),
    );

    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
    expect(mocks.writeHandoff).not.toHaveBeenCalled();
  });
});
