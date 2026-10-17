import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const { syncMock } = vi.hoisted(() => ({ syncMock: vi.fn() }));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 9);
    c.set('userRole', 'tripulante');
    c.set('empresaId', 7);
    c.set('funcionarioId', 70);
    await next();
  },
}));
vi.mock('../../middleware/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/tenant')>()),
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));
vi.mock('../../middleware/frms-fatigue-checkin-access', () => ({
  requireFatigueCheckinAccess: async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/frms-fadiga-config', () => ({
  getFadigaConfig: async () => ({
    ativo: true, threshold_amarelo: 50, threshold_vermelho: 80,
    peso_kss: 1, peso_sono_duracao: 1, peso_sono_qualidade: 1, peso_sintomas: 1,
  }),
  updateFadigaDutyConfig: async () => {},
}));
vi.mock('../../lib/frms/fadiga-score', () => ({
  calcularHorasSono: () => 7,
  calcularScoreFadiga: () => ({
    score_fadiga: 20,
    nivel_fadiga: 'VERDE',
    status_operacional: 'APTO',
    requires_frat_review: 0,
    frat_sugerido_nivel: null,
    recomendacao: 'Normal',
    componentes: {},
  }),
}));
vi.mock('../../lib/frms/parameter-governance', () => ({
  FrmsParameterResolutionError: class extends Error {},
  resolveFrmsOperationalContext: async () => ({
    regulatoryProfileId: 'profile-v2',
    profileCode: 'R117',
    configRevisionId: 'revision-v2',
    modelVersion: 'configured',
    fadigaPolicy: {},
    parameters: {},
  }),
}));
vi.mock('../../routes/frms-fadiga-checkin-readiness-sync', () => ({
  EmbeddedReadinessValidationError: class extends Error {},
  persistReadinessAndSyncFrms: (...args: unknown[]) => syncMock(...args),
}));
vi.mock('../../utils/auditoria', () => ({ registrarAuditoria: async () => {} }));

import router from '../../routes/frms-fadiga-checkin-legacy';

type MockStatement = {
  sql: string;
  binds: unknown[];
  bind: (...args: unknown[]) => MockStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

function fakeDb(opts: { existing?: boolean; batchReject?: boolean; concurrent?: boolean } = {}) {
  let checkinReadCount = 0;
  const statements: MockStatement[] = [];
  const batch = vi.fn(async (writes: MockStatement[]) => {
    if (opts.batchReject) throw new Error('D1_ERROR: CHECK constraint failed');
    return writes.map(() => ({ meta: { changes: 1 } }));
  });
  const db = {
    prepare: vi.fn((sql: string): MockStatement => {
      const text = sql.replace(/\s+/g, ' ').trim();
      const stmt: MockStatement = {
        sql: text, binds: [],
        bind: (...args: unknown[]) => { stmt.binds = args; return stmt; },
        first: async () => {
          if (text.includes('FROM funcionarios') && text.includes('WHERE id = ?')) return { id: 70 };
          if (text.includes('FROM frms_fadiga_checkin') && text.includes('WHERE empresa_id')) {
            checkinReadCount++;
            return (opts.existing || (opts.concurrent && checkinReadCount > 1))
              ? { id: 'checkin-present' }
              : null;
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1 } }),
      };
      statements.push(stmt);
      return stmt;
    }),
    batch,
  };
  return { db: db as unknown as D1Database, batch, statements };
}

function trials() {
  return Array.from({ length: 10 }, (_, i) => {
    const t = (i + 1) * 5000;
    return {
      sequence: i + 1, scheduledAtMs: t,
      stimulusAtMs: t + 100, responseAtMs: t + 380,
      reactionTimeMs: 280, outcome: 'response',
    };
  });
}

function request(readiness?: object) {
  return new Request('http://localhost/fadiga-checkin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference_date: '2026-10-16', wake_time: '06:15', hora_apresentacao: '07:00',
      horas_sono_24h: 7, fit_for_duty: true, kss_score: 3,
      ...(readiness ? { readiness } : {}),
    }),
  });
}

describe('daily check-in atomic commit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncMock.mockResolvedValue({ sync: { sincronizado: false, jornada_id: null } });
  });

  it('commits check-in, readiness and ten trials, then KSS event in ONE D1 batch', async () => {
    const { db, batch } = fakeDb();
    const response = await router.fetch(request({ duration_ms: 60000, trials: trials() }),
      { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(batch).toHaveBeenCalledTimes(1);
    const writes = batch.mock.calls[0][0];
    expect(writes).toHaveLength(13);
    expect(writes[0].sql).toContain('INSERT INTO frms_fadiga_checkin');
    expect(writes[1].sql).toContain('INSERT INTO frms_readiness_assessment');
    expect(writes.slice(2, 12).every((s) => s.sql.includes('INSERT INTO frms_readiness_vigilance_trial'))).toBe(true);
    expect(writes[12].sql).toContain('INSERT INTO frms_fadiga_evento');
    expect(writes[12].binds[1]).toBe(7);
    expect(JSON.parse(String(writes[12].binds[4]))).toMatchObject({ kssProvenance: 'CREW_REPORTED' });
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ readinessAlreadyPersisted: true }));
  });

  it('prevalidates malformed trial timing without mutating an existing check-in', async () => {
    const { db, batch } = fakeDb({ existing: true });
    const broken = trials();
    broken[3].stimulusAtMs = 70000;
    const response = await router.fetch(request({ duration_ms: 60000, trials: broken }),
      { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_trial_timing' });
    expect(batch).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('rejects the batch atomically on constraint failure, before FRMS sync', async () => {
    const { db, batch } = fakeDb({ batchReject: true });
    const response = await router.fetch(request(), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(500);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('returns 409 if competing same-day insert wins, without syncing', async () => {
    const { db, batch } = fakeDb({ batchReject: true, concurrent: true });
    const response = await router.fetch(request(), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(syncMock).not.toHaveBeenCalled();
  });
});
