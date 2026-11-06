/**
 * Atomic identity linkage for a single-tenant administrator account.
 * Requires a missing link, same-email active employee, no conflicting user,
 * and exactly one tenant membership, checked inside the UPDATE statement.
 */
export const LINK_USER_EMPLOYEE_CAS_SQL = `
UPDATE usuarios
   SET funcionario_id = ?, updated_at = datetime('now')
 WHERE id = ?
   AND funcionario_id IS NULL
   AND active = 1
   AND deleted_at IS NULL
   AND UPPER(TRIM(COALESCE(perfil, ''))) IN ('ADMIN', 'ADMINISTRADOR')
   AND (SELECT COUNT(*) FROM usuarios_empresas ue
         WHERE ue.usuario_id = usuarios.id) = 1
   AND EXISTS (
     SELECT 1 FROM usuarios_empresas ue
      WHERE ue.usuario_id = usuarios.id
        AND ue.empresa_id = ?
        AND UPPER(TRIM(ue.role)) IN ('ADMIN', 'ADMINISTRADOR')
   )
   AND (
     SELECT COUNT(*) FROM usuarios_empresas_perfis p
      WHERE p.usuario_id = usuarios.id AND p.empresa_id = ? AND p.ativo = 1
   ) = 1
   AND EXISTS (
     SELECT 1 FROM usuarios_empresas_perfis p
      WHERE p.usuario_id = usuarios.id AND p.empresa_id = ? AND p.ativo = 1
        AND UPPER(TRIM(p.perfil)) IN ('ADMIN', 'ADMINISTRADOR')
   )
   AND EXISTS (
     SELECT 1 FROM funcionarios f
      WHERE f.id = ?
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND f.ativo = 1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        AND LOWER(TRIM(COALESCE(f.email, ''))) =
            LOWER(TRIM(COALESCE(usuarios.email, '')))
        AND TRIM(COALESCE(f.email, '')) <> ''
   )
   AND NOT EXISTS (
     SELECT 1 FROM usuarios other
      WHERE other.id <> usuarios.id
        AND other.funcionario_id = ?
        AND other.deleted_at IS NULL
   )
`;

/** Read-only guard uses exactly the same WHERE predicate as the atomic update. */
export const LINK_USER_EMPLOYEE_ELIGIBLE_SQL =
  LINK_USER_EMPLOYEE_CAS_SQL.replace(
    /^\s*UPDATE usuarios\s+SET funcionario_id = \?, updated_at = datetime\('now'\)\s+WHERE\s+/i,
    'SELECT COUNT(*) AS n FROM usuarios WHERE ',
  );

export async function eligibleAtomicUserEmployeeLink(
  db: D1Database,
  input: Pick<LinkIdentityInput, 'empresaId' | 'userId' | 'employeeId'>,
): Promise<boolean> {
  const { empresaId, userId, employeeId } = input;
  const query = await db.prepare(LINK_USER_EMPLOYEE_ELIGIBLE_SQL)
    .bind(userId, empresaId, empresaId, empresaId, employeeId, empresaId, employeeId)
    .first<{ n: number }>();
  return Number(query?.n ?? 0) === 1;
}

export const LINK_USER_EMPLOYEE_AUDIT_SQL = `
INSERT INTO audit_logs
  (empresa_id, usuario_id, acao, tabela, registro_id, detalhes, created_at)
SELECT ?, ?, 'ADMIN_USER_EMPLOYEE_LINK_CAS', 'usuarios', CAST(? AS TEXT), ?,
       datetime('now')
WHERE changes() = 1
`;

export type LinkIdentityInput = {
  empresaId: number;
  actorId: number;
  userId: number;
  employeeId: number;
};

export function linkIdentityStatements(db: D1Database, input: LinkIdentityInput):
  D1PreparedStatement[] {
  const { empresaId, actorId, userId, employeeId } = input;
  return [
    db.prepare(LINK_USER_EMPLOYEE_CAS_SQL)
      .bind(employeeId, userId, empresaId, empresaId, empresaId, employeeId, empresaId, employeeId),
    db.prepare(LINK_USER_EMPLOYEE_AUDIT_SQL)
      .bind(empresaId, actorId, userId,
        JSON.stringify({ action: 'LINK_EMPLOYEE_TO_ADMIN_USER', empresa_id: empresaId,
          user_id: userId, employee_id: employeeId, expected_previous_link: null })),
  ];
}

export async function applyAtomicUserEmployeeLink(
  db: D1Database,
  input: LinkIdentityInput,
): Promise<'linked' | 'conflict'> {
  const [updated, audit] = await db.batch(linkIdentityStatements(db, input));
  const updatedRows = Number(updated?.meta?.changes ?? 0);
  const auditRows = Number(audit?.meta?.changes ?? 0);
  if (updatedRows === 0 && auditRows === 0) return 'conflict';
  if (updatedRows !== 1 || auditRows !== 1) {
    throw new Error('ADMIN_EMPLOYEE_LINK_AUDIT_INCONSISTENT');
  }
  return 'linked';
}
