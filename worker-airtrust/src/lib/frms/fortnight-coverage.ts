import {
  buildFrmsFortnightIndicatorMap,
  type FrmsFortnightDataSource,
  type FrmsFortnightIndicatorItemSeed,
} from './fortnight-indicator';

export const FRMS_FORTNIGHT_COVERAGE_MAX_WINDOW_DAYS = 31;

export interface FrmsFortnightCoverageParams {
  empresaId: number;
  dataInicio: string;
  dataFim: string;
  origem?: string[];
  status?: string[];
}

export interface FrmsFortnightCoverageBucket {
  total: number;
  com_dia_periodo: number;
  sem_dia_periodo: number;
  pct_cobertura: number;
}

export interface FrmsFortnightCoverageResponse {
  periodo: {
    data_inicio: string;
    data_fim: string;
  };
  resumo: {
    total_fatorizacoes: number;
    com_dia_periodo: number;
    sem_dia_periodo: number;
    pct_cobertura: number;
    com_total_dias: number;
    sem_total_dias: number;
  };
  por_origem: Array<{ origem: string } & FrmsFortnightCoverageBucket>;
  por_status_jornada: Array<{ status_jornada: string } & FrmsFortnightCoverageBucket>;
  por_fonte_periodo: Array<{ fonte_periodo: FrmsFortnightDataSource } & FrmsFortnightCoverageBucket>;
  recuperaveis_estimados: {
    com_escala_alocacoes: number;
    com_frms_escala_quinzenal: number;
    sem_escala_detectada: number;
  };
  notas: string[];
}

type CoverageRow = {
  fatorizacao_id: string;
  jornada_id: string;
  data_operacional: string;
  funcionario_id: number;
  origem: string | null;
  status_jornada: string | null;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  duracao_jornada_minutos: number | null;
  horas_voo_minutos: number | null;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
  has_frms_escala_quinzenal: number | null;
  has_escala_alocacoes: number | null;
};

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function normalizeUpper(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized || fallback;
}

function mapJornadaDataSource(origem: string): FrmsFortnightIndicatorItemSeed['jornada_data_source'] {
  if (origem === 'SIGVOOS') return 'REAL';
  if (origem === 'MANUAL') return 'MANUAL';
  if (!origem || origem === 'SEM_ORIGEM') return 'AUSENTE';
  if (origem === 'FIRA') return 'ESTIMADO';
  return 'ESTIMADO';
}

function toCoverageBucket(rows: CoverageRow[]): FrmsFortnightCoverageBucket {
  const total = rows.length;
  const comDia = rows.filter((row) => row.dia_periodo_embarcado != null).length;
  return {
    total,
    com_dia_periodo: comDia,
    sem_dia_periodo: total - comDia,
    pct_cobertura: pct(comDia, total),
  };
}

function buildSeed(row: CoverageRow): FrmsFortnightIndicatorItemSeed {
  return {
    data_operacional: row.data_operacional,
    funcionario_id: Number(row.funcionario_id),
    snapshot_status: 'OK',
    checkin_status: 'NAO_APLICAVEL',
    sleep_data_source: 'AUSENTE',
    wake_data_source: 'AUSENTE',
    jornada_data_source: mapJornadaDataSource(normalizeUpper(row.origem, 'SEM_ORIGEM')),
    hora_apresentacao: row.hora_apresentacao,
    hora_termino: row.hora_termino,
    duracao_jornada_minutos: Number(row.duracao_jornada_minutos ?? 0),
    horas_voo_minutos: Number(row.horas_voo_minutos ?? 0),
    teve_jornada: true,
    dia_periodo_embarcado:
      row.dia_periodo_embarcado == null ? null : Number(row.dia_periodo_embarcado),
    total_dias_periodo:
      row.total_dias_periodo == null ? null : Number(row.total_dias_periodo),
  };
}

export async function getFrmsFortnightCoverage(
  db: D1Database,
  params: FrmsFortnightCoverageParams,
): Promise<FrmsFortnightCoverageResponse> {
  const whereClauses = [
    'fj.deleted_at IS NULL',
    'j.deleted_at IS NULL',
    'COALESCE(j.empresa_id, f.empresa_id) = ?',
    'j.data >= ?',
    'j.data <= ?',
  ];
  const bindParams: Array<string | number> = [params.empresaId, params.dataInicio, params.dataFim];

  if (params.origem && params.origem.length > 0) {
    whereClauses.push(
      `UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'SEM_ORIGEM')) IN (${params.origem.map(() => '?').join(',')})`,
    );
    bindParams.push(...params.origem);
  }

  if (params.status && params.status.length > 0) {
    whereClauses.push(
      `UPPER(COALESCE(NULLIF(TRIM(j.status), ''), 'SEM_STATUS')) IN (${params.status.map(() => '?').join(',')})`,
    );
    bindParams.push(...params.status);
  }

  const query = `
    SELECT
      fj.id AS fatorizacao_id,
      j.id AS jornada_id,
      j.data AS data_operacional,
      CAST(j.tripulante_id AS INTEGER) AS funcionario_id,
      j.origem,
      j.status AS status_jornada,
      j.hora_apresentacao,
      COALESCE(j.hora_termino, j.hora_corte_motor, j.hora_ultimo_pouso) AS hora_termino,
      COALESCE(j.duracao_jornada_minutos, 0) AS duracao_jornada_minutos,
      COALESCE(j.horas_voo_minutos, 0) AS horas_voo_minutos,
      fj.dia_periodo_embarcado,
      fj.total_dias_periodo,
      CASE
        WHEN EXISTS (
          SELECT 1
            FROM frms_escala_quinzenal eq
           WHERE CAST(eq.tripulante_id AS TEXT) = CAST(j.tripulante_id AS TEXT)
             AND eq.deleted_at IS NULL
             AND j.data >= eq.data_inicio_embarque
             AND j.data <= eq.data_fim_embarque
        )
        THEN 1 ELSE 0
      END AS has_frms_escala_quinzenal,
      CASE
        WHEN EXISTS (
          SELECT 1
            FROM escala_alocacoes ea
            LEFT JOIN escalas_quinzenas eq
              ON eq.id = ea.quinzena_id
             AND eq.deleted_at IS NULL
           WHERE CAST(ea.funcionario_id AS TEXT) = CAST(j.tripulante_id AS TEXT)
             AND ea.data_inicio <= j.data
             AND ea.data_fim >= j.data
             AND ea.deleted_at IS NULL
             AND ea.status != 'cancelado'
             AND (
               ea.aeronave_id IS NOT NULL
               OR ea.quinzena_id IS NOT NULL
               OR (ea.situacao_tipo IS NOT NULL AND UPPER(ea.situacao_tipo) != 'FOLGA')
             )
        )
        THEN 1 ELSE 0
      END AS has_escala_alocacoes
    FROM frms_fatorizacao_jornada fj
    JOIN frms_jornada j
      ON j.id = fj.jornada_id
    LEFT JOIN funcionarios f
      ON f.id = CAST(j.tripulante_id AS INTEGER)
    WHERE ${whereClauses.join('\n      AND ')}
    ORDER BY j.data ASC, CAST(j.tripulante_id AS INTEGER) ASC, fj.id ASC
  `;

  const rowsResult = await db.prepare(query).bind(...bindParams).all<CoverageRow>();
  const rows = rowsResult.results || [];

  const resumo = {
    total_fatorizacoes: rows.length,
    com_dia_periodo: rows.filter((row) => row.dia_periodo_embarcado != null).length,
    sem_dia_periodo: rows.filter((row) => row.dia_periodo_embarcado == null).length,
    pct_cobertura: 0,
    com_total_dias: rows.filter((row) => row.total_dias_periodo != null).length,
    sem_total_dias: rows.filter((row) => row.total_dias_periodo == null).length,
  };
  resumo.pct_cobertura = pct(resumo.com_dia_periodo, resumo.total_fatorizacoes);

  const rowsByOrigem = new Map<string, CoverageRow[]>();
  const rowsByStatus = new Map<string, CoverageRow[]>();
  for (const row of rows) {
    const origem = normalizeUpper(row.origem, 'SEM_ORIGEM');
    const status = normalizeUpper(row.status_jornada, 'SEM_STATUS');
    rowsByOrigem.set(origem, [...(rowsByOrigem.get(origem) || []), row]);
    rowsByStatus.set(status, [...(rowsByStatus.get(status) || []), row]);
  }

  const indicatorMap = buildFrmsFortnightIndicatorMap({
    items: rows.map(buildSeed),
    windowStart: params.dataInicio,
    windowEnd: params.dataFim,
  });

  const rowsByFonte = new Map<FrmsFortnightDataSource, CoverageRow[]>();
  let comEscalaAlocacoes = 0;
  let comFrmsEscalaQuinzenal = 0;
  let semEscalaDetectada = 0;

  for (const row of rows) {
    const indicatorKey = `${row.data_operacional}::${Number(row.funcionario_id)}`;
    const fonte = indicatorMap.get(indicatorKey)?.fonte_periodo ?? 'AUSENTE';
    rowsByFonte.set(fonte, [...(rowsByFonte.get(fonte) || []), row]);

    if (row.dia_periodo_embarcado != null) continue;
    if (Number(row.has_frms_escala_quinzenal || 0) > 0) {
      comFrmsEscalaQuinzenal += 1;
      continue;
    }
    if (Number(row.has_escala_alocacoes || 0) > 0) {
      comEscalaAlocacoes += 1;
      continue;
    }
    semEscalaDetectada += 1;
  }

  return {
    periodo: {
      data_inicio: params.dataInicio,
      data_fim: params.dataFim,
    },
    resumo,
    por_origem: Array.from(rowsByOrigem.entries())
      .map(([origem, groupedRows]) => ({ origem, ...toCoverageBucket(groupedRows) }))
      .sort((a, b) => b.total - a.total || a.origem.localeCompare(b.origem)),
    por_status_jornada: Array.from(rowsByStatus.entries())
      .map(([status_jornada, groupedRows]) => ({
        status_jornada,
        ...toCoverageBucket(groupedRows),
      }))
      .sort((a, b) => b.total - a.total || a.status_jornada.localeCompare(b.status_jornada)),
    por_fonte_periodo: Array.from(rowsByFonte.entries())
      .map(([fonte_periodo, groupedRows]) => ({
        fonte_periodo,
        ...toCoverageBucket(groupedRows),
      }))
      .sort((a, b) => b.total - a.total || a.fonte_periodo.localeCompare(b.fonte_periodo)),
    recuperaveis_estimados: {
      com_escala_alocacoes: comEscalaAlocacoes,
      com_frms_escala_quinzenal: comFrmsEscalaQuinzenal,
      sem_escala_detectada: semEscalaDetectada,
    },
    notas: [
      'Indicador operacional descritivo; nao e compliance regulatorio.',
      'Endpoint read-only; nao executa reprocessamento.',
      'Buckets recuperaveis priorizam frms_escala_quinzenal antes de escala_alocacoes.',
    ],
  };
}
