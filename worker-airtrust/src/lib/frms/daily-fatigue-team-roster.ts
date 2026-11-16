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
  /**
   * Tripulantes com obrigação canônica de check-in no dia (PENDENTE ou RECEBIDO) por QUALQUER fonte de
   * atividade (Controle de Voos, simulador, treinamento, atividade informada). Entram na lista mesmo sem
   * alocação, EVD, jornada ou quinzena-base; do contrário uma pendência real ficaria invisível ao gestor.
   * Vai como um único JSON para não esbarrar no limite de variáveis do D1.
   */
  obligatedIds?: readonly number[];
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
          ch.hora_checkin, ch.kss_score, ch.kss_provenance,
          ch.horas_sono,
          ch.horas_sono_48h,
          ch.wake_time,
          ch.fit_for_duty,
          ch.score_fadiga,
          ch.nivel_fadiga,
          ch.status_operacional,
          ch.computed_risk_level,
          ch.requires_operational_review
       FROM funcionarios f
       -- Preserve assigned-quinzena team rows, but never hide a real daily check-in
       -- or journey just because the employee's fortnight assignment is missing.
       LEFT JOIN current_fortnight cf
         ON (
           (cf.numero = 1 AND LOWER(TRIM(COALESCE(f.quinzena, ''))) IN
             ('primeira','1','1q','q1','1ª','1a','primeira quinzena'))
           OR
           (cf.numero = 2 AND LOWER(TRIM(COALESCE(f.quinzena, ''))) IN
             ('segunda','2','2q','q2','2ª','2a','segunda quinzena'))
         )
       LEFT JOIN frms_jornada fj
         ON fj.tripulante_id = f.id
        AND fj.empresa_id = f.empresa_id
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
         AND (
           cf.numero IS NOT NULL OR fj.id IS NOT NULL OR ch.id IS NOT NULL
           OR f.id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
           -- Alocação real do dia (inclusive fora da quinzena-base) e voo
           -- programado na EVD também colocam o tripulante na lista; a regra
           -- canônica decide depois se o check-in é exigível.
           OR EXISTS (
             SELECT 1 FROM escala_alocacoes ea
              WHERE ea.funcionario_id = f.id
                AND ea.deleted_at IS NULL
                AND LOWER(COALESCE(ea.status, '')) <> 'cancelado'
                AND ea.data_inicio <= ? AND ea.data_fim >= ?
           )
           OR EXISTS (
             SELECT 1 FROM escala_voo_diaria e
              WHERE e.empresa_id = f.empresa_id
                AND e.data = ?
                AND e.deleted_at IS NULL
                AND UPPER(COALESCE(e.status, '')) <> 'CANCELADA'
                AND (CAST(e.pic_id AS INTEGER) = f.id OR CAST(e.sic_id AS INTEGER) = f.id)
           )
         )
       ORDER BY
         CASE
           WHEN ch.id IS NULL AND fj.id IS NOT NULL THEN 1
           WHEN ch.computed_risk_level IN ('critical', 'unfit_for_duty') THEN 2
           WHEN ch.computed_risk_level = 'attention' THEN 3
           ELSE 4
         END,
         f.nome ASC,
         f.id ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(
      params.empresaId,
      params.date,
      params.date,
      params.date,
      params.empresaId,
      ...params.sectorScope.bindings,
      JSON.stringify([...new Set((params.obligatedIds ?? []).filter((id) => Number.isInteger(id) && id > 0))]),
      params.date,
      params.date,
      params.date,
      params.limit,
      params.offset,
    )
    .all<Record<string, unknown>>();

  return rows.results || [];
}
