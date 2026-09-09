import {
  RedemetClient,
  selectMetarObservation,
  type RedemetMetarRow,
} from '../../lib/frms/redemet-weather';

type LocationCatalogRow = {
  location_code: string;
  operational_class: string;
  name: string | null;
  timezone_iana: string | null;
  weather_source_kind: string;
  redemet_station_icao: string | null;
  latitude: number | null;
  longitude: number | null;
  source_reference: string | null;
  updated_at: string | null;
};

type StageLike = {
  id: number;
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  combustivel_inicio: number | null;
  combustivel_fim: number | null;
  unidade_combustivel: string | null;
  updated_at: string | null;
};

type FuelLike = {
  id: number;
  etapa_id: number | null;
  fornecedor: string | null;
  localidade: string | null;
  combustivel_solicitado: number | null;
  combustivel_abastecido: number | null;
  unidade: string | null;
  tem_anexo?: boolean;
  updated_at: string | null;
};

type AirportLike = {
  id: number;
  codigo: string | null;
  codigo_icao: string | null;
  codigo_iata: string | null;
  nome: string | null;
  cidade: string | null;
  uf: string | null;
  tipo: string | null;
} | null;

type AircraftLike = {
  id: number;
  modelo: string | null;
} | null;

type RdvLike = {
  id: number;
  numero: string;
  versao: number;
  updated_at: string | null;
} | null;

type FlightLike = {
  id: number;
  prefixo: string;
  data_programacao: string;
  horario_previsto_partida: string;
  horario_previsto_chegada: string;
  status: string;
  observacoes: string | null;
  versao: number;
  updated_at: string | null;
};

export type PilotOfflineWorkspace = {
  contract: {
    name: 'airtrust-pilot-workspace';
    version: 1;
    generated_at: string;
    navigation_certified: false;
    regulated_edb: false;
  };
  planning: Record<string, unknown>;
  locations: Array<Record<string, unknown>>;
  route_schematic: Record<string, unknown>;
  helideck_safety: Record<string, unknown>;
  met_snapshot: Record<string, unknown>;
  dossier: Record<string, unknown>;
};

const EARTH_RADIUS_NM = 3440.065;

function normalizeCode(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  return code || null;
}

function finiteCoordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function haversineNm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function airportCode(airport: AirportLike): string | null {
  return normalizeCode(airport?.codigo_icao || airport?.codigo || airport?.codigo_iata);
}

function routeCodes(
  stages: StageLike[],
  origem: AirportLike,
  destino: AirportLike,
): string[] {
  const codes: string[] = [];
  for (const stage of stages) {
    const origin = normalizeCode(stage.origem_icao);
    const destination = normalizeCode(stage.destino_icao);
    if (origin) codes.push(origin);
    if (destination) codes.push(destination);
  }
  if (codes.length === 0) {
    const origin = airportCode(origem);
    const destination = airportCode(destino);
    if (origin) codes.push(origin);
    if (destination) codes.push(destination);
  }
  return [...new Set(codes)];
}

function publicLocation(row: LocationCatalogRow) {
  return {
    code: normalizeCode(row.location_code),
    name: row.name,
    operational_class: row.operational_class,
    timezone_iana: row.timezone_iana,
    weather_source_kind: row.weather_source_kind,
    redemet_station_icao: normalizeCode(row.redemet_station_icao),
    latitude: finiteCoordinate(row.latitude),
    longitude: finiteCoordinate(row.longitude),
    source_reference: row.source_reference,
    updated_at: row.updated_at,
  };
}

async function loadLocationCatalog(db: D1Database, empresaId: number): Promise<{
  available: boolean;
  rows: LocationCatalogRow[];
  reason: string | null;
}> {
  try {
    const result = await db
      .prepare(
        `SELECT
           location_code, operational_class, name, timezone_iana,
           weather_source_kind, redemet_station_icao, latitude, longitude,
           source_reference, updated_at
         FROM frms_location_catalog
         WHERE empresa_id = ?
           AND active = 1
           AND deleted_at IS NULL
         ORDER BY location_code ASC`,
      )
      .bind(empresaId)
      .all<LocationCatalogRow>();
    return { available: true, rows: result.results || [], reason: null };
  } catch {
    return {
      available: false,
      rows: [],
      reason: 'LOCATION_CATALOG_UNAVAILABLE',
    };
  }
}

function buildRouteSchematic(
  stages: StageLike[],
  origem: AirportLike,
  destino: AirportLike,
  catalog: LocationCatalogRow[],
) {
  const byCode = new Map(
    catalog
      .map((row) => [normalizeCode(row.location_code), row] as const)
      .filter((entry): entry is [string, LocationCatalogRow] => Boolean(entry[0])),
  );
  const rawLegs =
    stages.length > 0
      ? stages.map((stage) => ({
          id: stage.id,
          sequence: stage.numero_etapa,
          from: normalizeCode(stage.origem_icao),
          to: normalizeCode(stage.destino_icao),
        }))
      : [
          {
            id: 0,
            sequence: 1,
            from: airportCode(origem),
            to: airportCode(destino),
          },
        ];

  const legs = rawLegs.map((leg) => {
    const fromRow = leg.from ? byCode.get(leg.from) : undefined;
    const toRow = leg.to ? byCode.get(leg.to) : undefined;
    const fromLat = finiteCoordinate(fromRow?.latitude);
    const fromLon = finiteCoordinate(fromRow?.longitude);
    const toLat = finiteCoordinate(toRow?.latitude);
    const toLon = finiteCoordinate(toRow?.longitude);
    const distanceNm =
      fromLat != null && fromLon != null && toLat != null && toLon != null
        ? round(
            haversineNm(
              { latitude: fromLat, longitude: fromLon },
              { latitude: toLat, longitude: toLon },
            ),
          )
        : null;

    return {
      id: leg.id,
      sequence: leg.sequence,
      from: leg.from,
      to: leg.to,
      distance_nm: distanceNm,
      from_coordinates:
        fromLat != null && fromLon != null
          ? { latitude: fromLat, longitude: fromLon }
          : null,
      to_coordinates:
        toLat != null && toLon != null
          ? { latitude: toLat, longitude: toLon }
          : null,
      data_quality:
        fromLat != null && fromLon != null && toLat != null && toLon != null
          ? 'COMPLETE'
          : 'PARTIAL',
    };
  });

  return {
    version: 1,
    navigation_certified: false,
    disclaimer:
      'Esquema de rota para consciência situacional. Não substitui navegação ou aviônicos certificados.',
    legs,
  };
}

function buildHelideckSafety(
  destinationCode: string | null,
  catalog: LocationCatalogRow[],
) {
  const destination = catalog.find(
    (row) => normalizeCode(row.location_code) === destinationCode,
  );
  const latitude = finiteCoordinate(destination?.latitude);
  const longitude = finiteCoordinate(destination?.longitude);
  if (!destinationCode || latitude == null || longitude == null) {
    return {
      status: 'UNAVAILABLE',
      destination_code: destinationCode,
      reason: 'DESTINATION_COORDINATES_UNAVAILABLE',
      nearby: [],
      navigation_certified: false,
    };
  }

  const nearby = catalog
    .filter((row) => {
      const code = normalizeCode(row.location_code);
      return (
        code &&
        code !== destinationCode &&
        ['HELIDECK', 'PLATFORM'].includes(String(row.operational_class || '').toUpperCase()) &&
        finiteCoordinate(row.latitude) != null &&
        finiteCoordinate(row.longitude) != null
      );
    })
    .map((row) => ({
      code: normalizeCode(row.location_code),
      name: row.name,
      operational_class: row.operational_class,
      distance_nm: round(
        haversineNm(
          { latitude, longitude },
          {
            latitude: finiteCoordinate(row.latitude)!,
            longitude: finiteCoordinate(row.longitude)!,
          },
        ),
      ),
      latitude: finiteCoordinate(row.latitude),
      longitude: finiteCoordinate(row.longitude),
      source_reference: row.source_reference,
    }))
    .sort((left, right) => left.distance_nm - right.distance_nm)
    .slice(0, 5);

  return {
    status: 'AVAILABLE',
    destination_code: destinationCode,
    destination_name: destination?.name ?? null,
    destination_coordinates: { latitude, longitude },
    nearby,
    navigation_certified: false,
    disclaimer:
      'Apoio à conferência de identificação do destino. Não substitui procedimento operacional nem navegação certificada.',
  };
}

function unavailableWeatherObservation(
  code: string,
  stationIcao: string | null,
  reason: string,
) {
  return {
    code,
    station_icao: stationIcao,
    status: 'UNAVAILABLE',
    quality: 'UNAVAILABLE',
    reason,
  };
}

async function buildMetSnapshot(options: {
  catalogAvailable: boolean;
  catalog: LocationCatalogRow[];
  codes: string[];
  generatedAt: string;
  redemetApiKey?: string;
}) {
  const locations = options.codes.map((code) => {
    const row = options.catalog.find(
      (item) => normalizeCode(item.location_code) === code,
    );
    return { code, row };
  });

  if (!options.catalogAvailable) {
    return {
      status: 'UNAVAILABLE',
      generated_at: options.generatedAt,
      reason: 'LOCATION_CATALOG_UNAVAILABLE',
      observations: locations.map(({ code }) =>
        unavailableWeatherObservation(code, null, 'LOCATION_CATALOG_UNAVAILABLE'),
      ),
    };
  }

  if (!options.redemetApiKey?.trim()) {
    return {
      status: 'UNAVAILABLE',
      generated_at: options.generatedAt,
      reason: 'REDEMET_NOT_CONFIGURED',
      observations: locations.map(({ code, row }) =>
        unavailableWeatherObservation(
          code,
          normalizeCode(row?.redemet_station_icao),
          'REDEMET_NOT_CONFIGURED',
        ),
      ),
    };
  }

  const stations = [
    ...new Set(
      locations
        .filter(({ row }) => row?.weather_source_kind === 'REDEMET')
        .map(({ row }) => normalizeCode(row?.redemet_station_icao))
        .filter((station): station is string => Boolean(station)),
    ),
  ];

  if (stations.length === 0) {
    return {
      status: 'UNAVAILABLE',
      generated_at: options.generatedAt,
      reason: 'NO_REDEMET_STATIONS',
      observations: locations.map(({ code, row }) =>
        unavailableWeatherObservation(
          code,
          normalizeCode(row?.redemet_station_icao),
          row ? 'WEATHER_SOURCE_NOT_REDEMET' : 'LOCATION_NOT_CATALOGUED',
        ),
      ),
    };
  }

  const eventAt = new Date(options.generatedAt);
  const fromUtc = new Date(eventAt.getTime() - 180 * 60_000);
  const toUtc = new Date(eventAt.getTime() + 5 * 60_000);
  let rows: RedemetMetarRow[];
  try {
    rows = await new RedemetClient({
      apiKey: options.redemetApiKey,
    }).fetchMetarRows(stations, { fromUtc, toUtc });
  } catch {
    return {
      status: 'UNAVAILABLE',
      generated_at: options.generatedAt,
      reason: 'REDEMET_FETCH_FAILED',
      observations: locations.map(({ code, row }) =>
        unavailableWeatherObservation(
          code,
          normalizeCode(row?.redemet_station_icao),
          'REDEMET_FETCH_FAILED',
        ),
      ),
    };
  }

  const observations = locations.map(({ code, row }) => {
    if (!row) {
      return unavailableWeatherObservation(code, null, 'LOCATION_NOT_CATALOGUED');
    }
    if (row.weather_source_kind !== 'REDEMET') {
      return unavailableWeatherObservation(
        code,
        normalizeCode(row.redemet_station_icao),
        'WEATHER_SOURCE_NOT_REDEMET',
      );
    }
    const stationIcao = normalizeCode(row.redemet_station_icao);
    if (!stationIcao) {
      return unavailableWeatherObservation(code, null, 'REDEMET_STATION_UNAVAILABLE');
    }
    const selected = selectMetarObservation(rows, stationIcao, eventAt, {
      mode: 'LATEST_AT_OR_BEFORE',
      maxAgeMinutes: 180,
    });
    if (!selected) {
      return unavailableWeatherObservation(
        code,
        stationIcao,
        'SEM_OBSERVACAO_COMPATIVEL',
      );
    }
    return {
      code,
      station_icao: stationIcao,
      status: 'AVAILABLE',
      quality: selected.quality,
      observed_at_utc: selected.observedAtUtc,
      received_at_utc: selected.receivedAtUtc,
      age_minutes: selected.ageMinutes,
      metar_kind: selected.metarKind,
      raw_metar: selected.rawMetar,
      temperature_c: selected.temperatureC,
      dew_point_c: selected.dewPointC,
      relative_humidity_pct: selected.relativeHumidityPct,
      wind_speed_kt: selected.windSpeedKt,
      source: selected.source,
    };
  });

  return {
    status: observations.some((entry) => entry.status === 'AVAILABLE')
      ? 'AVAILABLE'
      : 'UNAVAILABLE',
    generated_at: options.generatedAt,
    reason: null,
    observations,
  };
}

export async function buildPilotOfflineWorkspace(options: {
  db: D1Database;
  empresaId: number;
  generatedAt: string;
  redemetApiKey?: string;
  voo: FlightLike;
  origem: AirportLike;
  destino: AirportLike;
  alternado: AirportLike;
  aeronave: AircraftLike;
  tripulantes: unknown[];
  etapas: StageLike[];
  abastecimentos: FuelLike[];
  rdv: RdvLike;
}): Promise<PilotOfflineWorkspace> {
  const catalogResult = await loadLocationCatalog(options.db, options.empresaId);
  const codes = routeCodes(options.etapas, options.origem, options.destino);
  const destinationCode = codes[codes.length - 1] || airportCode(options.destino);
  const relevantLocations = catalogResult.rows.filter((row) =>
    codes.includes(normalizeCode(row.location_code) || ''),
  );
  const metSnapshot = await buildMetSnapshot({
    catalogAvailable: catalogResult.available,
    catalog: catalogResult.rows,
    codes,
    generatedAt: options.generatedAt,
    redemetApiKey: options.redemetApiKey,
  });
  const attachmentCount = options.abastecimentos.filter(
    (entry) => entry.tem_anexo,
  ).length;

  return {
    contract: {
      name: 'airtrust-pilot-workspace',
      version: 1,
      generated_at: options.generatedAt,
      navigation_certified: false,
      regulated_edb: false,
    },
    planning: {
      flight_id: options.voo.id,
      prefixo: options.voo.prefixo,
      data_programacao: options.voo.data_programacao,
      status: options.voo.status,
      origem: options.origem,
      destino: options.destino,
      alternado: options.alternado,
      aeronave: options.aeronave,
      horario_previsto_partida: options.voo.horario_previsto_partida,
      horario_previsto_chegada: options.voo.horario_previsto_chegada,
      observacoes: options.voo.observacoes,
      crew_count: options.tripulantes.length,
      stage_count: options.etapas.length,
      flight_version: options.voo.versao,
    },
    locations: relevantLocations.map(publicLocation),
    route_schematic: buildRouteSchematic(
      options.etapas,
      options.origem,
      options.destino,
      catalogResult.rows,
    ),
    helideck_safety: buildHelideckSafety(
      destinationCode,
      catalogResult.rows,
    ),
    met_snapshot: metSnapshot,
    dossier: {
      version: 1,
      entries: [
        {
          id: `planning:${options.voo.id}`,
          name: 'Resumo do planejamento',
          category: 'planejamento',
          source: 'AIRTRUST',
          updated_at: options.voo.updated_at,
          available_offline: true,
          integrity_state: 'EMBEDDED_IN_PACKAGE',
          version: `flight-v${options.voo.versao}`,
        },
        {
          id: `met:${options.voo.id}`,
          name: 'Snapshot meteorológico',
          category: 'MET',
          source: 'DECEA_REDEMET',
          updated_at: options.generatedAt,
          available_offline: true,
          integrity_state: 'EMBEDDED_IN_PACKAGE',
          version: 'met-snapshot-v1',
          evidence_status: (metSnapshot as { status?: string }).status ?? 'UNAVAILABLE',
        },
        {
          id: `fuel:${options.voo.id}`,
          name: 'Abastecimentos',
          category: 'abastecimento',
          source: 'AIRTRUST',
          updated_at:
            options.abastecimentos
              .map((entry) => entry.updated_at)
              .filter(Boolean)
              .sort()
              .at(-1) ?? null,
          available_offline: true,
          integrity_state: 'METADATA_EMBEDDED',
          version: 'fuel-metadata-v1',
          attachment_count: attachmentCount,
          attachment_payloads_offline: false,
        },
        ...(options.rdv
          ? [
              {
                id: `rdv:${options.voo.id}`,
                name: 'RDV operacional',
                category: 'coordenacao',
                source: 'AIRTRUST',
                updated_at: options.rdv.updated_at,
                available_offline: true,
                integrity_state: 'EMBEDDED_IN_PACKAGE',
                version: `rdv-v${options.rdv.versao}`,
              },
            ]
          : []),
      ],
    },
  };
}
