import type { D1Database } from '@cloudflare/workers-types';

export interface DailyFatigueTeamSectorScope {
  clause: string;
  bindings: unknown[];
}

export async function loadDailyFatigueTeamRoster(params: {
  db: D1Database;
  empresaId: number;
  date: string;
  sectorScope: DailyFatigueTeamSectorScope;
  limit: number;
  offset: number;
}): Promise<Record<string, unknown>[]> {
  const rows = await params.db
    .prepare(
      `WITH current_fortnight AS (
         SELECT numero, data_inicio, data_fim
           FROM escalas_quinzenas
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND ? BETWEEN data_inicio AND data_fim
          ORDER BY numero
          LIMIT 1
       )
       SELECT
          f.id AS funcionario_id,
          f.nome AS funcionario_nome,
          COALESCE(f.cargo, f.funcao) AS cargo,
          cf.numero AS quinzena_numero,
          cf.data_inicio AS quinzena_inicio,
          cf.data_fim AS quinzena_fim,
          fj.id AS jornada_id,
          ch.id AS checkin_id,
          ch.jornada_inicio_prevista AS checkin_apresentacao,
          ch.hora_checkin, ch.kss_score,
          ch.horas_sono,
          ch.horas_sono_48h,
          ch.wake_time,
          ch.score_fadiga,
          ch.nivel_fadiga,
          ch.status_operacional,
          ch.computed_risk_level,
          ch.requires_operational_review
       FROM funcionarios f
       JOIN current_fortnight cf
         ON (
           (cf.numero = 1 AND LOWER(TRIM(COALESCE(f.quinzena, ''))) IN
             ('primeira','1','1q','q1','1ª','1a','primeira quinzena'))
           OR
           (cf.numero = 2 AND LOWER(TRIM(COALESCE(f.quinzena, ''))) IN
             ('segunda','2','2q','q2','2ª','2a','segunda quinzena'))
         )
       LEFT JOIN frms_jornada fj
         ON fj.tripulante_id = f.id
        AND fj.data = ?
        AND fj.deleted_at IS NULL
        AND fj.status IN ('ES','TS','TV','EX','RE','SA')
       LEFT JOIN frms_fadiga_checkin ch
         ON ch.funcionario_id = f.id
        AND ch.empresa_id = f.empresa_id
        AND ch.data_checkin = ?
        AND ch.deleted_at IS NULL
       WHERE f.empresa_id = ?
         AND f.deleted_at IS NULL
         AND COALESCE(f.ativo, 1) = 1
         AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         AND UPPER(COALESCE(f.funcao, '')) IN ('PILOTO','COPILOTO','COMANDANTE')
         AND ${params.sectorScope.clause}
       ORDER BY
         CASE
           WHEN ch.id IS NULL AND fj.id IS NOT NULL THEN 1
           WHEN ch.computed_risk_level IN ('critical', 'unfit_for_duty') THEN 2
           WHEN ch.computed_risk_level = 'attention' THEN 3
           ELSE 4
         END,
         f.nome ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(
      params.empresaId,
      params.date,
      params.date,
      params.date,
      params.empresaId,
      ...params.sectorScope.bindings,
      params.limit,
      params.offset,
    )
    .all<Record<string, unknown>>();

  return rows.results || [];
}
