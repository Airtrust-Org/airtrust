import type { EdbPersonIdentity } from './contracts';

export type EdbDiaryVolumeStatus = 'OPEN' | 'CLOSED';

export interface EdbVolumeBoundaryAct {
  type: 'OPENING' | 'CLOSING';
  occurredAt: string;
  actor: EdbPersonIdentity;
  observations: string | null;
}

export interface EdbDiaryVolume {
  diaryId: number;
  volumeId: string;
  aircraftRegistrationMarks: string;
  sequence: number;
  status: EdbDiaryVolumeStatus;
  openingAct: EdbVolumeBoundaryAct;
  closingAct: EdbVolumeBoundaryAct | null;
}

export type EdbInformationLossKind = 'LOSS' | 'MISPLACEMENT' | 'CORRUPTION';
export type EdbReconstitutionOutcome = 'PENDING' | 'RECONSTITUTED' | 'IMPOSSIBLE';

export interface EdbInformationLossIncident {
  incidentId: string;
  diaryId: number;
  volumeId: string | null;
  kind: EdbInformationLossKind;
  detectedAt: string;
  description: string;
  policeOccurrenceReference: string | null;
  policeReportedAt: string | null;
  anacNotificationReference: string | null;
  anacNotifiedAt: string | null;
  reconstitutionOutcome: EdbReconstitutionOutcome;
  reconstitutionCompletedAt: string | null;
  newDiaryOpeningObservation: string | null;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.trim() || null;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
  return value;
}

function requireTimestamp(value: string, field: string): string {
  const normalized = requireText(value, field);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${field} must be a valid timestamp`);
  return normalized;
}

function clonePerson(person: EdbPersonIdentity, field: string): EdbPersonIdentity {
  const fullName = requireText(person.fullName, `${field}.fullName`);
  return { ...person, fullName };
}

/**
 * Res. 773/2025 art. 2: the diary is a unique aircraft document, but its
 * information may be split into volumes delimited by opening/closing acts.
 * The local diary identity is the persisted edb_diarios integer primary key;
 * this contract intentionally does not invent an ANAC API diary identifier.
 */
export function openEdbDiaryVolume(params: {
  diaryId: number;
  volumeId: string;
  aircraftRegistrationMarks: string;
  sequence: number;
  openedAt: string;
  openedBy: EdbPersonIdentity;
  observations?: string | null;
}): EdbDiaryVolume {
  return {
    diaryId: requirePositiveInteger(params.diaryId, 'diaryId'),
    volumeId: requireText(params.volumeId, 'volumeId'),
    aircraftRegistrationMarks: requireText(params.aircraftRegistrationMarks, 'aircraftRegistrationMarks'),
    sequence: requirePositiveInteger(params.sequence, 'sequence'),
    status: 'OPEN',
    openingAct: {
      type: 'OPENING',
      occurredAt: requireTimestamp(params.openedAt, 'openedAt'),
      actor: clonePerson(params.openedBy, 'openedBy'),
      observations: params.observations?.trim() || null,
    },
    closingAct: null,
  };
}

export function closeEdbDiaryVolume(
  volume: EdbDiaryVolume,
  params: {
    closedAt: string;
    closedBy: EdbPersonIdentity;
    observations?: string | null;
  },
): EdbDiaryVolume {
  requirePositiveInteger(volume.diaryId, 'volume.diaryId');
  if (volume.status !== 'OPEN' || volume.closingAct) throw new Error('Only an open diary volume can be closed');
  const closedAt = requireTimestamp(params.closedAt, 'closedAt');
  if (Date.parse(closedAt) < Date.parse(volume.openingAct.occurredAt)) {
    throw new Error('Volume closing act cannot predate opening act');
  }

  return {
    ...volume,
    openingAct: { ...volume.openingAct, actor: { ...volume.openingAct.actor } },
    status: 'CLOSED',
    closingAct: {
      type: 'CLOSING',
      occurredAt: closedAt,
      actor: clonePerson(params.closedBy, 'closedBy'),
      observations: params.observations?.trim() || null,
    },
  };
}

/** Res. 773/2025 art. 3 §1: aircraft life + at least 5 years and 1 day after RAB deregistration. */
export function minimumEdbRetentionUntil(deregistrationDate: string | null): string | null {
  if (deregistrationDate === null) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deregistrationDate);
  if (!match) throw new Error('deregistrationDate must use YYYY-MM-DD');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const original = new Date(Date.UTC(year, month - 1, day));
  if (
    original.getUTCFullYear() !== year ||
    original.getUTCMonth() !== month - 1 ||
    original.getUTCDate() !== day
  ) {
    throw new Error('deregistrationDate must be a valid calendar date');
  }

  const retention = new Date(Date.UTC(year + 5, month - 1, day));
  retention.setUTCDate(retention.getUTCDate() + 1);
  return retention.toISOString().slice(0, 10);
}

/** Res. 773/2025 art. 7 §2: volumes covering the last 30 days of aircraft operation. */
export function onboardOperationWindowStart(asOfOperationDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOfOperationDate);
  if (!match) throw new Error('asOfOperationDate must use YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('asOfOperationDate must be a valid calendar date');
  }
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
}

export function createEdbInformationLossIncident(params: {
  incidentId: string;
  diaryId: number;
  volumeId?: string | null;
  kind: EdbInformationLossKind;
  detectedAt: string;
  description: string;
}): EdbInformationLossIncident {
  return {
    incidentId: requireText(params.incidentId, 'incidentId'),
    diaryId: requirePositiveInteger(params.diaryId, 'diaryId'),
    volumeId: optionalText(params.volumeId),
    kind: params.kind,
    detectedAt: requireTimestamp(params.detectedAt, 'detectedAt'),
    description: requireText(params.description, 'description'),
    policeOccurrenceReference: null,
    policeReportedAt: null,
    anacNotificationReference: null,
    anacNotifiedAt: null,
    reconstitutionOutcome: 'PENDING',
    reconstitutionCompletedAt: null,
    newDiaryOpeningObservation: null,
  };
}

/** Res. 773/2025 art. 11 I and §1. */
export function recordPoliceOccurrence(
  incident: EdbInformationLossIncident,
  params: { reference: string; reportedAt: string },
): EdbInformationLossIncident {
  requirePositiveInteger(incident.diaryId, 'incident.diaryId');
  if (incident.policeOccurrenceReference) throw new Error('Police occurrence already recorded');
  return {
    ...incident,
    policeOccurrenceReference: requireText(params.reference, 'reference'),
    policeReportedAt: requireTimestamp(params.reportedAt, 'reportedAt'),
  };
}

/** ANAC notification must carry the police occurrence/term reference required by art. 11 §1. */
export function recordAnacInformationLossNotification(
  incident: EdbInformationLossIncident,
  params: { reference: string; notifiedAt: string },
): EdbInformationLossIncident {
  requirePositiveInteger(incident.diaryId, 'incident.diaryId');
  if (!incident.policeOccurrenceReference) {
    throw new Error('ANAC notification requires the police occurrence reference');
  }
  if (incident.anacNotificationReference) throw new Error('ANAC notification already recorded');
  return {
    ...incident,
    anacNotificationReference: requireText(params.reference, 'reference'),
    anacNotifiedAt: requireTimestamp(params.notifiedAt, 'notifiedAt'),
  };
}

export function recordSuccessfulReconstitution(
  incident: EdbInformationLossIncident,
  completedAt: string,
): EdbInformationLossIncident {
  requirePositiveInteger(incident.diaryId, 'incident.diaryId');
  if (incident.reconstitutionOutcome !== 'PENDING') throw new Error('Reconstitution outcome already recorded');
  return {
    ...incident,
    reconstitutionOutcome: 'RECONSTITUTED',
    reconstitutionCompletedAt: requireTimestamp(completedAt, 'completedAt'),
  };
}

/** Res. 773/2025 art. 11 §2: if reconstitution is impossible, new opening term must reference occurrence + declaration. */
export function recordImpossibleReconstitution(
  incident: EdbInformationLossIncident,
  params: { completedAt: string; newDiaryOpeningObservation: string },
): EdbInformationLossIncident {
  requirePositiveInteger(incident.diaryId, 'incident.diaryId');
  if (!incident.policeOccurrenceReference) {
    throw new Error('Impossible reconstitution requires the police occurrence reference');
  }
  if (incident.reconstitutionOutcome !== 'PENDING') throw new Error('Reconstitution outcome already recorded');
  const observation = requireText(params.newDiaryOpeningObservation, 'newDiaryOpeningObservation');
  if (!observation.includes(incident.policeOccurrenceReference)) {
    throw new Error('New diary opening observation must reference the police occurrence');
  }
  return {
    ...incident,
    reconstitutionOutcome: 'IMPOSSIBLE',
    reconstitutionCompletedAt: requireTimestamp(params.completedAt, 'completedAt'),
    newDiaryOpeningObservation: observation,
  };
}

export function isEdbInformationLossIncidentRegulatorilyDocumented(
  incident: EdbInformationLossIncident,
): boolean {
  if (!incident.policeOccurrenceReference || !incident.anacNotificationReference) return false;
  if (incident.reconstitutionOutcome === 'RECONSTITUTED') return true;
  return incident.reconstitutionOutcome === 'IMPOSSIBLE' && Boolean(incident.newDiaryOpeningObservation?.trim());
}
