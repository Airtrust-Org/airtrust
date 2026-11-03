/**
 * Acesso a dados de escalas_mensais / escala_eventos usado pelos helpers
 * compartilhados de Escalas. Movido de routes/escalas-shared.ts sem mudar o SQL.
 */

export interface ManualEventoRange {
  data_inicio: string;
  data_fim: string;
}

export interface EventoBaseRow {
  id: string;
  escala_id: string;
  tripulacao_id: string;
  funcionario_id: string;
  tipo_evento: 'voo' | 'folga';
  data: string;
  local: string | null;
  aeronave: string | null;
  motivo: string;
  created_by: string;
  now: string;
}

/** Escala do tenant (não apagada), ou null. */
export async function findEscalaDoTenant<T = Record<string, unknown>>(
  db: D1Database,
  id: string,
  empresaId: number,
): Promise<T | null> {
  return db
    .prepare(`SELECT * FROM escalas_mensais WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`)
    .bind(id, empresaId)
    .first<T>();
}

/**
 * Intervalos de eventos manuais (não automáticos) de um funcionário numa escala.
 * Com empresaId informado, só vale se a escala pertencer ao tenant.
 */
export async function listManualEventoRanges(
  db: D1Database,
  escalaId: string,
  funcionarioId: string,
  empresaId: string | number | null | undefined,
): Promise<ManualEventoRange[]> {
  const rows = await db
    .prepare(
      `SELECT data_inicio, data_fim FROM escala_eventos
       WHERE escala_id = ? AND funcionario_id = ?
         AND gerado_automaticamente = 0 AND deleted_at IS NULL
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM escalas_mensais em
            WHERE em.id = escala_eventos.escala_id AND em.empresa_id = ? AND em.deleted_at IS NULL
         ))`,
    )
    .bind(escalaId, funcionarioId, empresaId ?? null, empresaId ?? null)
    .all<ManualEventoRange>();
  return rows.results || [];
}

/** Insere os eventos automáticos (VOO/FOL) em um único batch. */
export async function insertEventosBase(db: D1Database, eventos: EventoBaseRow[]): Promise<number> {
  const stmts: D1PreparedStatement[] = eventos.map((e) =>
    db
      .prepare(
        `INSERT INTO escala_eventos
         (id, escala_id, tripulacao_id, funcionario_id, tipo_evento, data_inicio, data_fim,
          turno, local, aeronave, gerado_automaticamente, motivo_automatico, status,
          origem, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'dia_todo', ?, ?, 1, ?, 'confirmado', 'auto_quinzena', ?, ?, ?)`,
      )
      .bind(
        e.id,
        e.escala_id,
        e.tripulacao_id,
        e.funcionario_id,
        e.tipo_evento,
        e.data,
        e.data,
        e.local,
        e.aeronave,
        e.motivo,
        e.created_by,
        e.now,
        e.now,
      ),
  );
  if (stmts.length > 0) {
    await db.batch(stmts);
  }
  return stmts.length;
}

/** Soft delete dos eventos automáticos de uma tripulação. Devolve quantos foram apagados. */
export async function softDeleteEventosAutoGerados(
  db: D1Database,
  escalaId: string,
  tripulacaoId: string,
  now: string,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE escala_eventos SET deleted_at = ?
       WHERE escala_id = ? AND tripulacao_id = ? AND gerado_automaticamente = 1 AND deleted_at IS NULL`,
    )
    .bind(now, escalaId, tripulacaoId)
    .run();
  return result.meta?.changes ?? 0;
}
