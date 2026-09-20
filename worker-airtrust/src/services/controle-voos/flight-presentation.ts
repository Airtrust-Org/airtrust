export type FlightRoutePresentationPoint = {
  id: number | null;
  codigo: string;
  codigo_icao: string | null;
  nome: string | null;
  tipo: string | null;
};

export type FlightPresentation = {
  rota_codigos: string[];
  rota_pontos: FlightRoutePresentationPoint[];
  rdv_status: string | null;
  rdv_workflow_status: string | null;
  rdv_enviado_em: string | null;
};

type StageRow = {
  voo_id: number;
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
};

type EventRow = {
  voo_id: number;
  metadata_json: string | null;
};

type CatalogRow = {
  id: number;
  codigo: string | null;
  codigo_icao: string | null;
  nome: string | null;
  tipo: string | null;
};

type RdvRow = {
  voo_id: number;
  status: string | null;
  workflow_status: string | null;
  enviado_em: string | null;
};

const emptyPresentation = (): FlightPresentation => ({
  rota_codigos: [],
  rota_pontos: [],
  rdv_status: null,
  rdv_workflow_status: null,
  rdv_enviado_em: null,
});

function normalizeCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function buildRouteCodes(stages: StageRow[]): string[] {
  const route: string[] = [];
  for (const stage of stages) {
    const origin = normalizeCode(stage.origem_icao);
    const destination = normalizeCode(stage.destino_icao);
    if (origin && route[route.length - 1] !== origin) route.push(origin);
    if (destination && route[route.length - 1] !== destination) route.push(destination);
  }
  return route;
}

function parseRoutePointIds(metadataJson: string | null): number[] | null {
  if (!metadataJson) return null;
  try {
    const metadata = JSON.parse(metadataJson) as { route_point_ids?: unknown };
    if (!Array.isArray(metadata.route_point_ids) || metadata.route_point_ids.length < 2) return null;
    const ids = metadata.route_point_ids.map(Number);
    if (ids.some((id) => !Number.isInteger(id) || id <= 0)) return null;
    return ids;
  } catch {
    return null;
  }
}

function catalogCode(point: CatalogRow): string {
  return normalizeCode(point.codigo_icao || point.codigo);
}

function routeMatchesCodes(points: CatalogRow[], codes: string[]): boolean {
  if (points.length !== codes.length) return false;
  return points.every((point, index) => catalogCode(point) === codes[index]);
}

async function loadCatalogByIds(
  db: D1Database,
  empresaId: number,
  ids: number[],
): Promise<Map<number, CatalogRow>> {
  const map = new Map<number, CatalogRow>();
  const unique = [...new Set(ids)];
  const chunkSize = 80;
  for (let offset = 0; offset < unique.length; offset += chunkSize) {
    const chunk = unique.slice(offset, offset + chunkSize);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT id, codigo, codigo_icao, nome, tipo
           FROM cv_aeroportos
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND id IN (${placeholders})`,
      )
      .bind(empresaId, ...chunk)
      .all<CatalogRow>();
    for (const row of result.results || []) map.set(Number(row.id), row);
  }
  return map;
}

async function loadCatalogByCodes(
  db: D1Database,
  empresaId: number,
  codes: string[],
): Promise<Map<string, CatalogRow[]>> {
  const map = new Map<string, CatalogRow[]>();
  const unique = [...new Set(codes.map(normalizeCode).filter(Boolean))];
  const chunkSize = 35;
  for (let offset = 0; offset < unique.length; offset += chunkSize) {
    const chunk = unique.slice(offset, offset + chunkSize);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT id, codigo, codigo_icao, nome, tipo
           FROM cv_aeroportos
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND ativo = 1
            AND (
              UPPER(TRIM(codigo)) IN (${placeholders})
              OR UPPER(TRIM(COALESCE(codigo_icao, ''))) IN (${placeholders})
            )`,
      )
      .bind(empresaId, ...chunk, ...chunk)
      .all<CatalogRow>();
    for (const row of result.results || []) {
      for (const code of [normalizeCode(row.codigo), normalizeCode(row.codigo_icao)].filter(Boolean)) {
        const rows = map.get(code) || [];
        if (!rows.some((item) => Number(item.id) === Number(row.id))) rows.push(row);
        map.set(code, rows);
      }
    }
  }
  return map;
}

export async function getFlightPresentationMap(
  db: D1Database,
  empresaId: number,
  flightIds: number[],
): Promise<Map<number, FlightPresentation>> {
  const ids = [...new Set(flightIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const output = new Map<number, FlightPresentation>(ids.map((id) => [id, emptyPresentation()]));
  if (ids.length === 0) return output;

  const placeholders = ids.map(() => '?').join(', ');
  const [stageResult, eventResult, rdvResult] = await Promise.all([
    db
      .prepare(
        `SELECT voo_id, numero_etapa, origem_icao, destino_icao
           FROM cv_voo_etapas
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND voo_id IN (${placeholders})
          ORDER BY voo_id ASC, numero_etapa ASC, id ASC`,
      )
      .bind(empresaId, ...ids)
      .all<StageRow>(),
    db
      .prepare(
        `SELECT voo_id, metadata_json
           FROM cv_voo_eventos
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND metadata_json IS NOT NULL
            AND voo_id IN (${placeholders})
          ORDER BY voo_id ASC, id ASC`,
      )
      .bind(empresaId, ...ids)
      .all<EventRow>(),
    db
      .prepare(
        `SELECT voo_id, status, workflow_status, enviado_em
           FROM cv_rdv_operacional
          WHERE empresa_id = ?
            AND deleted_at IS NULL
            AND voo_id IN (${placeholders})`,
      )
      .bind(empresaId, ...ids)
      .all<RdvRow>(),
  ]);

  const stagesByFlight = new Map<number, StageRow[]>();
  for (const stage of stageResult.results || []) {
    const rows = stagesByFlight.get(Number(stage.voo_id)) || [];
    rows.push(stage);
    stagesByFlight.set(Number(stage.voo_id), rows);
  }

  const eventRouteIds = new Map<number, number[]>();
  for (const event of eventResult.results || []) {
    const routeIds = parseRoutePointIds(event.metadata_json);
    if (routeIds) eventRouteIds.set(Number(event.voo_id), routeIds);
  }

  const allRouteIds = [...eventRouteIds.values()].flat();
  const catalogById = await loadCatalogByIds(db, empresaId, allRouteIds);

  const allCodes = ids.flatMap((id) => buildRouteCodes(stagesByFlight.get(id) || []));
  const catalogByCode = await loadCatalogByCodes(db, empresaId, allCodes);

  for (const id of ids) {
    const presentation = output.get(id) || emptyPresentation();
    const codes = buildRouteCodes(stagesByFlight.get(id) || []);
    presentation.rota_codigos = codes;

    const exactIds = eventRouteIds.get(id) || [];
    const exactPoints = exactIds.map((pointId) => catalogById.get(pointId)).filter(Boolean) as CatalogRow[];
    if (exactPoints.length > 0 && (codes.length === 0 || routeMatchesCodes(exactPoints, codes))) {
      presentation.rota_pontos = exactPoints.map((point) => ({
        id: Number(point.id),
        codigo: normalizeCode(point.codigo),
        codigo_icao: normalizeCode(point.codigo_icao) || null,
        nome: point.nome ? String(point.nome).trim() : null,
        tipo: point.tipo ? String(point.tipo).trim() : null,
      }));
    } else {
      presentation.rota_pontos = codes.map((code) => {
        const matches = catalogByCode.get(code) || [];
        const point = matches.length === 1 ? matches[0] : null;
        return {
          id: point ? Number(point.id) : null,
          codigo: point ? normalizeCode(point.codigo) : code,
          codigo_icao: point ? normalizeCode(point.codigo_icao) || null : code,
          nome: point?.nome ? String(point.nome).trim() : null,
          tipo: point?.tipo ? String(point.tipo).trim() : null,
        };
      });
    }
    output.set(id, presentation);
  }

  for (const rdv of rdvResult.results || []) {
    const id = Number(rdv.voo_id);
    const presentation = output.get(id) || emptyPresentation();
    presentation.rdv_status = rdv.status || null;
    presentation.rdv_workflow_status = rdv.workflow_status || null;
    presentation.rdv_enviado_em = rdv.enviado_em || null;
    output.set(id, presentation);
  }

  return output;
}

export async function enrichFlightsWithPresentation<T extends { id: number }>(
  db: D1Database,
  empresaId: number,
  flights: T[],
): Promise<Array<T & FlightPresentation>> {
  const presentation = await getFlightPresentationMap(
    db,
    empresaId,
    flights.map((flight) => Number(flight.id)),
  );
  return flights.map((flight) => ({
    ...flight,
    ...(presentation.get(Number(flight.id)) || emptyPresentation()),
  }));
}
