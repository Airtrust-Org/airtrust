import {
  appendEdbCorrectiveAction,
  appendEdbDeferredAction,
  appendEdbReturnToService,
  createEdbTechnicalDiscrepancyLedger,
  type EdbRegulatedActor,
  type EdbTechnicalDiscrepancyLedger,
} from '../../services/edb/technical-discrepancy-ledger';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, code: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function optionalText(value: unknown, code: string): string | null {
  if (value === null || value === undefined) return null;
  return requireText(value, code);
}

function requireTimestamp(value: unknown, code: string): string {
  const normalized = requireText(value, code);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function requireActor(value: unknown, code: string): EdbRegulatedActor {
  if (!isObject(value)) throw new Error(code);
  return {
    actorRef: requireText(value.actorRef, code),
    displayName: requireText(value.displayName, code),
  };
}

/**
 * Reconstructs an append-only technical-discrepancy ledger from persisted
 * evidence without trusting any derived status or mutating storage.
 *
 * This is intentionally persistence-agnostic. A future D1 repository may feed
 * this boundary only after tenant/revision scoping has been proven separately.
 * The domain append functions are replayed so duplicate IDs, chronology,
 * corrective-action ordering and return-to-service closure all fail closed.
 */
export function hydrateEdbTechnicalDiscrepancyLedger(
  value: unknown,
): EdbTechnicalDiscrepancyLedger {
  if (!isObject(value)) throw new Error('EDB_DISCREPANCY_SNAPSHOT_INVALID');
  if (!isObject(value.identity)) throw new Error('EDB_DISCREPANCY_IDENTITY_INVALID');
  if (!Array.isArray(value.events)) throw new Error('EDB_DISCREPANCY_EVENTS_INVALID');

  const identity = value.identity;
  let ledger = createEdbTechnicalDiscrepancyLedger({
    discrepancyId: requireText(identity.discrepancyId, 'EDB_DISCREPANCY_ID_REQUIRED'),
    revisionId: requireText(identity.revisionId, 'EDB_DISCREPANCY_REVISION_ID_REQUIRED'),
    description: requireText(identity.description, 'EDB_DISCREPANCY_DESCRIPTION_REQUIRED'),
    detectedBy: requireActor(identity.detectedBy, 'EDB_DISCREPANCY_DETECTED_BY_INVALID'),
    detectedAt: requireTimestamp(identity.detectedAt, 'EDB_DISCREPANCY_DETECTED_AT_INVALID'),
    createdAt: requireTimestamp(identity.createdAt, 'EDB_DISCREPANCY_CREATED_AT_INVALID'),
  });

  for (const rawEvent of value.events) {
    if (!isObject(rawEvent)) throw new Error('EDB_DISCREPANCY_EVENT_INVALID');

    const type = requireText(rawEvent.type, 'EDB_DISCREPANCY_EVENT_TYPE_REQUIRED');
    if (type === 'DEFERRED_ACTION_AUTHORIZED') {
      ledger = appendEdbDeferredAction(ledger, {
        eventId: requireText(rawEvent.eventId, 'EDB_DISCREPANCY_EVENT_ID_REQUIRED'),
        reason: requireText(rawEvent.reason, 'EDB_DEFERRED_ACTION_REASON_REQUIRED'),
        limitationOrControl: optionalText(
          rawEvent.limitationOrControl,
          'EDB_DEFERRED_ACTION_LIMITATION_INVALID',
        ),
        authorizedBy: requireActor(
          rawEvent.authorizedBy,
          'EDB_DEFERRED_ACTION_ACTOR_INVALID',
        ),
        occurredAt: requireTimestamp(
          rawEvent.occurredAt,
          'EDB_DISCREPANCY_EVENT_TIMESTAMP_INVALID',
        ),
        reference: optionalText(rawEvent.reference, 'EDB_DISCREPANCY_EVENT_REFERENCE_INVALID'),
      });
      continue;
    }

    if (type === 'CORRECTIVE_ACTION_RECORDED') {
      ledger = appendEdbCorrectiveAction(ledger, {
        eventId: requireText(rawEvent.eventId, 'EDB_DISCREPANCY_EVENT_ID_REQUIRED'),
        correctiveActionId: requireText(
          rawEvent.correctiveActionId,
          'EDB_CORRECTIVE_ACTION_ID_REQUIRED',
        ),
        description: requireText(
          rawEvent.description,
          'EDB_CORRECTIVE_ACTION_DESCRIPTION_REQUIRED',
        ),
        performedBy: requireActor(
          rawEvent.performedBy,
          'EDB_CORRECTIVE_ACTION_ACTOR_INVALID',
        ),
        occurredAt: requireTimestamp(
          rawEvent.occurredAt,
          'EDB_DISCREPANCY_EVENT_TIMESTAMP_INVALID',
        ),
        reference: optionalText(rawEvent.reference, 'EDB_DISCREPANCY_EVENT_REFERENCE_INVALID'),
      });
      continue;
    }

    if (type === 'RETURN_TO_SERVICE_RECORDED') {
      ledger = appendEdbReturnToService(ledger, {
        eventId: requireText(rawEvent.eventId, 'EDB_DISCREPANCY_EVENT_ID_REQUIRED'),
        approvalId: requireText(rawEvent.approvalId, 'EDB_RTS_APPROVAL_ID_REQUIRED'),
        correctiveActionId: requireText(
          rawEvent.correctiveActionId,
          'EDB_RTS_CORRECTIVE_ACTION_ID_REQUIRED',
        ),
        description: requireText(rawEvent.description, 'EDB_RTS_DESCRIPTION_REQUIRED'),
        approvedBy: requireActor(rawEvent.approvedBy, 'EDB_RTS_ACTOR_INVALID'),
        occurredAt: requireTimestamp(
          rawEvent.occurredAt,
          'EDB_DISCREPANCY_EVENT_TIMESTAMP_INVALID',
        ),
        reference: optionalText(rawEvent.reference, 'EDB_DISCREPANCY_EVENT_REFERENCE_INVALID'),
      });
      continue;
    }

    throw new Error('EDB_DISCREPANCY_EVENT_TYPE_INVALID');
  }

  return ledger;
}
