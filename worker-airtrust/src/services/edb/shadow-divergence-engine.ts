import {
  validateEdbDraftCompleteness,
  type EdbDraft,
  type EdbDraftCompletenessFinding,
} from './domain-contracts';

export const EDB_SHADOW_DIVERGENCE_SCHEMA_VERSION = 'edb.shadow-divergence.v1' as const;

export const EDB_SHADOW_DIVERGENCE_CATEGORIES = [
  'FIELD_MISSING',
  'VALUE_MISMATCH',
  'UNIT_MISMATCH',
  'TIMEZONE_MISMATCH',
  'CREW_UNRESOLVED',
  'LEG_MISSING',
  'LEG_EXTRA',
  'ROLE_UNMAPPED',
  'PROVENANCE_CONFLICT',
  'TECHNICAL_STATUS_MISMATCH',
  'TENANT_SCOPE_ERROR',
  'POSSIBLE_CRITICAL_DIVERGENCE',
  'UNKNOWN_FIELD',
] as const;

export type EdbShadowDivergenceCategory = (typeof EDB_SHADOW_DIVERGENCE_CATEGORIES)[number];

export const EDB_SHADOW_SEVERITIES = ['OBSERVATION', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type EdbShadowSeverity = (typeof EDB_SHADOW_SEVERITIES)[number];

export const EDB_SHADOW_CAUSE_CODES = [
  'SOURCE_MISSING',
  'SOURCE_CONFLICT',
  'MAPPING_ERROR',
  'TIMEZONE_ERROR',
  'UNIT_ERROR',
  'IDENTITY_ERROR',
  'TENANT_SCOPE_ERROR',
  'TECHNICAL_STATUS_STALE',
  'OFFLINE_PACKAGE_ERROR',
  'SYNC_ERROR',
  'USER_WORKFLOW_ERROR',
  'MANUAL_PROCEDURE_GAP',
  'TRAINING_GAP',
  'REGULATORY_DECISION_PENDING',
] as const;

export type EdbShadowCauseCode = (typeof EDB_SHADOW_CAUSE_CODES)[number];

export interface EdbShadowSanitizedFinding {
  code: string;
  path: string;
}

export interface EdbShadowDivergenceInput {
  expectedTenantId: number;
  draft: EdbDraft;
  reference: EdbDraft;
  projectionFindings?: readonly EdbShadowSanitizedFinding[];
}

export interface EdbShadowDivergenceFinding {
  category: EdbShadowDivergenceCategory;
  severity: EdbShadowSeverity;
  causeCode: EdbShadowCauseCode;
  field: string;
}

export interface EdbShadowReadinessIndicator {
  score: number;
  status: 'ready' | 'review' | 'not_ready';
  fieldAgreementPercent: number;
  completenessPercent: number;
}

export interface EdbShadowDivergenceResult {
  schemaVersion: typeof EDB_SHADOW_DIVERGENCE_SCHEMA_VERSION;
  caseResult: 'matched' | 'divergent' | 'interrupted';
  recommendation: 'continue' | 'review' | 'stop';
  maxSeverity: 'NONE' | EdbShadowSeverity;
  findings: EdbShadowDivergenceFinding[];
  countsByCategory: Record<EdbShadowDivergenceCategory, number>;
  countsBySeverity: Record<EdbShadowSeverity, number>;
  causeCodes: EdbShadowCauseCode[];
  affectedFields: string[];
  metrics: {
    comparisonFieldCount: number;
    matchingFieldCount: number;
    divergenceCount: number;
    completenessFindingCount: number;
    projectionFindingCount: number;
    unknownFieldCount: number;
  };
  readiness: EdbShadowReadinessIndicator;
  evidence: {
    fingerprint: string;
  };
}

type Scalar = string | number | boolean | null | undefined;
type FindingDraft = EdbShadowDivergenceFinding;

interface ComparisonState {
  findings: FindingDraft[];
  comparisonFieldCount: number;
  matchingFieldCount: number;
  completenessFindingCount: number;
  projectionFindingCount: number;
  unknownFieldCount: number;
}

const severityRank: Record<EdbShadowSeverity, number> = {
  OBSERVATION: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const SAFE_PATH_SEGMENT = /^(?:[A-Za-z][A-Za-z0-9_-]{0,47}|\d{1,6})$/;

const allowedDraftKeys = new Set([
  'schemaVersion',
  'draftId',
  'tenantId',
  'status',
  'createdAt',
  'sourceFlightReference',
  'operator',
  'owner',
  'aircraft',
  'volumeNumber',
  'legs',
  'technicalStatus',
]);
const allowedOperatorKeys = new Set(['legalName', 'legalIdentifier', 'operatingCertificate']);
const allowedOwnerKeys = new Set(['legalName', 'legalIdentifier']);
const allowedAircraftKeys = new Set(['manufacturer', 'model', 'serialNumber', 'registration']);
const allowedLegKeys = new Set([
  'sequence',
  'operationalDate',
  'origin',
  'destination',
  'timezone',
  'engineStartTime',
  'takeoffTime',
  'landingTime',
  'engineShutdownTime',
  'times',
  'dayLandings',
  'nightLandings',
  'cycles',
  'fuelAtEngineStart',
  'fuelAtEngineShutdown',
  'fuelConsumed',
  'fuelAdded',
  'personsOnBoard',
  'payload',
  'payloadUnit',
  'flightNatureCode',
  'crew',
  'occurrenceSummary',
  'technicalDiscrepancySummary',
  'source',
]);
const allowedTimesKeys = new Set([
  'blockMinutes',
  'takeoffToLandingMinutes',
  'dayMinutes',
  'nightMinutes',
  'vfrMinutes',
  'ifrActualMinutes',
  'ifrSimulatedMinutes',
]);
const allowedFuelKeys = new Set(['value', 'unit', 'source']);
const allowedCrewKeys = new Set([
  'personReference',
  'displayName',
  'canac',
  'function',
  'reportTime',
  'contractualBase',
  'source',
]);
const allowedSourceKeys = new Set(['kind', 'reference', 'observedAt']);
const allowedTechnicalKeys = new Set([
  'lastMaintenanceIntervention',
  'nextMaintenanceIntervention',
  'airframeHoursRemaining',
  'returnToServiceReference',
  'openDiscrepancyCount',
  'source',
]);

function sanitizeFieldPath(path: string): string {
  const segments = path.split('.');
  if (
    path.length === 0 ||
    path.length > 180 ||
    segments.length > 16 ||
    segments.some((segment) => !SAFE_PATH_SEGMENT.test(segment))
  ) {
    return 'unknown_fields';
  }
  return segments.join('.');
}

function addFinding(state: ComparisonState, finding: FindingDraft): void {
  state.findings.push({
    ...finding,
    field: sanitizeFieldPath(finding.field),
  });
}

function isMissing(value: Scalar): boolean {
  return (
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
  );
}

function normalizeScalar(path: string, value: Scalar): Scalar {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    path.endsWith('.registration') ||
    path.endsWith('.origin') ||
    path.endsWith('.destination') ||
    path.endsWith('.unit') ||
    path.endsWith('.payloadUnit') ||
    path.endsWith('.function')
  ) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

function scalarEqual(path: string, left: Scalar, right: Scalar): boolean {
  return Object.is(normalizeScalar(path, left), normalizeScalar(path, right));
}

function defaultSeverityForPath(path: string): EdbShadowSeverity {
  if (path === 'aircraft.registration') return 'CRITICAL';
  if (path.startsWith('technicalStatus.')) return 'CRITICAL';
  if (
    path.includes('.engineStartTime') ||
    path.includes('.takeoffTime') ||
    path.includes('.landingTime') ||
    path.includes('.engineShutdownTime') ||
    path.includes('.crew.') ||
    path.endsWith('.origin') ||
    path.endsWith('.destination') ||
    path.endsWith('.personsOnBoard')
  ) {
    return 'HIGH';
  }
  if (
    path.includes('.times.') ||
    path.includes('.fuel') ||
    path.endsWith('.payload') ||
    path.endsWith('.payloadUnit') ||
    path.endsWith('.cycles') ||
    path.endsWith('.dayLandings') ||
    path.endsWith('.nightLandings')
  ) {
    return 'MEDIUM';
  }
  return 'HIGH';
}

function compareScalar(
  state: ComparisonState,
  path: string,
  draftValue: Scalar,
  referenceValue: Scalar,
  options?: {
    category?: EdbShadowDivergenceCategory;
    severity?: EdbShadowSeverity;
    causeCode?: EdbShadowCauseCode;
  },
): void {
  state.comparisonFieldCount += 1;

  if (scalarEqual(path, draftValue, referenceValue)) {
    state.matchingFieldCount += 1;
    return;
  }

  const draftMissing = isMissing(draftValue);
  const referenceMissing = isMissing(referenceValue);
  const severity = options?.severity ?? defaultSeverityForPath(path);

  if (draftMissing || referenceMissing) {
    addFinding(state, {
      category: 'FIELD_MISSING',
      severity,
      causeCode: 'SOURCE_MISSING',
      field: path,
    });
    return;
  }

  addFinding(state, {
    category: options?.category ?? 'VALUE_MISMATCH',
    severity,
    causeCode: options?.causeCode ?? 'MAPPING_ERROR',
    field: path,
  });
}

function compareProvenance(
  state: ComparisonState,
  path: string,
  draftKind: string,
  referenceKind: string,
): void {
  state.comparisonFieldCount += 1;
  if (draftKind === referenceKind && draftKind !== 'UNKNOWN') {
    state.matchingFieldCount += 1;
    return;
  }

  addFinding(state, {
    category: 'PROVENANCE_CONFLICT',
    severity: 'MEDIUM',
    causeCode: 'SOURCE_CONFLICT',
    field: path,
  });
}

function inspectUnknownKeys(value: unknown, allowedKeys: ReadonlySet<string>): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.keys(value).filter((key) => !allowedKeys.has(key)).length;
}

function countUnknownFields(draft: EdbDraft): number {
  let count = inspectUnknownKeys(draft, allowedDraftKeys);
  count += inspectUnknownKeys(draft.operator, allowedOperatorKeys);
  count += inspectUnknownKeys(draft.owner, allowedOwnerKeys);
  count += inspectUnknownKeys(draft.aircraft, allowedAircraftKeys);
  count += inspectUnknownKeys(draft.technicalStatus, allowedTechnicalKeys);
  count += inspectUnknownKeys(draft.technicalStatus.source, allowedSourceKeys);

  for (const leg of draft.legs) {
    count += inspectUnknownKeys(leg, allowedLegKeys);
    count += inspectUnknownKeys(leg.times, allowedTimesKeys);
    count += inspectUnknownKeys(leg.source, allowedSourceKeys);
    for (const fuel of [
      leg.fuelAtEngineStart,
      leg.fuelAtEngineShutdown,
      leg.fuelConsumed,
      leg.fuelAdded,
    ]) {
      count += inspectUnknownKeys(fuel, allowedFuelKeys);
      count += inspectUnknownKeys(fuel.source, allowedSourceKeys);
    }
    for (const member of leg.crew) {
      count += inspectUnknownKeys(member, allowedCrewKeys);
      count += inspectUnknownKeys(member.source, allowedSourceKeys);
    }
  }

  return count;
}

function severityForCompletenessFinding(finding: EdbDraftCompletenessFinding): EdbShadowSeverity {
  if (
    finding.code === 'AIRCRAFT_REGISTRATION_REQUIRED' ||
    finding.code === 'TECHNICAL_RETURN_TO_SERVICE_REQUIRED' ||
    finding.code === 'TECHNICAL_OPEN_DISCREPANCY_COUNT_REQUIRED'
  ) {
    return 'CRITICAL';
  }
  if (
    finding.code.startsWith('LEG_DAY_') ||
    finding.code.startsWith('LEG_NIGHT_') ||
    finding.code.startsWith('LEG_IFR_') ||
    finding.code === 'LEG_VFR_MINUTES_REQUIRED' ||
    finding.code === 'LEG_CYCLES_REQUIRED' ||
    finding.code === 'LEG_FUEL_UNIT_REQUIRED' ||
    finding.code === 'LEG_PAYLOAD_UNIT_REQUIRED'
  ) {
    return 'MEDIUM';
  }
  return 'HIGH';
}

function addCompletenessFindings(
  state: ComparisonState,
  findings: readonly EdbDraftCompletenessFinding[],
): void {
  state.completenessFindingCount += findings.length;
  for (const finding of findings) {
    addFinding(state, {
      category: 'FIELD_MISSING',
      severity: severityForCompletenessFinding(finding),
      causeCode: 'SOURCE_MISSING',
      field: finding.path,
    });
  }
}

function addProjectionFindings(
  state: ComparisonState,
  findings: readonly EdbShadowSanitizedFinding[],
): void {
  state.projectionFindingCount += findings.length;

  for (const finding of findings) {
    switch (finding.code) {
      case 'CREW_ROLE_UNMAPPED':
        addFinding(state, {
          category: 'ROLE_UNMAPPED',
          severity: 'MEDIUM',
          causeCode: 'MAPPING_ERROR',
          field: finding.path,
        });
        break;
      case 'CREW_LEG_NOT_FOUND':
      case 'CREW_WITHOUT_LEG':
        addFinding(state, {
          category: 'CREW_UNRESOLVED',
          severity: 'HIGH',
          causeCode: 'IDENTITY_ERROR',
          field: finding.path,
        });
        break;
      case 'FUEL_UNIT_UNKNOWN':
      case 'PAYLOAD_UNIT_UNKNOWN':
        addFinding(state, {
          category: 'UNIT_MISMATCH',
          severity: 'MEDIUM',
          causeCode: 'UNIT_ERROR',
          field: finding.path,
        });
        break;
      case 'TIMEZONE_REQUIRED':
        addFinding(state, {
          category: 'FIELD_MISSING',
          severity: 'HIGH',
          causeCode: 'TIMEZONE_ERROR',
          field: finding.path,
        });
        break;
      case 'SOURCE_CONFLICT_OPEN':
        addFinding(state, {
          category: 'PROVENANCE_CONFLICT',
          severity: 'HIGH',
          causeCode: 'SOURCE_CONFLICT',
          field: finding.path,
        });
        break;
      case 'DURATION_INVALID':
      case 'FUEL_CONSUMPTION_UNAVAILABLE':
      case 'CYCLES_SEMANTICS_UNCONFIRMED':
      case 'IFR_CLASSIFICATION_REQUIRED':
      case 'TECHNICAL_DISCREPANCY_SOURCE_REQUIRED':
        addFinding(state, {
          category: 'FIELD_MISSING',
          severity: 'HIGH',
          causeCode: 'SOURCE_MISSING',
          field: finding.path,
        });
        break;
      default:
        addFinding(state, {
          category: 'UNKNOWN_FIELD',
          severity: 'LOW',
          causeCode: 'MAPPING_ERROR',
          field: 'projection_findings',
        });
    }
  }
}

const SAFE_CREW_ROLES = new Set([
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

function crewRoleToken(value: string | null): string {
  return value && SAFE_CREW_ROLES.has(value) ? value : 'UNMAPPED';
}

function compareCrew(
  state: ComparisonState,
  legPath: string,
  draftCrew: EdbDraft['legs'][number]['crew'],
  referenceCrew: EdbDraft['legs'][number]['crew'],
): void {
  const roleKeys = new Set([
    ...draftCrew.map((member) => crewRoleToken(member.function)),
    ...referenceCrew.map((member) => crewRoleToken(member.function)),
  ]);

  for (const role of [...roleKeys].sort()) {
    const draftMembers = draftCrew
      .filter((member) => crewRoleToken(member.function) === role)
      .sort((left, right) =>
        `${left.displayName ?? ''}\u0000${left.canac ?? ''}`.localeCompare(
          `${right.displayName ?? ''}\u0000${right.canac ?? ''}`,
        ),
      );
    const referenceMembers = referenceCrew
      .filter((member) => crewRoleToken(member.function) === role)
      .sort((left, right) =>
        `${left.displayName ?? ''}\u0000${left.canac ?? ''}`.localeCompare(
          `${right.displayName ?? ''}\u0000${right.canac ?? ''}`,
        ),
      );
    const rolePath = `${legPath}.crew.${role}`;

    compareScalar(state, `${rolePath}.count`, draftMembers.length, referenceMembers.length, {
      category: 'CREW_UNRESOLVED',
      severity: 'HIGH',
      causeCode: 'IDENTITY_ERROR',
    });

    const memberCount = Math.min(draftMembers.length, referenceMembers.length);
    for (let index = 0; index < memberCount; index += 1) {
      const draftMember = draftMembers[index];
      const referenceMember = referenceMembers[index];
      const memberPath = `${rolePath}.${index}`;
      compareScalar(
        state,
        `${memberPath}.displayName`,
        draftMember.displayName,
        referenceMember.displayName,
        { severity: 'HIGH', causeCode: 'IDENTITY_ERROR' },
      );
      compareScalar(state, `${memberPath}.canac`, draftMember.canac, referenceMember.canac, {
        severity: 'HIGH',
        causeCode: 'IDENTITY_ERROR',
      });
      compareScalar(
        state,
        `${memberPath}.function`,
        draftMember.function,
        referenceMember.function,
        { severity: 'HIGH', causeCode: 'IDENTITY_ERROR' },
      );
      compareScalar(
        state,
        `${memberPath}.reportTime`,
        draftMember.reportTime,
        referenceMember.reportTime,
        { severity: 'MEDIUM', causeCode: 'MAPPING_ERROR' },
      );
      compareScalar(
        state,
        `${memberPath}.contractualBase`,
        draftMember.contractualBase,
        referenceMember.contractualBase,
        { severity: 'MEDIUM', causeCode: 'MAPPING_ERROR' },
      );
      compareProvenance(
        state,
        `${memberPath}.source.kind`,
        draftMember.source.kind,
        referenceMember.source.kind,
      );
    }
  }
}

function compareFuel(
  state: ComparisonState,
  path: string,
  draftFuel: EdbDraft['legs'][number]['fuelAtEngineStart'],
  referenceFuel: EdbDraft['legs'][number]['fuelAtEngineStart'],
): void {
  compareScalar(state, `${path}.value`, draftFuel.value, referenceFuel.value, {
    severity: 'MEDIUM',
  });
  compareScalar(state, `${path}.unit`, draftFuel.unit, referenceFuel.unit, {
    category: 'UNIT_MISMATCH',
    severity: 'MEDIUM',
    causeCode: 'UNIT_ERROR',
  });
  compareProvenance(state, `${path}.source.kind`, draftFuel.source.kind, referenceFuel.source.kind);
}

function compareLeg(
  state: ComparisonState,
  draftLeg: EdbDraft['legs'][number],
  referenceLeg: EdbDraft['legs'][number],
): void {
  const legPath = `legs.${referenceLeg.sequence}`;
  compareScalar(
    state,
    `${legPath}.operationalDate`,
    draftLeg.operationalDate,
    referenceLeg.operationalDate,
  );
  compareScalar(state, `${legPath}.origin`, draftLeg.origin, referenceLeg.origin);
  compareScalar(state, `${legPath}.destination`, draftLeg.destination, referenceLeg.destination);
  compareScalar(state, `${legPath}.timezone`, draftLeg.timezone, referenceLeg.timezone, {
    category: 'TIMEZONE_MISMATCH',
    severity: 'HIGH',
    causeCode: 'TIMEZONE_ERROR',
  });
  compareScalar(
    state,
    `${legPath}.engineStartTime`,
    draftLeg.engineStartTime,
    referenceLeg.engineStartTime,
  );
  compareScalar(state, `${legPath}.takeoffTime`, draftLeg.takeoffTime, referenceLeg.takeoffTime);
  compareScalar(state, `${legPath}.landingTime`, draftLeg.landingTime, referenceLeg.landingTime);
  compareScalar(
    state,
    `${legPath}.engineShutdownTime`,
    draftLeg.engineShutdownTime,
    referenceLeg.engineShutdownTime,
  );

  for (const key of [
    'blockMinutes',
    'takeoffToLandingMinutes',
    'dayMinutes',
    'nightMinutes',
    'vfrMinutes',
    'ifrActualMinutes',
    'ifrSimulatedMinutes',
  ] as const) {
    compareScalar(state, `${legPath}.times.${key}`, draftLeg.times[key], referenceLeg.times[key], {
      severity: 'MEDIUM',
    });
  }

  compareScalar(state, `${legPath}.dayLandings`, draftLeg.dayLandings, referenceLeg.dayLandings, {
    severity: 'MEDIUM',
  });
  compareScalar(
    state,
    `${legPath}.nightLandings`,
    draftLeg.nightLandings,
    referenceLeg.nightLandings,
    { severity: 'MEDIUM' },
  );
  compareScalar(state, `${legPath}.cycles`, draftLeg.cycles, referenceLeg.cycles, {
    severity: 'MEDIUM',
  });
  compareFuel(
    state,
    `${legPath}.fuelAtEngineStart`,
    draftLeg.fuelAtEngineStart,
    referenceLeg.fuelAtEngineStart,
  );
  compareFuel(
    state,
    `${legPath}.fuelAtEngineShutdown`,
    draftLeg.fuelAtEngineShutdown,
    referenceLeg.fuelAtEngineShutdown,
  );
  compareFuel(state, `${legPath}.fuelConsumed`, draftLeg.fuelConsumed, referenceLeg.fuelConsumed);
  compareFuel(state, `${legPath}.fuelAdded`, draftLeg.fuelAdded, referenceLeg.fuelAdded);
  compareScalar(
    state,
    `${legPath}.personsOnBoard`,
    draftLeg.personsOnBoard,
    referenceLeg.personsOnBoard,
    { severity: 'HIGH' },
  );
  compareScalar(state, `${legPath}.payload`, draftLeg.payload, referenceLeg.payload, {
    severity: 'MEDIUM',
  });
  compareScalar(state, `${legPath}.payloadUnit`, draftLeg.payloadUnit, referenceLeg.payloadUnit, {
    category: 'UNIT_MISMATCH',
    severity: 'MEDIUM',
    causeCode: 'UNIT_ERROR',
  });
  compareScalar(
    state,
    `${legPath}.flightNatureCode`,
    draftLeg.flightNatureCode,
    referenceLeg.flightNatureCode,
  );
  compareScalar(
    state,
    `${legPath}.occurrenceSummary`,
    draftLeg.occurrenceSummary,
    referenceLeg.occurrenceSummary,
    { severity: 'HIGH' },
  );
  compareScalar(
    state,
    `${legPath}.technicalDiscrepancySummary`,
    draftLeg.technicalDiscrepancySummary,
    referenceLeg.technicalDiscrepancySummary,
    {
      category: 'TECHNICAL_STATUS_MISMATCH',
      severity: 'CRITICAL',
      causeCode: 'TECHNICAL_STATUS_STALE',
    },
  );
  compareProvenance(
    state,
    `${legPath}.source.kind`,
    draftLeg.source.kind,
    referenceLeg.source.kind,
  );
  compareCrew(state, legPath, draftLeg.crew, referenceLeg.crew);
}

function compareTechnicalStatus(
  state: ComparisonState,
  draft: EdbDraft['technicalStatus'],
  reference: EdbDraft['technicalStatus'],
): void {
  for (const key of [
    'lastMaintenanceIntervention',
    'nextMaintenanceIntervention',
    'airframeHoursRemaining',
    'returnToServiceReference',
    'openDiscrepancyCount',
  ] as const) {
    compareScalar(state, `technicalStatus.${key}`, draft[key], reference[key], {
      category: 'TECHNICAL_STATUS_MISMATCH',
      severity: 'CRITICAL',
      causeCode: 'TECHNICAL_STATUS_STALE',
    });
  }
  compareProvenance(state, 'technicalStatus.source.kind', draft.source.kind, reference.source.kind);
}

function compareDrafts(state: ComparisonState, draft: EdbDraft, reference: EdbDraft): void {
  compareScalar(state, 'schemaVersion', draft.schemaVersion, reference.schemaVersion, {
    severity: 'HIGH',
  });
  for (const key of ['legalName', 'legalIdentifier', 'operatingCertificate'] as const) {
    compareScalar(state, `operator.${key}`, draft.operator[key], reference.operator[key]);
  }
  for (const key of ['legalName', 'legalIdentifier'] as const) {
    compareScalar(state, `owner.${key}`, draft.owner[key], reference.owner[key]);
  }
  for (const key of ['manufacturer', 'model', 'serialNumber'] as const) {
    compareScalar(state, `aircraft.${key}`, draft.aircraft[key], reference.aircraft[key]);
  }
  compareScalar(
    state,
    'aircraft.registration',
    draft.aircraft.registration,
    reference.aircraft.registration,
    {
      category: 'POSSIBLE_CRITICAL_DIVERGENCE',
      severity: 'CRITICAL',
      causeCode: 'MAPPING_ERROR',
    },
  );
  compareScalar(state, 'volumeNumber', draft.volumeNumber, reference.volumeNumber);

  const draftLegs = new Map(draft.legs.map((leg) => [leg.sequence, leg]));
  const referenceLegs = new Map(reference.legs.map((leg) => [leg.sequence, leg]));
  const sequences = [...new Set([...draftLegs.keys(), ...referenceLegs.keys()])].sort(
    (left, right) => left - right,
  );

  for (const sequence of sequences) {
    const draftLeg = draftLegs.get(sequence);
    const referenceLeg = referenceLegs.get(sequence);
    if (!draftLeg) {
      addFinding(state, {
        category: 'LEG_MISSING',
        severity: 'HIGH',
        causeCode: 'SOURCE_MISSING',
        field: `legs.${sequence}`,
      });
      continue;
    }
    if (!referenceLeg) {
      addFinding(state, {
        category: 'LEG_EXTRA',
        severity: 'HIGH',
        causeCode: 'MAPPING_ERROR',
        field: `legs.${sequence}`,
      });
      continue;
    }
    compareLeg(state, draftLeg, referenceLeg);
  }

  compareTechnicalStatus(state, draft.technicalStatus, reference.technicalStatus);
}

function deduplicateAndSortFindings(
  findings: readonly FindingDraft[],
): EdbShadowDivergenceFinding[] {
  const unique = new Map<string, EdbShadowDivergenceFinding>();
  for (const finding of findings) {
    const key = `${finding.category}\u0000${finding.severity}\u0000${finding.causeCode}\u0000${finding.field}`;
    unique.set(key, finding);
  }
  return [...unique.values()].sort((left, right) => {
    const fieldOrder = left.field.localeCompare(right.field);
    if (fieldOrder !== 0) return fieldOrder;
    const severityOrder = severityRank[right.severity] - severityRank[left.severity];
    if (severityOrder !== 0) return severityOrder;
    const categoryOrder = left.category.localeCompare(right.category);
    if (categoryOrder !== 0) return categoryOrder;
    return left.causeCode.localeCompare(right.causeCode);
  });
}

function createZeroCounts<T extends readonly string[]>(keys: T): Record<T[number], number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T[number], number>;
}

function maxSeverity(findings: readonly EdbShadowDivergenceFinding[]): 'NONE' | EdbShadowSeverity {
  if (findings.length === 0) return 'NONE';
  return findings.reduce<EdbShadowSeverity>(
    (maximum, finding) =>
      severityRank[finding.severity] > severityRank[maximum] ? finding.severity : maximum,
    'OBSERVATION',
  );
}

function calculateReadiness(
  fieldCount: number,
  matchingFieldCount: number,
  completenessFindingCount: number,
  maximumSeverity: 'NONE' | EdbShadowSeverity,
): EdbShadowReadinessIndicator {
  const safeFieldCount = Math.max(1, fieldCount);
  const fieldAgreementPercent = Math.round((matchingFieldCount / safeFieldCount) * 100);
  const completenessPercent = Math.max(
    0,
    Math.round(((safeFieldCount - completenessFindingCount) / safeFieldCount) * 100),
  );
  let score = Math.round(fieldAgreementPercent * 0.7 + completenessPercent * 0.3);

  if (maximumSeverity === 'CRITICAL') score = 0;
  else if (maximumSeverity === 'HIGH') score = Math.min(score, 59);
  else if (maximumSeverity === 'MEDIUM') score = Math.min(score, 79);
  else if (maximumSeverity === 'LOW') score = Math.min(score, 94);

  const status =
    maximumSeverity === 'CRITICAL' || maximumSeverity === 'HIGH'
      ? 'not_ready'
      : maximumSeverity === 'MEDIUM' || maximumSeverity === 'LOW'
        ? 'review'
        : 'ready';

  return { score, status, fieldAgreementPercent, completenessPercent };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildResult(state: ComparisonState): EdbShadowDivergenceResult {
  const findings = deduplicateAndSortFindings(state.findings);
  const countsByCategory = createZeroCounts(EDB_SHADOW_DIVERGENCE_CATEGORIES);
  const countsBySeverity = createZeroCounts(EDB_SHADOW_SEVERITIES);
  for (const finding of findings) {
    countsByCategory[finding.category] += 1;
    countsBySeverity[finding.severity] += 1;
  }

  const maximumSeverity = maxSeverity(findings);
  const recommendation: EdbShadowDivergenceResult['recommendation'] =
    maximumSeverity === 'CRITICAL'
      ? 'stop'
      : maximumSeverity === 'HIGH' || maximumSeverity === 'MEDIUM'
        ? 'review'
        : 'continue';
  const caseResult: EdbShadowDivergenceResult['caseResult'] =
    maximumSeverity === 'CRITICAL'
      ? 'interrupted'
      : findings.length === 0
        ? 'matched'
        : 'divergent';
  const readiness = calculateReadiness(
    state.comparisonFieldCount,
    state.matchingFieldCount,
    state.completenessFindingCount,
    maximumSeverity,
  );
  const causeCodes = [...new Set(findings.map((finding) => finding.causeCode))].sort();
  const affectedFields = [...new Set(findings.map((finding) => finding.field))].sort();
  const metrics = {
    comparisonFieldCount: state.comparisonFieldCount,
    matchingFieldCount: state.matchingFieldCount,
    divergenceCount: findings.length,
    completenessFindingCount: state.completenessFindingCount,
    projectionFindingCount: state.projectionFindingCount,
    unknownFieldCount: state.unknownFieldCount,
  };

  const sanitizedEvidence = {
    schemaVersion: EDB_SHADOW_DIVERGENCE_SCHEMA_VERSION,
    caseResult,
    recommendation,
    maxSeverity: maximumSeverity,
    findings,
    countsByCategory,
    countsBySeverity,
    causeCodes,
    affectedFields,
    metrics,
    readiness,
  };

  return {
    ...sanitizedEvidence,
    evidence: {
      fingerprint: `fnv1a32:${fnv1a32(stableStringify(sanitizedEvidence))}`,
    },
  };
}

function emptyState(): ComparisonState {
  return {
    findings: [],
    comparisonFieldCount: 0,
    matchingFieldCount: 0,
    completenessFindingCount: 0,
    projectionFindingCount: 0,
    unknownFieldCount: 0,
  };
}

/**
 * Pure, deterministic comparison for non-official shadow mode.
 *
 * The returned structure contains only sanitized codes, paths and aggregate metrics. It never
 * returns compared values, identities, free text, operational payloads or source references.
 */
export function evaluateEdbShadowDivergence(
  input: EdbShadowDivergenceInput,
): EdbShadowDivergenceResult {
  const state = emptyState();

  if (
    input.draft.tenantId !== input.expectedTenantId ||
    input.reference.tenantId !== input.expectedTenantId ||
    input.draft.tenantId !== input.reference.tenantId
  ) {
    addFinding(state, {
      category: 'TENANT_SCOPE_ERROR',
      severity: 'CRITICAL',
      causeCode: 'TENANT_SCOPE_ERROR',
      field: 'tenant_scope',
    });
    return buildResult(state);
  }

  state.unknownFieldCount = countUnknownFields(input.draft) + countUnknownFields(input.reference);
  for (let index = 0; index < state.unknownFieldCount; index += 1) {
    addFinding(state, {
      category: 'UNKNOWN_FIELD',
      severity: 'LOW',
      causeCode: 'MAPPING_ERROR',
      field: `unknown_fields.${index}`,
    });
  }

  compareDrafts(state, input.draft, input.reference);
  addCompletenessFindings(state, validateEdbDraftCompleteness(input.draft));
  addProjectionFindings(state, input.projectionFindings ?? []);

  return buildResult(state);
}
