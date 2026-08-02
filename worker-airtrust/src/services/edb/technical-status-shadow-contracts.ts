import { z } from 'zod';
import { edbFieldSourceSchema } from './domain-contracts';

/**
 * Provider-agnostic, non-official technical-status contract for eDB shadow mode.
 *
 * It intentionally contains no signature material, authenticated-user shortcut,
 * official maintenance release, persistence model or route contract.
 */
export const EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION =
  'edb.technical-status.shadow.v1' as const;

export const edbTechnicalInformationStateSchema = z.enum([
  'IMPORTED',
  'DECLARED',
  'UNCONFIRMED',
]);

export type EdbTechnicalInformationState = z.infer<
  typeof edbTechnicalInformationStateSchema
>;

export const edbTechnicalAircraftStatusSchema = z.enum([
  'SERVICEABLE',
  'UNSERVICEABLE',
  'RESTRICTED',
  'UNKNOWN',
]);

export const edbTechnicalLimitUnitSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .nullable();

const nullableTrimmedText = (max: number) =>
  z.string().trim().min(1).max(max).nullable();

const evidenceReferenceSchema = z.string().trim().min(1).max(160);

export const edbTechnicalLimitSchema = z
  .object({
    value: z.number().finite().nonnegative().nullable(),
    unit: edbTechnicalLimitUnitSchema,
  })
  .strict();

export const edbTechnicalOrganizationSchema = z
  .object({
    organizationReference: nullableTrimmedText(128),
    legalName: nullableTrimmedText(200),
    authorizationReference: nullableTrimmedText(160),
  })
  .strict();

export const edbTechnicalPersonSchema = z
  .object({
    personReference: nullableTrimmedText(128),
    displayName: nullableTrimmedText(200),
    licenseOrCanac: nullableTrimmedText(80),
    roleOrPrerogative: nullableTrimmedText(120),
  })
  .strict();

export const edbTechnicalFutureSignatureSchema = z
  .object({
    state: z.enum([
      'NOT_REQUESTED',
      'PENDING_FUTURE_OFFICIAL_ACT',
      'NOT_APPLICABLE',
    ]),
    purpose: z.enum([
      'DISCREPANCY_RECORD',
      'CORRECTIVE_ACTION',
      'DEFERRED_ITEM',
      'RETURN_TO_SERVICE',
      'PIC_AWARENESS',
    ]),
  })
  .strict();

export const edbTechnicalMaintenanceActSchema = z
  .object({
    kind: z.enum(['NONE', 'DECLARED_SHADOW', 'UNCONFIRMED']),
    occurredAt: z.string().datetime({ offset: true }).nullable(),
    organization: edbTechnicalOrganizationSchema.nullable(),
    person: edbTechnicalPersonSchema.nullable(),
  })
  .strict();

export const edbTechnicalStatusAssertionSchema = z
  .object({
    assertionId: z.string().uuid(),
    informationState: edbTechnicalInformationStateSchema,
    status: edbTechnicalAircraftStatusSchema,
    source: edbFieldSourceSchema,
    evidenceReferences: z.array(evidenceReferenceSchema),
  })
  .strict();

export const edbTechnicalInterventionSchema = z
  .object({
    reference: nullableTrimmedText(160),
    description: nullableTrimmedText(2000),
    occurredAt: z.string().datetime({ offset: true }).nullable(),
    informationState: edbTechnicalInformationStateSchema,
    source: edbFieldSourceSchema,
    evidenceReferences: z.array(evidenceReferenceSchema),
  })
  .strict();

export const edbTechnicalNextInterventionSchema = z
  .object({
    reference: nullableTrimmedText(160),
    description: nullableTrimmedText(2000),
    remainingLimits: z.array(edbTechnicalLimitSchema),
    informationState: edbTechnicalInformationStateSchema,
    source: edbFieldSourceSchema,
    evidenceReferences: z.array(evidenceReferenceSchema),
  })
  .strict();

export const edbTechnicalCorrectiveActionSchema = z
  .object({
    description: nullableTrimmedText(4000),
    declaredAt: z.string().datetime({ offset: true }).nullable(),
    reference: nullableTrimmedText(160),
  })
  .strict();

export const edbTechnicalDeferredItemSchema = z
  .object({
    authorizationReference: nullableTrimmedText(160),
    reason: nullableTrimmedText(2000),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    remainingLimits: z.array(edbTechnicalLimitSchema),
  })
  .strict();

export const edbTechnicalReturnToServiceSchema = z
  .object({
    state: z.enum(['NOT_DECLARED', 'DECLARED_SHADOW', 'UNCONFIRMED']),
    reference: nullableTrimmedText(160),
    officialEffect: z.literal('NONE'),
    maintenanceAct: edbTechnicalMaintenanceActSchema.nullable(),
    futureSignature: edbTechnicalFutureSignatureSchema,
  })
  .strict();

export const edbTechnicalDiscrepancyEventTypeSchema = z.enum([
  'DISCREPANCY_DECLARED',
  'CORRECTIVE_ACTION_DECLARED',
  'DEFERRED_ITEM_DECLARED',
  'RETURN_TO_SERVICE_DECLARED',
  'CORRECTION_DECLARED',
]);

export const edbTechnicalDiscrepancyEventSchema = z
  .object({
    eventId: z.string().uuid(),
    sequence: z.number().int().positive(),
    eventType: edbTechnicalDiscrepancyEventTypeSchema,
    recordedAt: z.string().datetime({ offset: true }),
    supersedesEventId: z.string().uuid().nullable(),
    informationState: edbTechnicalInformationStateSchema,
    description: nullableTrimmedText(4000),
    systemCode: nullableTrimmedText(80),
    correctiveAction: edbTechnicalCorrectiveActionSchema.nullable(),
    deferredItem: edbTechnicalDeferredItemSchema.nullable(),
    maintenanceAct: edbTechnicalMaintenanceActSchema.nullable(),
    returnToService: edbTechnicalReturnToServiceSchema.nullable(),
    futureSignature: edbTechnicalFutureSignatureSchema,
    source: edbFieldSourceSchema,
    evidenceReferences: z.array(evidenceReferenceSchema),
  })
  .strict();

export const edbTechnicalDiscrepancySchema = z
  .object({
    discrepancyId: z.string().uuid(),
    status: z.enum([
      'OPEN',
      'CORRECTIVE_ACTION_DECLARED',
      'DEFERRED',
      'UNCONFIRMED',
    ]),
    events: z.array(edbTechnicalDiscrepancyEventSchema).min(1),
  })
  .strict();

export const edbTechnicalPicAwarenessSchema = z
  .object({
    state: z.enum(['PENDING', 'DECLARED_SHADOW', 'UNCONFIRMED']),
    declaredAt: z.string().datetime({ offset: true }).nullable(),
    personReference: nullableTrimmedText(128),
    evidenceReferences: z.array(evidenceReferenceSchema),
    futureSignature: edbTechnicalFutureSignatureSchema,
  })
  .strict();

export const edbTechnicalStatusShadowSchema = z
  .object({
    schemaVersion: z.literal(EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION),
    technicalStatusId: z.string().uuid(),
    tenantId: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    officialEffect: z.literal('NONE'),
    statusAssertions: z.array(edbTechnicalStatusAssertionSchema),
    lastIntervention: edbTechnicalInterventionSchema.nullable(),
    nextIntervention: edbTechnicalNextInterventionSchema.nullable(),
    discrepancies: z.array(edbTechnicalDiscrepancySchema),
    picAwareness: edbTechnicalPicAwarenessSchema,
  })
  .strict();

export type EdbTechnicalStatusShadow = z.infer<
  typeof edbTechnicalStatusShadowSchema
>;

export type EdbTechnicalStatusShadowSeverity =
  | 'CRITICAL'
  | 'HIGH'
  | 'MEDIUM'
  | 'LOW'
  | 'OBSERVATION';

export type EdbTechnicalStatusShadowFindingCode =
  | 'TECHNICAL_LAST_INTERVENTION_REQUIRED'
  | 'TECHNICAL_NEXT_INTERVENTION_REQUIRED'
  | 'TECHNICAL_NEXT_INTERVENTION_REFERENCE_REQUIRED'
  | 'TECHNICAL_LIMIT_REQUIRED'
  | 'TECHNICAL_LIMIT_UNIT_UNKNOWN'
  | 'TECHNICAL_SOURCE_UNKNOWN'
  | 'TECHNICAL_SOURCE_REFERENCE_REQUIRED'
  | 'TECHNICAL_EVIDENCE_REQUIRED'
  | 'TECHNICAL_STATUS_SOURCE_CONFLICT'
  | 'TECHNICAL_DISCREPANCY_OPEN'
  | 'TECHNICAL_DISCREPANCY_DECLARATION_REQUIRED'
  | 'TECHNICAL_CORRECTIVE_ACTION_DECLARED'
  | 'TECHNICAL_CORRECTIVE_ACTION_DESCRIPTION_REQUIRED'
  | 'TECHNICAL_DEFERRED_ITEM_DECLARED'
  | 'TECHNICAL_DEFERRED_REFERENCE_REQUIRED'
  | 'TECHNICAL_DEFERRED_LIMIT_REQUIRED'
  | 'TECHNICAL_MAINTENANCE_ACT_REQUIRED'
  | 'TECHNICAL_ORGANIZATION_REQUIRED'
  | 'TECHNICAL_PERSON_IDENTIFICATION_REQUIRED'
  | 'TECHNICAL_RETURN_TO_SERVICE_REQUIRES_FUTURE_OFFICIAL_ACT'
  | 'TECHNICAL_PIC_AWARENESS_PENDING'
  | 'TECHNICAL_EVENT_ID_DUPLICATED'
  | 'TECHNICAL_EVENT_SEQUENCE_INVALID'
  | 'TECHNICAL_CORRECTION_TARGET_REQUIRED'
  | 'TECHNICAL_CORRECTION_TARGET_NOT_FOUND'
  | 'TECHNICAL_CORRECTION_TARGET_NOT_EARLIER';

export interface EdbTechnicalStatusShadowFinding {
  code: EdbTechnicalStatusShadowFindingCode;
  severity: EdbTechnicalStatusShadowSeverity;
  path: string;
}

const KNOWN_LIMIT_UNITS = new Set([
  'HOURS',
  'CYCLES',
  'CALENDAR_DAYS',
  'LANDINGS',
]);

function addFinding(
  findings: EdbTechnicalStatusShadowFinding[],
  code: EdbTechnicalStatusShadowFindingCode,
  severity: EdbTechnicalStatusShadowSeverity,
  path: string,
): void {
  findings.push({ code, severity, path });
}

function hasOrganizationIdentification(
  organization: z.infer<typeof edbTechnicalOrganizationSchema> | null,
): boolean {
  return Boolean(
    organization?.organizationReference ||
      organization?.legalName ||
      organization?.authorizationReference,
  );
}

function hasPersonIdentification(
  person: z.infer<typeof edbTechnicalPersonSchema> | null,
): boolean {
  return Boolean(
    person?.displayName &&
      (person.personReference || person.licenseOrCanac) &&
      person.roleOrPrerogative,
  );
}

function validateSourceAndEvidence(
  findings: EdbTechnicalStatusShadowFinding[],
  informationState: EdbTechnicalInformationState,
  source: z.infer<typeof edbFieldSourceSchema>,
  evidenceReferences: string[],
  path: string,
): void {
  if (source.kind === 'UNKNOWN') {
    addFinding(
      findings,
      'TECHNICAL_SOURCE_UNKNOWN',
      'MEDIUM',
      `${path}.source.kind`,
    );
  }

  if (informationState !== 'UNCONFIRMED' && !source.reference) {
    addFinding(
      findings,
      'TECHNICAL_SOURCE_REFERENCE_REQUIRED',
      'MEDIUM',
      `${path}.source.reference`,
    );
  }

  if (informationState !== 'UNCONFIRMED' && evidenceReferences.length === 0) {
    addFinding(
      findings,
      'TECHNICAL_EVIDENCE_REQUIRED',
      'MEDIUM',
      `${path}.evidenceReferences`,
    );
  }
}

function validateLimits(
  findings: EdbTechnicalStatusShadowFinding[],
  limits: Array<z.infer<typeof edbTechnicalLimitSchema>>,
  path: string,
  missingCode:
    | 'TECHNICAL_LIMIT_REQUIRED'
    | 'TECHNICAL_DEFERRED_LIMIT_REQUIRED',
): void {
  if (limits.length === 0 || limits.every((limit) => limit.value === null)) {
    addFinding(findings, missingCode, 'HIGH', path);
  }

  for (const [index, limit] of limits.entries()) {
    if (limit.unit && !KNOWN_LIMIT_UNITS.has(limit.unit.toUpperCase())) {
      addFinding(
        findings,
        'TECHNICAL_LIMIT_UNIT_UNKNOWN',
        'MEDIUM',
        `${path}.${index}.unit`,
      );
    }
  }
}

function validateMaintenanceActor(
  findings: EdbTechnicalStatusShadowFinding[],
  act: z.infer<typeof edbTechnicalMaintenanceActSchema> | null,
  path: string,
): void {
  if (!act || act.kind === 'NONE') {
    addFinding(
      findings,
      'TECHNICAL_MAINTENANCE_ACT_REQUIRED',
      'HIGH',
      path,
    );
    return;
  }

  if (!hasOrganizationIdentification(act.organization)) {
    addFinding(
      findings,
      'TECHNICAL_ORGANIZATION_REQUIRED',
      'HIGH',
      `${path}.organization`,
    );
  }

  if (!hasPersonIdentification(act.person)) {
    addFinding(
      findings,
      'TECHNICAL_PERSON_IDENTIFICATION_REQUIRED',
      'HIGH',
      `${path}.person`,
    );
  }
}

/**
 * Produces sanitized shadow findings. Findings contain only code, severity and
 * field path; operational values and PII are never copied into the result.
 */
export function validateEdbTechnicalStatusShadow(
  status: EdbTechnicalStatusShadow,
): EdbTechnicalStatusShadowFinding[] {
  const findings: EdbTechnicalStatusShadowFinding[] = [];

  if (!status.lastIntervention) {
    addFinding(
      findings,
      'TECHNICAL_LAST_INTERVENTION_REQUIRED',
      'HIGH',
      'lastIntervention',
    );
  } else {
    validateSourceAndEvidence(
      findings,
      status.lastIntervention.informationState,
      status.lastIntervention.source,
      status.lastIntervention.evidenceReferences,
      'lastIntervention',
    );
  }

  if (!status.nextIntervention) {
    addFinding(
      findings,
      'TECHNICAL_NEXT_INTERVENTION_REQUIRED',
      'HIGH',
      'nextIntervention',
    );
  } else {
    if (!status.nextIntervention.reference) {
      addFinding(
        findings,
        'TECHNICAL_NEXT_INTERVENTION_REFERENCE_REQUIRED',
        'HIGH',
        'nextIntervention.reference',
      );
    }
    validateLimits(
      findings,
      status.nextIntervention.remainingLimits,
      'nextIntervention.remainingLimits',
      'TECHNICAL_LIMIT_REQUIRED',
    );
    validateSourceAndEvidence(
      findings,
      status.nextIntervention.informationState,
      status.nextIntervention.source,
      status.nextIntervention.evidenceReferences,
      'nextIntervention',
    );
  }

  for (const [index, assertion] of status.statusAssertions.entries()) {
    validateSourceAndEvidence(
      findings,
      assertion.informationState,
      assertion.source,
      assertion.evidenceReferences,
      `statusAssertions.${index}`,
    );
  }

  const importedStatuses = new Set(
    status.statusAssertions
      .filter(
        (assertion) =>
          assertion.informationState === 'IMPORTED' &&
          assertion.status !== 'UNKNOWN',
      )
      .map((assertion) => assertion.status),
  );
  const declaredStatuses = new Set(
    status.statusAssertions
      .filter(
        (assertion) =>
          assertion.informationState === 'DECLARED' &&
          assertion.status !== 'UNKNOWN',
      )
      .map((assertion) => assertion.status),
  );

  if (
    importedStatuses.size > 0 &&
    declaredStatuses.size > 0 &&
    [...importedStatuses].some((value) => !declaredStatuses.has(value))
  ) {
    addFinding(
      findings,
      'TECHNICAL_STATUS_SOURCE_CONFLICT',
      'CRITICAL',
      'statusAssertions',
    );
  }

  for (const [discrepancyIndex, discrepancy] of status.discrepancies.entries()) {
    const discrepancyPath = `discrepancies.${discrepancyIndex}`;

    if (discrepancy.status === 'OPEN') {
      addFinding(
        findings,
        'TECHNICAL_DISCREPANCY_OPEN',
        'HIGH',
        `${discrepancyPath}.status`,
      );
    }

    if (
      !discrepancy.events.some(
        (event) => event.eventType === 'DISCREPANCY_DECLARED',
      )
    ) {
      addFinding(
        findings,
        'TECHNICAL_DISCREPANCY_DECLARATION_REQUIRED',
        'HIGH',
        `${discrepancyPath}.events`,
      );
    }

    const eventIds = new Set<string>();
    let previousSequence = 0;

    for (const [eventIndex, event] of discrepancy.events.entries()) {
      const eventPath = `${discrepancyPath}.events.${eventIndex}`;

      if (eventIds.has(event.eventId)) {
        addFinding(
          findings,
          'TECHNICAL_EVENT_ID_DUPLICATED',
          'HIGH',
          `${eventPath}.eventId`,
        );
      }

      if (event.sequence <= previousSequence) {
        addFinding(
          findings,
          'TECHNICAL_EVENT_SEQUENCE_INVALID',
          'HIGH',
          `${eventPath}.sequence`,
        );
      }

      if (event.eventType === 'CORRECTION_DECLARED') {
        if (!event.supersedesEventId) {
          addFinding(
            findings,
            'TECHNICAL_CORRECTION_TARGET_REQUIRED',
            'HIGH',
            `${eventPath}.supersedesEventId`,
          );
        } else if (
          !discrepancy.events.some(
            (candidate) => candidate.eventId === event.supersedesEventId,
          )
        ) {
          addFinding(
            findings,
            'TECHNICAL_CORRECTION_TARGET_NOT_FOUND',
            'HIGH',
            `${eventPath}.supersedesEventId`,
          );
        } else if (!eventIds.has(event.supersedesEventId)) {
          addFinding(
            findings,
            'TECHNICAL_CORRECTION_TARGET_NOT_EARLIER',
            'HIGH',
            `${eventPath}.supersedesEventId`,
          );
        }
      }

      if (event.eventType === 'CORRECTIVE_ACTION_DECLARED') {
        addFinding(
          findings,
          'TECHNICAL_CORRECTIVE_ACTION_DECLARED',
          'OBSERVATION',
          `${eventPath}.eventType`,
        );
        if (!event.correctiveAction?.description) {
          addFinding(
            findings,
            'TECHNICAL_CORRECTIVE_ACTION_DESCRIPTION_REQUIRED',
            'HIGH',
            `${eventPath}.correctiveAction.description`,
          );
        }
        validateMaintenanceActor(
          findings,
          event.maintenanceAct,
          `${eventPath}.maintenanceAct`,
        );
      }

      if (event.eventType === 'DEFERRED_ITEM_DECLARED') {
        addFinding(
          findings,
          'TECHNICAL_DEFERRED_ITEM_DECLARED',
          'OBSERVATION',
          `${eventPath}.eventType`,
        );
        if (!event.deferredItem?.authorizationReference) {
          addFinding(
            findings,
            'TECHNICAL_DEFERRED_REFERENCE_REQUIRED',
            'HIGH',
            `${eventPath}.deferredItem.authorizationReference`,
          );
        }
        if (
          !event.deferredItem?.dueAt &&
          (!event.deferredItem ||
            event.deferredItem.remainingLimits.length === 0 ||
            event.deferredItem.remainingLimits.every(
              (limit) => limit.value === null,
            ))
        ) {
          addFinding(
            findings,
            'TECHNICAL_DEFERRED_LIMIT_REQUIRED',
            'HIGH',
            `${eventPath}.deferredItem`,
          );
        }
        if (event.deferredItem) {
          for (const [limitIndex, limit] of
            event.deferredItem.remainingLimits.entries()) {
            if (
              limit.unit &&
              !KNOWN_LIMIT_UNITS.has(limit.unit.toUpperCase())
            ) {
              addFinding(
                findings,
                'TECHNICAL_LIMIT_UNIT_UNKNOWN',
                'MEDIUM',
                `${eventPath}.deferredItem.remainingLimits.${limitIndex}.unit`,
              );
            }
          }
        }
        validateMaintenanceActor(
          findings,
          event.maintenanceAct,
          `${eventPath}.maintenanceAct`,
        );
      }

      if (event.eventType === 'RETURN_TO_SERVICE_DECLARED') {
        addFinding(
          findings,
          'TECHNICAL_RETURN_TO_SERVICE_REQUIRES_FUTURE_OFFICIAL_ACT',
          'HIGH',
          `${eventPath}.returnToService`,
        );
        validateMaintenanceActor(
          findings,
          event.returnToService?.maintenanceAct ?? event.maintenanceAct,
          `${eventPath}.returnToService.maintenanceAct`,
        );
      }

      validateSourceAndEvidence(
        findings,
        event.informationState,
        event.source,
        event.evidenceReferences,
        eventPath,
      );

      eventIds.add(event.eventId);
      previousSequence = event.sequence;
    }
  }

  if (status.picAwareness.state === 'PENDING') {
    addFinding(
      findings,
      'TECHNICAL_PIC_AWARENESS_PENDING',
      'HIGH',
      'picAwareness.state',
    );
  }

  return findings;
}

/**
 * Parses and deep-clones the input into the non-official shadow contract.
 */
export function createEdbTechnicalStatusShadowSnapshot(
  input: unknown,
): EdbTechnicalStatusShadow {
  return edbTechnicalStatusShadowSchema.parse(input);
}
