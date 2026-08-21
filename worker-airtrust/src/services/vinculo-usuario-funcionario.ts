/**
 * Vínculo automático entre `usuarios` (contas de acesso, ex.: gestores) e
 * `funcionarios` (colaboradores) por e-mail.
 *
 * O elo canônico entre as duas entidades é `usuarios.funcionario_id`. O cadastro
 * manual de um lado (ex.: registrar um gestor como funcionário da manutenção)
 * deve reconhecer automaticamente a mesma pessoa do outro lado quando o e-mail
 * for idêntico — sem exigir que o operador vincule manualmente.
 */

export type VinculoUsuarioFuncionario = {
  usuario_id: number;
  funcionario_id: number;
};

function normalizarEmail(email: string | null | undefined): string {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/**
 * Vincula um usuário existente (ex.: gestor) ao funcionário recém-criado,
 * desde que o e-mail seja o mesmo (case-insensitive), o usuário pertença à
 * mesma empresa e ainda não esteja vinculado a nenhum funcionário.
 *
 * Retorna o vínculo criado ou `null` quando não há usuário correspondente.
 */
export async function vincularUsuarioAoFuncionarioPorEmail(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  email: string | null | undefined,
): Promise<VinculoUsuarioFuncionario | null> {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado) return null;

  const usuario = await db
    .prepare(
      `SELECT u.id
         FROM usuarios u
         INNER JOIN usuarios_empresas ue
           ON ue.usuario_id = u.id
          AND ue.empresa_id = ?
        WHERE LOWER(TRIM(u.email)) = ?
          AND u.deleted_at IS NULL
          AND u.funcionario_id IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, emailNormalizado)
    .first<{ id: number }>();

  if (!usuario?.id) return null;

  await db
    .prepare(
      `UPDATE usuarios
          SET funcionario_id = ?, updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(funcionarioId, usuario.id)
    .run();

  return { usuario_id: Number(usuario.id), funcionario_id: funcionarioId };
}

/**
 * Vincula um funcionário existente ao usuário recém-criado (ex.: gestor),
 * desde que o e-mail seja o mesmo e o funcionário ainda não esteja vinculado
 * a nenhum usuário ativo.
 *
 * Retorna o vínculo criado ou `null` quando não há funcionário correspondente.
 */
export async function vincularFuncionarioAoUsuarioPorEmail(
  db: D1Database,
  empresaId: number,
  usuarioId: number,
  email: string | null | undefined,
): Promise<VinculoUsuarioFuncionario | null> {
  const emailNormalizado = normalizarEmail(email);
  if (!emailNormalizado) return null;

  const funcionario = await db
    .prepare(
      `SELECT f.id
         FROM funcionarios f
        WHERE f.empresa_id = ?
          AND LOWER(TRIM(f.email)) = ?
          AND f.deleted_at IS NULL
          AND f.ativo = 1
          AND NOT EXISTS (
                SELECT 1
                  FROM usuarios u
                 WHERE u.funcionario_id = f.id
                   AND u.deleted_at IS NULL
              )
        LIMIT 1`,
    )
    .bind(empresaId, emailNormalizado)
    .first<{ id: number }>();

  if (!funcionario?.id) return null;

  await db
    .prepare(
      `UPDATE usuarios
          SET funcionario_id = ?, updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(Number(funcionario.id), usuarioId)
    .run();

  return { usuario_id: usuarioId, funcionario_id: Number(funcionario.id) };
}
