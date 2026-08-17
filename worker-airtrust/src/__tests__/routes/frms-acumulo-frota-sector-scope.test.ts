import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Env } from '../../types';
import type { EmployeeSectorAccess } from '../../services/employee-sector-access';

/**
 * P1-FRMS-003 — GET /api/frms/acumulo-frota ignored self/setor scoping,
 * only filtering by empresa_id. This verifies the route now resolves the
 * requester's employee-sector-access scope and forwards it into
 * buscarAcumuloFrota, so:
 *  - a self-service user (A_USER) only ever gets a self-scope
 *  - a manager scoped to setor 1 (A_MANAGER_SETOR1) only gets that setor
 *    (never setor 2, where A_F2 lives)
 *  - an admin (A_ADMIN) gets no extra restriction ("all")
 *  - tenant isolation (empresaId) is always taken from the tenant context,
 *    never from the sector-access resolution — so tenant B data can never
 *    leak into a tenant A request regardless of role.
 */

const empresaIdBox: { value: number | undefined } = vi.hoisted(() => ({ value: 5 }));
const accessBox: { value: EmployeeSectorAccess } = vi.hoisted(() => ({
  value: { mode: 'all', setorIds: [], funcionarioId: null },
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: any, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../routes/frms-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../routes/frms-shared')>();
  return {
    ...actual,
    safe: (fn: (c: any) => Promise<Response>) => fn,
    getEmpresaIdSafe: () => empresaIdBox.value,
  };
});

vi.mock('../../services/employee-sector-access', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/employee-sector-access')>();
  return {
    ...actual,
    getEmployeeSectorAccess: vi.fn(async () => accessBox.value),
  };
});

const { capturedScopeCalls, buscarAcumuloFrotaMock } = vi.hoisted(() => {
  const capturedScopeCalls: Array<{
    empresaId: number | undefined;
    sectorScope: { clause: string; bindings: number[] } | undefined;
  }> = [];
  const buscarAcumuloFrotaMock = vi.fn(
    async (
      _db: unknown,
      _mes: string | undefined,
      empresaId: number | undefined,
      _periodo: number,
      _quinzena: unknown,
      sectorScope: { clause: string; bindings: number[] } | undefined,
    ) => {
      capturedScopeCalls.push({ empresaId, sectorScope });
      return [];
    },
  );
  return { capturedScopeCalls, buscarAcumuloFrotaMock };
});

vi.mock('../../lib/frms/db-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/frms/db-service')>();
  return {
    ...actual,
    buscarAcumuloFrota: buscarAcumuloFrotaMock,
  };
});

import frmsRoutes from '../../routes/frms';
import { buildFuncionarioScopeWhere } from '../../services/employee-sector-access';

const fakeDb = {} as unknown as Env['DB'];

function acumuloFrotaRequest() {
  return new Request('http://localhost/acumulo-frota', { method: 'GET' });
}

describe('GET /api/frms/acumulo-frota — sector/self scoping (P1-FRMS-003)', () => {
  beforeEach(() => {
    capturedScopeCalls.length = 0;
    buscarAcumuloFrotaMock.mockClear();
    empresaIdBox.value = 5;
    accessBox.value = { mode: 'all', setorIds: [], funcionarioId: null };
  });

  it('A_USER (self mode) → route forwards a self-only scope to buscarAcumuloFrota', async () => {
    accessBox.value = { mode: 'self', setorIds: [], funcionarioId: 101 };

    const response = await frmsRoutes.fetch(
      acumuloFrotaRequest(),
      { DB: fakeDb } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(capturedScopeCalls).toHaveLength(1);
    const { sectorScope } = capturedScopeCalls[0];
    expect(sectorScope).toEqual(buildFuncionarioScopeWhere(accessBox.value, 'p'));
    expect(sectorScope!.clause).toBe('p.id = ?');
    expect(sectorScope!.bindings).toEqual([101]);
  });

  it('A_MANAGER_SETOR1 → route forwards a setor1-only scope, never including setor2 (A_F2)', async () => {
    accessBox.value = { mode: 'restricted', setorIds: [1], funcionarioId: null };

    const response = await frmsRoutes.fetch(
      acumuloFrotaRequest(),
      { DB: fakeDb } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const { sectorScope } = capturedScopeCalls[0];
    expect(sectorScope!.clause).toBe('p.setor_id IN (?)');
    expect(sectorScope!.bindings).toEqual([1]);
    expect(sectorScope!.bindings).not.toContain(2);
  });

  it('A_MANAGER_SETOR1 → B_F1 (other tenant) never appears: empresaId always comes from tenant context, not from the sector-access resolution', async () => {
    empresaIdBox.value = 5; // tenant A
    accessBox.value = { mode: 'restricted', setorIds: [1], funcionarioId: null };

    await frmsRoutes.fetch(acumuloFrotaRequest(), { DB: fakeDb } as Env, {} as ExecutionContext);

    expect(capturedScopeCalls[0].empresaId).toBe(5);
    expect(capturedScopeCalls[0].empresaId).not.toBe(99); // tenant B id, never leaked
  });

  it('A_ADMIN → sees all of tenant A (no extra sector restriction), tenant isolation still via empresaId', async () => {
    empresaIdBox.value = 5;
    accessBox.value = { mode: 'all', setorIds: [], funcionarioId: null };

    const response = await frmsRoutes.fetch(
      acumuloFrotaRequest(),
      { DB: fakeDb } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const { sectorScope, empresaId } = capturedScopeCalls[0];
    expect(sectorScope!.clause).toBe('1 = 1');
    expect(sectorScope!.bindings).toEqual([]);
    expect(empresaId).toBe(5);
  });
});
