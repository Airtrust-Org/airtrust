import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros from '../../routes/frms-bombeiros';

const profile = vi.fn();
const policy = vi.fn();
vi.mock('../../lib/frms/parameter-governance', async original => ({
  ...(await original<typeof import('../../lib/frms/parameter-governance')>()),
  resolveFrmsRegulatoryProfileEvidence: (...args: unknown[]) => profile(...args),
}));
vi.mock('../../lib/frms/db-service', async original => ({
  ...(await original<typeof import('../../lib/frms/db-service')>()),
  loadEffectiveFrmsConfiguration: (...args: unknown[]) => policy(...args),
}));

const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as ExecutionContext;
function appFor(id = 130, code = 'bombeiros', role = 'admin', env = 'staging') {
  const db = { prepare: vi.fn() };
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db, ENVIRONMENT: env };
    c.set('userId', 90);
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId: id, empresaCodigo: code, role, empresaNome: code,
      plano: 'qa', permissions: [],
    });
    await next();
  });
  app.onError(error => new Response(JSON.stringify({ code: 'DENIED' }), {
    status: (error as { statusCode?: number }).statusCode ?? 500,
  }));
  app.route('/', frmsBombeiros);
  return {
    db,
    post: (body: string, type = 'application/json') => app.fetch(
      new Request('http://localhost/fontes-operacionais/validar-qa', {
        method: 'POST',
        headers: { 'Content-Type': type },
        body,
      }), {}, ctx,
    ),
  };
}
const fixture = () => ({
  schema: 'BOA_OPERATIONAL_SOURCE_BATCH_V1',
  source: {
    source_system_id: 'BOA-QA-SYNTHETIC',
    dataset_id: 'qa-batch-001',
    export_id: 'qa-export-1',
    export_revision: 'qa-rev-1',
    exported_at: '2026-10-22T08:00:00-03:00',
    source_document_reference: 'qa-source-document-1',
  },
  records: [{
    external_duty_id: 'qa-duty-1', external_crew_id: 'qa-crew-1',
    external_sector_id: 'qa-sector-1', external_base_id: 'qa-base-1',
    external_mission_id: null, source_record_revision: 'qa-record-1',
    source_record_updated_at: '2026-10-22T07:30:00-03:00',
    planned: {
      start_at: '2026-10-21T22:00:00-03:00',
      end_at: '2026-10-22T06:00:00-03:00',
    },
    actual: {
      start_at: '2026-10-21T22:30:00-03:00',
      end_at: '2026-10-22T06:30:00-03:00',
    },
    standby_state: 'UNKNOWN', standby: null,
    activation_state: 'UNKNOWN', activations: [],
  }],
});

describe('BOA source preflight is bounded, authenticated, synthetic-only and read-only', () => {
  beforeEach(() => {
    profile.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION', regulatoryProfileId: 'boa-profile',
    });
    policy.mockReset().mockResolvedValue({
      empresaId: 130, profileCode: 'FIREFIGHTER_AVIATION',
      regulatoryProfileId: 'boa-profile', revision: { id: 'qa-rev', policy_version: 'QA_ONLY' },
    });
  });

  it('validates fictitious sources and reports only aggregates, missing coverage and checksum', async () => {
    const { db, post } = appFor();
    const response = await post(JSON.stringify(fixture()));
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Record<string, any>; meta: Record<string, unknown> };
    expect(body.data).toMatchObject({
      schema: 'BOA_OPERATIONAL_SOURCE_BATCH_V1',
      status: 'SCHEMA_VALID_SOURCE_UNVERIFIED',
      record_count: 1,
      candidate_totals_ms: { planned: 28800000, actual: 28800000,
        standby: null, activations: null },
      missing_sources_count: { STANDBY_STATUS_UNKNOWN: 1, ACTIVATION_COVERAGE_UNKNOWN: 1 },
      tenant_identity_link: 'NOT_RESOLVED', source_approval: 'NOT_EVALUATED',
      stored: false, scientific_risk_score: null, operational_exposure_denominator_ms: null,
      dispatch_permission: 'NOT_GRANTED',
    });
    expect(body.data.input_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.meta.write_performed).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/qa-crew-1|qa-duty-1|sleep_hours_24h|kss_reported/);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('rejects wrong role/tenant/production before policy evaluation', async () => {
    const payload = JSON.stringify(fixture());
    for (const args of [
      [6, 'costadosol', 'admin', 'staging'],
      [6, 'bombeiros', 'admin', 'staging'],
      [130, 'bombeiros', 'manager', 'staging'],
      [130, 'bombeiros', 'admin', 'production'],
    ] as const) {
      const response = await appFor(...args).post(payload);
      expect([403, 404]).toContain(response.status);
    }
    expect(profile).not.toHaveBeenCalled();
  });

  it('rejects non-synthetic source and unapproved profile, with no result disclosure', async () => {
    const data = fixture();
    data.source.source_system_id = 'BOA-REAL-UNAPPROVED';
    expect((await appFor().post(JSON.stringify(data))).status).toBe(403);
    expect(profile).not.toHaveBeenCalled();
    data.source.source_system_id = 'BOA-QA-SYNTHETIC';
    profile.mockResolvedValueOnce({
      empresaId: 130, profileCode: 'HELICOPTER_OFFSHORE', regulatoryProfileId: 'wrong',
    });
    expect((await appFor().post(JSON.stringify(data))).status).toBe(503);
  });

  it('fails closed on malformed, oversized or non-JSON input without touching D1', async () => {
    const { db, post } = appFor();
    expect((await post('no JSON')).status).toBe(400);
    expect((await post('{}', 'text/plain')).status).toBe(415);
    expect((await post(JSON.stringify({ ...fixture(), empresa_id: 6 }))).status).toBe(400);
    expect((await post(' '.repeat(262145))).status).toBe(413);
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
