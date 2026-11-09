/**
 * N-03: `usuarios.last_login` nunca era escrito (0 de 155 usuarios em producao),
 * entao nao havia trilha de ultimo acesso. Grava em melhor esforco depois que o
 * login ja foi autenticado e a sessao persistida: uma falha aqui (coluna ausente
 * em ambientes com schema divergente, indisponibilidade momentanea do D1) nunca
 * pode impedir o acesso do usuario.
 */
export async function recordSuccessfulLogin(
  db: D1Database,
  userId: number,
  onError?: (error: unknown) => void,
): Promise<boolean> {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  try {
    const result = await db
      .prepare(`UPDATE usuarios SET last_login = datetime('now') WHERE id = ? AND deleted_at IS NULL`)
      .bind(userId)
      .run();
    return Number(result.meta?.changes ?? 0) === 1;
  } catch (error) {
    onError?.(error);
    return false;
  }
}
