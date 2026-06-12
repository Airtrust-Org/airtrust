import { describe, expect, it } from 'vitest';
import {
  appendEmployeeSectorFilter,
  employeeSectorSql,
  resolveEmployeeSectorAccess,
} from '../../services/employee-sector-access';

function createDb(options: { hasUsuarioId?: boolean; setorIds?: number[] } = {}) {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          calls.push({ sql, bindings });
          return {
            all: async () => {
              if (sql.includes("pragma_table_info('setores_gestores')")) {
                return {
                  results: options.hasUsuarioId === false ? [] : [{ name: 'usuario_id' }],
                };
              }
              return {
                results: (options.setorIds || []).map((setor_id) => ({ setor_id })),
              };
            },
          };
        },
        all: async () => {
          calls.push({ sql, bindings: [] });
          return {
            results: options.hasUsuarioId === false ? [] : [{ name: 'usuario_id' }],
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, calls };
}

describe('employee sector access', () => {
  it('keeps administrators and common users on their current global behavior', async () => {
    const { db, calls } = createDb();

    await expect(resolveEmployeeSectorAccess(db, 6, 10, 'ADMINISTRADOR')).resolves.toEqual({
      mode: 'all',
      setorIds: [],
    });
    await expect(resolveEmployeeSectorAccess(db, 6, 11, 'ALUNO')).resolves.toEqual({
      mode: 'all',
      setorIds: [],
    });
    expect(calls).toHaveLength(0);
  });

  it('returns every active sector assigned to the authenticated manager', async () => {
    const { db, calls } = createDb({ setorIds: [10, 12] });

    await expect(resolveEmployeeSectorAccess(db, 6, 42, 'GESTOR')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [10, 12],
    });

    const assignmentQuery = calls.find((call) => call.sql.includes('FROM setores_gestores sg'));
    expect(assignmentQuery?.bindings).toEqual([6, 42]);
    expect(assignmentQuery?.sql).toContain('sg.usuario_id = ?');
    expect(assignmentQuery?.sql).toContain('sg.empresa_id = ?');
  });

  it('fails closed for managers without assignments or before the identity migration', async () => {
    const withoutAssignments = createDb({ setorIds: [] });
    const withoutColumn = createDb({ hasUsuarioId: false });

    await expect(
      resolveEmployeeSectorAccess(withoutAssignments.db, 6, 42, 'manager'),
    ).resolves.toEqual({
      mode: 'restricted',
      setorIds: [],
    });
    await expect(resolveEmployeeSectorAccess(withoutColumn.db, 6, 42, 'manager')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [],
    });
  });

  it('builds parameterized SQL and a deny-all predicate for empty manager scope', () => {
    expect(
      employeeSectorSql({ mode: 'restricted', setorIds: [10, 12] }, 'f'),
    ).toEqual({
      clause: 'f.setor_id IN (?, ?)',
      bindings: [10, 12],
    });

    const conditions: string[] = [];
    const bindings: unknown[] = [];
    appendEmployeeSectorFilter(
      conditions,
      bindings,
      { mode: 'restricted', setorIds: [] },
      'funcionario',
    );
    expect(conditions).toEqual(['1 = 0']);
    expect(bindings).toEqual([]);
  });
});
