import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarAcumuloFrota } from '../../lib/frms/db-service-acumulo';
import { buildFuncionarioScopeWhere, type EmployeeSectorAccess } from '../../services/employee-sector-access';
import * as parameterGovernanceModule from '../../lib/frms/parameter-governance';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * P1-FRMS-003 — GET /api/frms/acumulo-frota previously filtered only by
 * empresa_id, ignoring self/setor scoping. This verifies that an optional
 * sectorScope (built from employee-sector-access) is actually embedded into
 * both SQL paths (mesReferencia and rolling-window) with correct bindings.
 */

const EMPRESA_ID = 5;

function createDb() {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];

  vi.spyOn(parameterGovernanceModule, 'resolveFrmsOperationalContext').mockResolvedValue({
    empresaId: EMPRESA_ID,
    profileCode: 'LEGACY_GENERAL',
    regulatoryProfileId: 'profile-1',
    configRevisionId: 'rev-1',
    modelVersion: 'FRMS_CONFIG_V1_TEST',
    effectiveFrom: '2000-01-01',
    effectiveTo: null,
    parameters: LIMITES_DEFAULT,
    fadigaPolicy: {} as never,
    fortnightPolicy: {} as never,
  } as never);

  const db = {
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => {
        calls.push({ sql, bindings });
        return {
          all: async () => ({ results: [] }),
          first: async () => null,
        };
      },
    }),
  };

  return { db: db as unknown as D1Database, calls };
}

describe('buscarAcumuloFrota — sector/self scoping (P1-FRMS-003)', () => {
  it('embeds a self-scope clause and binding in the rolling-window (no mesReferencia) query', async () => {
    const { db, calls } = createDb();
    const selfAccess: EmployeeSectorAccess = { mode: 'self', setorIds: [], funcionarioId: 42 };
    const scope = buildFuncionarioScopeWhere(selfAccess, 'p');

    await buscarAcumuloFrota(db, undefined, EMPRESA_ID, 30, undefined, scope);

    const rollingCall = calls.find((c) => c.sql.includes('FROM frms_acumulo_rolling ar'));
    expect(rollingCall).toBeDefined();
    expect(rollingCall!.sql).toContain('p.id = ?');
    expect(rollingCall!.bindings).toContain(42);
  });

  it('embeds a setor-restricted clause and bindings in the rolling-window query', async () => {
    const { db, calls } = createDb();
    const managerAccess: EmployeeSectorAccess = { mode: 'restricted', setorIds: [1], funcionarioId: null };
    const scope = buildFuncionarioScopeWhere(managerAccess, 'p');

    await buscarAcumuloFrota(db, undefined, EMPRESA_ID, 30, undefined, scope);

    const rollingCall = calls.find((c) => c.sql.includes('FROM frms_acumulo_rolling ar'));
    expect(rollingCall).toBeDefined();
    expect(rollingCall!.sql).toContain('p.setor_id IN (?)');
    expect(rollingCall!.bindings).toContain(1);
    // setor2 must never be part of the bindings for a manager restricted to setor1
    expect(rollingCall!.bindings).not.toContain(2);
  });

  it('embeds a fail-closed "1 = 0" clause when a manager has no assigned setores', async () => {
    const { db, calls } = createDb();
    const emptyAccess: EmployeeSectorAccess = { mode: 'restricted', setorIds: [], funcionarioId: null };
    const scope = buildFuncionarioScopeWhere(emptyAccess, 'p');

    await buscarAcumuloFrota(db, undefined, EMPRESA_ID, 30, undefined, scope);

    const rollingCall = calls.find((c) => c.sql.includes('FROM frms_acumulo_rolling ar'));
    expect(rollingCall).toBeDefined();
    expect(rollingCall!.sql).toContain('1 = 0');
  });

  it('embeds "1 = 1" (no extra restriction) for admin ("all") scope, keeping tenant filter intact', async () => {
    const { db, calls } = createDb();
    const adminAccess: EmployeeSectorAccess = { mode: 'all', setorIds: [], funcionarioId: null };
    const scope = buildFuncionarioScopeWhere(adminAccess, 'p');

    await buscarAcumuloFrota(db, undefined, EMPRESA_ID, 30, undefined, scope);

    const rollingCall = calls.find((c) => c.sql.includes('FROM frms_acumulo_rolling ar'));
    expect(rollingCall).toBeDefined();
    expect(rollingCall!.sql).toContain('1 = 1');
    // Tenant isolation (empresa_id) must still be present and bound.
    expect(rollingCall!.sql).toContain('p.empresa_id = ?');
    expect(rollingCall!.bindings).toContain(EMPRESA_ID);
  });

  it('embeds the setor-restricted clause in the mesReferencia (monthly) query path too', async () => {
    const { db, calls } = createDb();
    const managerAccess: EmployeeSectorAccess = { mode: 'restricted', setorIds: [1], funcionarioId: null };
    const scope = buildFuncionarioScopeWhere(managerAccess, 'p');

    await buscarAcumuloFrota(db, '2026-08', EMPRESA_ID, 30, undefined, scope);

    const monthlyCall = calls.find((c) => c.sql.includes('SELECT DISTINCT tripulante_id'));
    expect(monthlyCall).toBeDefined();
    expect(monthlyCall!.sql).toContain('p.setor_id IN (?)');
    expect(monthlyCall!.bindings).toContain(1);
  });

  it('defaults to "1 = 1" (no restriction) when no sectorScope is passed, preserving legacy callers', async () => {
    const { db, calls } = createDb();

    await buscarAcumuloFrota(db, undefined, EMPRESA_ID, 30);

    const rollingCall = calls.find((c) => c.sql.includes('FROM frms_acumulo_rolling ar'));
    expect(rollingCall).toBeDefined();
    expect(rollingCall!.sql).toContain('1 = 1');
  });
});
