import {
  buildFuncionarioScopeWhere,
  isAdminRole,
  isInstructorRole,
  resolveEmployeeSectorAccess,
} from '../../lib/rbac/employee-sector-access';

export type SimuladorReaderIdentity = {
  empresaId: number;
  userId: number;
  userRole: unknown;
  /** funcionario vinculado ao usuario autenticado, quando houver. */
  funcionarioId: number | null;
};

/**
 * Quem pode ler dados individuais de simulador (historico de notas, dashboard
 * de manobras) de um funcionario (P07-02):
 * - admin, compliance e instrutor: qualquer funcionario do proprio tenant (instrutor conduz
 *   sessoes de alunos de varios setores);
 * - gestor: funcionarios dos setores que gere;
 * - demais papeis (aluno/usuario): somente o proprio registro.
 * O chamador continua responsavel pelo filtro de tenant na consulta de dados.
 * Falha fechada: alvo invalido, usuario sem vinculo ou gestor sem setor => false.
 */
export async function canReadFuncionarioSimuladorData(
  db: D1Database,
  reader: SimuladorReaderIdentity,
  targetFuncionarioId: number,
): Promise<boolean> {
  if (!Number.isInteger(targetFuncionarioId) || targetFuncionarioId <= 0) return false;
  if (
    isAdminRole(reader.userRole) ||
    isInstructorRole(reader.userRole) ||
    String(reader.userRole || '').trim().toLowerCase() === 'compliance'
  ) {
    return true;
  }
  if (reader.funcionarioId && reader.funcionarioId === targetFuncionarioId) return true;

  const access = await resolveEmployeeSectorAccess(
    db,
    reader.empresaId,
    reader.userId,
    reader.userRole,
    { funcionarioId: reader.funcionarioId },
  );
  if (access.mode === 'all') return true;
  if (access.mode === 'self') return access.funcionarioId === targetFuncionarioId;
  if (access.setorIds.length === 0) return false;

  const scope = buildFuncionarioScopeWhere(access, 'f');
  const row = await db
    .prepare(
      `SELECT f.id
         FROM funcionarios f
        WHERE f.id = ?
          AND f.empresa_id = ?
          AND f.deleted_at IS NULL
          AND ${scope.clause}
        LIMIT 1`,
    )
    .bind(targetFuncionarioId, reader.empresaId, ...scope.bindings)
    .first<{ id: number }>();
  return Boolean(row?.id);
}
