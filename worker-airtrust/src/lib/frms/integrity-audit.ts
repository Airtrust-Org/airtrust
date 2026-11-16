import type { D1Database } from '@cloudflare/workers-types';

/**
 * Auditoria diária de integridade FRMS (global, só contagens). Compartilhada pelo roteador resiliente
 * e pelo handler legado: antes cada um mantinha uma cópia idêntica, e ambas tratavam só FOLGA como
 * ausência, de modo que jornada lançada em férias ou afastamento não aparecia como divergência.
 */
export async function runFrmsIntegrityAudit(db: D1Database): Promise<{
  jornadasSemFatorizacao: number;
  jornadasLancadasForaQuinzena: number;
  rollingSemJornadaRecente: number;
}> {
  const jornadasSemFatorizacao = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM frms_jornada j
         LEFT JOIN frms_fatorizacao_jornada fj
           ON fj.jornada_id = j.id
          AND fj.deleted_at IS NULL
        WHERE j.deleted_at IS NULL
          AND fj.id IS NULL`,
    )
    .first<{ total: number }>();

  const jornadasLancadasForaQuinzena = await db
    .prepare(
      `WITH jornadas_lancadas AS (
         SELECT j.id, j.tripulante_id, j.data
           FROM frms_jornada j
          WHERE j.deleted_at IS NULL
            AND (
              j.hora_apresentacao IS NOT NULL
              OR j.hora_termino IS NOT NULL
              OR COALESCE(j.horas_voo_minutos, 0) > 0
              OR COALESCE(j.duracao_jornada_minutos, 0) > 0
            )
       ),
       jornadas_fora_faixa AS (
         SELECT jl.id
           FROM jornadas_lancadas jl
          WHERE NOT EXISTS (
            SELECT 1
              FROM escala_alocacoes ea
             WHERE CAST(ea.funcionario_id AS TEXT) = CAST(jl.tripulante_id AS TEXT)
               AND ea.deleted_at IS NULL
               AND ea.status != 'cancelado'
               -- Ausência programada (folga, férias, afastamento) não é escala de trabalho: uma jornada
               -- lançada nela é divergência, mesmo que a alocação tenha quinzena_id resolvido.
               AND UPPER(COALESCE(ea.situacao_tipo, '')) NOT IN ('FOLGA', 'FERIAS', 'MED', 'AFT')
               AND (
                 ea.aeronave_id IS NOT NULL
                 OR ea.quinzena_id IS NOT NULL
                 OR ea.situacao_tipo IS NOT NULL
               )
               AND jl.data BETWEEN date(ea.data_inicio, '-2 day') AND date(ea.data_fim, '+2 day')
          )
       )
       SELECT COUNT(*) AS total FROM jornadas_fora_faixa`,
    )
    .first<{ total: number }>();

  const rollingSemJornadaRecente = await db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM frms_acumulo_rolling ar
         LEFT JOIN frms_jornada j
           ON j.tripulante_id = ar.tripulante_id
          AND j.data = ar.data_referencia
          AND j.deleted_at IS NULL
        WHERE ar.deleted_at IS NULL
          AND j.id IS NULL
          AND ar.data_referencia >= date('now', '-120 days')`,
    )
    .first<{ total: number }>();

  return {
    jornadasSemFatorizacao: Number(jornadasSemFatorizacao?.total || 0),
    jornadasLancadasForaQuinzena: Number(jornadasLancadasForaQuinzena?.total || 0),
    rollingSemJornadaRecente: Number(rollingSemJornadaRecente?.total || 0),
  };
}
