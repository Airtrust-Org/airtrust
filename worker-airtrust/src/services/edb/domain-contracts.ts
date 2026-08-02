import { z } from 'zod';

/**
 * Non-official eDB draft contracts.
 *
 * These schemas intentionally do not model signatures, hashes, official status,
 * persistence or ANAC authorization. They are safe input/output contracts for
 * shadow-mode projection and completeness analysis only.
 */

export const EDB_DRAFT_SCHEMA_VERSION = 'edb.draft.v1' as const;

export const edbDraftStatusSchema = z.enum(['shadow_draft', 'ready_for_pic_review']);

export type EdbDraftStatus = z.infer<typeof edbDraftStatusSchema>;

export const edbCrewFunctionSchema = z.enum([
  'P1',
  'P2',
  'I1',
  'I2',
  'O1',
  'O2',
  'O3',
  'V1',
  'V2',
  'V3',
  'C',
  'M',
  'X',
  'D',
]);

export type EdbCrewFunction = z.infer<typeof edbCrewFunctionSchema>;

export const edbFieldSourceKindSchema = z.enum([
  'AIRTRUST_MANUAL',
  'AIRTRUST_CONTROL_FLIGHTS',
  'SIGVOOS',
  'MAINTENANCE_SYSTEM',
  'UNKNOWN',
]);

export const edbFieldSourceSchema = z
  .object({
    kind: edbFieldSourceKindSchema,
    reference: z.string().trim().min(1).max(128).optional(),
    observedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const nullableTrimmedText = (max: number) => z.string().trim().min(1).max(max).nullable();

const clockTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'invalid local clock time')
  .nullable();

const operationalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid operational date');

const locationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{2,12}$/, 'invalid location code')
  .nullable();

const nonNegativeInteger = z.number().int().nonnegative().nullable();
const nonNegativeNumber = z.number().finite().nonnegative().nullable();
const nonNegativeMinutes = z.number().int().nonnegative().nullable();

export const edbOperatorSnapshotSchema = z
  .object({
    legalName: nullableTrimmedText(200),
    legalIdentifier: nullableTrimmedText(32),
    operatingCertificate: nullableTrimmedText(64),
  })
  .strict();

export const edbOwnerSnapshotSchema = z
  .object({
    legalName: nullableTrimmedText(200),
    legalIdentifier: nullableTrimmedText(32),
  })
  .strict();

export const edbAircraftSnapshotSchema = z
  .object({
    manufacturer: nullableTrimmedText(120),
    model: nullableTrimmedText(120),
    serialNumber: nullableTrimmedText(80),
    registration: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,16}$/, 'invalid aircraft registration')
      .nullable(),
  })
  .strict();

export const edbCrewMemberSchema = z
  .object({
    personReference: z.string().trim().min(1).max(128),
    displayName: nullableTrimmedText(200),
    canac: z
      .string()
      .trim()
      .regex(/^\d{1,10}$/, 'invalid CANAC')
      .nullable(),
    function: edbCrewFunctionSchema.nullable(),
    reportTime: clockTimeSchema,
    contractualBase: nullableTrimmedText(80),
    source: edbFieldSourceSchema,
  })
  .strict();

export const edbFuelQuantitySchema = z
  .object({
    value: nonNegativeNumber,
    unit: z.enum(['KG', 'LB', 'L']).nullable(),
    source: edbFieldSourceSchema,
  })
  .strict();

export const edbFlightTimeBreakdownSchema = z
  .object({
    blockMinutes: nonNegativeMinutes,
    takeoffToLandingMinutes: nonNegativeMinutes,
    dayMinutes: nonNegativeMinutes,
    nightMinutes: nonNegativeMinutes,
    vfrMinutes: nonNegativeMinutes,
    ifrActualMinutes: nonNegativeMinutes,
    ifrSimulatedMinutes: nonNegativeMinutes,
  })
  .strict();

export const edbLegSchema = z
  .object({
    sequence: z.number().int().positive(),
    operationalDate: operationalDateSchema,
    origin: locationCodeSchema,
    destination: locationCodeSchema,
    timezone: nullableTrimmedText(80),
    engineStartTime: clockTimeSchema,
    takeoffTime: clockTimeSchema,
    landingTime: clockTimeSchema,
    engineShutdownTime: clockTimeSchema,
    times: edbFlightTimeBreakdownSchema,
    dayLandings: nonNegativeInteger,
    nightLandings: nonNegativeInteger,
    cycles: nonNegativeInteger,
    fuelAtEngineStart: edbFuelQuantitySchema,
    fuelAtEngineShutdown: edbFuelQuantitySchema,
    fuelConsumed: edbFuelQuantitySchema,
    fuelAdded: edbFuelQuantitySchema,
    personsOnBoard: nonNegativeInteger,
    payload: nonNegativeNumber,
    payloadUnit: z.enum(['KG', 'LB']).nullable(),
    flightNatureCode: nullableTrimmedText(64),
    crew: z.array(edbCrewMemberSchema),
    occurrenceSummary: nullableTrimmedText(4000),
    technicalDiscrepancySummary: nullableTrimmedText(4000),
    source: edbFieldSourceSchema,
  })
  .strict();

export const edbTechnicalStatusSchema = z
  .object({
    lastMaintenanceIntervention: nullableTrimmedText(2000),
    nextMaintenanceIntervention: nullableTrimmedText(2000),
    airframeHoursRemaining: nonNegativeNumber,
    returnToServiceReference: nullableTrimmedText(160),
    openDiscrepancyCount: nonNegativeInteger,
    source: edbFieldSourceSchema,
  })
  .strict();

export const edbDraftSchema = z
  .object({
    schemaVersion: z.literal(EDB_DRAFT_SCHEMA_VERSION),
    draftId: z.string().uuid(),
    tenantId: z.number().int().positive(),
    status: edbDraftStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
    sourceFlightReference: z.string().trim().min(1).max(128),
    operator: edbOperatorSnapshotSchema,
    owner: edbOwnerSnapshotSchema,
    aircraft: edbAircraftSnapshotSchema,
    volumeNumber: nullableTrimmedText(32),
    legs: z.array(edbLegSchema),
    technicalStatus: edbTechnicalStatusSchema,
  })
  .strict();

export type EdbDraft = z.infer<typeof edbDraftSchema>;

export type EdbDraftCompletenessCode =
  | 'OPERATOR_LEGAL_NAME_REQUIRED'
  | 'OPERATOR_LEGAL_IDENTIFIER_REQUIRED'
  | 'OWNER_LEGAL_NAME_REQUIRED'
  | 'OWNER_LEGAL_IDENTIFIER_REQUIRED'
  | 'AIRCRAFT_MANUFACTURER_REQUIRED'
  | 'AIRCRAFT_MODEL_REQUIRED'
  | 'AIRCRAFT_SERIAL_NUMBER_REQUIRED'
  | 'AIRCRAFT_REGISTRATION_REQUIRED'
  | 'VOLUME_NUMBER_REQUIRED'
  | 'LEGS_REQUIRED'
  | 'LEG_ORIGIN_REQUIRED'
  | 'LEG_DESTINATION_REQUIRED'
  | 'LEG_TIMEZONE_REQUIRED'
  | 'LEG_ENGINE_START_REQUIRED'
  | 'LEG_TAKEOFF_REQUIRED'
  | 'LEG_LANDING_REQUIRED'
  | 'LEG_ENGINE_SHUTDOWN_REQUIRED'
  | 'LEG_BLOCK_MINUTES_REQUIRED'
  | 'LEG_FLIGHT_MINUTES_REQUIRED'
  | 'LEG_DAY_MINUTES_REQUIRED'
  | 'LEG_NIGHT_MINUTES_REQUIRED'
  | 'LEG_VFR_MINUTES_REQUIRED'
  | 'LEG_IFR_ACTUAL_MINUTES_REQUIRED'
  | 'LEG_IFR_SIMULATED_MINUTES_REQUIRED'
  | 'LEG_DAY_LANDINGS_REQUIRED'
  | 'LEG_NIGHT_LANDINGS_REQUIRED'
  | 'LEG_CYCLES_REQUIRED'
  | 'LEG_PIC_REQUIRED'
  | 'LEG_CREW_NAME_REQUIRED'
  | 'LEG_CANAC_REQUIRED'
  | 'LEG_CREW_FUNCTION_REQUIRED'
  | 'LEG_CREW_REPORT_TIME_REQUIRED'
  | 'LEG_CREW_BASE_REQUIRED'
  | 'LEG_FUEL_START_REQUIRED'
  | 'LEG_FUEL_SHUTDOWN_REQUIRED'
  | 'LEG_FUEL_CONSUMED_REQUIRED'
  | 'LEG_FUEL_ADDED_REQUIRED'
  | 'LEG_FUEL_UNIT_REQUIRED'
  | 'LEG_POB_REQUIRED'
  | 'LEG_PAYLOAD_REQUIRED'
  | 'LEG_PAYLOAD_UNIT_REQUIRED'
  | 'LEG_NATURE_REQUIRED'
  | 'TECHNICAL_LAST_INTERVENTION_REQUIRED'
  | 'TECHNICAL_NEXT_INTERVENTION_REQUIRED'
  | 'TECHNICAL_AIRFRAME_HOURS_REQUIRED'
  | 'TECHNICAL_RETURN_TO_SERVICE_REQUIRED'
  | 'TECHNICAL_OPEN_DISCREPANCY_COUNT_REQUIRED';

export interface EdbDraftCompletenessFinding {
  code: EdbDraftCompletenessCode;
  path: string;
}

function addFinding(
  findings: EdbDraftCompletenessFinding[],
  code: EdbDraftCompletenessCode,
  path: string,
): void {
  findings.push({ code, path });
}

/**
 * Reports missing regulatory data without including field values or personal data.
 */
export function validateEdbDraftCompleteness(draft: EdbDraft): EdbDraftCompletenessFinding[] {
  const findings: EdbDraftCompletenessFinding[] = [];

  if (!draft.operator.legalName) {
    addFinding(findings, 'OPERATOR_LEGAL_NAME_REQUIRED', 'operator.legalName');
  }
  if (!draft.operator.legalIdentifier) {
    addFinding(findings, 'OPERATOR_LEGAL_IDENTIFIER_REQUIRED', 'operator.legalIdentifier');
  }
  if (!draft.owner.legalName) {
    addFinding(findings, 'OWNER_LEGAL_NAME_REQUIRED', 'owner.legalName');
  }
  if (!draft.owner.legalIdentifier) {
    addFinding(findings, 'OWNER_LEGAL_IDENTIFIER_REQUIRED', 'owner.legalIdentifier');
  }
  if (!draft.aircraft.manufacturer) {
    addFinding(findings, 'AIRCRAFT_MANUFACTURER_REQUIRED', 'aircraft.manufacturer');
  }
  if (!draft.aircraft.model) {
    addFinding(findings, 'AIRCRAFT_MODEL_REQUIRED', 'aircraft.model');
  }
  if (!draft.aircraft.serialNumber) {
    addFinding(findings, 'AIRCRAFT_SERIAL_NUMBER_REQUIRED', 'aircraft.serialNumber');
  }
  if (!draft.aircraft.registration) {
    addFinding(findings, 'AIRCRAFT_REGISTRATION_REQUIRED', 'aircraft.registration');
  }
  if (!draft.volumeNumber) {
    addFinding(findings, 'VOLUME_NUMBER_REQUIRED', 'volumeNumber');
  }
  if (draft.legs.length === 0) {
    addFinding(findings, 'LEGS_REQUIRED', 'legs');
  }

  for (const [index, leg] of draft.legs.entries()) {
    const legPath = `legs.${index}`;

    if (!leg.origin) {
      addFinding(findings, 'LEG_ORIGIN_REQUIRED', `${legPath}.origin`);
    }
    if (!leg.destination) {
      addFinding(findings, 'LEG_DESTINATION_REQUIRED', `${legPath}.destination`);
    }
    if (!leg.timezone) {
      addFinding(findings, 'LEG_TIMEZONE_REQUIRED', `${legPath}.timezone`);
    }
    if (!leg.engineStartTime) {
      addFinding(findings, 'LEG_ENGINE_START_REQUIRED', `${legPath}.engineStartTime`);
    }
    if (!leg.takeoffTime) {
      addFinding(findings, 'LEG_TAKEOFF_REQUIRED', `${legPath}.takeoffTime`);
    }
    if (!leg.landingTime) {
      addFinding(findings, 'LEG_LANDING_REQUIRED', `${legPath}.landingTime`);
    }
    if (!leg.engineShutdownTime) {
      addFinding(findings, 'LEG_ENGINE_SHUTDOWN_REQUIRED', `${legPath}.engineShutdownTime`);
    }

    if (leg.times.blockMinutes === null) {
      addFinding(findings, 'LEG_BLOCK_MINUTES_REQUIRED', `${legPath}.times.blockMinutes`);
    }
    if (leg.times.takeoffToLandingMinutes === null) {
      addFinding(
        findings,
        'LEG_FLIGHT_MINUTES_REQUIRED',
        `${legPath}.times.takeoffToLandingMinutes`,
      );
    }
    if (leg.times.dayMinutes === null) {
      addFinding(findings, 'LEG_DAY_MINUTES_REQUIRED', `${legPath}.times.dayMinutes`);
    }
    if (leg.times.nightMinutes === null) {
      addFinding(findings, 'LEG_NIGHT_MINUTES_REQUIRED', `${legPath}.times.nightMinutes`);
    }
    if (leg.times.vfrMinutes === null) {
      addFinding(findings, 'LEG_VFR_MINUTES_REQUIRED', `${legPath}.times.vfrMinutes`);
    }
    if (leg.times.ifrActualMinutes === null) {
      addFinding(findings, 'LEG_IFR_ACTUAL_MINUTES_REQUIRED', `${legPath}.times.ifrActualMinutes`);
    }
    if (leg.times.ifrSimulatedMinutes === null) {
      addFinding(
        findings,
        'LEG_IFR_SIMULATED_MINUTES_REQUIRED',
        `${legPath}.times.ifrSimulatedMinutes`,
      );
    }
    if (leg.dayLandings === null) {
      addFinding(findings, 'LEG_DAY_LANDINGS_REQUIRED', `${legPath}.dayLandings`);
    }
    if (leg.nightLandings === null) {
      addFinding(findings, 'LEG_NIGHT_LANDINGS_REQUIRED', `${legPath}.nightLandings`);
    }
    if (leg.cycles === null) {
      addFinding(findings, 'LEG_CYCLES_REQUIRED', `${legPath}.cycles`);
    }

    const pic = leg.crew.find((member) => member.function === 'P1');
    if (!pic) {
      addFinding(findings, 'LEG_PIC_REQUIRED', `${legPath}.crew`);
    }

    for (const [crewIndex, member] of leg.crew.entries()) {
      const crewPath = `${legPath}.crew.${crewIndex}`;

      if (!member.displayName) {
        addFinding(findings, 'LEG_CREW_NAME_REQUIRED', `${crewPath}.displayName`);
      }
      if (!member.canac) {
        addFinding(findings, 'LEG_CANAC_REQUIRED', `${crewPath}.canac`);
      }
      if (!member.function) {
        addFinding(findings, 'LEG_CREW_FUNCTION_REQUIRED', `${crewPath}.function`);
      }
      if (!member.reportTime) {
        addFinding(findings, 'LEG_CREW_REPORT_TIME_REQUIRED', `${crewPath}.reportTime`);
      }
      if (!member.contractualBase) {
        addFinding(findings, 'LEG_CREW_BASE_REQUIRED', `${crewPath}.contractualBase`);
      }
    }

    if (leg.fuelAtEngineStart.value === null) {
      addFinding(findings, 'LEG_FUEL_START_REQUIRED', `${legPath}.fuelAtEngineStart.value`);
    }
    if (leg.fuelAtEngineShutdown.value === null) {
      addFinding(findings, 'LEG_FUEL_SHUTDOWN_REQUIRED', `${legPath}.fuelAtEngineShutdown.value`);
    }
    if (leg.fuelConsumed.value === null) {
      addFinding(findings, 'LEG_FUEL_CONSUMED_REQUIRED', `${legPath}.fuelConsumed.value`);
    }
    if (leg.fuelAdded.value === null) {
      addFinding(findings, 'LEG_FUEL_ADDED_REQUIRED', `${legPath}.fuelAdded.value`);
    }
    if (!leg.fuelAtEngineStart.unit) {
      addFinding(findings, 'LEG_FUEL_UNIT_REQUIRED', `${legPath}.fuelAtEngineStart.unit`);
    }
    if (!leg.fuelAtEngineShutdown.unit) {
      addFinding(findings, 'LEG_FUEL_UNIT_REQUIRED', `${legPath}.fuelAtEngineShutdown.unit`);
    }
    if (!leg.fuelConsumed.unit) {
      addFinding(findings, 'LEG_FUEL_UNIT_REQUIRED', `${legPath}.fuelConsumed.unit`);
    }
    if (!leg.fuelAdded.unit) {
      addFinding(findings, 'LEG_FUEL_UNIT_REQUIRED', `${legPath}.fuelAdded.unit`);
    }
    if (leg.personsOnBoard === null) {
      addFinding(findings, 'LEG_POB_REQUIRED', `${legPath}.personsOnBoard`);
    }
    if (leg.payload === null) {
      addFinding(findings, 'LEG_PAYLOAD_REQUIRED', `${legPath}.payload`);
    }
    if (!leg.payloadUnit) {
      addFinding(findings, 'LEG_PAYLOAD_UNIT_REQUIRED', `${legPath}.payloadUnit`);
    }
    if (!leg.flightNatureCode) {
      addFinding(findings, 'LEG_NATURE_REQUIRED', `${legPath}.flightNatureCode`);
    }
  }

  if (!draft.technicalStatus.lastMaintenanceIntervention) {
    addFinding(
      findings,
      'TECHNICAL_LAST_INTERVENTION_REQUIRED',
      'technicalStatus.lastMaintenanceIntervention',
    );
  }
  if (!draft.technicalStatus.nextMaintenanceIntervention) {
    addFinding(
      findings,
      'TECHNICAL_NEXT_INTERVENTION_REQUIRED',
      'technicalStatus.nextMaintenanceIntervention',
    );
  }
  if (draft.technicalStatus.airframeHoursRemaining === null) {
    addFinding(
      findings,
      'TECHNICAL_AIRFRAME_HOURS_REQUIRED',
      'technicalStatus.airframeHoursRemaining',
    );
  }
  if (!draft.technicalStatus.returnToServiceReference) {
    addFinding(
      findings,
      'TECHNICAL_RETURN_TO_SERVICE_REQUIRED',
      'technicalStatus.returnToServiceReference',
    );
  }
  if (draft.technicalStatus.openDiscrepancyCount === null) {
    addFinding(
      findings,
      'TECHNICAL_OPEN_DISCREPANCY_COUNT_REQUIRED',
      'technicalStatus.openDiscrepancyCount',
    );
  }

  return findings;
}

/**
 * Parses and deep-clones the input into the non-official draft contract.
 */
export function createEdbDraftSnapshot(input: unknown): EdbDraft {
  return edbDraftSchema.parse(input);
}
