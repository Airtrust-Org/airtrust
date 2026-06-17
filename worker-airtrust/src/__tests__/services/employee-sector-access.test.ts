import { describe, expect, it } from 'vitest';
import {
  appendEmployeeSectorFilter,
  buildFuncionarioScopeWhere,
  employeeSectorSql,
  filterRequestedSetorIdsByAccess,
  resolveEmployeeSectorAccess,
} from '../../services/employee-sector-access';

function createDb(
  options: {
    hasUsuarioId?: boolean;
    hasGestorId?: boolean;
    setorIds?: number[];
    gestorFallbackSetorIds?: number[];
    ownFuncionario?: { id: number; setor_id: number | null } | null;
  } = {},
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
                const cols: Array<{ name: string }> = [];
                if (options.hasUsuarioId !== false) cols.push({ name: 'usuario_id' });
                if (options.hasGestorId === true) cols.push({ name: 'gestor_id' });
                return { results: cols };
              }
              // Fallback gestor_id path returns different setor IDs
              if (sql.includes('FROM setores_gestores sg') && sql.includes('INNER JOIN notificacoes_convocacao_cc_gestores')) {
                return {
                  results: (options.gestorFallbackSetorIds || []).map((setor_id) => ({ setor_id })),
                };
              }
              // Regular usuario_id path
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
          const cols: Array<{ name: string }> = [];
          if (options.hasUsuarioId !== false) cols.push({ name: 'usuario_id' });
          if (options.hasGestorId === true) cols.push({ name: 'gestor_id' });
          return { results: cols };
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

  // ── Gestor_id fallback tests ──────────────────────────────────────────

  it('uses gestor_id fallback when usuario_id column does not exist', async () => {
    const { db, calls } = createDb({
      hasUsuarioId: false,
      hasGestorId: true,
      gestorFallbackSetorIds: [5, 8],
    });

    await expect(resolveEmployeeSectorAccess(db, 6, 42, 'GESTOR')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [5, 8],
      funcionarioId: null,
    });

    const fallbackQuery = calls.find(
      (call) =>
        call.sql.includes('FROM setores_gestores sg') &&
        call.sql.includes('INNER JOIN notificacoes_convocacao_cc_gestores'),
    );
    expect(fallbackQuery).toBeDefined();
    expect(fallbackQuery?.bindings).toContain(42); // userId for email match
    expect(fallbackQuery?.bindings).toContain(6); // empresaId
  });

  it('uses gestor_id fallback when usuario_id exists but returns empty results', async () => {
    const { db, calls } = createDb({
      hasUsuarioId: true,
      hasGestorId: true,
      setorIds: [], // empty from usuario_id path
      gestorFallbackSetorIds: [3, 7],
    });

    await expect(resolveEmployeeSectorAccess(db, 6, 42, 'manager')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [3, 7],
      funcionarioId: null,
    });

    const fallbackQuery = calls.find(
      (call) =>
        call.sql.includes('FROM setores_gestores sg') &&
        call.sql.includes('INNER JOIN notificacoes_convocacao_cc_gestores'),
    );
    expect(fallbackQuery).toBeDefined();
  });

  it('does not use gestor_id fallback when usuario_id already returns results', async () => {
    const { db, calls } = createDb({
      hasUsuarioId: true,
      hasGestorId: true,
      setorIds: [10, 20],
      gestorFallbackSetorIds: [99], // should be ignored
    });

    await expect(resolveEmployeeSectorAccess(db, 6, 42, 'GESTOR')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [10, 20],
      funcionarioId: null,
    });

    // gestor_id fallback query should NOT have been executed
    const fallbackQuery = calls.find(
      (call) =>
        call.sql.includes('FROM setores_gestores sg') &&
        call.sql.includes('INNER JOIN notificacoes_convocacao_cc_gestores'),
    );
    expect(fallbackQuery).toBeUndefined();
  });

  it('fails closed when neither usuario_id nor gestor_id column exists', async () => {
    const { db } = createDb({
      hasUsuarioId: false,
      hasGestorId: false,
    });

    await expect(resolveEmployeeSectorAccess(db, 6, 42, 'GESTOR')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [],
      funcionarioId: null,
    });
  });

  it('returns empty scope when both paths return no results', async () => {
    const { db } = createDb({
      hasUsuarioId: true,
      hasGestorId: true,
      setorIds: [],
      gestorFallbackSetorIds: [],
    });

    await expect(resolveEmployeeSectorAccess(db, 6, 42, 'COORDENADOR')).resolves.toEqual({
      mode: 'restricted',
      setorIds: [],
      funcionarioId: null,
    });
  });
});
