
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const listSnapshotMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth: () => async (context: unknown, next: () => Promise<void>) => {
    const c = context as { set: (key: string, value: unknown) => void; req: { header: (key: string) => string | undefined } };
    c.set('userId', 101);
    c.set('userRole', c.req.header('x-role') || 'viewer');
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (context: unknown) => Number((context as { req: { header: (key: string) => string | undefined } }).req.header('x-empresa-id') || 0),
}));
vi.mock('../../lib/frms/access', () => ({
  canSeeFrmsTeamScopeForContext: async (context: unknown) => (context as { req: { header: (key: string) => string | undefined } }).req.header('x-role') === 'manager',
}));
vi.mock('../../lib/frms/operational-snapshot', () => ({
  listFrmsOperationalSnapshot: (...args: unknown[]) => listSnapshotMock(...args),
}));

import routes from '../../routes/frms-operational-snapshot';

const endpoint = '/frms/ima-v3/schedule-exposure-shadow' +
  '?data_inicio=2026-10-15&data_fim=2026-10-15&funcionario_id=42' +
  '&reference_utc_offset_minutes=-180';

function app() {
  const r = new Hono<{ Bindings: Env }>();
  r.route('/frms', routes);
  return r;
}
function db(owned: boolean) {
  return {
    prepare: vi.fn(() => ({
      bind: (...args: unknown[]) => {
        expect(args).toEqual([42, 6]);
        return { first: async () => owned ? { id: 42 } : null };
      },
    })),
  };
}
function env(database: ReturnType<typeof db>, overrides: Record<string, unknown> = {}): Env {
  return {
    DB: database as unknown as D1Database,
    ENVIRONMENT: 'staging',
    FRMS_V3_SHADOW_PREVIEW_TENANTS: '6',
    ...overrides,
  } as unknown as Env;
}
function request(url = endpoint, role = 'manager', tenant = '6') {
  return new Request('http://localhost' + url, {
    headers: { 'x-role': role, 'x-empresa-id': tenant },
  });
}

const row = {
  empresa_id: 6, funcionario_id: 42, data_operacional: '2026-10-15',
  hora_apresentacao: '03:00', hora_termino: '11:00',
  teve_jornada: true, escalado: true, escala_source: 'EVD',
  jornada_data_source: 'REAL', operational_data_source: 'CONTROLE_VOOS',
  snapshot_status: 'OK', checkin_status: 'RECEBIDO',
  sleep_data_source: 'REAL', wake_data_source: 'REAL',
  horas_sono: 7, kss_score: 4,
  nome: 'IDENTITY_MUST_NOT_LEAVE_PREVIEW',
};

describe('FRMS IMA V3 research preview route: staging/tenant/RBAC isolation', () => {
  beforeEach(() => listSnapshotMock.mockReset());

  it('does not exist in production even with an accidentally configured allowlist', async () => {
    const database = db(true);
    const response = await app().fetch(request(), env(database, { ENVIRONMENT: 'production' }), {} as ExecutionContext);
    expect(response.status).toBe(404);
    expect(database.prepare).not.toHaveBeenCalled();
    expect(listSnapshotMock).not.toHaveBeenCalled();
  });

  it('is disabled by default and rejects all wildcard/foreign tenant activation', async () => {
    for (const tenants of [undefined, '', 'all', '7']) {
      const database = db(true);
      const response = await app().fetch(request(), env(database, { FRMS_V3_SHADOW_PREVIEW_TENANTS: tenants }), {} as ExecutionContext);
      expect(response.status).toBe(404);
      expect(database.prepare).not.toHaveBeenCalled();
    }
  });

  it('denies self/viewer scope BEFORE any employee or snapshot read', async () => {
    const database = db(true);
    const response = await app().fetch(request(endpoint, 'viewer'), env(database), {} as ExecutionContext);
    expect(response.status).toBe(403);
    expect(database.prepare).not.toHaveBeenCalled();
    expect(listSnapshotMock).not.toHaveBeenCalled();
  });

  it('does not query a missing/foreign-tenant employee in the snapshot', async () => {
    const database = db(false);
    const response = await app().fetch(request(), env(database), {} as ExecutionContext);
    expect(response.status).toBe(404);
    expect(database.prepare).toHaveBeenCalledTimes(1);
    expect(listSnapshotMock).not.toHaveBeenCalled();
  });

  it('rejects malformed and excessive date spans, unknown UTC offset or missing employee', async () => {
    const invalid = [
      endpoint.replace('data_fim=2026-10-15', 'data_fim=2026-10-25'),
      endpoint.replace('data_inicio=2026-10-15', 'data_inicio=2026-02-30'),
      endpoint.replace('reference_utc_offset_minutes=-180', 'reference_utc_offset_minutes=2500'),
      endpoint.replace('funcionario_id=42', 'funcionario_id='),
    ];
    for (const url of invalid) {
      const database = db(true);
      const response = await app().fetch(request(url), env(database), {} as ExecutionContext);
      expect(response.status).toBe(400);
      expect(database.prepare).not.toHaveBeenCalled();
    }
  });

  it('only returns aggregate exposure and evidence, never names or employee identifiers', async () => {
    const database = db(true);
    listSnapshotMock.mockResolvedValueOnce({ items: [row], summary: {} });
    const response = await app().fetch(request(), env(database), {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(listSnapshotMock).toHaveBeenCalledTimes(1);
    expect(listSnapshotMock.mock.calls[0][1]).toMatchObject({
      empresaId: 6, dataInicio: '2026-10-15', dataFim: '2026-10-15',
      filters: { funcionario_id: 42, include_inconsistencies: true },
    });
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      success: true,
      meta: { mode: 'EXPERIMENTAL_SHADOW_ONLY', physiologyValidated: false, writes: 0 },
      data: {
        reconstructedOperationalRows: 1, mappedActualRows: 0,
        mappedEstimatedRows: 1, operationalDecision: 'NOT_ASSESSED',
        modelValidation: 'NOT_VALIDATED',
        exposure: { actualDutyHours: 0, estimatedDutyHours: 8, fatigueIndex: null, fitForDuty: null },
        dailyEvidence: { sampleSize: 1, datedSleepEpisodeRows: 0, knownKssRows: 1 },
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('IDENTITY_MUST_NOT_LEAVE_PREVIEW');
    expect(serialized).not.toContain('"funcionario_id"');
    expect(serialized).not.toContain('"empresa_id"');
  });

  it('fails closed and does not leak source row identifiers if snapshot contains another tenant', async () => {
    const database = db(true);
    listSnapshotMock.mockResolvedValueOnce({
      items: [{ ...row, empresa_id: 7, nome: 'SECRET_NEVER_OUTPUT' }], summary: {},
    });
    const response = await app().fetch(request(), env(database), {} as ExecutionContext);
    expect(response.status).toBe(409);
    const body = await response.text();
    expect(body).toContain('IMA_SHADOW_UNRESOLVED_EVIDENCE');
    expect(body).not.toContain('SECRET_NEVER_OUTPUT');
    expect(body).not.toContain('funcionario_id');
  });
});
