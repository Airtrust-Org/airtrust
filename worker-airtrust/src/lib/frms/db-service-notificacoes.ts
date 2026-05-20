/**
 * FRMS — Notificações por cargo (D1)
 */

import { generateId, now } from './db-service-shared';

export interface NotificacaoDestinatario {
  id: string;
  alerta_id: string;
  funcionario_id: number;
  cargo: string;
  lido: number;
  lido_em: string | null;
  created_at: string;
}

export async function buscarNotificacoes(
  db: D1Database,
  funcionarioId: string,
  filtro: { lido?: boolean; page?: number; limit?: number },
): Promise<{
  notificacoes: Array<NotificacaoDestinatario & { mensagem: string; nivel: string }>;
  total: number;
}> {
  const conditions: string[] = ['nd.funcionario_id = ?', 'nd.deleted_at IS NULL'];
  const binds: (string | number)[] = [funcionarioId];

  if (filtro.lido !== undefined) {
    conditions.push('nd.lido = ?');
    binds.push(filtro.lido ? 1 : 0);
  }

  const where = conditions.join(' AND ');
  const page = filtro.page ?? 1;
  const limit = filtro.limit ?? 50;
  const offset = (page - 1) * limit;

  const countResult = await db
    .prepare(`SELECT COUNT(*) as total FROM frms_notificacao_destinatario nd WHERE ${where}`)
    .bind(...binds)
    .first<{ total: number }>();

  const rows = await db
    .prepare(
      `SELECT nd.*, a.mensagem, a.nivel
       FROM frms_notificacao_destinatario nd
       JOIN frms_alerta a ON a.id = nd.alerta_id
       AND a.deleted_at IS NULL
       WHERE ${where}
       ORDER BY nd.created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, offset)
    .all();

  return {
    notificacoes: (rows.results || []) as unknown as Array<
      NotificacaoDestinatario & { mensagem: string; nivel: string }
    >,
    total: countResult?.total ?? 0,
  };
}

export async function marcarNotificacaoLida(
  db: D1Database,
  id: string,
  funcionarioId: string,
): Promise<void> {
  const timestamp = now();
  await db
    .prepare(
      'UPDATE frms_notificacao_destinatario SET lido = 1, lido_em = ? WHERE id = ? AND funcionario_id = ? AND deleted_at IS NULL',
    )
    .bind(timestamp, id, funcionarioId)
    .run();
}

export async function marcarTodasNotificacoesLidas(
  db: D1Database,
  funcionarioId: string,
): Promise<void> {
  const timestamp = now();
  await db
    .prepare(
      'UPDATE frms_notificacao_destinatario SET lido = 1, lido_em = ? WHERE funcionario_id = ? AND lido = 0 AND deleted_at IS NULL',
    )
    .bind(timestamp, funcionarioId)
    .run();
}

/**
 * Despacha notificações para destinatários baseado no cargo configurado.
 * Chamado automaticamente após persistir alertas.
 * Versão sem N+1: busca todos os funcionários de uma vez usando IN clause.
 */
export async function despacharNotificacoes(
  db: D1Database,
  alertaId: string,
  nivelAlerta: string,
  tripulanteId: number,
): Promise<void> {
  try {
    // Buscar configs de notificação ativas
    const configs = await db
      .prepare('SELECT * FROM frms_notificacao_config WHERE ativo = 1')
      .all<{ cargo: string; nivel_minimo: string }>();

    const nivelOrd: Record<string, number> = { AVISO: 1, ATENCAO: 2, CRITICO: 3, VIOLACAO: 4 };
    const nivelNum = nivelOrd[nivelAlerta] ?? 0;

    // Filtrar cargos elegíveis
    const cargosElegiveis = (configs.results || [])
      .filter((cfg) => nivelNum >= (nivelOrd[cfg.nivel_minimo] ?? 0))
      .map((cfg) => cfg.cargo);

    if (cargosElegiveis.length === 0) return;

    // Buscar todos os funcionários dos cargos elegíveis em uma única query (IN clause)
    const placeholders = cargosElegiveis.map(() => '?').join(', ');
    const funcionarios = await db
      .prepare(
        `SELECT id, cargo FROM funcionarios WHERE cargo IN (${placeholders}) AND (ativo = 1 OR status = 'ATIVO') AND deleted_at IS NULL`,
      )
      .bind(...cargosElegiveis)
      .all<{ id: number; cargo: string }>();

    // Montar set de destinatários únicos (cargo PILOTO inclui o próprio tripulante)
    const destinatarios: Array<{ id: number; cargo: string }> = [...(funcionarios.results || [])];
    if (cargosElegiveis.includes('PILOTO')) {
      const jaIncluso = destinatarios.some((d) => d.id === tripulanteId);
      if (!jaIncluso) destinatarios.push({ id: tripulanteId, cargo: 'PILOTO' });
    }

    if (destinatarios.length === 0) return;

    // Batch INSERT todas as notificações de uma vez
    const stmtNotif = db.prepare(
      "INSERT INTO frms_notificacao_destinatario (id, alerta_id, funcionario_id, cargo, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
    );
    await db.batch(
      destinatarios.map(({ id, cargo }) => stmtNotif.bind(generateId(), alertaId, id, cargo)),
    );
  } catch (e) {
    console.warn('[FRMS][NOTIFICACAO] falha ao despachar:', (e as Error).message);
  }
}
