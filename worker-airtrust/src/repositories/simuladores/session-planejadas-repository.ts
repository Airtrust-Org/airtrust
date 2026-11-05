import {
  PLANNED_QUALIFICATION_STATUS_VALUES,
  QUALIFICACAO_STATUS,
  sqlStatusEqualsAny,
} from '../../lib/status/status-codes';

/**
 * Consultas da criação tardia de qualificações PLANEJADAS de uma sessão de simulador.
 * Movido de routes/simuladores-sessoes-update.ts sem alterar o SQL.
 */

type Id = string | number;

/** A sessão já tem ao menos uma qualificação PLANEJADA viva? */
export async function hasQualificacoesPlanejadas(db: D1Database, sessaoId: Id): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM qualificacoes_historico
       WHERE sessao_id=?
         AND ${sqlStatusEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.PLANEJADA)}
         AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(sessaoId)
    .first();
  return !!row;
}

/**
 * Modelo de sessão candidato (mesmo tipo e aeronave, do tenant). Com `somenteGeraQualificacao`
 * só os que geram qualificação; em ambos os casos o nome igual ao do tema vem primeiro,
 * depois o de maior id.
 */
export async function findModeloFallback(
  db: D1Database,
  params: {
    empresaId: number;
    tipoSessao: string;
    modeloAeronave: string;
    upperNome: string;
    somenteGeraQualificacao: boolean;
  },
): Promise<{ id: number; nome: string } | null> {
  const { empresaId, tipoSessao, modeloAeronave, upperNome, somenteGeraQualificacao } = params;
  return db
    .prepare(
      `SELECT ms.id, ms.nome
           FROM modelos_sessao ms
           INNER JOIN tipos_sessao ts
             ON ms.tipo_sessao_id = ts.id
            AND ts.empresa_id = ?
            AND ts.deleted_at IS NULL
           WHERE ts.codigo = ?
             AND ms.modelo_aeronave = ?
             AND ms.deleted_at IS NULL
             AND ms.empresa_id = ?${somenteGeraQualificacao ? '\n             AND ms.gera_qualificacao = 1' : ''}
           ORDER BY CASE WHEN UPPER(ms.nome) = ? THEN 0 ELSE 1 END, ms.id DESC
           LIMIT 1`,
    )
    .bind(empresaId, tipoSessao, modeloAeronave, empresaId, upperNome)
    .first<{ id: number; nome: string }>();
}
