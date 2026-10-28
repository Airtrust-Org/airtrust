/**
 * Fonte canônica da identidade de funcionário no LMS.
 * O JWT pode ter sido emitido antes da vinculação/desvinculação cadastral.
 * Nunca usar funcionario_id do token como fallback: isso permitiria que um
 * vínculo revogado continuasse acessando matrículas até a expiração do JWT.
 */
export async function resolveLmsFuncionarioId(
  db: D1Database,
  userIdInput: unknown,
  empresaIdInput: unknown,
): Promise<number | null> {
  const userId = Number(userIdInput);
  const empresaId = Number(empresaIdInput);
  if (!Number.isSafeInteger(userId) || userId <= 0 ||
      !Number.isSafeInteger(empresaId) || empresaId <= 0) return null;

  const row = await db.prepare(`
    SELECT f.id AS funcionario_id
      FROM usuarios u
      JOIN funcionarios f
        ON f.id = u.funcionario_id
       AND f.empresa_id = ?
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
     WHERE u.id = ? AND u.deleted_at IS NULL
     LIMIT 1
  `).bind(empresaId, userId).first<{ funcionario_id: number }>();

  const funcionarioId = Number(row?.funcionario_id);
  return Number.isSafeInteger(funcionarioId) && funcionarioId > 0 ? funcionarioId : null;
}
