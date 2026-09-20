import type { D1Database } from '@cloudflare/workers-types';

export interface PilotLogbookEntry {
  rdv_id: number;
  voo_id: number;
  data_voo: string;
  prefixo: string;
  modelo_aeronave: string | null;
  funcao: 'PIC' | 'SIC';
  rota: string[];
  tempo_voo_min: number;
  tempo_noturno_min: number;
  tempo_ifr_min: number;
  finalizado_em: string | null;
}

export interface PilotLogbookTotals {
  total_min: number;
  pic_min: number;
  sic_min: number;
  noturna_min: number;
  instrumento_min: number;
  simulador_min: number;
  saldo_referencia: string | null;
}

export interface PilotLogbookResult {
  entries: PilotLogbookEntry[];
  totals: PilotLogbookTotals;
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    operational_source: 'RDV_FINALIZADO';
    historical_source: 'SALDO_INICIAL';
    landing_credit: 'NAO_ATRIBUIDO';
  };
}

type FlightRow = {
  rdv_id: number;
  voo_id: number;
  data_voo: string;
  horas_voadas: number | null;
  finalizado_workflow_em: string | null;
  prefixo: string;
  funcao: string;
  modelo_aeronave: string | null;
  origem_icao: string | null;
  destino_icao: string | null;
};

type StageRow = {
  voo_id: number;
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  tempo_decolagem_pouso: string | null;
  tempo_noturno: string | null;
  tempo_ifr: string | null;
};

type InitialBalanceRow = {
  horas_total_min: number | null;
  horas_pic_min: number | null;
  horas_sic_min: number | null;
  horas_noturna_min: number | null;
  horas_instrumento_min: number | null;
  horas_simulador_min: number | null;
  data_referencia: string | null;
};

function toSafeInt(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function parsePilotLogbookDuration(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 60) : 0;
  }
  const raw = String(value).trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,4}):(\d{1,2})$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return 0;
    return hours * 60 + minutes;
  }
  const decimal = Number(raw.replace(',', '.'));
  return Number.isFinite(decimal) && decimal > 0 ? Math.round(decimal * 60) : 0;
}

export function buildPilotLogbookRoute(
  stages: Array<Pick<StageRow, 'origem_icao' | 'destino_icao'>>,
  fallback: string[] = [],
): string[] {
  if (stages.length === 0) return fallback.filter(Boolean);
  const route: string[] = [];
  const firstOrigin = String(stages[0]?.origem_icao || '')
    .trim()
    .toUpperCase();
  if (firstOrigin) route.push(firstOrigin);
  for (const stage of stages) {
    const destination = String(stage.destino_icao || '')
      .trim()
      .toUpperCase();
    if (destination && route[route.length - 1] !== destination) route.push(destination);
  }
  return route.length >= 2 ? route : fallback.filter(Boolean);
}

function aggregateFlight(
  flight: FlightRow,
  stages: StageRow[],
): Pick<PilotLogbookEntry, 'rota' | 'tempo_voo_min' | 'tempo_noturno_min' | 'tempo_ifr_min'> {
  const sorted = [...stages].sort((a, b) => Number(a.numero_etapa) - Number(b.numero_etapa));
  const stageFlightMinutes = sorted.reduce(
    (sum, stage) => sum + parsePilotLogbookDuration(stage.tempo_decolagem_pouso),
    0,
  );
  return {
    rota: buildPilotLogbookRoute(sorted, [flight.origem_icao || '', flight.destino_icao || '']),
    tempo_voo_min:
      stageFlightMinutes > 0 ? stageFlightMinutes : parsePilotLogbookDuration(flight.horas_voadas),
    tempo_noturno_min: sorted.reduce(
      (sum, stage) => sum + parsePilotLogbookDuration(stage.tempo_noturno),
      0,
    ),
    tempo_ifr_min: sorted.reduce(
      (sum, stage) => sum + parsePilotLogbookDuration(stage.tempo_ifr),
      0,
    ),
  };
}

async function loadStagesForFlights(
  db: D1Database,
  empresaId: number,
  vooIds: number[],
): Promise<StageRow[]> {
  const unique = [...new Set(vooIds)].filter((id) => Number.isInteger(id) && id > 0);
  const rows: StageRow[] = [];
  for (let offset = 0; offset < unique.length; offset += 200) {
    const chunk = unique.slice(offset, offset + 200);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT voo_id, numero_etapa, origem_icao, destino_icao,
                tempo_decolagem_pouso, tempo_noturno, tempo_ifr
         FROM cv_voo_etapas
         WHERE empresa_id = ?
           AND voo_id IN (${placeholders})
           AND deleted_at IS NULL
         ORDER BY voo_id ASC, numero_etapa ASC`,
      )
      .bind(empresaId, ...chunk)
      .all<StageRow>();
    rows.push(...(result.results || []));
  }
  return rows;
}

function stagesByFlight(rows: StageRow[]): Map<number, StageRow[]> {
  const map = new Map<number, StageRow[]>();
  for (const row of rows) {
    const vooId = Number(row.voo_id);
    const bucket = map.get(vooId) || [];
    bucket.push(row);
    map.set(vooId, bucket);
  }
  return map;
}

function flightWhere(
  filters: { dataInicio?: string; dataFim?: string },
  prefix = 'r',
): {
  sql: string;
  args: string[];
} {
  const conditions: string[] = [];
  const args: string[] = [];
  if (filters.dataInicio) {
    conditions.push(`${prefix}.data_voo >= ?`);
    args.push(filters.dataInicio);
  }
  if (filters.dataFim) {
    conditions.push(`${prefix}.data_voo <= ?`);
    args.push(filters.dataFim);
  }
  return { sql: conditions.length ? ` AND ${conditions.join(' AND ')}` : '', args };
}

export async function getPilotLogbook(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  options: { page?: number; limit?: number; dataInicio?: string; dataFim?: string } = {},
): Promise<PilotLogbookResult> {
  const page = Math.max(1, Math.floor(Number(options.page || 1)));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit || 20))));
  const offset = (page - 1) * limit;
  const filtered = flightWhere({ dataInicio: options.dataInicio, dataFim: options.dataFim });

  const baseSql = `
    FROM cv_rdv_operacional r
    INNER JOIN cv_voos v
      ON v.id = r.voo_id AND v.empresa_id = r.empresa_id AND v.deleted_at IS NULL
    INNER JOIN cv_voo_tripulantes t
      ON t.voo_id = v.id AND t.empresa_id = v.empresa_id
     AND t.funcionario_id = ? AND t.deleted_at IS NULL AND t.funcao IN ('PIC', 'SIC')
    LEFT JOIN aeronaves a
      ON a.id = v.aeronave_id AND a.empresa_id = v.empresa_id AND a.deleted_at IS NULL
    LEFT JOIN cv_aeroportos ao
      ON ao.id = v.origem_id AND ao.empresa_id = v.empresa_id AND ao.deleted_at IS NULL
    LEFT JOIN cv_aeroportos ad
      ON ad.id = v.destino_id AND ad.empresa_id = v.empresa_id AND ad.deleted_at IS NULL
    WHERE r.empresa_id = ?
      AND r.deleted_at IS NULL
      AND r.status = 'preenchimento_finalizado'
      AND r.workflow_status = 'finalizado'
      ${filtered.sql}`;

  const bindBase: unknown[] = [funcionarioId, empresaId, ...filtered.args];
  const [countResult, flightsResult, initialBalance] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total ${baseSql}`)
      .bind(...bindBase)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT r.id AS rdv_id, r.voo_id, r.data_voo, r.horas_voadas,
                r.finalizado_workflow_em, v.prefixo, t.funcao,
                a.modelo AS modelo_aeronave,
                COALESCE(ao.codigo_icao, ao.codigo) AS origem_icao,
                COALESCE(ad.codigo_icao, ad.codigo) AS destino_icao
         ${baseSql}
         ORDER BY r.data_voo DESC, r.id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindBase, limit, offset)
      .all<FlightRow>(),
    db
      .prepare(
        `SELECT horas_total_min, horas_pic_min, horas_sic_min,
                horas_noturna_min, horas_instrumento_min, horas_simulador_min, data_referencia
         FROM horas_voo_saldo_inicial
         WHERE empresa_id = ? AND funcionario_id = ? AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(empresaId, funcionarioId)
      .first<InitialBalanceRow>(),
  ]);

  const flights = flightsResult.results || [];
  const listStages = await loadStagesForFlights(
    db,
    empresaId,
    flights.map((row) => Number(row.voo_id)),
  );
  const listStageMap = stagesByFlight(listStages);
  const entries: PilotLogbookEntry[] = flights.map((flight) => {
    const aggregate = aggregateFlight(flight, listStageMap.get(Number(flight.voo_id)) || []);
    return {
      rdv_id: Number(flight.rdv_id),
      voo_id: Number(flight.voo_id),
      data_voo: String(flight.data_voo),
      prefixo: String(flight.prefixo || ''),
      modelo_aeronave: flight.modelo_aeronave || null,
      funcao: String(flight.funcao).toUpperCase() === 'PIC' ? 'PIC' : 'SIC',
      rota: aggregate.rota,
      tempo_voo_min: aggregate.tempo_voo_min,
      tempo_noturno_min: aggregate.tempo_noturno_min,
      tempo_ifr_min: aggregate.tempo_ifr_min,
      finalizado_em: flight.finalizado_workflow_em || null,
    };
  });

  const periodFiltered = Boolean(options.dataInicio || options.dataFim);
  const balanceReference = periodFiltered ? null : (initialBalance?.data_referencia || null);
  const summaryWhere = periodFiltered
    ? filtered.sql
    : balanceReference
      ? ' AND r.data_voo > ?'
      : '';
  const summaryBindArgs = periodFiltered
    ? filtered.args
    : balanceReference
      ? [balanceReference]
      : [];
  const summaryFlights = await db
    .prepare(
      `SELECT r.id AS rdv_id, r.voo_id, r.data_voo, r.horas_voadas,
              r.finalizado_workflow_em, v.prefixo, t.funcao,
              a.modelo AS modelo_aeronave,
              COALESCE(ao.codigo_icao, ao.codigo) AS origem_icao,
              COALESCE(ad.codigo_icao, ad.codigo) AS destino_icao
       FROM cv_rdv_operacional r
       INNER JOIN cv_voos v
         ON v.id = r.voo_id AND v.empresa_id = r.empresa_id AND v.deleted_at IS NULL
       INNER JOIN cv_voo_tripulantes t
         ON t.voo_id = v.id AND t.empresa_id = v.empresa_id
        AND t.funcionario_id = ? AND t.deleted_at IS NULL AND t.funcao IN ('PIC', 'SIC')
       LEFT JOIN aeronaves a
         ON a.id = v.aeronave_id AND a.empresa_id = v.empresa_id AND a.deleted_at IS NULL
       LEFT JOIN cv_aeroportos ao
         ON ao.id = v.origem_id AND ao.empresa_id = v.empresa_id AND ao.deleted_at IS NULL
       LEFT JOIN cv_aeroportos ad
         ON ad.id = v.destino_id AND ad.empresa_id = v.empresa_id AND ad.deleted_at IS NULL
       WHERE r.empresa_id = ?
         AND r.deleted_at IS NULL
         AND r.status = 'preenchimento_finalizado'
         AND r.workflow_status = 'finalizado'
         ${summaryWhere}
       ORDER BY r.data_voo ASC, r.id ASC`,
    )
    .bind(funcionarioId, empresaId, ...summaryBindArgs)
    .all<FlightRow>();

  const summaryRows = summaryFlights.results || [];
  const summaryStages = await loadStagesForFlights(
    db,
    empresaId,
    summaryRows.map((row) => Number(row.voo_id)),
  );
  const summaryStageMap = stagesByFlight(summaryStages);

  const totals: PilotLogbookTotals = {
    total_min: periodFiltered ? 0 : toSafeInt(initialBalance?.horas_total_min),
    pic_min: periodFiltered ? 0 : toSafeInt(initialBalance?.horas_pic_min),
    sic_min: periodFiltered ? 0 : toSafeInt(initialBalance?.horas_sic_min),
    noturna_min: periodFiltered ? 0 : toSafeInt(initialBalance?.horas_noturna_min),
    instrumento_min: periodFiltered ? 0 : toSafeInt(initialBalance?.horas_instrumento_min),
    simulador_min: periodFiltered ? 0 : toSafeInt(initialBalance?.horas_simulador_min),
    saldo_referencia: balanceReference,
  };

  for (const flight of summaryRows) {
    const aggregate = aggregateFlight(flight, summaryStageMap.get(Number(flight.voo_id)) || []);
    totals.total_min += aggregate.tempo_voo_min;
    totals.noturna_min += aggregate.tempo_noturno_min;
    totals.instrumento_min += aggregate.tempo_ifr_min;
    if (String(flight.funcao).toUpperCase() === 'PIC') totals.pic_min += aggregate.tempo_voo_min;
    else totals.sic_min += aggregate.tempo_voo_min;
  }

  return {
    entries,
    totals,
    meta: {
      page,
      limit,
      total: Number(countResult?.total || 0),
      total_pages: Math.ceil(Number(countResult?.total || 0) / limit),
      operational_source: 'RDV_FINALIZADO',
      historical_source: 'SALDO_INICIAL',
      landing_credit: 'NAO_ATRIBUIDO',
    },
  };
}
