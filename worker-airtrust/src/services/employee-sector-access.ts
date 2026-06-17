import type { Context } from 'hono';
import { forbidden } from '../middleware/error-handler';

export type EmployeeSectorAccess =
  | { mode: 'all'; setorIds: []; funcionarioId: null }
  | { mode: 'restricted'; setorIds: number[]; funcionarioId: null }
  | { mode: 'self'; setorIds: number[]; funcionarioId: number };

type ResolveAccessOptions = {
  funcionarioId?: number | null;
};

function normalizeRole(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function isManagerRole(value: unknown): boolean {
  return ['gestor', 'manager', 'supervisor', 'coordenador', 'coordinator'].includes(
    normalizeRole(value),
  );
}

export function isAdminRole(value: unknown): boolean {
  return ['admin', 'administrador'].includes(normalizeRole(value));
}

export function isInstructorRole(value: unknown): boolean {
  return ['instrutor', 'instructor'].includes(normalizeRole(value));
}

async function tableHasColumn(
  db: D1Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const columns = await db
    .prepare(`SELECT name FROM pragma_table_info('${tableName}')`)
    .all<{ name: string }>();

  return (columns.results || []).some((column) => column.name === columnName);
}

async function resolveOwnFuncionarioScope(
  db: D1Database,
  empresaId: number,
  userId: number,
  explicitFuncionarioId?: number | null,
): Promise<EmployeeSectorAccess> {
  const funcionarioId =
    explicitFuncionarioId && Number.isInteger(explicitFuncionarioId) && explicitFuncionarioId > 0
      ? explicitFuncionarioId
      : null;

  if (funcionarioId) {
    const ownFuncionario = await db
      .prepare(
        `SELECT id, setor_id
           FROM funcionarios
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
          LIMIT 1`,
      )
      .bind(funcionarioId, empresaId)
      .first<{ id: number; setor_id: number | null }>();

    if (ownFuncionario?.id) {
      return {
        mode: 'self',
        funcionarioId: Number(ownFuncionario.id),
        setorIds: ownFuncionario.setor_id ? [Number(ownFuncionario.setor_id)] : [],
      };
    }
  }

  const ownFuncionario = await db
    .prepare(
      `SELECT f.id, f.setor_id
         FROM usuarios u
         INNER JOIN funcionarios f
           ON f.id = u.funcionario_id
          AND f.empresa_id = ?
          AND f.deleted_at IS NULL
        WHERE u.id = ?
          AND u.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, userId)
    .first<{ id: number; setor_id: number | null }>();

  if (!ownFuncionario?.id) {
    return { mode: 'restricted', funcionarioId: null, setorIds: [] };
  }

  return {
    mode: 'self',
    funcionarioId: Number(ownFuncionario.id),
    setorIds: ownFuncionario.setor_id ? [Number(ownFuncionario.setor_id)] : [],
  };
}

export async function getAllowedSetorIdsForUser(
  db: D1Database,
  empresaId: number,
  userId: number,
  userRole: unknown,
  options?: ResolveAccessOptions,
): Promise<number[]> {
  const access = await resolveEmployeeSectorAccess(db, empresaId, userId, userRole, options);
  return access.mode === 'all' ? [] : access.setorIds;
}

export async function resolveEmployeeSectorAccess(
  db: D1Database,
  empresaId: number,
  userId: number,
  userRole: unknown,
  options?: ResolveAccessOptions,
): Promise<EmployeeSectorAccess> {
  if (isAdminRole(userRole)) {
    return { mode: 'all', setorIds: [], funcionarioId: null };
  }

  if (isManagerRole(userRole)) {
    const hasUsuarioId = await tableHasColumn(db, 'setores_gestores', 'usuario_id');
    const hasGestorId = await tableHasColumn(db, 'setores_gestores', 'gestor_id');

    // If neither column exists, fail closed (empty scope)
    if (!hasUsuarioId && !hasGestorId) {
      return { mode: 'restricted', setorIds: [], funcionarioId: null };
    }

    let setorIds: number[] = [];

    // Path 1: query by usuario_id (direct user FK, modern path)
    if (hasUsuarioId) {
      const rows = await db
        .prepare(
          `SELECT DISTINCT sg.setor_id
             FROM setores_gestores sg
             INNER JOIN setores s
               ON s.id = sg.setor_id
              AND s.empresa_id = sg.empresa_id
              AND s.deleted_at IS NULL
              AND s.ativo = 1
            WHERE sg.empresa_id = ?
              AND sg.usuario_id = ?
              AND sg.deleted_at IS NULL
              AND sg.ativo = 1
            ORDER BY sg.setor_id`,
        )
        .bind(empresaId, userId)
        .all<{ setor_id: number }>();

      setorIds = (rows.results || [])
        .map((row) => Number(row.setor_id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }

    // Path 2: fallback via gestor_id → notificacoes_convocacao_cc_gestores.email → usuarios.id
    if (setorIds.length === 0 && hasGestorId) {
      const fallbackRows = await db
        .prepare(
          `SELECT DISTINCT sg.setor_id
             FROM setores_gestores sg
             INNER JOIN notificacoes_convocacao_cc_gestores g
               ON g.id = sg.gestor_id
              AND g.deleted_at IS NULL
              AND g.ativo = 1
             INNER JOIN usuarios u
               ON LOWER(TRIM(u.email)) = LOWER(TRIM(g.email))
              AND u.deleted_at IS NULL
              AND u.id = ?
             INNER JOIN setores s
               ON s.id = sg.setor_id
              AND s.empresa_id = sg.empresa_id
              AND s.deleted_at IS NULL
              AND s.ativo = 1
            WHERE sg.empresa_id = ?
              AND sg.deleted_at IS NULL
              AND sg.ativo = 1
            ORDER BY sg.setor_id`,
        )
        .bind(userId, empresaId)
        .all<{ setor_id: number }>();

      setorIds = (fallbackRows.results || [])
        .map((row) => Number(row.setor_id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }

    return {
      mode: 'restricted',
      funcionarioId: null,
      setorIds,
    };
  }

  if (isInstructorRole(userRole)) {
    return resolveOwnFuncionarioScope(db, empresaId, userId, options?.funcionarioId);
  }

  return resolveOwnFuncionarioScope(db, empresaId, userId, options?.funcionarioId);
}

export async function getEmployeeSectorAccess(
  c: Context<any>,
  empresaId: number,
): Promise<EmployeeSectorAccess> {
  const getContextValue = c.get as (key: string) => unknown;
  const userId = Number(getContextValue('userId') || 0);
  const userRole = getContextValue('userRole');
  const funcionarioId = Number(getContextValue('funcionarioId') || 0);

  return resolveEmployeeSectorAccess(c.env.DB, empresaId, userId, userRole, {
    funcionarioId: Number.isInteger(funcionarioId) && funcionarioId > 0 ? funcionarioId : null,
  });
}

export function buildFuncionarioScopeWhere(
  access: EmployeeSectorAccess,
  funcionarioAlias = 'f',
): { clause: string; bindings: number[] } {
  if (access.mode === 'all') return { clause: '1 = 1', bindings: [] };
  if (access.mode === 'self') return { clause: `${funcionarioAlias}.id = ?`, bindings: [access.funcionarioId] };
  if (access.setorIds.length === 0) return { clause: '1 = 0', bindings: [] };

  return {
    clause: `${funcionarioAlias}.setor_id IN (${access.setorIds.map(() => '?').join(', ')})`,
    bindings: access.setorIds,
  };
}

export function employeeSectorSql(
  access: EmployeeSectorAccess,
  funcionarioAlias = 'f',
): { clause: string; bindings: number[] } {
  return buildFuncionarioScopeWhere(access, funcionarioAlias);
}

export function appendEmployeeSectorFilter(
  conditions: string[],
  bindings: unknown[],
  access: EmployeeSectorAccess,
  funcionarioAlias = 'f',
): void {
  const scope = buildFuncionarioScopeWhere(access, funcionarioAlias);
  conditions.push(scope.clause);
  bindings.push(...scope.bindings);
}

export function filterRequestedSetorIdsByAccess(
  requestedSetorIds: number[],
  access: EmployeeSectorAccess,
): number[] {
  if (access.mode === 'all') {
    return [...new Set(requestedSetorIds)];
  }

  if (access.mode === 'self') {
    const allowed = new Set(access.setorIds);
    return requestedSetorIds.filter((setorId) => allowed.has(setorId));
  }

  const allowed = new Set(access.setorIds);
  return requestedSetorIds.filter((setorId) => allowed.has(setorId));
}

export async function assertFuncionarioInScope(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  access: EmployeeSectorAccess,
): Promise<void> {
  const scope = buildFuncionarioScopeWhere(access, 'funcionarios');
  const inScope = await db
    .prepare(
      `SELECT id
         FROM funcionarios
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
          AND ${scope.clause}
        LIMIT 1`,
    )
    .bind(funcionarioId, empresaId, ...scope.bindings)
    .first<{ id: number }>();

  if (!inScope?.id) {
    forbidden('Acesso negado ao funcionário solicitado', 'FUNCIONARIO_OUT_OF_SCOPE');
  }
}
