import type { D1Database } from '@cloudflare/workers-types';

function toMinutes(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  const diff = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  return diff;
}

export async function syncHorasVooFromFrmsJornada(
  db: D1Database,
  frmsJornadaId: number,
  empresaId: number,
): Promise<void> {
  const jornada = await db
    .prepare(
      `SELECT id, empresa_id, tripulante_id, data, hora_inicio, hora_fim, status, deleted_at
       FROM frms_jornada
       WHERE id = ? AND empresa_id = ?
       LIMIT 1`,
    )
    .bind(frmsJornadaId, empresaId)
    .first<{
      id: number;
      empresa_id: number;
      tripulante_id: number;
      data: string;
      hora_inicio: string | null;
      hora_fim: string | null;
      status: string | null;
      deleted_at: string | null;
    }>();

  if (!jornada || !jornada.tripulante_id) return;

  const status = String(jornada.status || '').toUpperCase();
  const countsStatus = ['ES', 'TS', 'TV', 'EX', 'RE'].includes(status);

  const existing = await db
    .prepare(
      `SELECT id
       FROM horas_voo_lancamentos
       WHERE frms_jornada_id = ? AND empresa_id = ?
       LIMIT 1`,
    )
    .bind(frmsJornadaId, empresaId)
    .first<{ id: number }>();

  if (jornada.deleted_at || !countsStatus) {
    if (existing?.id) {
      await db
        .prepare(
          `UPDATE horas_voo_lancamentos
           SET deleted_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(existing.id)
        .run();
    }
    return;
  }

  const duracaoTotal = toMinutes(jornada.hora_inicio, jornada.hora_fim);

  const alocacao = await db
    .prepare(
      `SELECT tipo, aeronave_id
       FROM escala_alocacoes
       WHERE funcionario_id = ?
         AND empresa_id = ?
         AND data = ?
         AND deleted_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
    )
    .bind(jornada.tripulante_id, empresaId, jornada.data)
    .first<{ tipo: string | null; aeronave_id: number | null }>();

  const funcao = String(alocacao?.tipo || 'SIC').toUpperCase() === 'PIC' ? 'PIC' : 'SIC';

  const modelo = await db
    .prepare(
      `SELECT ma.modelo as modelo, a.prefixo as prefixo
       FROM aeronaves a
       LEFT JOIN modelos_aeronave ma ON ma.id = a.modelo_aeronave_id
       WHERE a.id = ?
       LIMIT 1`,
    )
    .bind(alocacao?.aeronave_id || null)
    .first<{ modelo: string | null; prefixo: string | null }>();

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE horas_voo_lancamentos
         SET funcionario_id = ?,
             empresa_id = ?,
             data_voo = ?,
             modelo_aeronave = ?,
             prefixo_aeronave = ?,
             duracao_total_min = ?,
             duracao_pic_min = ?,
             duracao_sic_min = ?,
             funcao = ?,
             origem_registro = 'FRMS',
             is_simulador = 0,
             deleted_at = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        jornada.tripulante_id,
        empresaId,
        jornada.data,
        modelo?.modelo || null,
        modelo?.prefixo || null,
        duracaoTotal,
        funcao === 'PIC' ? duracaoTotal : 0,
        funcao === 'SIC' ? duracaoTotal : 0,
        funcao,
        existing.id,
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO horas_voo_lancamentos (
        funcionario_id, empresa_id, data_voo, modelo_aeronave, prefixo_aeronave,
        duracao_total_min, duracao_pic_min, duracao_sic_min, funcao,
        origem_registro, frms_jornada_id, is_simulador, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'FRMS', ?, 0, datetime('now'), datetime('now'))`,
    )
    .bind(
      jornada.tripulante_id,
      empresaId,
      jornada.data,
      modelo?.modelo || null,
      modelo?.prefixo || null,
      duracaoTotal,
      funcao === 'PIC' ? duracaoTotal : 0,
      funcao === 'SIC' ? duracaoTotal : 0,
      funcao,
      frmsJornadaId,
    )
    .run();
}
