import { describe, expect, it } from 'vitest';
import {
  isBombeirosManagerTenant, loadBombeirosManagerCase,
} from '../../lib/frms/bombeiros-case-access';
import type { EmployeeSectorAccess } from '../../services/employee-sector-access';

const sectors: EmployeeSectorAccess = { mode: 'restricted', setorIds: [9, 10], funcionarioId: null };
function fakeDb(record: unknown) {
  const statements: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const call = { sql, binds: [] as unknown[] };
      statements.push(call);
      return {
        bind(...binds: unknown[]) {
          call.binds = binds;
          return { async first() { return record; } };
        },
      };
    },
  } as unknown as D1Database;
  return { db, statements };
}
describe('BOA manager case access — no Costa do Sol contamination', () => {
  it.each([
    [6, 'bombeiros', 'manager'], [6, 'costadosol', 'manager'],
    [130, 'costadosol', 'manager'], [130, 'bombeiros', 'admin'],
    [130, 'bombeiros', 'student'],
  ] as const)('denies company %i / %s / %s', (empresaId, empresaCodigo, role) => {
    expect(isBombeirosManagerTenant({ empresaId, empresaCodigo, role })).toBe(false);
  });

  it('permits only operational manager of dedicated tenant', () => {
    expect(isBombeirosManagerTenant({
      empresaId: 130, empresaCodigo: 'bombeiros', role: 'manager',
    })).toBe(true);
  });

  it('never queries empresa 6 or a scope without sector grants', async () => {
    const { db, statements } = fakeDb(null);
    const absent: EmployeeSectorAccess = {
      mode: 'restricted', setorIds: [], funcionarioId: null,
    };
    expect(await loadBombeirosManagerCase(db, 6, 'boa-alert-1', sectors)).toBeNull();
    expect(await loadBombeirosManagerCase(db, 130, 'boa-alert-1', absent)).toBeNull();
    expect(await loadBombeirosManagerCase(db, 130, 'boa-alert-1', {
      mode: 'all', setorIds: [], funcionarioId: null,
    })).toBeNull();
    expect(statements).toHaveLength(0);
  });

  it('queries by real tenant plus sector and only BOA_ prefixed events', async () => {
    const { db, statements } = fakeDb({
      id: 'boa-alert-1', resolvido: 0, notas_resolucao: null,
      created_at: '2026-10-20', resolvido_em: null,
    });
    const row = await loadBombeirosManagerCase(db, 130, 'boa-alert-1', sectors);
    expect(row?.id).toBe('boa-alert-1');
    expect(statements).toHaveLength(1);
    expect(statements[0].binds).toEqual(['boa-alert-1', 130, 9, 10]);
    expect(statements[0].sql).toContain("a.tipo_limite LIKE 'BOA_%'");
    expect(statements[0].sql).toContain('f.empresa_id = ?');
    expect(statements[0].sql).toContain('f.setor_id IN (?, ?)');
  });

  it('discards unexpected database result ID to prevent accidental leakage', async () => {
    const { db } = fakeDb({ id: 'unexpected', resolvido: 0, notas_resolucao: null });
    expect(await loadBombeirosManagerCase(db, 130, 'boa-alert-1', sectors)).toBeNull();
  });
});
