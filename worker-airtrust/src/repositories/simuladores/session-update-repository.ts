import {
  PLANNED_QUALIFICATION_STATUS_VALUES,
  QUALIFICACAO_STATUS,
  sqlStatusEqualsAny,
} from '../../lib/status/status-codes';
import { getSchemaColumns } from '../../utils/db-schema';

/**
 * Acesso a dados do UPDATE de uma sessão de simulador (horário, dispositivo, modelo) e da
 * data das qualificações planejadas ligadas a ela. Movido de
 * routes/simuladores-sessoes-update.ts sem alterar o SQL.
 */

export interface AgendamentoColumnSupport {
  hasTipoDispositivo: boolean;
  hasAeronaveId: boolean;
}

/** Colunas opcionais de simulador_agendamentos (migration 0364) presentes neste banco. */
export async function getAgendamentoColumnSupport(db: D1Database): Promise<AgendamentoColumnSupport> {
  const agendamentoColumns = await getSchemaColumns(db, 'simulador_agendamentos');
  return {
    hasTipoDispositivo: agendamentoColumns.has('tipo_dispositivo'),
    hasAeronaveId: agendamentoColumns.has('aeronave_id'),
  };
}

export async function runAgendamentoUpdate(
  db: D1Database,
  sql: string,
  binds: unknown[],
): Promise<void> {
  await db.prepare(sql).bind(...binds).run();
}

/** Acompanha a nova data nas qualificações PLANEJADAS vivas da sessão. */
export async function syncPlanejadasDataConclusao(
  db: D1Database,
  sessaoId: string | number,
  data: unknown,
): Promise<void> {
  await db
    .prepare(
      `UPDATE qualificacoes_historico
         SET data_conclusao=?, updated_at=datetime('now')
         WHERE sessao_id=?
           AND ${sqlStatusEqualsAny('status', PLANNED_QUALIFICATION_STATUS_VALUES, QUALIFICACAO_STATUS.PLANEJADA)}
           AND deleted_at IS NULL`,
    )
    .bind(data, sessaoId)
    .run();
}
