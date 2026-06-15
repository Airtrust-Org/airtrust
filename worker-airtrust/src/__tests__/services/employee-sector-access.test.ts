import { describe, expect, it } from 'vitest';
import {
  appendEmployeeSectorFilter,
  buildFuncionarioScopeWhere,
  employeeSectorSql,
  filterRequestedSetorIdsByAccess,
  resolveEmployeeSectorAccess,
} from '../../services/employee-sector-access';

function createDb(
  options: { hasUsuarioId?: boolean; setorIds?: number[]; ownFuncionario?: { id: number; setor_id: number | null } | null } = {},
) {
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
            first: async () => {
              if (sql.includes('FROM usuarios u') && sql.includes('INNER JOIN funcionarios f')) {
                return options.ownFuncionario || null;
              }
              if (sql.includes('FROM funcionarios') && sql.includes('WHERE id = ?')) {
                return options.ownFuncionario || null;
              }
              return null;
            },
          };
        },
        all: async () => {
          calls.push({ sql, bindings: [] });
          return {
            results: options.hasUsuarioId === false ? [] : [{ name: 'usuario_id' }],
          };
        },
        first: async () => {
          calls.push({ sql, bindings: [] });
          return null;
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
      funcionarioId: null,
    });
    await expect(
      resolveEmployeeSectorAccess(db, 6, 11, 'ALUNO', {
        funcionarioId: 91,
      }),
    ).resolves.toEqual({
      mode: 'restricted',
      setorIds: [],
      funcionarioId: null,
    });
    expect(calls).toHaveLength(2);
  });

  it('returns every active sector assigned to the authenticated manager', async () => {
    const { db, calls } = createDb({ setorIds: [10, 12] });

    await expect(resolveEmployeeSectorAccess(db, 6, 42, 'GESTOR')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [10, 12],
      funcionarioId: null,
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
      funcionarioId: null,
    });
    await expect(resolveEmployeeSectorAccess(withoutColumn.db, 6, 42, 'manager')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [],
      funcionarioId: null,
    });
  });

  it('returns self scope for instructor and regular users bound to a funcionario', async () => {
    const { db } = createDb({ ownFuncionario: { id: 77, setor_id: 5 } });

    await expect(resolveEmployeeSectorAccess(db, 6, 55, 'INSTRUTOR')).resolves.toEqual({
      mode: 'self',
      funcionarioId: 77,
      setorIds: [5],
    });
  });

  it('builds parameterized SQL and a deny-all predicate for empty manager scope', () => {
    expect(
      employeeSectorSql({ mode: 'restricted', setorIds: [10, 12], funcionarioId: null }, 'f'),
    ).toEqual({
      clause: 'f.setor_id IN (?, ?)',
      bindings: [10, 12],
    });

    expect(
      buildFuncionarioScopeWhere({ mode: 'self', funcionarioId: 77, setorIds: [5] }, 'f'),
    ).toEqual({
      clause: 'f.id = ?',
      bindings: [77],
    });

    const conditions: string[] = [];
    const bindings: unknown[] = [];
    appendEmployeeSectorFilter(
      conditions,
      bindings,
      { mode: 'restricted', setorIds: [], funcionarioId: null },
      'funcionario',
    );
    expect(conditions).toEqual(['1 = 0']);
    expect(bindings).toEqual([]);
  });

  it('filters requested sector ids against the allowed scope', () => {
    expect(
      filterRequestedSetorIdsByAccess([1, 2, 3], {
        mode: 'restricted',
        setorIds: [2, 3],
        funcionarioId: null,
      }),
    ).toEqual([2, 3]);
  });
});
