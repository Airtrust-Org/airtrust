import {
  EDB_CONTRACT_VERSION,
  type EdbFlightRecord,
} from './contracts';

const LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  'DRAFT',
  'READY_FOR_PIC_SIGNATURE',
  'PIC_SIGNED',
  'OPERATOR_SIGNED',
  'SUPERSEDED',
  'CANCELLED',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableInteger(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isInteger(value));
}

function isStringArrayOrNull(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isPerson(value: unknown): boolean {
  return (
    isObject(value) &&
    isNullableInteger(value.employeeId) &&
    typeof value.fullName === 'string' &&
    isNullableString(value.anacCode)
  );
}

function isSignatureProofOrNull(value: unknown): boolean {
  if (value === null) return true;
  if (!isObject(value) || !isPerson(value.signer)) return false;
  return (
    typeof value.signatureId === 'string' &&
    (value.type === 'PIC_TECHNICAL_ACK' || value.type === 'PIC_FLIGHT_RECORD' || value.type === 'OPERATOR_RECORD') &&
    (value.targetType === undefined || value.targetType === 'TECHNICAL_SITUATION' || value.targetType === 'FINAL_RECORD_REVISION') &&
    (value.targetId === undefined || typeof value.targetId === 'string') &&
    typeof value.signedAt === 'string' &&
    Number.isFinite(Date.parse(value.signedAt)) &&
    typeof value.canonicalPayloadHashSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.canonicalPayloadHashSha256) &&
    (value.method === 'ASYMMETRIC_DIGITAL_SIGNATURE' || value.method === 'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE') &&
    typeof value.proofReference === 'string'
  );
}

function isAircraft(value: unknown): boolean {
  return (
    isObject(value) &&
    isNullableInteger(value.aircraftId) &&
    isNullableString(value.manufacturer) &&
    isNullableString(value.model) &&
    isNullableString(value.serialNumber) &&
    isNullableString(value.registrationMarks) &&
    isStringArrayOrNull(value.owners) &&
    isStringArrayOrNull(value.operators)
  );
}

function isCrewMember(value: unknown): boolean {
  return (
    isPerson(value) &&
    isObject(value) &&
    (value.operationalRole === 'PIC' ||
      value.operationalRole === 'SIC' ||
      value.operationalRole === 'COM' ||
      value.operationalRole === 'MEC' ||
      value.operationalRole === 'OTHER') &&
    isNullableString(value.regulatoryFunctionCode)
  );
}

function isTechnicalDiscrepancy(value: unknown): boolean {
  return isObject(value) && typeof value.description === 'string' && isPerson(value.detectedBy);
}

function isValidTimestampOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

export function isPersistedEdbFlightRecord(value: unknown): value is EdbFlightRecord {
  if (!isObject(value)) return false;
  if (value.contractVersion !== EDB_CONTRACT_VERSION) return false;
  if (!isNullableString(value.logicalRecordId) || !isNullableString(value.revisionId)) return false;
  if (typeof value.status !== 'string' || !LIFECYCLE_STATUSES.has(value.status)) return false;

  const identity = value.identity;
  if (!isObject(identity) || !Number.isInteger(identity.operatorCompanyId)) return false;
  if (identity.operatorRegulation !== 'RBAC121' && identity.operatorRegulation !== 'RBAC135' && identity.operatorRegulation !== 'OTHER') return false;
  if (!isAircraft(identity.aircraft)) return false;

  const maintenance = value.maintenance;
  if (!isObject(maintenance) || !isObject(maintenance.lastIntervention) || !isObject(maintenance.nextIntervention)) return false;
  if (
    !isNullableString(maintenance.lastIntervention.type) ||
    !isNullableString(maintenance.lastIntervention.date) ||
    !isNullableString(maintenance.lastIntervention.returnToServiceApprovedBy) ||
    !isNullableString(maintenance.nextIntervention.type) ||
    !isNullableFiniteNumber(maintenance.nextIntervention.dueAtAirframeHours)
  ) return false;

  const flight = value.flight;
  if (!isObject(flight) || !isObject(flight.times) || !isObject(flight.duration)) return false;
  if (
    !isNullableString(flight.date) ||
    !isNullableString(flight.origin) ||
    !isNullableString(flight.destination) ||
    !isValidTimestampOrNull(flight.times.engineStartAt) ||
    !isValidTimestampOrNull(flight.times.takeoffAt) ||
    !isValidTimestampOrNull(flight.times.landingAt) ||
    !isValidTimestampOrNull(flight.times.engineShutdownAt) ||
    !isNullableInteger(flight.landingsTotal) ||
    !isNullableInteger(flight.cycles) ||
    !isNullableFiniteNumber(flight.duration.dayMinutes) ||
    !isNullableFiniteNumber(flight.duration.nightMinutes) ||
    !isNullableFiniteNumber(flight.duration.totalMinutes) ||
    !isNullableFiniteNumber(flight.duration.ifrActualMinutes) ||
    !isNullableFiniteNumber(flight.duration.ifrSimulatedMinutes) ||
    !isNullableFiniteNumber(flight.fuelBeforeEngineStart) ||
    !isNullableInteger(flight.personsOnBoard) ||
    !isNullableFiniteNumber(flight.cargoKg) ||
    !isNullableString(flight.nature) ||
    !isStringArrayOrNull(flight.occurrences) ||
    !(flight.technicalDiscrepancies === null || (Array.isArray(flight.technicalDiscrepancies) && flight.technicalDiscrepancies.every(isTechnicalDiscrepancy))) ||
    !Array.isArray(flight.crew) ||
    !flight.crew.every(isCrewMember)
  ) return false;

  const signatures = value.signatures;
  if (
    !isObject(signatures) ||
    !isSignatureProofOrNull(signatures.picTechnicalAcknowledgement) ||
    !isSignatureProofOrNull(signatures.picFlightRecord) ||
    !isSignatureProofOrNull(signatures.operatorRecord)
  ) return false;

  const correction = value.correction;
  if (
    !isObject(correction) ||
    !Number.isInteger(correction.revision) ||
    (correction.revision as number) < 1 ||
    !isNullableString(correction.supersedesRevisionId) ||
    !isNullableString(correction.correctionReason)
  ) return false;

  const source = value.source;
  if (
    !isObject(source) ||
    source.sourceSystem !== 'AIRTRUST' ||
    source.sourceType !== 'CONTROLE_VOOS_RDV' ||
    !Number.isInteger(source.sourceFlightId) ||
    !isNullableInteger(source.sourceRdvId) ||
    !isNullableInteger(source.sourceRdvVersion) ||
    !isNullableInteger(source.sourceStageId) ||
    typeof source.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(source.capturedAt))
  ) return false;

  return true;
}
