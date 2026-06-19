import type { D1Database } from '@cloudflare/workers-types';

export class SigvoosShadowCompareError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'SigvoosShadowCompareError';
  }
}

type AggregateRow = {
  key: string | null;
  total: number;
};

type ConflictSeverityRow = {
  severity: string | null;
  total: number;
};

type Window = {
  from: string;
  to: string;
  days: number;
};

type AggregateDiffRow = {
  key: string;
  cvTotal: number | null;
  frmsTotal: number | null;
  delta: number | null;
  status: 'MATCH' | 'DIVERGENT' | 'CV_ONLY_DIMENSION';
};

type CompareDimensions = {
  byDate: AggregateDiffRow[];
  byBase: AggregateDiffRow[];
  byAircraft: AggregateDiffRow[];
  byFlightType: AggregateDiffRow[];
};

type ComparableJourneyAggregate = {
  data: string | null;
  localBase: string | null;
  aircraft: string | null;
};

type Recommendation = {
  status: 'READY' | 'PARTIAL' | 'BLOCKED';
  reasons: string[];
};

export type SigvoosShadowCompareReport = {
  mode: 'shadow-compare';
  tenantScoped: true;
  writesEnabled: false;
  provider: 'SIGVOOS';
  empresaId: number;
  window: Window;
  totals: {
    previewStagingRecords: number;
    cvFlights: number;
    cvStages: number;
    cvCrew: number;
    frmsJourneysSigvoos: number;
    frmsAlertsSigvoos: number;
    openIntegrationConflicts: number;
  };
  conflictsBySeverity: Array<{ severity: string; total: number }>;
  divergences: CompareDimensions;
  normalizationErrors: string[];
  missingFields: string[];
  recommendation: Recommendation;
};

function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((toMs - fromMs) / 86400000) + 1;
}

export function parseSigvoosShadowCompareWindow(query: {
  from?: string | null;
  to?: string | null;
}): Window {
  const today = new Date().toISOString().slice(0, 10);
  const to = (query.to || '').trim() || today;
  const from = (query.from || '').trim() || shiftIsoDate(to, -6);

  if (!isIsoDateOnly(from) || !isIsoDateOnly(to)) {
    throw new SigvoosShadowCompareError('CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_INVALID_WINDOW', 400);
  }

  if (Date.parse(`${to}T00:00:00Z`) < Date.parse(`${from}T00:00:00Z`)) {
    throw new SigvoosShadowCompareError('CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_INVALID_WINDOW', 400);
  }

  const days = diffDaysInclusive(from, to);
  if (days > 31) {
    throw new SigvoosShadowCompareError('CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_WINDOW_TOO_WIDE', 400);
  }

  if (Date.parse(`${to}T00:00:00Z`) > Date.parse(`${today}T00:00:00Z`)) {
    throw new SigvoosShadowCompareError('CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_TO_FUTURE', 400);
  }

  return { from, to, days };
}

async function queryCount(db: D1Database, sql: string, ...values: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...values).first<{ total: number }>();
  return Number(row?.total || 0);
}

async function queryRows<T>(db: D1Database, sql: string, ...values: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...values).all<T>();
  return result.results || [];
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(tableName)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

async function columnExists(db: D1Database, tableName: string, columnName: string): Promise<boolean> {
  const rows = await queryRows<{ name: string }>(db, `PRAGMA table_info(${tableName})`);
  return rows.some((row) => row.name === columnName);
}

async function queryComparableCvJourneys(
  db: D1Database,
  empresaId: number,
  window: Window,
): Promise<ComparableJourneyAggregate[]> {
  return queryRows<ComparableJourneyAggregate>(
    db,
    `
      WITH cv_trip_day AS (
        SELECT
          t.funcionario_id AS tripulante_id,
          v.data_programacao AS data,
          MIN(v.id) AS representative_voo_id
        FROM cv_voo_tripulantes t
        JOIN cv_voos v ON v.id = t.voo_id
        WHERE t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND v.empresa_id = ?
          AND v.deleted_at IS NULL
          AND v.origem_importacao = 'SIGVOOS'
          AND date(v.data_programacao) BETWEEN date(?) AND date(?)
        GROUP BY t.funcionario_id, v.data_programacao
      ),
      first_stage AS (
        SELECT
          e.voo_id,
          MIN(e.id) AS representative_etapa_id
        FROM cv_voo_etapas e
        WHERE e.empresa_id = ?
          AND e.deleted_at IS NULL
          AND e.origem_dados = 'SIGVOOS'
        GROUP BY e.voo_id
      )
      SELECT
        c.data AS data,
        COALESCE(e.origem_icao, 'SEM_BASE') AS localBase,
        COALESCE(v.prefixo, 'SEM_AERONAVE') AS aircraft
      FROM cv_trip_day c
      JOIN cv_voos v ON v.id = c.representative_voo_id
      LEFT JOIN first_stage fs ON fs.voo_id = v.id
      LEFT JOIN cv_voo_etapas e ON e.id = fs.representative_etapa_id
      ORDER BY c.data, c.tripulante_id
    `,
    empresaId,
    empresaId,
    window.from,
    window.to,
    empresaId,
  );
}

function aggregateComparableJourneys(
  rows: ComparableJourneyAggregate[],
  dimension: 'data' | 'localBase' | 'aircraft',
): AggregateRow[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const rawKey = row[dimension];
    const key = rawKey || 'SEM_VALOR';
    totals.set(key, (totals.get(key) || 0) + 1);
  }

  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, total]) => ({ key, total }));
}

function mergeAggregateRows(cvRows: AggregateRow[], frmsRows: AggregateRow[], frmsComparable = true): AggregateDiffRow[] {
  const keys = new Set<string>();
  const cvMap = new Map<string, number>();
  const frmsMap = new Map<string, number>();

  for (const row of cvRows) {
    const key = row.key || 'SEM_VALOR';
    keys.add(key);
    cvMap.set(key, Number(row.total || 0));
  }

  for (const row of frmsRows) {
    const key = row.key || 'SEM_VALOR';
    keys.add(key);
    frmsMap.set(key, Number(row.total || 0));
  }

  return [...keys]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => {
      const cvTotal = cvMap.get(key) ?? 0;
      if (!frmsComparable) {
        return {
          key,
          cvTotal,
          frmsTotal: null,
          delta: null,
          status: 'CV_ONLY_DIMENSION' as const,
        };
      }

      const frmsTotal = frmsMap.get(key) ?? 0;
      return {
        key,
        cvTotal,
        frmsTotal,
        delta: cvTotal - frmsTotal,
        status: cvTotal === frmsTotal ? ('MATCH' as const) : ('DIVERGENT' as const),
      };
    });
}

function buildRecommendation(report: Omit<SigvoosShadowCompareReport, 'recommendation'>): Recommendation {
  const reasons: string[] = [];
  if (report.totals.previewStagingRecords === 0) reasons.push('NO_STAGING_SIGVOOS_ROWS');
  if (report.totals.cvFlights === 0) reasons.push('NO_SIGVOOS_CV_FLIGHTS');
  if (report.totals.frmsJourneysSigvoos === 0) reasons.push('NO_FRMS_SIGVOOS_JOURNEYS');
  if (report.totals.openIntegrationConflicts > 0) reasons.push('OPEN_INTEGRATION_CONFLICTS');
  if (report.missingFields.length > 0) reasons.push('MISSING_COMPARABLE_FIELDS');

  const hasDivergence = [
    ...report.divergences.byDate,
    ...report.divergences.byBase,
    ...report.divergences.byAircraft,
  ].some((row) => row.delta !== null && row.delta !== 0);

  if (hasDivergence) reasons.push('NON_ZERO_AGGREGATE_DELTAS');

  if (
    report.totals.previewStagingRecords === 0 ||
    report.totals.cvFlights === 0 ||
    report.totals.frmsJourneysSigvoos === 0
  ) {
    return { status: 'BLOCKED', reasons };
  }

  if (hasDivergence || report.totals.openIntegrationConflicts > 0 || report.missingFields.length > 0) {
    return { status: 'PARTIAL', reasons };
  }

  return { status: 'READY', reasons };
}

export async function buildSigvoosShadowCompareReport(
  db: D1Database,
  empresaId: number,
  window: Window,
): Promise<SigvoosShadowCompareReport> {
  const frmsJornadaExists = await tableExists(db, 'frms_jornada');
  const frmsAlertaExists = await tableExists(db, 'frms_alerta');

  const [frmsHasEmpresaId, frmsHasLocalBase, frmsHasMatriculaAeronave] = frmsJornadaExists
    ? await Promise.all([
        columnExists(db, 'frms_jornada', 'empresa_id'),
        columnExists(db, 'frms_jornada', 'local_base'),
        columnExists(db, 'frms_jornada', 'matricula_aeronave'),
      ])
    : [false, false, false];

  const missingFields: string[] = [];
  const normalizationErrors: string[] = [];

  if (!frmsJornadaExists) {
    missingFields.push('frms_jornada');
    normalizationErrors.push('FRMS_JORNADA_TABLE_MISSING');
  } else {
    if (!frmsHasEmpresaId) {
      missingFields.push('frms_jornada.empresa_id');
      normalizationErrors.push('FRMS_TENANT_SCOPE_UNAVAILABLE');
    }
    if (!frmsHasLocalBase) {
      missingFields.push('frms_jornada.local_base');
      normalizationErrors.push('FRMS_BASE_DIMENSION_UNAVAILABLE');
    }
    if (!frmsHasMatriculaAeronave) {
      missingFields.push('frms_jornada.matricula_aeronave');
      normalizationErrors.push('FRMS_AIRCRAFT_DIMENSION_UNAVAILABLE');
    }
  }

  normalizationErrors.push('FRMS_FLIGHT_TYPE_DIMENSION_UNAVAILABLE');

  const comparableCvJourneysPromise = queryComparableCvJourneys(db, empresaId, window);

  const totalsPromise = Promise.all([
    queryCount(
      db,
      `SELECT COUNT(*) AS total
         FROM cv_sigvoos_staging
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND date(data_operacional) BETWEEN date(?) AND date(?)`,
      empresaId,
      window.from,
      window.to,
    ),
    queryCount(
      db,
      `SELECT COUNT(*) AS total
         FROM cv_voos
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND origem_importacao = 'SIGVOOS'
          AND date(data_programacao) BETWEEN date(?) AND date(?)`,
      empresaId,
      window.from,
      window.to,
    ),
    queryCount(
      db,
      `SELECT COUNT(*) AS total
         FROM cv_voo_etapas e
         JOIN cv_voos v ON v.id = e.voo_id
        WHERE e.empresa_id = ?
          AND e.deleted_at IS NULL
          AND v.deleted_at IS NULL
          AND e.origem_dados = 'SIGVOOS'
          AND date(v.data_programacao) BETWEEN date(?) AND date(?)`,
      empresaId,
      window.from,
      window.to,
    ),
    queryCount(
      db,
      `SELECT COUNT(*) AS total
         FROM cv_voo_tripulantes t
         JOIN cv_voos v ON v.id = t.voo_id
        WHERE t.empresa_id = ?
          AND t.deleted_at IS NULL
          AND v.deleted_at IS NULL
          AND t.sigvoos_staff_id IS NOT NULL
          AND date(v.data_programacao) BETWEEN date(?) AND date(?)`,
      empresaId,
      window.from,
      window.to,
    ),
    frmsJornadaExists && frmsHasEmpresaId
      ? queryCount(
          db,
          `SELECT COUNT(*) AS total
             FROM frms_jornada
            WHERE deleted_at IS NULL
              AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'
              AND empresa_id = ?
              AND date(data) BETWEEN date(?) AND date(?)`,
          empresaId,
          window.from,
          window.to,
        )
      : Promise.resolve(0),
    frmsJornadaExists && frmsAlertaExists && frmsHasEmpresaId
      ? queryCount(
          db,
          `SELECT COUNT(*) AS total
             FROM frms_alerta a
             JOIN frms_jornada j ON j.id = a.jornada_id
            WHERE a.deleted_at IS NULL
              AND j.deleted_at IS NULL
              AND UPPER(COALESCE(j.origem, '')) = 'SIGVOOS'
              AND j.empresa_id = ?
              AND date(j.data) BETWEEN date(?) AND date(?)`,
          empresaId,
          window.from,
          window.to,
        )
      : Promise.resolve(0),
    queryCount(
      db,
      `SELECT COUNT(*) AS total
         FROM cv_conflitos_integracao
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND status = 'ABERTO'`,
      empresaId,
    ),
  ]);

  const conflictsBySeverityPromise = queryRows<ConflictSeverityRow>(
    db,
    `SELECT severidade AS severity, COUNT(*) AS total
       FROM cv_conflitos_integracao
      WHERE empresa_id = ?
        AND deleted_at IS NULL
        AND status = 'ABERTO'
      GROUP BY severidade
      ORDER BY total DESC, severity ASC`,
    empresaId,
  );

  const byDatePromise = Promise.all([
    comparableCvJourneysPromise.then((rows) => aggregateComparableJourneys(rows, 'data')),
    frmsJornadaExists && frmsHasEmpresaId
      ? queryRows<AggregateRow>(
          db,
          `SELECT data AS key, COUNT(*) AS total
             FROM frms_jornada
            WHERE deleted_at IS NULL
              AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'
              AND empresa_id = ?
              AND date(data) BETWEEN date(?) AND date(?)
            GROUP BY data`,
          empresaId,
          window.from,
          window.to,
        )
      : Promise.resolve([] as AggregateRow[]),
  ]);

  const byBasePromise = Promise.all([
    comparableCvJourneysPromise.then((rows) => aggregateComparableJourneys(rows, 'localBase')),
    frmsJornadaExists && frmsHasEmpresaId && frmsHasLocalBase
      ? queryRows<AggregateRow>(
          db,
          `SELECT COALESCE(local_base, 'SEM_BASE') AS key, COUNT(*) AS total
             FROM frms_jornada
            WHERE deleted_at IS NULL
              AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'
              AND empresa_id = ?
              AND date(data) BETWEEN date(?) AND date(?)
            GROUP BY COALESCE(local_base, 'SEM_BASE')`,
          empresaId,
          window.from,
          window.to,
        )
      : Promise.resolve([] as AggregateRow[]),
  ]);

  const byAircraftPromise = Promise.all([
    comparableCvJourneysPromise.then((rows) => aggregateComparableJourneys(rows, 'aircraft')),
    frmsJornadaExists && frmsHasEmpresaId && frmsHasMatriculaAeronave
      ? queryRows<AggregateRow>(
          db,
          `SELECT COALESCE(matricula_aeronave, 'SEM_AERONAVE') AS key, COUNT(*) AS total
             FROM frms_jornada
            WHERE deleted_at IS NULL
              AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'
              AND empresa_id = ?
              AND date(data) BETWEEN date(?) AND date(?)
            GROUP BY COALESCE(matricula_aeronave, 'SEM_AERONAVE')`,
          empresaId,
          window.from,
          window.to,
        )
      : Promise.resolve([] as AggregateRow[]),
  ]);

  const byFlightTypePromise = queryRows<AggregateRow>(
    db,
    `SELECT COALESCE(t.codigo, 'SEM_TIPO') AS key, COUNT(*) AS total
       FROM cv_voos v
       LEFT JOIN cv_tipos_voo t ON t.id = v.tipo_voo_id AND t.deleted_at IS NULL
      WHERE v.empresa_id = ?
        AND v.deleted_at IS NULL
        AND v.origem_importacao = 'SIGVOOS'
        AND date(v.data_programacao) BETWEEN date(?) AND date(?)
      GROUP BY COALESCE(t.codigo, 'SEM_TIPO')`,
    empresaId,
    window.from,
    window.to,
  );

  const [
    totals,
    conflictsBySeverity,
    [cvByDate, frmsByDate],
    [cvByBase, frmsByBase],
    [cvByAircraft, frmsByAircraft],
    cvByFlightType,
  ] = await Promise.all([
    totalsPromise,
    conflictsBySeverityPromise,
    byDatePromise,
    byBasePromise,
    byAircraftPromise,
    byFlightTypePromise,
  ]);

  const baseReport: Omit<SigvoosShadowCompareReport, 'recommendation'> = {
    mode: 'shadow-compare',
    tenantScoped: true,
    writesEnabled: false,
    provider: 'SIGVOOS',
    empresaId,
    window,
    totals: {
      previewStagingRecords: totals[0],
      cvFlights: totals[1],
      cvStages: totals[2],
      cvCrew: totals[3],
      frmsJourneysSigvoos: totals[4],
      frmsAlertsSigvoos: totals[5],
      openIntegrationConflicts: totals[6],
    },
    conflictsBySeverity: conflictsBySeverity.map((row) => ({
      severity: row.severity || 'SEM_SEVERIDADE',
      total: Number(row.total || 0),
    })),
    divergences: {
      byDate: mergeAggregateRows(cvByDate, frmsByDate),
      byBase: mergeAggregateRows(cvByBase, frmsByBase, frmsHasLocalBase),
      byAircraft: mergeAggregateRows(cvByAircraft, frmsByAircraft, frmsHasMatriculaAeronave),
      byFlightType: mergeAggregateRows(cvByFlightType, [], false),
    },
    normalizationErrors,
    missingFields,
  };

  return {
    ...baseReport,
    recommendation: buildRecommendation(baseReport),
  };
}
