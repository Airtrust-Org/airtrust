import type { Context } from 'hono';

export type EmployeeSectorAccess =
  | { mode: 'all'; setorIds: [] }
  | { mode: 'restricted'; setorIds: number[] };

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

export async function resolveEmployeeSectorAccess(
  db: D1Database,
  empresaId: number,
  userId: number,
  userRole: unknown,
): Promise<EmployeeSectorAccess> {
  if (isAdminRole(userRole) || !isManagerRole(userRole)) {
    return { mode: 'all', setorIds: [] };
  }

  const columns = await db
    .prepare("SELECT name FROM pragma_table_info('setores_gestores')")
    .all<{ name: string }>();
  const hasUsuarioId = (columns.results || []).some((column) => column.name === 'usuario_id');

  if (!hasUsuarioId) {
    return { mode: 'restricted', setorIds: [] };
  }

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

  return {
    mode: 'restricted',
    setorIds: (rows.results || [])
      .map((row) => Number(row.setor_id))
      .filter((id) => Number.isInteger(id) && id > 0),
  };
}

export async function getEmployeeSectorAccess(
  c: Context<any>,
  empresaId: number,
): Promise<EmployeeSectorAccess> {
  const getContextValue = c.get as (key: string) => unknown;
  const userId = Number(getContextValue('userId') || 0);
  const userRole = getContextValue('userRole');
  return resolveEmployeeSectorAccess(c.env.DB, empresaId, userId, userRole);
}

export function appendEmployeeSectorFilter(
  conditions: string[],
  bindings: unknown[],
  access: EmployeeSectorAccess,
  funcionarioAlias = 'f',
): void {
  if (access.mode === 'all') return;
  if (access.setorIds.length === 0) {
    conditions.push('1 = 0');
    return;
  }

  conditions.push(`${funcionarioAlias}.setor_id IN (${access.setorIds.map(() => '?').join(', ')})`);
  bindings.push(...access.setorIds);
}

export function employeeSectorSql(
  access: EmployeeSectorAccess,
  funcionarioAlias = 'f',
): { clause: string; bindings: number[] } {
  if (access.mode === 'all') return { clause: '1 = 1', bindings: [] };
  if (access.setorIds.length === 0) return { clause: '1 = 0', bindings: [] };
  return {
    clause: `${funcionarioAlias}.setor_id IN (${access.setorIds.map(() => '?').join(', ')})`,
    bindings: access.setorIds,
  };
}
