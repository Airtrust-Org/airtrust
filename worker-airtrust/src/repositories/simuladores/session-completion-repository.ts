/**
 * SIMULADORES — acesso a dados da cauda do PUT /sessoes/:id (conclusão da sessão).
 *
 * Só SQL: nenhuma regra de negócio aqui (ver services/simuladores/session-completion).
 */

/** Ids das fichas vivas da sessão que aguardam a avaliação do instrutor. */
export async function listFichaIdsAvaliacaoPendente(
  db: D1Database,
  sessaoId: string,
): Promise<number[]> {
  const rows = await db
    .prepare(
      `SELECT id FROM fichas_sessao
           WHERE agendamento_slot_id = ?
             AND status = 'AVALIACAO_PENDENTE'
             AND deleted_at IS NULL`,
    )
    .bind(sessaoId)
    .all<{ id: number }>();
  return (rows.results || []).map((r) => Number(r.id));
}
