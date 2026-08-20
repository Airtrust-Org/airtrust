import { describe, expect, it, vi } from 'vitest';
import {
  runFrmsIogpShadowPipeline,
  type FrmsIogpShadowRawLeg,
} from '../../lib/frms/frms-iogp-shadow-pipeline';
import type { RedemetClient } from '../../lib/frms/redemet-weather';
import type { FrmsLocationCatalogEntry } from '../../lib/frms/location-catalog';

const CATALOGUE: FrmsLocationCatalogEntry[] = [
  {
    code: 'SBME',
    operationalClass: 'AERODROME',
    timezoneIana: null,
    weatherSourceKind: 'REDEMET',
    redemetStationIcao: 'SBME',
    active: true,
  },
  {
    code: 'PMXX',
    operationalClass: 'HELIDECK',
    timezoneIana: null,
    weatherSourceKind: 'NONE',
    redemetStationIcao: null,
    active: true,
  },
];

function mockRedemetClient(rows: { id_localidade: string; validade_inicial: string; mens: string }[]) {
  const fetchMetarRows = vi.fn().mockResolvedValue(rows);
  return { fetchMetarRows } as unknown as RedemetClient;
}

function buildRawLeg(staffId: string): FrmsIogpShadowRawLeg {
  const raw = {
    staff: { id: staffId },
    flight_report: { id: '99001' },
    flight_report_leg: {
      number: 1,
      departure_location: { icao_code: 'SBME' },
      arrival_location: { icao_code: 'PMXX' },
      takeoff_time_str: '07:06',
      landing_time_str: '07:54',
      day_landings: 1,
      night_landings: 0,
    },
  };
  return {
    data: '2026-04-02',
    horasVooMin: 48,
    departureIcao: 'SBME',
    arrivalIcao: 'PMXX',
    takeoffTime: '07:06',
    landingTime: '07:54',
    dayLandings: 1,
    nightLandings: 0,
    flightReportId: '99001',
    legNumber: 1,
    raw,
  };
}

describe('FRMS IOGP shadow pipeline — end to end', () => {
  it('is a strict no-op when the tenant is not shadow-enabled', async () => {
    const client = mockRedemetClient([]);
    const result = await runFrmsIogpShadowPipeline({
      env: { ENVIRONMENT: 'staging' }, // no FRMS_IOGP_SHADOW_MODE_TENANTS
      tenantId: 6,
      tripulanteId: 1,
      jornadaId: 'j-1',
      dataOperacional: '2026-04-02',
      naturezaDado: 'JORNADA_REALIZADA',
      rawSigvoosLegs: [buildRawLeg('crewA'), buildRawLeg('crewB')],
      locationCatalogue: CATALOGUE,
      tenantOperationalTimezoneIana: 'America/Sao_Paulo',
      redemetClient: client,
      complianceEvaluations: [],
      regulatoryProfileReady: true,
      regulatoryProfileCode: 'ANAC_BASIC',
      regulatoryProfileReference: 'ref',
      biologicalLevel: 'NORMAL',
    });

    expect(result.enabled).toBe(false);
    expect(client.fetchMetarRows).not.toHaveBeenCalled();
  });

  it('produces a full shadow evaluation without touching the canonical decision', async () => {
    const client = mockRedemetClient([
      {
        id_localidade: 'SBME',
        validade_inicial: '2026-04-02 10:00:00',
        mens: 'METAR SBME 021000Z 00000KT 9999 SCT030 29/24 Q1012=',
      },
    ]);

    const result = await runFrmsIogpShadowPipeline({
      env: { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '6' },
      tenantId: 6,
      tripulanteId: 42,
      jornadaId: 'j-99001-1',
      dataOperacional: '2026-04-02',
      naturezaDado: 'JORNADA_REALIZADA',
      rawSigvoosLegs: [buildRawLeg('crewA'), buildRawLeg('crewB')],
      locationCatalogue: CATALOGUE,
      tenantOperationalTimezoneIana: 'America/Sao_Paulo',
      redemetClient: client,
      complianceEvaluations: [{ status: 'COMPLIANT', actualMin: 100, resolved: null }],
      regulatoryProfileReady: true,
      regulatoryProfileCode: 'ANAC_BASIC',
      regulatoryProfileReference: 'MGO accepted by ANAC',
      biologicalLevel: 'NORMAL',
    });

    if (!result.enabled) throw new Error('expected shadow pipeline to be enabled');

    // Single physical leg despite two crew rows.
    expect(result.legContexts).toHaveLength(1);
    expect(result.legContexts[0].departureIcao).toBe('SBME');
    expect(result.legContexts[0].arrivalIcao).toBe('PMXX');

    // Exactly one REDEMET call for the whole evaluation (batched, not per crew member).
    expect(client.fetchMetarRows).toHaveBeenCalledTimes(1);

    const weather = [...result.weatherByLegId.values()][0];
    expect(weather.departure.quality).not.toBe('UNAVAILABLE');
    if (weather.departure.quality === 'UNAVAILABLE') throw new Error('unreachable');
    expect(weather.departure.eventAtUtc).toBe('2026-04-02T10:06:00.000Z');
    expect(weather.departure.observedAtUtc).toBe('2026-04-02T10:00:00.000Z');
    expect(weather.departure.temperatureC).toBe(29);
    expect(weather.departure.dewPointC).toBe(24);
    expect(weather.departure.relativeHumidityPct).not.toBeNull();

    // PMXX has no configured weather source in the catalogue — never proxied from SBME.
    expect(weather.arrival.quality).toBe('UNAVAILABLE');

    // Operational metrics reflect one physical leg, not two crew rows.
    expect(result.snapshot.operational.sectorCount).toBe(1);
    expect(result.snapshot.operational.landingCount).toBe(1);
    expect(result.snapshot.operational.takeoffCount).toBe(1);

    expect(result.snapshot.environmental).toBeDefined();
    expect(result.snapshot.evidence.weatherSource).toBe('MIXED');
    expect(result.orchestration).toBeDefined();
    expect(result.decision).toBeDefined();
    // PMXX weather is UNAVAILABLE, so environmental data quality is PARTIAL —
    // the missing evidence is surfaced as an explicit low-confidence alert
    // rather than silently treated as low risk.
    expect(result.decision.decisao).toBe('ALERTA');
    expect(result.orchestration.alerts).toContain('ENVIRONMENTAL_DATA_LOW_CONFIDENCE');

    // Shadow snapshot is a pure, standalone audit artifact — nothing here
    // mutates or reads the canonical decision-policy module.
    expect(result.snapshot.schemaVersion).toBe(1);
  });

  it('never resolves an UNKNOWN compliance/regulatory state to automatic approval', async () => {
    const client = mockRedemetClient([]);
    const result = await runFrmsIogpShadowPipeline({
      env: { ENVIRONMENT: 'staging', FRMS_IOGP_SHADOW_MODE_TENANTS: '6' },
      tenantId: 6,
      tripulanteId: 42,
      jornadaId: 'j-99001-1',
      dataOperacional: '2026-04-02',
      naturezaDado: 'JORNADA_REALIZADA',
      rawSigvoosLegs: [buildRawLeg('crewA')],
      locationCatalogue: CATALOGUE,
      tenantOperationalTimezoneIana: 'America/Sao_Paulo',
      redemetClient: client,
      complianceEvaluations: [],
      regulatoryProfileReady: false,
      regulatoryProfileCode: null,
      regulatoryProfileReference: null,
      biologicalLevel: 'NORMAL',
    });

    if (!result.enabled) throw new Error('expected shadow pipeline to be enabled');
    expect(result.orchestration.automaticApprovalAllowed).toBe(false);
    expect(result.orchestration.alerts).toContain('PERFIL_REGULATORIO_NAO_CONFIGURADO');
  });
});
