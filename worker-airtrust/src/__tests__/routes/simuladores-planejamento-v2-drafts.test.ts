import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const assertFuncionarioInScope = vi.fn().mockResolvedValue(undefined);

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('empresaId', 1);
    c.set('userRole', 'admin');
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({ empresaId: 1 }),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn().mockResolvedValue({ mode: 'all', setorIds: [] }),
  buildFuncionarioScopeWhere: vi.fn().mockReturnValue({ clause: '1 = 1', bindings: [] }),
  assertFuncionarioInScope,
}));

import router from '../../routes/simuladores-planejamento-v2-drafts';

type RecordedStatement = { query: string; bindings: unknown[] };

function need(employeeId: number, name: string) {
  return {
    need_id: `${employeeId}:1:101`,
    employee_id: employeeId,
    employee_name: name,
    employee_role: employeeId === 10 ? 'Comandante' : 'Copiloto',
    qualification_type_id: 1,
    qualification_code: 'G1',
    qualification_name: 'AW139 — Currículo de Voo - Anual (FFS)',
    expiry_date: '2027-06-30',
    equipment: 'AW139',
    session_model_id: 101,
    session_code: 'S1',
    session_name: 'Sessão 1',
    session_order: 1,
    duration_minutes: 120,
    training_session_count: 4,
  };
}

function proposal() {
  const filipe = need(10, 'Filipe');
  const castro = need(30, 'Castro');
  return {
    mode: 'PREVIEW_ONLY',
    generated_at: '2026-09-03T00:00:00.000Z',
    reference_date: '2026-09-03',
    config: { roster_policy: 'FOLGA' },
    summary: {
      trainings: 2,
      session_requirements: 2,
      paired_blocks: 1,
      unmatched_blocks: 0,
      classes: 1,
    },
    trainings: [],
    classes: [
      {
        class_id: 'AW139-2027.06A',
        class_name: 'AW139-2027.06A',
        equipment: 'AW139',
        reference_date: '2027-06-30',
        blocks: [
          {
            block_id: 'block-1',
            equipment: 'AW139',
            duration_minutes: 120,
            target_date: '2027-06-30',
            pairing: 'MESMO_TREINAMENTO',
            sessions: [filipe, castro],
          },
        ],
      },
    ],
    cae_comparison: null,
    exceptions: [],
  };
}

function buildDb() {
  const statements: RecordedStatement[] = [];
  const db = {
    prepare: vi.fn((query: string) => {
      let bindings: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => {
          bindings = args;
          statements.push({ query, bindings });
          return statement;
        },
        all: async () => {
          if (query.includes("pragma_table_info('treinamentos_planejados')")) {
            return {
              results: [
                { name: 'planejamento_status' },
                { name: 'planejamento_origem' },
                { name: 'planejamento_chave' },
                { name: 'planejamento_snapshot_json' },
              ],
            };
          }
          return { results: [] };
        },
        first: async () => null,
        run: async () => {
          if (query.includes('INSERT INTO treinamentos_planejados')) {
            return { success: true, meta: { last_row_id: 77 } };
          }
          return { success: true, meta: {} };
        },
      };
      return statement;
    }),
  };
  return { db, statements };
}

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/simuladores/planejamento-v2', router);
  return app;
}

function savePayload(overrides: Record<string, unknown> = {}) {
  return {
    vencimento_inicio: '2027-06-01',
    vencimento_fim: '2027-06-30',
    workflow_status: 'AGUARDANDO_CAE',
    proposal: proposal(),
    base_needs: [need(10, 'Filipe'), need(30, 'Castro')],
    locks: [{ anchor_need_id: '10:1:101', partner_need_id: '30:1:101' }],
    cae_file_name: null,
    cae_file_key: null,
    cae_document: null,
    ...overrides,
  };
}

describe('simulator planning V3 persistent CAE workflow', () => {
  it('persists an adjusted proposal as tenant-scoped AGUARDANDO_DISPONIBILIDADE without materializing a session', async () => {
    assertFuncionarioInScope.mockClear();
    const app = buildApp();
    const { db, statements } = buildDb();

    const response = await app.request(
      '/api/simuladores/planejamento-v2/rascunhos',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(savePayload()),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(201);
    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.workflow_status).toBe('AGUARDANDO_CAE');
    expect(body.data.draft_id).toMatch(/^[0-9a-f-]{20,}$/i);
    expect(assertFuncionarioInScope).toHaveBeenCalledTimes(2);
    expect(assertFuncionarioInScope).toHaveBeenCalledWith(db, 1, 10, expect.anything());
    expect(assertFuncionarioInScope).toHaveBeenCalledWith(db, 1, 30, expect.anything());

    const planningInsert = statements.find((item) => item.query.includes('INSERT INTO treinamentos_planejados'));
    expect(planningInsert).toBeTruthy();
    expect(planningInsert?.bindings).toContain('AGUARDANDO_DISPONIBILIDADE');
    expect(planningInsert?.bindings).toContain('SIMULADOR_V3_PERSISTED');
    expect(statements.some((item) => item.query.includes('INSERT INTO simulador_planejamento_auditoria'))).toBe(true);
    expect(statements.some((item) => item.query.includes('simulador_agendamentos'))).toBe(false);
  });

  it('rejects a CAE object key from another tenant', async () => {
    assertFuncionarioInScope.mockClear();
    const app = buildApp();
    const { db } = buildDb();

    const response = await app.request(
      '/api/simuladores/planejamento-v2/rascunhos',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          savePayload({
            workflow_status: 'CAE_RECEBIDA',
            cae_file_name: 'disponibilidade.pdf',
            cae_file_key: 'cae-availability/2/disponibilidade.pdf',
          }),
        ),
      },
      { DB: db } as unknown as Env,
    );

    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error).toContain('tenant autenticado');
  });
});
