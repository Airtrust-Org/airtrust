import type { D1Database } from '@cloudflare/workers-types';

function toMinutes(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

export async function syncHorasVooFromFira(
  db: D1Database,
  importacaoId: number,
  empresaId: number,
): Promise<void> {
  const registros = await db
    .prepare(
      `SELECT fj.id, fj.tripulante_id, fj.data, fj.hora_inicio, fj.hora_fim, fj.origem, fj.destino,
              fj.aeronave, fj.funcao, fj.tempo_noturno_min
       FROM frms_jornada fj
       WHERE fj.fira_importacao_id = ?
         AND fj.empresa_id = ?
         AND fj.deleted_at IS NULL`,
    )
    .bind(importacaoId, empresaId)
    .all<{
      id: number;
      tripulante_id: number;
      data: string;
      hora_inicio: string | null;
      hora_fim: string | null;
      origem: string | null;
      destino: string | null;
      aeronave: string | null;
      funcao: string | null;
      tempo_noturno_min: number | null;
    }>();

  if ((registros.results || []).length === 0) return;

  // Pre-load all existing lancamentos for this import in a single query
  const existingLancamentos = await db
    .prepare(
      `SELECT id, frms_jornada_id
       FROM horas_voo_lancamentos
       WHERE fira_importacao_id = ? AND empresa_id = ?`,
    )
    .bind(importacaoId, empresaId)
    .all<{ id: number; frms_jornada_id: number }>();

  const existingByJornadaId = new Map<number, number>();
  for (const ex of existingLancamentos.results || []) {
    existingByJornadaId.set(ex.frms_jornada_id, ex.id);
  }

  // Build batch of UPDATE or INSERT statements
  const stmts = (registros.results || []).map((row) => {
    const duracao = toMinutes(row.hora_inicio, row.hora_fim);
    const funcao = String(row.funcao || 'SIC').toUpperCase() === 'PIC' ? 'PIC' : 'SIC';
    const existingId = existingByJornadaId.get(row.id);

    if (existingId !== undefined) {
      return db
        .prepare(
          `UPDATE horas_voo_lancamentos
           SET funcionario_id = ?,
               empresa_id = ?,
               data_voo = ?,
               modelo_aeronave = ?,
               origem = ?,
               destino = ?,
               duracao_total_min = ?,
               duracao_pic_min = ?,
               duracao_sic_min = ?,
               duracao_noturna_min = ?,
               funcao = ?,
               origem_registro = 'FIRA',
               is_simulador = 0,
               deleted_at = NULL,
               updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(
          row.tripulante_id,
          empresaId,
          row.data,
          row.aeronave,
          row.origem,
          row.destino,
          duracao,
          funcao === 'PIC' ? duracao : 0,
          funcao === 'SIC' ? duracao : 0,
          Number(row.tempo_noturno_min || 0),
          funcao,
          existingId,
        );
    }

    return db
      .prepare(
        `INSERT INTO horas_voo_lancamentos (
           funcionario_id, empresa_id, data_voo, modelo_aeronave,
           origem, destino, duracao_total_min, duracao_pic_min, duracao_sic_min,
           duracao_noturna_min, funcao, origem_registro, is_simulador,
           frms_jornada_id, fira_importacao_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FIRA', 0, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        row.tripulante_id,
        empresaId,
        row.data,
        row.aeronave,
        row.origem,
        row.destino,
        duracao,
        funcao === 'PIC' ? duracao : 0,
        funcao === 'SIC' ? duracao : 0,
        Number(row.tempo_noturno_min || 0),
        funcao,
        row.id,
        importacaoId,
      );
  });

  // Execute in batches of 50
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}
