import { describe, expect, it } from 'vitest';
import {
  EDB_DRAFT_SCHEMA_VERSION,
  createEdbDraftSnapshot,
  edbCrewFunctionSchema,
  edbDraftSchema,
  validateEdbDraftCompleteness,
} from '../../services/edb/domain-contracts';

function buildValidDraft(): Record<string, unknown> {
  const source = {
    kind: 'AIRTRUST_CONTROL_FLIGHTS',
    reference: 'synthetic-flight-reference',
    observedAt: '2026-08-02T02:00:00-03:00',
  };

  const fuel = {
    value: 850,
    unit: 'KG',
    source,
  };

  return {
    schemaVersion: EDB_DRAFT_SCHEMA_VERSION,
    draftId: '00000000-0000-4000-8000-000000000001',
    tenantId: 7,
    status: 'shadow_draft',
    createdAt: '2026-08-02T02:00:00-03:00',
    sourceFlightReference: 'synthetic-flight-reference',
    operator: {
      legalName: 'Synthetic Operator',
      legalIdentifier: '00000000000000',
      operatingCertificate: 'COA-SYNTHETIC',
    },
    owner: {
      legalName: 'Synthetic Owner',
      legalIdentifier: '11111111111111',
    },
    aircraft: {
      manufacturer: 'Synthetic Manufacturer',
      model: 'SYNTHETIC-MODEL',
      serialNumber: 'SERIAL-0001',
      registration: 'PR-TST',
    },
    volumeNumber: '01/PR-TST/2026',
    legs: [
      {
        sequence: 1,
        operationalDate: '2026-08-02',
        origin: 'SBXX',
        destination: 'PLAT-01',
        timezone: 'America/Sao_Paulo',
        engineStartTime: '08:00',
        takeoffTime: '08:10',
        landingTime: '09:00',
        engineShutdownTime: '09:10',
        times: {
          blockMinutes: 70,
          takeoffToLandingMinutes: 50,
          dayMinutes: 50,
          nightMinutes: 0,
          vfrMinutes: 20,
          ifrActualMinutes: 30,
          ifrSimulatedMinutes: 0,
        },
        dayLandings: 1,
        nightLandings: 0,
        cycles: 1,
        fuelAtEngineStart: fuel,
        fuelAtEngineShutdown: {
          ...fuel,
          value: 610,
        },
        fuelConsumed: {
          ...fuel,
          value: 240,
        },
        fuelAdded: {
          ...fuel,
          value: 0,
        },
        personsOnBoard: 8,
        payload: 520,
        payloadUnit: 'KG',
        flightNatureCode: 'TRANSPORTE',
        crew: [
          {
            personReference: 'synthetic-pic-reference',
            displayName: 'Synthetic PIC',
            canac: '123456',
            function: 'P1',
            reportTime: '07:20',
            contractualBase: 'SBXX',
            source,
          },
          {
            personReference: 'synthetic-sic-reference',
            displayName: 'Synthetic SIC',
            canac: '654321',
            function: 'P2',
            reportTime: '07:20',
            contractualBase: 'SBXX',
            source,
          },
        ],
        occurrenceSummary: null,
        technicalDiscrepancySummary: null,
        source,
      },
    ],
    technicalStatus: {
      lastMaintenanceIntervention: 'Synthetic inspection completed',
      nextMaintenanceIntervention: 'Synthetic inspection due',
      airframeHoursRemaining: 42.5,
      returnToServiceReference: 'RTS-SYNTHETIC-001',
      openDiscrepancyCount: 0,
      source: {
        kind: 'MAINTENANCE_SYSTEM',
        reference: 'synthetic-maintenance-reference',
        observedAt: '2026-08-02T01:00:00-03:00',
      },
    },
  };
}

describe('eDB non-official shadow draft contracts', () => {
  it('accepts a complete synthetic draft and reports no completeness findings', () => {
    const draft = createEdbDraftSnapshot(buildValidDraft());

    expect(draft.status).toBe('shadow_draft');
    expect(validateEdbDraftCompleteness(draft)).toEqual([]);
  });

  it('deep-clones input so later source mutations do not change the snapshot', () => {
    const input = buildValidDraft();
    const draft = createEdbDraftSnapshot(input);

    (input.operator as Record<string, unknown>).legalName = 'Changed later';
    const legs = input.legs as Array<Record<string, unknown>>;
    const crew = legs[0].crew as Array<Record<string, unknown>>;
    crew[0].displayName = 'Changed later';

    expect(draft.operator.legalName).toBe('Synthetic Operator');
    expect(draft.legs[0].crew[0].displayName).toBe('Synthetic PIC');
  });

  it('rejects any attempt to introduce an official status', () => {
    const input = buildValidDraft();
    input.status = 'official';

    expect(edbDraftSchema.safeParse(input).success).toBe(false);
  });

  it('accepts only the versioned crew function codes in the shadow contract', () => {
    expect(edbCrewFunctionSchema.safeParse('P1').success).toBe(true);
    expect(edbCrewFunctionSchema.safeParse('D').success).toBe(true);
    expect(edbCrewFunctionSchema.safeParse('PIC').success).toBe(false);
    expect(edbCrewFunctionSchema.safeParse('ADMIN').success).toBe(false);
  });

  it('reports missing fields without exposing values or personal data', () => {
    const input = buildValidDraft();
    const leg = (input.legs as Array<Record<string, unknown>>)[0];
    const crew = leg.crew as Array<Record<string, unknown>>;

    input.volumeNumber = null;
    leg.origin = null;
    leg.engineStartTime = null;
    leg.personsOnBoard = null;
    crew[0].displayName = 'Sensitive Person Name';
    crew[0].canac = null;

    const findings = validateEdbDraftCompleteness(createEdbDraftSnapshot(input));
    const serialized = JSON.stringify(findings);

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'VOLUME_NUMBER_REQUIRED',
        'LEG_ORIGIN_REQUIRED',
        'LEG_ENGINE_START_REQUIRED',
        'LEG_POB_REQUIRED',
        'LEG_CANAC_REQUIRED',
      ]),
    );
    expect(serialized).not.toContain('Sensitive Person Name');
    expect(serialized).not.toContain('123456');
  });

  it('reports detailed regulatory gaps using only codes and paths', () => {
    const input = buildValidDraft();
    const owner = input.owner as Record<string, unknown>;
    const leg = (input.legs as Array<Record<string, unknown>>)[0];
    const times = leg.times as Record<string, unknown>;
    const crew = leg.crew as Array<Record<string, unknown>>;
    const fuelStart = leg.fuelAtEngineStart as Record<string, unknown>;
    const fuelShutdown = leg.fuelAtEngineShutdown as Record<string, unknown>;
    const fuelConsumed = leg.fuelConsumed as Record<string, unknown>;
    const fuelAdded = leg.fuelAdded as Record<string, unknown>;
    const technicalStatus = input.technicalStatus as Record<string, unknown>;

    owner.legalIdentifier = null;
    times.dayMinutes = null;
    times.vfrMinutes = null;
    leg.dayLandings = null;
    leg.cycles = null;
    crew[1].displayName = null;
    crew[1].function = null;
    crew[1].reportTime = null;
    crew[1].contractualBase = null;
    fuelStart.value = null;
    fuelShutdown.value = null;
    fuelConsumed.value = null;
    fuelAdded.value = null;
    fuelAdded.unit = null;
    leg.payload = null;
    leg.payloadUnit = null;
    technicalStatus.openDiscrepancyCount = null;

    const findings = validateEdbDraftCompleteness(createEdbDraftSnapshot(input));
    const serialized = JSON.stringify(findings);

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'OWNER_LEGAL_IDENTIFIER_REQUIRED',
        'LEG_DAY_MINUTES_REQUIRED',
        'LEG_VFR_MINUTES_REQUIRED',
        'LEG_DAY_LANDINGS_REQUIRED',
        'LEG_CYCLES_REQUIRED',
        'LEG_CREW_NAME_REQUIRED',
        'LEG_CREW_FUNCTION_REQUIRED',
        'LEG_CREW_REPORT_TIME_REQUIRED',
        'LEG_CREW_BASE_REQUIRED',
        'LEG_FUEL_START_REQUIRED',
        'LEG_FUEL_SHUTDOWN_REQUIRED',
        'LEG_FUEL_CONSUMED_REQUIRED',
        'LEG_FUEL_ADDED_REQUIRED',
        'LEG_FUEL_UNIT_REQUIRED',
        'LEG_PAYLOAD_REQUIRED',
        'LEG_PAYLOAD_UNIT_REQUIRED',
        'TECHNICAL_OPEN_DISCREPANCY_COUNT_REQUIRED',
      ]),
    );
    expect(serialized).not.toContain('Synthetic SIC');
    expect(serialized).not.toContain('11111111111111');
  });

  it('rejects negative operational counters and non-finite values', () => {
    const negative = buildValidDraft();
    const negativeLeg = (negative.legs as Array<Record<string, unknown>>)[0];
    negativeLeg.dayLandings = -1;

    const nonFinite = buildValidDraft();
    const nonFiniteLeg = (nonFinite.legs as Array<Record<string, unknown>>)[0];
    nonFiniteLeg.payload = Number.POSITIVE_INFINITY;

    expect(edbDraftSchema.safeParse(negative).success).toBe(false);
    expect(edbDraftSchema.safeParse(nonFinite).success).toBe(false);
  });

  it('keeps unknown field provenance explicit instead of inventing a source', () => {
    const input = buildValidDraft();
    const leg = (input.legs as Array<Record<string, unknown>>)[0];
    leg.source = { kind: 'UNKNOWN' };

    const draft = createEdbDraftSnapshot(input);

    expect(draft.legs[0].source.kind).toBe('UNKNOWN');
  });
});
