export interface EdbRegulatedActor {
  actorRef: string;
  displayName: string;
}

export type EdbTechnicalDiscrepancyStatus =
  | 'OPEN'
  | 'DEFERRED_ACTION_AUTHORIZED'
  | 'CORRECTIVE_ACTION_RECORDED'
  | 'RETURN_TO_SERVICE_RECORDED';

export interface EdbTechnicalDiscrepancyIdentity {
  discrepancyId: string;
  revisionId: string;
  description: string;
  detectedBy: EdbRegulatedActor;
  detectedAt: string;
  createdAt: string;
}

export interface EdbDeferredActionEvent {
  type: 'DEFERRED_ACTION_AUTHORIZED';
  eventId: string;
  reason: string;
  limitationOrControl: string | null;
  authorizedBy: EdbRegulatedActor;
  occurredAt: string;
  reference: string | null;
}

export interface EdbCorrectiveActionEvent {
  type: 'CORRECTIVE_ACTION_RECORDED';
  eventId: string;
  correctiveActionId: string;
  description: string;
  performedBy: EdbRegulatedActor;
  occurredAt: string;
  reference: string | null;
}

export interface EdbReturnToServiceEvent {
  type: 'RETURN_TO_SERVICE_RECORDED';
  eventId: string;
  approvalId: string;
  correctiveActionId: string;
  description: string;
  approvedBy: EdbRegulatedActor;
  occurredAt: string;
  reference: string | null;
}

export type EdbTechnicalDiscrepancyEvent =
  | EdbDeferredActionEvent
  | EdbCorrectiveActionEvent
  | EdbReturnToServiceEvent;

export interface EdbTechnicalDiscrepancyLedger {
  identity: EdbTechnicalDiscrepancyIdentity;
  events: EdbTechnicalDiscrepancyEvent[];
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function actor(actor: EdbRegulatedActor, field: string): EdbRegulatedActor {
  return {
    actorRef: required(actor.actorRef, `${field}.actorRef`),
    displayName: required(actor.displayName, `${field}.displayName`),
  };
}

function timestamp(value: string, field: string): string {
  const normalized = required(value, field);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return normalized;
}

function latestEvent(ledger: EdbTechnicalDiscrepancyLedger): EdbTechnicalDiscrepancyEvent | null {
  return ledger.events.at(-1) ?? null;
}

function ensureAppendable(
  ledger: EdbTechnicalDiscrepancyLedger,
  eventId: string,
  occurredAt: string,
): void {
  const normalizedEventId = required(eventId, 'eventId');
  if (ledger.events.some((event) => event.eventId === normalizedEventId)) {
    throw new Error('Duplicate technical discrepancy eventId');
  }

  const at = timestamp(occurredAt, 'occurredAt');
  if (Date.parse(at) < Date.parse(ledger.identity.detectedAt)) {
    throw new Error('Technical discrepancy event cannot predate discrepancy detection');
  }

  const previous = latestEvent(ledger);
  if (previous && Date.parse(at) < Date.parse(previous.occurredAt)) {
    throw new Error('Technical discrepancy ledger must be chronological');
  }

  if (getEdbTechnicalDiscrepancyStatus(ledger) === 'RETURN_TO_SERVICE_RECORDED') {
    throw new Error('Technical discrepancy ledger is closed after return to service');
  }
}

function cloneLedger(
  ledger: EdbTechnicalDiscrepancyLedger,
  event: EdbTechnicalDiscrepancyEvent,
): EdbTechnicalDiscrepancyLedger {
  return {
    identity: {
      ...ledger.identity,
      detectedBy: { ...ledger.identity.detectedBy },
    },
    events: [...ledger.events.map((item) => ({ ...item })), event],
  };
}

/**
 * Append-only technical discrepancy ledger.
 *
 * The discrepancy text detected by the crew remains bound to the immutable
 * final-record revision. Maintenance disposition is represented only by later
 * events; no API here can edit or erase the original discrepancy.
 */
export function createEdbTechnicalDiscrepancyLedger(params: {
  discrepancyId: string;
  revisionId: string;
  description: string;
  detectedBy: EdbRegulatedActor;
  detectedAt: string;
  createdAt: string;
}): EdbTechnicalDiscrepancyLedger {
  const detectedAt = timestamp(params.detectedAt, 'detectedAt');
  const createdAt = timestamp(params.createdAt, 'createdAt');
  if (Date.parse(createdAt) < Date.parse(detectedAt)) {
    throw new Error('createdAt cannot predate detectedAt');
  }

  return {
    identity: {
      discrepancyId: required(params.discrepancyId, 'discrepancyId'),
      revisionId: required(params.revisionId, 'revisionId'),
      description: required(params.description, 'description'),
      detectedBy: actor(params.detectedBy, 'detectedBy'),
      detectedAt,
      createdAt,
    },
    events: [],
  };
}

export function appendEdbDeferredAction(
  ledger: EdbTechnicalDiscrepancyLedger,
  input: Omit<EdbDeferredActionEvent, 'type'>,
): EdbTechnicalDiscrepancyLedger {
  ensureAppendable(ledger, input.eventId, input.occurredAt);

  const status = getEdbTechnicalDiscrepancyStatus(ledger);
  if (status !== 'OPEN' && status !== 'DEFERRED_ACTION_AUTHORIZED') {
    throw new Error('Deferred action is only valid before corrective action');
  }

  return cloneLedger(ledger, {
    type: 'DEFERRED_ACTION_AUTHORIZED',
    eventId: required(input.eventId, 'eventId'),
    reason: required(input.reason, 'reason'),
    limitationOrControl: input.limitationOrControl?.trim() || null,
    authorizedBy: actor(input.authorizedBy, 'authorizedBy'),
    occurredAt: timestamp(input.occurredAt, 'occurredAt'),
    reference: input.reference?.trim() || null,
  });
}

export function appendEdbCorrectiveAction(
  ledger: EdbTechnicalDiscrepancyLedger,
  input: Omit<EdbCorrectiveActionEvent, 'type'>,
): EdbTechnicalDiscrepancyLedger {
  ensureAppendable(ledger, input.eventId, input.occurredAt);

  return cloneLedger(ledger, {
    type: 'CORRECTIVE_ACTION_RECORDED',
    eventId: required(input.eventId, 'eventId'),
    correctiveActionId: required(input.correctiveActionId, 'correctiveActionId'),
    description: required(input.description, 'description'),
    performedBy: actor(input.performedBy, 'performedBy'),
    occurredAt: timestamp(input.occurredAt, 'occurredAt'),
    reference: input.reference?.trim() || null,
  });
}

export function appendEdbReturnToService(
  ledger: EdbTechnicalDiscrepancyLedger,
  input: Omit<EdbReturnToServiceEvent, 'type'>,
): EdbTechnicalDiscrepancyLedger {
  ensureAppendable(ledger, input.eventId, input.occurredAt);

  const correctiveActions = ledger.events.filter(
    (event): event is EdbCorrectiveActionEvent => event.type === 'CORRECTIVE_ACTION_RECORDED',
  );
  const latestCorrectiveAction = correctiveActions.at(-1);

  if (!latestCorrectiveAction) {
    throw new Error('Return to service requires a recorded corrective action');
  }
  if (latestCorrectiveAction.correctiveActionId !== input.correctiveActionId) {
    throw new Error('Return to service must reference the latest corrective action');
  }
  if (Date.parse(input.occurredAt) < Date.parse(latestCorrectiveAction.occurredAt)) {
    throw new Error('Return to service cannot predate corrective action');
  }

  return cloneLedger(ledger, {
    type: 'RETURN_TO_SERVICE_RECORDED',
    eventId: required(input.eventId, 'eventId'),
    approvalId: required(input.approvalId, 'approvalId'),
    correctiveActionId: required(input.correctiveActionId, 'correctiveActionId'),
    description: required(input.description, 'description'),
    approvedBy: actor(input.approvedBy, 'approvedBy'),
    occurredAt: timestamp(input.occurredAt, 'occurredAt'),
    reference: input.reference?.trim() || null,
  });
}

export function getEdbTechnicalDiscrepancyStatus(
  ledger: EdbTechnicalDiscrepancyLedger,
): EdbTechnicalDiscrepancyStatus {
  const latest = latestEvent(ledger);
  if (!latest) return 'OPEN';
  return latest.type;
}

export function isEdbTechnicalDiscrepancyClosed(
  ledger: EdbTechnicalDiscrepancyLedger,
): boolean {
  return getEdbTechnicalDiscrepancyStatus(ledger) === 'RETURN_TO_SERVICE_RECORDED';
}
