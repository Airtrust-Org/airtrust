import type { EdbRegulatedActor } from './technical-discrepancy-ledger';

export type EdbDiaryVolumeStatus = 'OPEN' | 'CLOSED';

export interface EdbVolumeBoundaryAct {
  type: 'OPENING' | 'CLOSING';
  occurredAt: string;
  actor: EdbRegulatedActor;
  observations: string | null;
}

export interface EdbDiaryVolume {
  diaryId: number;
  volumeId: string;
  aircraftRegistration: string;
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

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function optional(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.trim() || null;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function timestamp(value: string, field: string): string {
  const normalized = required(value, field);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return normalized;
}

function calendarDate(value: string, field: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${field} must use YYYY-MM-DD`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${field} must be a valid calendar date`);
  }

  return { year, month, day };
}

function cloneActor(actor: EdbRegulatedActor, field: string): EdbRegulatedActor {
  return {
    actorRef: required(actor.actorRef, `${field}.actorRef`),
    displayName: required(actor.displayName, `${field}.displayName`),
  };
}

function assertNotBefore(value: string, reference: string, message: string): void {
  if (Date.parse(value) < Date.parse(reference)) {
    throw new Error(message);
  }
}

/**
 * Pure diary-volume governance for Resolução ANAC 773/2025.
 *
 * This module deliberately models local evidence only. It does not invent an
 * ANAC API diary identifier, transmission endpoint, payload or acknowledgement.
 */
export function openEdbDiaryVolume(params: {
  diaryId: number;
  volumeId: string;
  aircraftRegistration: string;
  sequence: number;
  openedAt: string;
  openedBy: EdbRegulatedActor;
  observations?: string | null;
}): EdbDiaryVolume {
  return {
    diaryId: positiveInteger(params.diaryId, 'diaryId'),
    volumeId: required(params.volumeId, 'volumeId'),
    aircraftRegistration: required(params.aircraftRegistration, 'aircraftRegistration'),
    sequence: positiveInteger(params.sequence, 'sequence'),
    status: 'OPEN',
    openingAct: {
      type: 'OPENING',
      occurredAt: timestamp(params.openedAt, 'openedAt'),
      actor: cloneActor(params.openedBy, 'openedBy'),
      observations: optional(params.observations),
    },
    closingAct: null,
  };
}

export function closeEdbDiaryVolume(
  volume: EdbDiaryVolume,
  params: {
    closedAt: string;
    closedBy: EdbRegulatedActor;
    observations?: string | null;
  },
): EdbDiaryVolume {
  positiveInteger(volume.diaryId, 'volume.diaryId');
  if (volume.status !== 'OPEN' || volume.closingAct) {
    throw new Error('Only an open diary volume can be closed');
  }

  const closedAt = timestamp(params.closedAt, 'closedAt');
  assertNotBefore(
    closedAt,
    volume.openingAct.occurredAt,
    'Volume closing act cannot predate opening act',
  );

  return {
    ...volume,
    openingAct: {
      ...volume.openingAct,
      actor: { ...volume.openingAct.actor },
    },
    status: 'CLOSED',
    closingAct: {
      type: 'CLOSING',
      occurredAt: closedAt,
      actor: cloneActor(params.closedBy, 'closedBy'),
      observations: optional(params.observations),
    },
  };
}

/**
 * Resolução 773/2025 art. 3 §1:
 * keep the diary for the aircraft lifetime and at least 5 years + 1 day after
 * cancellation of its registration in the RAB.
 *
 * Null means deregistration/cancellation has not occurred, so there is no
 * finite retention cutoff.
 */
export function minimumEdbRetentionUntil(
  registrationCancellationDate: string | null,
): string | null {
  if (registrationCancellationDate === null) return null;

  const { year, month, day } = calendarDate(
    registrationCancellationDate,
    'registrationCancellationDate',
  );

  const fiveYearsLater = new Date(Date.UTC(year + 5, month - 1, day));
  fiveYearsLater.setUTCDate(fiveYearsLater.getUTCDate() + 1);
  return fiveYearsLater.toISOString().slice(0, 10);
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
    incidentId: required(params.incidentId, 'incidentId'),
    diaryId: positiveInteger(params.diaryId, 'diaryId'),
    volumeId: optional(params.volumeId),
    kind: params.kind,
    detectedAt: timestamp(params.detectedAt, 'detectedAt'),
    description: required(params.description, 'description'),
    policeOccurrenceReference: null,
    policeReportedAt: null,
    anacNotificationReference: null,
    anacNotifiedAt: null,
    reconstitutionOutcome: 'PENDING',
    reconstitutionCompletedAt: null,
    newDiaryOpeningObservation: null,
  };
}

export function recordPoliceOccurrence(
  incident: EdbInformationLossIncident,
  params: { reference: string; reportedAt: string },
): EdbInformationLossIncident {
  positiveInteger(incident.diaryId, 'incident.diaryId');
  if (incident.policeOccurrenceReference) {
    throw new Error('Police occurrence already recorded');
  }

  const reportedAt = timestamp(params.reportedAt, 'reportedAt');
  assertNotBefore(
    reportedAt,
    incident.detectedAt,
    'Police occurrence cannot predate incident detection',
  );

  return {
    ...incident,
    policeOccurrenceReference: required(params.reference, 'reference'),
    policeReportedAt: reportedAt,
  };
}

/**
 * Records local evidence that ANAC was notified.
 *
 * The function stores only the supplied local reference/timestamp and makes no
 * assumption about ANAC transport, endpoint, authentication or acceptance.
 */
export function recordAnacInformationLossNotification(
  incident: EdbInformationLossIncident,
  params: { reference: string; notifiedAt: string },
): EdbInformationLossIncident {
  positiveInteger(incident.diaryId, 'incident.diaryId');
  if (!incident.policeOccurrenceReference || !incident.policeReportedAt) {
    throw new Error('ANAC notification requires the police occurrence reference');
  }
  if (incident.anacNotificationReference) {
    throw new Error('ANAC notification already recorded');
  }

  const notifiedAt = timestamp(params.notifiedAt, 'notifiedAt');
  assertNotBefore(
    notifiedAt,
    incident.policeReportedAt,
    'ANAC notification cannot predate police occurrence',
  );

  return {
    ...incident,
    anacNotificationReference: required(params.reference, 'reference'),
    anacNotifiedAt: notifiedAt,
  };
}

export function recordSuccessfulReconstitution(
  incident: EdbInformationLossIncident,
  completedAtInput: string,
): EdbInformationLossIncident {
  positiveInteger(incident.diaryId, 'incident.diaryId');
  if (incident.reconstitutionOutcome !== 'PENDING') {
    throw new Error('Reconstitution outcome already recorded');
  }

  const completedAt = timestamp(completedAtInput, 'completedAt');
  assertNotBefore(
    completedAt,
    incident.detectedAt,
    'Reconstitution cannot predate incident detection',
  );

  return {
    ...incident,
    reconstitutionOutcome: 'RECONSTITUTED',
    reconstitutionCompletedAt: completedAt,
  };
}

export function recordImpossibleReconstitution(
  incident: EdbInformationLossIncident,
  params: {
    completedAt: string;
    newDiaryOpeningObservation: string;
  },
): EdbInformationLossIncident {
  positiveInteger(incident.diaryId, 'incident.diaryId');
  if (!incident.policeOccurrenceReference) {
    throw new Error('Impossible reconstitution requires the police occurrence reference');
  }
  if (incident.reconstitutionOutcome !== 'PENDING') {
    throw new Error('Reconstitution outcome already recorded');
  }

  const observation = required(
    params.newDiaryOpeningObservation,
    'newDiaryOpeningObservation',
  );
  if (!observation.includes(incident.policeOccurrenceReference)) {
    throw new Error('New diary opening observation must reference the police occurrence');
  }

  const completedAt = timestamp(params.completedAt, 'completedAt');
  assertNotBefore(
    completedAt,
    incident.detectedAt,
    'Reconstitution decision cannot predate incident detection',
  );

  return {
    ...incident,
    reconstitutionOutcome: 'IMPOSSIBLE',
    reconstitutionCompletedAt: completedAt,
    newDiaryOpeningObservation: observation,
  };
}

export function isEdbInformationLossIncidentDocumented(
  incident: EdbInformationLossIncident,
): boolean {
  if (!incident.policeOccurrenceReference || !incident.anacNotificationReference) {
    return false;
  }

  if (incident.reconstitutionOutcome === 'RECONSTITUTED') return true;

  return (
    incident.reconstitutionOutcome === 'IMPOSSIBLE' &&
    Boolean(incident.newDiaryOpeningObservation?.trim())
  );
}
