/**
 * FRMS — Acúmulo rolling por tripulante e por frota.
 */

import type { FrmsJornada, LimitesMap, FrmsAcumuloRolling } from './types';
import { diasNoMes, calcAcumuloMensal } from './calculos';
import { dateOffset } from './db-service-shared';
import { carregarLimites } from './db-service-config';
import { buildCanonicalOperationalSourceSql } from './frms-source-policy';

const CANONICAL_JORNADA_SOURCE_SQL = buildCanonicalOperationalSourceSql('origem');
const CANONICAL_JOINED_JORNADA_SOURCE_SQL = buildCanonicalOperationalSourceSql('j.origem');

export async function buscarAcumuloTripulante(
  db: D1Database,
  tripulanteId: string,
  mes?: string,
): Promise<{
  nome: string;
  rolling: FrmsAcumuloRolling | null;
  mensal: {
    jornada_realizada_min: number;
    hv_realizada_min: number;
    jornada_fatorizada_pct: number;
    hv_fatorizada_pct: number;
    dias_embarcado: number;
    dias_folga: number;
    dias_ferias: number;
  } | null;
  limites: LimitesMap;
  effectiveness: {
    effectiveness_pct: number;
    effectiveness_nivel: string;
    effectiveness_componentes: Record<string, number> | null;
  } | null;
}> {
  const hoje = new Date().toISOString().slice(0, 10);

  // Limites vigentes — enviados ao frontend para exibição dinâmica
  const limites = await carregarLimites(db);

  // Nome do tripulante
  const funcRow = await db
    .prepare(
      `SELECT COALESCE(p.nome, 'Tripulante #' || ?) as nome FROM funcionarios p WHERE p.id = ? LIMIT 1`,
    )
    .bind(tripulanteId, Number(tripulanteId))
    .first<{ nome: string }>();
  const nome = funcRow?.nome ?? `Tripulante #${tripulanteId}`;

  // Acúmulo rolling ancorado na última data com jornada real
  // (evita retornar o registro do cron diário quando não há jornadas no mês atual)
  const rolling = await db
    .prepare(
      `SELECT ar.* FROM frms_acumulo_rolling ar
       WHERE ar.tripulante_id = ?
         AND ar.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM frms_jornada j
           WHERE j.tripulante_id = ar.tripulante_id
             AND j.data = ar.data_referencia
             AND j.deleted_at IS NULL
         )
       ORDER BY ar.data_referencia DESC LIMIT 1`,
    )
    .bind(tripulanteId)
    .first<FrmsAcumuloRolling>();

  // Acúmulo mensal — usa o mês solicitado ou o último mês com jornadas (evita mês corrente vazio)
  let mesConsulta = mes ?? hoje.slice(0, 7);
  if (!mes) {
    // Sem parâmetro: busca o mês mais recente com jornadas do tripulante
    const ultimaJ = await db
      .prepare(
        `SELECT strftime('%Y-%m', data) as mes FROM frms_jornada
         WHERE tripulante_id = ? AND deleted_at IS NULL
           AND ${CANONICAL_JORNADA_SOURCE_SQL}
         ORDER BY data DESC LIMIT 1`,
      )
      .bind(tripulanteId)
      .first<{ mes: string }>();
    if (ultimaJ?.mes) mesConsulta = ultimaJ.mes;
  }

  const jornadas = await db
    .prepare(
      `SELECT status, duracao_jornada_minutos, horas_voo_minutos
       FROM frms_jornada
       WHERE tripulante_id = ?
         AND data LIKE ? || '%'
         AND deleted_at IS NULL
         AND ${CANONICAL_JORNADA_SOURCE_SQL}`,
    )
    .bind(tripulanteId, mesConsulta)
    .all<Pick<FrmsJornada, 'status' | 'duracao_jornada_minutos' | 'horas_voo_minutos'>>();

  const fatorizacoes = await db
    .prepare(
      `SELECT f.total_fatorizado_jornada, f.total_fatorizado_hv
       FROM frms_fatorizacao_jornada f
       JOIN frms_jornada j ON j.id = f.jornada_id AND j.deleted_at IS NULL
       WHERE j.tripulante_id = ?
         AND j.data LIKE ? || '%'
         AND f.deleted_at IS NULL
         AND ${CANONICAL_JOINED_JORNADA_SOURCE_SQL}`,
    )
    .bind(tripulanteId, mesConsulta)
    .all<{ total_fatorizado_jornada: number; total_fatorizado_hv: number }>();

  const mensal = calcAcumuloMensal({
    jornadas: jornadas.results || [],
    fatorizacoes: fatorizacoes.results || [],
  });

  // Latest effectiveness for this tripulante
  let effectiveness: {
    effectiveness_pct: number;
    effectiveness_nivel: string;
    effectiveness_componentes: Record<string, number> | null;
  } | null = null;
  try {
    const effRow = await db
      .prepare(
        `SELECT f.effectiveness_pct, f.effectiveness_nivel, f.effectiveness_componentes_json
         FROM frms_fatorizacao_jornada f
         JOIN frms_jornada j ON j.id = f.jornada_id AND j.deleted_at IS NULL
         WHERE j.tripulante_id = ? AND f.deleted_at IS NULL
           AND f.effectiveness_pct IS NOT NULL
         ORDER BY j.data DESC LIMIT 1`,
      )
      .bind(tripulanteId)
      .first<{
        effectiveness_pct: number;
        effectiveness_nivel: string;
        effectiveness_componentes_json: string | null;
      }>();
    if (effRow) {
      effectiveness = {
        effectiveness_pct: effRow.effectiveness_pct,
        effectiveness_nivel: effRow.effectiveness_nivel,
        effectiveness_componentes: effRow.effectiveness_componentes_json
          ? JSON.parse(effRow.effectiveness_componentes_json)
          : null,
      };
    }
  } catch {
    // pre-migration graceful fallback
  }

  return { nome, rolling: rolling ?? null, mensal, limites, effectiveness };
}

/**
 * Enrich frota rows with effectiveness data per tripulante constrained to the
 * same time window used by the dashboard view.
 */
async function enrichWithEffectiveness<T extends { tripulante_id: string }>(
  db: D1Database,
  frota: T[],
  options?: {
    startDate?: string;
    endDate?: string;
  },
): Promise<
  (T & {
    effectiveness_pct?: number;
    effectiveness_nivel?: string;
    effectiveness_componentes?: Record<string, number>;
  })[]
> {
  if (frota.length === 0) return frota;

  const startDate = options?.startDate ?? null;
  const endDate = options?.endDate ?? null;

  try {
    const effRows = await db
      .prepare(
        `SELECT j.tripulante_id,
                f.effectiveness_pct,
                f.effectiveness_nivel,
                f.effectiveness_componentes_json
         FROM frms_fatorizacao_jornada f
         JOIN frms_jornada j ON j.id = f.jornada_id AND j.deleted_at IS NULL
         WHERE f.deleted_at IS NULL
           AND f.effectiveness_pct IS NOT NULL
           AND (? IS NULL OR j.data >= ?)
           AND (? IS NULL OR j.data <= ?)
           AND f.id = (
             SELECT f2.id
             FROM frms_fatorizacao_jornada f2
             JOIN frms_jornada j2 ON j2.id = f2.jornada_id AND j2.deleted_at IS NULL
             WHERE f2.deleted_at IS NULL
               AND f2.effectiveness_pct IS NOT NULL
               AND (? IS NULL OR j2.data >= ?)
               AND (? IS NULL OR j2.data <= ?)
               AND j2.tripulante_id = j.tripulante_id
             ORDER BY f2.effectiveness_pct ASC, j2.data DESC, f2.created_at DESC, f2.id DESC
             LIMIT 1
           )`,
      )
      .bind(startDate, startDate, endDate, endDate, startDate, startDate, endDate, endDate)
      .all();

    const effMap = new Map<
      string,
      { pct: number; nivel: string; componentes?: Record<string, number> }
    >();
    for (const row of effRows.results || []) {
      const r = row as Record<string, unknown>;
      let componentes: Record<string, number> | undefined;
      try {
        if (r.effectiveness_componentes_json) {
          componentes = JSON.parse(r.effectiveness_componentes_json as string);
        }
      } catch {
        /* ignore */
      }
      effMap.set(String(r.tripulante_id), {
        pct: (r.effectiveness_pct as number) ?? 100,
        nivel: (r.effectiveness_nivel as string) ?? 'verde',
        componentes,
      });
    }

    return frota.map((row) => {
      const eff = effMap.get(String(row.tripulante_id));
      if (!eff) return row;
      return {
        ...row,
        effectiveness_pct: eff.pct,
        effectiveness_nivel: eff.nivel,
        effectiveness_componentes: eff.componentes,
      };
    });
  } catch {
    // If effectiveness columns don't exist yet (pre-migration), return data as-is
    return frota;
  }
}

async function enrichWithOperationalContext<
  T extends {
    tripulante_id: string;
  },
>(
  db: D1Database,
  rows: T[],
  range: { startDate: string; endDate: string },
): Promise<
  Array<
    T & {
      aeronave_id?: string | null;
      aeronave_prefixo?: string | null;
      aeronave_modelo?: string | null;
      quinzena_numero?: number | null;
      quinzena_tipo?: 'Q1' | 'Q2' | 'PERSONALIZADA' | null;
    }
  >
> {
  if (rows.length === 0) return rows;

  const ids = Array.from(new Set(rows.map((row) => String(row.tripulante_id)).filter(Boolean)));
  if (ids.length === 0) return rows;

  const placeholders = ids.map(() => '?').join(',');
  const contextoRows = await db
    .prepare(
      `WITH contexto AS (
         SELECT
           CAST(ea.funcionario_id AS TEXT) AS tripulante_id,
           CAST(ea.aeronave_id AS TEXT) AS aeronave_id,
           a.prefixo AS aeronave_prefixo,
           a.modelo AS aeronave_modelo,
           CASE
             WHEN eq.numero IN (1, 2) THEN eq.numero
             WHEN CAST(strftime('%d', ea.data_inicio) AS INTEGER) <= 15 THEN 1
             WHEN CAST(strftime('%d', ea.data_inicio) AS INTEGER) > 15 THEN 2
             ELSE NULL
           END AS quinzena_numero,
           CASE
             WHEN eq.numero = 1 THEN 'Q1'
             WHEN eq.numero = 2 THEN 'Q2'
             WHEN CAST(strftime('%d', ea.data_inicio) AS INTEGER) <= 15 THEN 'Q1'
             WHEN CAST(strftime('%d', ea.data_inicio) AS INTEGER) > 15 THEN 'Q2'
             ELSE NULL
           END AS quinzena_tipo,
           ROW_NUMBER() OVER (
             PARTITION BY ea.funcionario_id
             ORDER BY
               CASE WHEN ea.aeronave_id IS NOT NULL THEN 0 ELSE 1 END,
               CASE WHEN eq.numero IS NOT NULL THEN 0 ELSE 1 END,
               ea.data_inicio DESC,
               ea.created_at DESC
           ) AS rn
         FROM escala_alocacoes ea
         LEFT JOIN aeronaves a
           ON a.id = ea.aeronave_id
          AND a.deleted_at IS NULL
         LEFT JOIN escalas_quinzenas eq
           ON eq.id = ea.quinzena_id
          AND eq.deleted_at IS NULL
         WHERE CAST(ea.funcionario_id AS TEXT) IN (${placeholders})
           AND ea.deleted_at IS NULL
           AND ea.status != 'cancelado'
           AND (ea.aeronave_id IS NOT NULL OR ea.quinzena_id IS NOT NULL)
           AND NOT (ea.data_fim < ? OR ea.data_inicio > ?)
       )
       SELECT
         tripulante_id,
         aeronave_id,
         aeronave_prefixo,
         aeronave_modelo,
         quinzena_numero,
         quinzena_tipo
       FROM contexto
       WHERE rn = 1`,
    )
    .bind(...ids, range.startDate, range.endDate)
    .all<{
      tripulante_id: string;
      aeronave_id: string | null;
      aeronave_prefixo: string | null;
      aeronave_modelo: string | null;
      quinzena_numero: number | null;
      quinzena_tipo: 'Q1' | 'Q2' | 'PERSONALIZADA' | null;
    }>();

  const contextoMap = new Map(
    (contextoRows.results || []).map((row) => [String(row.tripulante_id), row]),
  );

  return rows.map((row) => {
    const contexto = contextoMap.get(String(row.tripulante_id));
    if (!contexto) return row;
    return {
      ...row,
      aeronave_id: contexto.aeronave_id,
      aeronave_prefixo: contexto.aeronave_prefixo,
      aeronave_modelo: contexto.aeronave_modelo,
      quinzena_numero: contexto.quinzena_numero,
      quinzena_tipo: contexto.quinzena_tipo,
    };
  });
}

function buildFuncionarioAeronaveDisplayExpr(funcAlias = 'f'): string {
  const modeloIdsExpr = `',' || REPLACE(COALESCE(${funcAlias}.modelo_aeronave_id, ''), ' ', '') || ','`;

  return `COALESCE(
    NULLIF(
      REPLACE(
        (
          SELECT GROUP_CONCAT(
            DISTINCT CASE
              WHEN UPPER(TRIM(COALESCE(ma_multi.modelo, ma_multi.codigo, ma_multi.nome, ''))) = 'SK76'
                OR UPPER(TRIM(COALESCE(ma_multi.codigo, ma_multi.nome, ma_multi.modelo, ''))) IN ('S76', 'SK76')
                THEN 'SK76'
              ELSE COALESCE(
                NULLIF(TRIM(ma_multi.modelo), ''),
                NULLIF(TRIM(ma_multi.codigo), ''),
                NULLIF(TRIM(ma_multi.nome), '')
              )
            END
          )
          FROM modelos_aeronave ma_multi
          WHERE ma_multi.deleted_at IS NULL
            AND instr(${modeloIdsExpr}, ',' || CAST(ma_multi.id AS TEXT) || ',') > 0
        ),
        ',',
        ' / '
      ),
      ''
    ),
    CASE
      WHEN UPPER(TRIM(COALESCE(${funcAlias}.aeronave, ''))) IN ('S76', 'SK76') THEN 'SK76'
      WHEN NULLIF(TRIM(COALESCE(${funcAlias}.aeronave, '')), '') IS NOT NULL THEN TRIM(${funcAlias}.aeronave)
      ELSE NULL
    END
  )`;
}

async function enrichWithFuncionarioContext<
  T extends {
    tripulante_id: string;
  },
>(
  db: D1Database,
  rows: T[],
  options?: {
    preferFuncionarioContext?: boolean;
  },
): Promise<
  Array<
    T & {
      aeronave_id?: string | null;
      aeronave_prefixo?: string | null;
      aeronave_modelo?: string | null;
      quinzena_numero?: number | null;
      quinzena_tipo?: 'Q1' | 'Q2' | 'PERSONALIZADA' | null;
      funcao?: string | null;
      cargo?: string | null;
    }
  >
> {
  if (rows.length === 0) return rows;

  const ids = Array.from(new Set(rows.map((row) => String(row.tripulante_id)).filter(Boolean)));
  if (ids.length === 0) return rows;

  const placeholders = ids.map(() => '?').join(',');
  const aeronaveExpr = buildFuncionarioAeronaveDisplayExpr('f');
  const funcionarioRows = await db
    .prepare(
      `SELECT
         CAST(f.id AS TEXT) AS tripulante_id,
         NULLIF(TRIM(COALESCE(f.funcao, ''), '')) as funcao,
         NULLIF(TRIM(COALESCE(f.cargo, ''), '')) as cargo,
         CASE
           WHEN UPPER(TRIM(COALESCE(f.aeronave, ''))) IN ('S76', 'SK76') THEN 'SK76'
           WHEN NULLIF(TRIM(COALESCE(f.aeronave, '')), '') IS NOT NULL THEN TRIM(f.aeronave)
           ELSE ${aeronaveExpr}
         END AS aeronave_modelo,
         CASE COALESCE(f.quinzena, '')
           WHEN 'primeira' THEN 1
           WHEN 'segunda' THEN 2
           ELSE NULL
         END AS quinzena_numero,
         CASE COALESCE(f.quinzena, '')
           WHEN 'primeira' THEN 'Q1'
           WHEN 'segunda' THEN 'Q2'
           WHEN 'personalizada' THEN 'PERSONALIZADA'
           ELSE NULL
         END AS quinzena_tipo
       FROM funcionarios f
       WHERE CAST(f.id AS TEXT) IN (${placeholders})
         AND f.deleted_at IS NULL`,
    )
    .bind(...ids)
    .all<{
      tripulante_id: string;
      funcao: string | null;
      cargo: string | null;
      aeronave_modelo: string | null;
      quinzena_numero: number | null;
      quinzena_tipo: 'Q1' | 'Q2' | 'PERSONALIZADA' | null;
    }>();

  const funcionarioMap = new Map(
    (funcionarioRows.results || []).map((row) => [String(row.tripulante_id), row]),
  );

  return rows.map((row) => {
    const funcionario = funcionarioMap.get(String(row.tripulante_id));
    if (!funcionario) return row;

    const preferFuncionarioContext = options?.preferFuncionarioContext === true;
    const current = row as T & {
      aeronave_id?: string | null;
      aeronave_prefixo?: string | null;
      aeronave_modelo?: string | null;
      quinzena_numero?: number | null;
      quinzena_tipo?: 'Q1' | 'Q2' | 'PERSONALIZADA' | null;
    };

    return {
      ...row,
      aeronave_id: current.aeronave_id ?? null,
      aeronave_prefixo: current.aeronave_prefixo ?? null,
      aeronave_modelo: preferFuncionarioContext
        ? (funcionario.aeronave_modelo ?? current.aeronave_modelo ?? null)
        : (current.aeronave_modelo ?? funcionario.aeronave_modelo ?? null),
      quinzena_numero: preferFuncionarioContext
        ? (funcionario.quinzena_numero ?? current.quinzena_numero ?? null)
        : (current.quinzena_numero ?? funcionario.quinzena_numero ?? null),
      quinzena_tipo: preferFuncionarioContext
        ? (funcionario.quinzena_tipo ?? current.quinzena_tipo ?? null)
        : (current.quinzena_tipo ?? funcionario.quinzena_tipo ?? null),
    };
  });
}

export async function buscarAcumuloFrota(
  db: D1Database,
  mesReferencia?: string,
  empresaId?: number,
  periodoDias = 30,
  quinzenaReferencia?: 'Q1' | 'Q2',
  sectorScope?: { clause: string; bindings: number[] },
): Promise<
  Array<{
    tripulante_id: string;
    nome: string;
    nome_guerra?: string;
    aeronave_id?: string | null;
    aeronave_prefixo?: string | null;
    aeronave_modelo?: string | null;
    quinzena_numero?: number | null;
    quinzena_tipo?: 'Q1' | 'Q2' | 'PERSONALIZADA' | null;
    hv_mes_min: number;
    pct_mes: number;
    hv_7d_min: number;
    pct_7d: number;
    hv_365d_min: number;
    pct_365d: number;
    hv_dia_min: number;
    pct_dia: number;
    nivel_max: string;
    effectiveness_pct?: number;
    effectiveness_nivel?: string;
    effectiveness_componentes?: Record<string, number>;
  }>
> {
  // Start limites query in parallel with the main data query (below)
  const limitesPromise = carregarLimites(db);

  if (mesReferencia) {
    const limites = await limitesPromise;
    const limiteAvisoPct = limites.ALERTA_AVISO_PCT ?? 80;
    const limiteAtencaoPct = limites.ALERTA_ATENCAO_PCT ?? 90;
    const limiteCriticoPct = limites.ALERTA_CRITICO_PCT ?? 95;
    const [anoStr, mesStr] = mesReferencia.split('-');
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const mesInicio = `${mesReferencia}-01`;
    const mesFim = `${mesReferencia}-${String(diasNoMes(ano, mes)).padStart(2, '0')}`;
    const periodoInicio = quinzenaReferencia === 'Q2' ? `${mesReferencia}-16` : mesInicio;
    const periodoFim = quinzenaReferencia === 'Q1' ? `${mesReferencia}-15` : mesFim;
    const limiteMesMin = Math.max(1, Math.round((limites.HV_MES_HORAS || 1) * 60));

    // Use frms_acumulo_rolling as base (same universe as heatmap) and LEFT JOIN jornadas
    // so ALL monitored tripulants appear, even those without jornadas in this month.
    // Also LEFT JOIN the latest rolling snapshot per tripulant for 7d/365d/dia values,
    // which must come from the rolling table (not computed from jornadas scoped to the month).
    const rowsMes = await db
      .prepare(
        `SELECT t.tripulante_id,
                COALESCE(p.nome, 'Tripulante #' || t.tripulante_id) as nome,
                NULLIF(p.guerra, '') as nome_guerra,
                COALESCE(SUM(CASE WHEN j.data >= ? AND j.data <= ? THEN j.horas_voo_minutos ELSE 0 END), 0) as hv_mes_min,
                ar.hv_365_dias_min as hv_365d_min,
                ar.pct_limite_365d as pct_365d,
                ar.hv_7_dias_min as hv_7d_min,
                ar.pct_limite_7d as pct_7d,
                ar.hv_dia_min as hv_dia_min,
                ar.pct_limite_dia as pct_dia
         FROM (
           SELECT DISTINCT tripulante_id
           FROM frms_acumulo_rolling
           WHERE deleted_at IS NULL
         ) t
         LEFT JOIN funcionarios p ON p.id = CAST(t.tripulante_id AS INTEGER)
         LEFT JOIN frms_jornada j ON j.tripulante_id = t.tripulante_id
           AND j.deleted_at IS NULL
           AND j.data >= ?
           AND j.data <= ?
           AND ${CANONICAL_JOINED_JORNADA_SOURCE_SQL}
         LEFT JOIN frms_acumulo_rolling ar ON ar.tripulante_id = t.tripulante_id
           AND ar.id = (
             SELECT ar2.id
             FROM frms_acumulo_rolling ar2
             WHERE ar2.tripulante_id = t.tripulante_id AND ar2.deleted_at IS NULL
             ORDER BY ar2.data_referencia DESC, ar2.id DESC
             LIMIT 1
           )
         WHERE p.deleted_at IS NULL
           AND (? IS NULL OR p.empresa_id = ?)
           AND ${sectorScope?.clause ?? '1 = 1'}
         GROUP BY t.tripulante_id
         HAVING COALESCE(SUM(CASE WHEN j.data >= ? AND j.data <= ? THEN j.horas_voo_minutos ELSE 0 END), 0) > 0
         ORDER BY hv_mes_min DESC`,
      )
      .bind(
        periodoInicio,
        periodoFim,
        periodoInicio,
        periodoFim,
        empresaId ?? null,
        empresaId ?? null,
        ...(sectorScope?.bindings ?? []),
        periodoInicio,
        periodoFim,
      )
      .all();

    const resultadosMes = (rowsMes.results || []).map((row: Record<string, unknown>) => {
      const hvMesMin = (row.hv_mes_min as number) || 0;
      const hv7dMin = (row.hv_7d_min as number) || 0;
      const pct7d = (row.pct_7d as number) || 0;
      const hv365dMin = (row.hv_365d_min as number) || 0;
      const pct365d = (row.pct_365d as number) || 0;
      const hvDiaMin = (row.hv_dia_min as number) || 0;
      const pctDia = (row.pct_dia as number) || 0;
      const pctMes = (hvMesMin / limiteMesMin) * 100;
      const pctMax = Math.max(pctMes, pct7d, pct365d, pctDia);

      let nivelMax = 'OK';
      if (pctMax >= limiteCriticoPct) nivelMax = 'CRITICO';
      else if (pctMax >= limiteAtencaoPct) nivelMax = 'ATENCAO';
      else if (pctMax >= limiteAvisoPct) nivelMax = 'AVISO';

      return {
        tripulante_id: row.tripulante_id as string,
        nome: row.nome as string,
        nome_guerra: (row.nome_guerra as string | null) ?? undefined,
        hv_mes_min: hvMesMin,
        pct_mes: pctMes,
        hv_7d_min: hv7dMin,
        pct_7d: pct7d,
        hv_365d_min: hv365dMin,
        pct_365d: pct365d,
        hv_dia_min: hvDiaMin,
        pct_dia: pctDia,
        nivel_max: nivelMax,
      };
    });

    // Enrich with the worst effectiveness inside the visible month window.
    const comEffectiveness = await enrichWithEffectiveness(db, resultadosMes, {
      startDate: periodoInicio,
      endDate: periodoFim,
    });
    const comContextoOperacional = await enrichWithOperationalContext(db, comEffectiveness, {
      startDate: periodoInicio,
      endDate: periodoFim,
    });
    return enrichWithFuncionarioContext(db, comContextoOperacional, {
      preferFuncionarioContext: true,
    });
  }

  // For the dashboard rolling view, return the worst snapshot within the selected window
  // rather than only the latest row. The latest day can be 0 while previous recent days
  // still show elevated fatigue in the heatmap.
  const rowsPromise = db
    .prepare(
      `WITH ranked AS (
         SELECT ar.tripulante_id,
                COALESCE(p.nome, 'Tripulante #' || ar.tripulante_id) as nome,
                NULLIF(p.guerra, '') as nome_guerra,
                ar.hv_28_dias_min as hv_mes_min,
                COALESCE(ar.pct_limite_28d, ar.pct_limite_mes_calendario) as pct_mes,
                ar.hv_7_dias_min as hv_7d_min,
                ar.pct_limite_7d as pct_7d,
                ar.hv_365_dias_min as hv_365d_min,
                ar.pct_limite_365d as pct_365d,
                ar.hv_dia_min as hv_dia_min,
                ar.pct_limite_dia as pct_dia,
                max(
                  COALESCE(ar.pct_limite_7d, 0),
                  COALESCE(ar.pct_limite_28d, 0),
                  COALESCE(ar.pct_limite_mes_calendario, 0),
                  COALESCE(ar.pct_limite_365d, 0),
                  COALESCE(ar.pct_limite_dia, 0)
                ) as pct_sort,
                ROW_NUMBER() OVER (
                  PARTITION BY ar.tripulante_id
                  ORDER BY max(
                    COALESCE(ar.pct_limite_7d, 0),
                    COALESCE(ar.pct_limite_28d, 0),
                    COALESCE(ar.pct_limite_mes_calendario, 0),
                    COALESCE(ar.pct_limite_365d, 0),
                    COALESCE(ar.pct_limite_dia, 0)
                  ) DESC,
                  ar.data_referencia DESC
                ) as rn
         FROM frms_acumulo_rolling ar
         LEFT JOIN funcionarios p ON p.id = CAST(ar.tripulante_id AS INTEGER)
         WHERE ar.deleted_at IS NULL
           AND p.deleted_at IS NULL
           AND ar.data_referencia >= date('now', '-' || ? || ' days')
           AND ar.data_referencia <= date('now')
           AND (? IS NULL OR p.empresa_id = ?)
           AND ${sectorScope?.clause ?? '1 = 1'}
       )
       SELECT tripulante_id,
              nome,
              nome_guerra,
              hv_mes_min,
              pct_mes,
              hv_7d_min,
              pct_7d,
              hv_365d_min,
              pct_365d,
              hv_dia_min,
              pct_dia
       FROM ranked
       WHERE rn = 1
       ORDER BY pct_sort DESC, nome ASC`,
    )
    .bind(periodoDias, empresaId ?? null, empresaId ?? null, ...(sectorScope?.bindings ?? []))
    .all();

  const [limites, rows] = await Promise.all([limitesPromise, rowsPromise]);
  const limiteAvisoPct = limites.ALERTA_AVISO_PCT ?? 80;
  const limiteAtencaoPct = limites.ALERTA_ATENCAO_PCT ?? 90;
  const limiteCriticoPct = limites.ALERTA_CRITICO_PCT ?? 95;
  const resultados = (rows.results || []).map((row: Record<string, unknown>) => {
    const pctMax = Math.max(
      (row.pct_mes as number) || 0,
      (row.pct_7d as number) || 0,
      (row.pct_365d as number) || 0,
      (row.pct_dia as number) || 0,
    );
    let nivelMax = 'OK';
    if (pctMax >= limiteCriticoPct) nivelMax = 'CRITICO';
    else if (pctMax >= limiteAtencaoPct) nivelMax = 'ATENCAO';
    else if (pctMax >= limiteAvisoPct) nivelMax = 'AVISO';

    return {
      tripulante_id: row.tripulante_id as string,
      nome: row.nome as string,
      nome_guerra: (row.nome_guerra as string | null) ?? undefined,
      hv_mes_min: (row.hv_mes_min as number) || 0,
      pct_mes: (row.pct_mes as number) || 0,
      hv_7d_min: (row.hv_7d_min as number) || 0,
      pct_7d: (row.pct_7d as number) || 0,
      hv_365d_min: (row.hv_365d_min as number) || 0,
      pct_365d: (row.pct_365d as number) || 0,
      hv_dia_min: (row.hv_dia_min as number) || 0,
      pct_dia: (row.pct_dia as number) || 0,
      nivel_max: nivelMax,
    };
  });

  // Enrich with the worst effectiveness inside the visible rolling window.
  const rollingRange = {
    startDate: dateOffset(new Date().toISOString().slice(0, 10), -periodoDias),
    endDate: new Date().toISOString().slice(0, 10),
  };
  const comEffectiveness = await enrichWithEffectiveness(db, resultados, rollingRange);
  const comContextoOperacional = await enrichWithOperationalContext(
    db,
    comEffectiveness,
    rollingRange,
  );
  return enrichWithFuncionarioContext(db, comContextoOperacional, {
    preferFuncionarioContext: false,
  });
}
