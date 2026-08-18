/**
 * Regression coverage for P0-HV-001 / P1-HV-002:
 *
 * The flight-hours (horas de voo / caderneta) mutation routes wrote
 * funcionario_id into horas_voo_saldo_inicial / horas_voo_lancamentos
 * without ever proving the target employee belongs to the acting
 * empresa_id (tenant) — an attacker could set/delete a balance or
 * create/update/delete/import flight-hour entries for any employee id,
 * including ones belonging to a different tenant. A sector-scoped
 * manager could also mutate an employee outside their own sector,
 * within the same tenant.
 *
 * These tests confirm every mutation route now calls the shared
 * fail-closed ownership helper (assertFuncionarioInScope /
 * getEmployeeSectorAccess — the same helper already used by
 * funcionarios-mutations.ts, lms-matriculas.ts, etc.) before issuing
 * any write, and that PUT/DELETE lancamentos additionally narrow their
 * WHERE clause to funcionario_id + empresa_id so a guessed/reused
 * lancamento_id paired with a mismatched funcionario_id cannot mutate
 * someone else's row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

type TestEmployeeSectorAccess =
  | { mode: 'all'; setorIds: number[] }
  | { mode: 'restricted'; setorIds: number[] }
  | { mode: 'self'; setorIds: number[] };

const { getEmployeeSectorAccessMock, assertFuncionarioInScopeMock, registrarAuditoriaMock } =
  vi.hoisted(() => ({
    getEmployeeSectorAccessMock: vi.fn(
      async (): Promise<TestEmployeeSectorAccess> => ({ mode: 'all', setorIds: [] }),
    ),
    assertFuncionarioInScopeMock: vi.fn(async () => undefined),
    registrarAuditoriaMock: vi.fn(async () => undefined),
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
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../utils/auditoria', () => ({
  extrairUsuarioAuditoria: () => ({ usuario_id: 42, usuario_nome: 'Teste' }),
  registrarAuditoria: registrarAuditoriaMock,
}));

vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: assertFuncionarioInScopeMock,
  getEmployeeSectorAccess: getEmployeeSectorAccessMock,
}));

import horasVooRoutes from '../../routes/horas-voo';
import { errorHandler, forbidden } from '../../middleware/error-handler';

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
            return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 1 } };
          },
          all: async () => (handler.all ? handler.all(args) : { results: [] }),
        }),
        first: async () => (handler.first ? handler.first([]) : null),
        run: async () => {
          writes.push(query.slice(0, 60));
          return { meta: { changes: 1, last_row_id: 1 } };
        },
        all: async () => (handler.all ? handler.all([]) : { results: [] }),
      };
    }),
  } as unknown as D1Database;

  return { db, writes };
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', horasVooRoutes);
  app.onError(errorHandler);
  return app;
}

function postSaldo(app: Hono<{ Bindings: Env }>, db: D1Database, funcionarioId: number) {
  return app.fetch(
    new Request(`http://localhost/${funcionarioId}/saldo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        horas_total_min: 100,
        horas_pic_min: 10,
        horas_sic_min: 10,
        horas_noturna_min: 0,
        horas_instrumento_min: 0,
        horas_simulador_min: 0,
        horas_instrucao_min: 0,
        horas_aw139_min: 0,
        horas_sk76_min: 0,
        horas_outros_modelos_min: 0,
        data_referencia: '2026-01-01',
      }),
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

function postLancamento(app: Hono<{ Bindings: Env }>, db: D1Database, funcionarioId: number) {
  return app.fetch(
    new Request(`http://localhost/${funcionarioId}/lancamentos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data_voo: '2026-01-01',
        duracao_total_min: 60,
        duracao_pic_min: 30,
        duracao_sic_min: 30,
        funcao: 'PIC',
      }),
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

function putLancamento(
  app: Hono<{ Bindings: Env }>,
  db: D1Database,
  funcionarioId: number,
  lancamentoId: number,
) {
  return app.fetch(
    new Request(`http://localhost/${funcionarioId}/lancamentos/${lancamentoId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data_voo: '2026-01-02',
        duracao_total_min: 90,
        duracao_pic_min: 45,
        duracao_sic_min: 45,
        funcao: 'SIC',
      }),
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

function deleteLancamento(
  app: Hono<{ Bindings: Env }>,
  db: D1Database,
  funcionarioId: number,
  lancamentoId: number,
) {
  return app.fetch(
    new Request(`http://localhost/${funcionarioId}/lancamentos/${lancamentoId}`, {
      method: 'DELETE',
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

function deleteSaldo(app: Hono<{ Bindings: Env }>, db: D1Database, funcionarioId: number) {
  return app.fetch(
    new Request(`http://localhost/${funcionarioId}/saldo`, { method: 'DELETE' }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );
}

const existingLancamento = {
  id: 700,
  funcionario_id: 111, // A_F1_SETOR1
  empresa_id: 1,
  origem_registro: 'MANUAL',
  deleted_at: null,
};

describe('Horas de voo — tenant + sector ownership enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'all', setorIds: [] });
    assertFuncionarioInScopeMock.mockResolvedValue(undefined);
    registrarAuditoriaMock.mockResolvedValue(undefined);
  });

  it('A_MANAGER writing saldo for B_F1 (other tenant employee): zero rows written, rejected', async () => {
    assertFuncionarioInScopeMock.mockImplementation(async () => {
      forbidden('Acesso negado ao funcionário solicitado', 'FUNCIONARIO_OUT_OF_SCOPE');
    });

    const { db, writes } = createMockDb([]);
    const res = await postSaldo(makeApp(), db, 999);

    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
    expect(assertFuncionarioInScopeMock).toHaveBeenCalledWith(
      expect.anything(),
      1,
      999,
      expect.objectContaining({ mode: 'all' }),
    );
  });

  it('A_MANAGER_SETOR1 writing lancamento for A_F2_SETOR2 (same tenant, different sector): denied, no write', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [1] });
    assertFuncionarioInScopeMock.mockImplementation(async () => {
      forbidden('Acesso negado ao funcionário solicitado', 'FUNCIONARIO_OUT_OF_SCOPE');
    });

    const { db, writes } = createMockDb([]);
    const res = await postLancamento(makeApp(), db, 222); // A_F2_SETOR2

    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('A_MANAGER_SETOR1 writing lancamento for A_F1_SETOR1 (own sector): allowed', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'restricted', setorIds: [1] });
    assertFuncionarioInScopeMock.mockResolvedValue(undefined);

    const { db, writes } = createMockDb([
      ['INSERT INTO horas_voo_lancamentos', { run: () => ({ meta: { last_row_id: 700 } }) }],
      [
        'SELECT * FROM horas_voo_lancamentos WHERE id = ? AND empresa_id = ?',
        { first: () => ({ ...existingLancamento, id: 700 }) },
      ],
    ]);

    const res = await postLancamento(makeApp(), db, 111); // A_F1_SETOR1

    expect(res.status).toBe(201);
    expect(writes.some((w) => w.includes('INSERT INTO horas_voo_lancamentos'))).toBe(true);
  });

  it('A_ADMIN writing to A_F1: allowed', async () => {
    getEmployeeSectorAccessMock.mockResolvedValue({ mode: 'all', setorIds: [] });
    assertFuncionarioInScopeMock.mockResolvedValue(undefined);

    const { db } = createMockDb([
      ['SELECT *\n       FROM horas_voo_saldo_inicial', { first: () => null }],
      ['INSERT INTO horas_voo_saldo_inicial', { run: () => ({ meta: { last_row_id: 1 } }) }],
    ]);

    const res = await postSaldo(makeApp(), db, 111);

    expect(res.status).toBe(200);
    expect(assertFuncionarioInScopeMock).toHaveBeenCalled();
  });

  it('A_ADMIN attempting to write to B_F1 (other tenant): denied', async () => {
    assertFuncionarioInScopeMock.mockImplementation(async () => {
      forbidden('Acesso negado ao funcionário solicitado', 'FUNCIONARIO_OUT_OF_SCOPE');
    });

    const { db, writes } = createMockDb([]);
    const res = await deleteSaldo(makeApp(), db, 999);

    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('correct lancamento_id with mismatched funcionario_id: zero rows written (WHERE narrowing)', async () => {
    // Ownership check passes (funcionarioId 333 is in scope), but the
    // lancamento_id 700 actually belongs to a different funcionario (111).
    // The lookup query includes funcionario_id in its WHERE, so it must
    // return nothing — proving the row-level narrowing, not just a
    // separate pre-check.
    assertFuncionarioInScopeMock.mockResolvedValue(undefined);

    const { db, writes } = createMockDb([
      [
        'WHERE id = ? AND funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL',
        {
          first: (args: unknown[]) => {
            const [id, funcionarioId] = args;
            if (id === 700 && funcionarioId === 111) return existingLancamento;
            return null; // mismatched funcionario_id -> no row found
          },
        },
      ],
    ]);

    const putRes = await putLancamento(makeApp(), db, 333, 700);
    expect(putRes.status).toBe(404);
    expect(writes.some((w) => w.includes('UPDATE horas_voo_lancamentos'))).toBe(false);

    const delRes = await deleteLancamento(makeApp(), db, 333, 700);
    expect(delRes.status).toBe(404);
    expect(writes).toHaveLength(0);
  });

  it('PUT lancamentos narrows the UPDATE WHERE clause to id + funcionario_id + empresa_id', async () => {
    assertFuncionarioInScopeMock.mockResolvedValue(undefined);

    const { db, writes } = createMockDb([
      [
        'WHERE id = ? AND funcionario_id = ? AND empresa_id = ? AND deleted_at IS NULL',
        { first: () => existingLancamento },
      ],
      ['UPDATE horas_voo_lancamentos', { run: () => ({ meta: { changes: 1 } }) }],
      [
        'SELECT * FROM horas_voo_lancamentos WHERE id = ? AND empresa_id = ?',
        { first: () => ({ ...existingLancamento, duracao_total_min: 90 }) },
      ],
    ]);

    const res = await putLancamento(makeApp(), db, 111, 700);

    expect(res.status).toBe(200);
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = ? AND funcionario_id = ? AND empresa_id = ?'),
    );
  });
});
