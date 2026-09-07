import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ExecutionContext } from 'hono';
import frmsRelatoriosConfig from '../../routes/frms-relatorios-config';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

type QueryCall = { sql: string; params: unknown[] };

function createGovernanceDb(empresaId: number, options: { assignment?: boolean } = {}) {
  const calls: QueryCall[] = [];
  const revision = {
    id: `tenant-${empresaId}-revision`,
    empresa_id: empresaId,
    profile_code: 'HELICOPTER_OFFSHORE',
    revision_number: 7,
    status: 'ACTIVE',
    source_type: 'UNVERIFIED_OPERATIONAL_POLICY',
    source_reference: 'approved tenant fixture',
    regulatory_profile_id: `profile-${empresaId}`,
    policy_version: 'TENANT_POLICY_V7',
    effective_from: '2000-01-01',
    effective_to: null,
    actor_user_id: '11',
    reason: 'fixture',
    supersedes_revision_id: null,
    created_at: '2026-01-01 00:00:00',
  };
  const parameters = Object.entries(LIMITES_DEFAULT).map(([parameter_key, numeric_value]) => ({
    id: `${empresaId}-${parameter_key}`,
    revision_id: revision.id,
    parameter_key,
    numeric_value,
    json_value: null,
    unit: 'unit',
    metric: null,
    window_kind: null,
    direction: null,
    required: 1,
    created_at: '2026-01-01 00:00:00',
  }));
  const db = {
    prepare(sql: string) {
      const call: QueryCall = { sql, params: [] };
      calls.push(call);
      const statement = {
        bind(...params: unknown[]) {
          call.params = params;
          return statement;
        },
        async all() {
          if (sql.includes('FROM frms_profile_assignments')) {
            return { results: options.assignment === false ? [] : [{ regulatory_profile_id: `profile-${empresaId}`, profile_code: 'HELICOPTER_OFFSHORE' }] };
          }
          if (sql.includes('FROM frms_config_revisions')) return { results: [revision] };
          if (sql.includes('FROM frms_config_parameters')) return { results: parameters };
          return { results: [] };
        },
        async first() {
          if (sql.includes('FROM frms_config_revisions')) return null;
          if (sql.includes('FROM frms_recalc_runs')) {
            return {
              id: 'run-1', empresa_id: empresaId, profile_code: 'HELICOPTER_OFFSHORE', previous_revision_id: null,
              target_revision_id: 'new-revision', effective_from: '2099-01-01', effective_to: null,
              changed_parameter_keys_json: '[]', status: 'PENDING', processed_count: 0, failed_count: 0,
              cursor_json: null, error_summary: null, started_at: null, completed_at: null,
              created_at: '2026-01-01', updated_at: '2026-01-01',
            };
          }
          return null;
        },
        async run() { return { success: true }; },
      };
      return statement;
    },
    async batch(_statements: unknown[]) { return []; },
  };
  return { db: db as unknown as D1Database, calls, revision };
}

function appFor(empresaId: number, role: string, options?: { assignment?: boolean }) {
  const { db, calls, revision } = createGovernanceDb(empresaId, options);
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db };
    c.set('userId', '11');
    c.set('userRole', role);
    c.set('tenantContext', {
      empresaId,
      empresaCodigo: `tenant-${empresaId}`,
      empresaNome: `Tenant ${empresaId}`,
      role,
      plano: 'test',
      permissions: [],
    });
    await next();
  });
  app.onError((error) => new Response(
    JSON.stringify({ success: false, code: (error as { code?: string }).code ?? 'FRMS_ERROR' }),
    {
      status: (error as { statusCode?: number }).statusCode ?? 500,
      headers: { 'Content-Type': 'application/json' },
    },
  ));
  app.route('/', frmsRelatoriosConfig);
  return { app, calls, revision };
}

const executionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} as ExecutionContext;

describe('FRMS governed configuration routes', () => {
  it('resolves tenant A and B independently from authenticated tenant context', async () => {
    const tenantA = appFor(101, 'admin');
    const tenantB = appFor(202, 'admin');

    const responseA = await tenantA.app.fetch(new Request('http://localhost/configuracoes/governadas'), {}, executionContext);
    const responseB = await tenantB.app.fetch(new Request('http://localhost/configuracoes/governadas'), {}, executionContext);

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect((await responseA.json() as { data: { revision: { id: string } } }).data.revision.id).toBe('tenant-101-revision');
    expect((await responseB.json() as { data: { revision: { id: string } } }).data.revision.id).toBe('tenant-202-revision');
    expect(tenantA.calls.find((call) => call.sql.includes('FROM frms_profile_assignments'))?.params[0]).toBe(101);
    expect(tenantB.calls.find((call) => call.sql.includes('FROM frms_profile_assignments'))?.params[0]).toBe(202);
  });

  it('denies a non-admin before reading or mutating configuration', async () => {
    const { app, calls } = appFor(101, 'manager');
    const response = await app.fetch(new Request('http://localhost/configuracoes/governadas'), {}, executionContext);
    expect(response.status).toBe(403);
    expect(calls.some((call) => call.sql.includes('frms_config_revisions'))).toBe(false);
  });

  it('returns UNKNOWN/503 when the tenant has no effective governed assignment', async () => {
    const { app } = appFor(101, 'admin', { assignment: false });
    const response = await app.fetch(new Request('http://localhost/configuracoes/governadas'), {}, executionContext);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'FRMS_CONTEXT_UNAVAILABLE', state: 'UNKNOWN' });
  });

  it('rejects a client-selected empresa_id instead of trusting a cross-tenant scope', async () => {
    const { app, calls } = appFor(101, 'admin');
    const response = await app.fetch(new Request('http://localhost/configuracoes/governadas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: 202 }),
    }), {}, executionContext);
    expect(response.status).toBe(400);
    expect(calls.some((call) => call.sql.includes('frms_config_revisions'))).toBe(false);
  });
});
