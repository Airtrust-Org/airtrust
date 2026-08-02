import { describe, expect, it } from 'vitest';
import {
  EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION,
  createEdbTechnicalStatusShadowSnapshot,
  edbTechnicalStatusShadowSchema,
  validateEdbTechnicalStatusShadow,
} from '../../services/edb/technical-status-shadow-contracts';

function buildValidTechnicalStatus(): Record<string, unknown> {
  const source = {
    kind: 'MAINTENANCE_SYSTEM',
    reference: 'synthetic-maintenance-source',
    observedAt: '2026-08-02T09:00:00-03:00',
  };

  return {
    schemaVersion: EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION,
    technicalStatusId: '00000000-0000-4000-8000-000000000101',
    tenantId: 7,
    createdAt: '2026-08-02T10:00:00-03:00',
    officialEffect: 'NONE',
    statusAssertions: [
      {
        assertionId: '00000000-0000-4000-8000-000000000102',
        informationState: 'IMPORTED',
        status: 'SERVICEABLE',
        source,
        evidenceReferences: ['evidence:status:synthetic'],
      },
    ],
    lastIntervention: {
      reference: 'intervention:synthetic:previous',
      description: 'Synthetic previous inspection',
      occurredAt: '2026-08-01T12:00:00-03:00',
      informationState: 'IMPORTED',
      source,
      evidenceReferences: ['evidence:previous-intervention:synthetic'],
    },
    nextIntervention: {
      reference: 'intervention:synthetic:next',
      description: 'Synthetic next inspection',
      remainingLimits: [{ value: 12.5, unit: 'HOURS' }],
      informationState: 'IMPORTED',
      source,
      evidenceReferences: ['evidence:next-intervention:synthetic'],
    },
    discrepancies: [],
    picAwareness: {
      state: 'DECLARED_SHADOW',
      declaredAt: '2026-08-02T09:30:00-03:00',
      personReference: 'person:synthetic-pic',
      evidenceReferences: ['evidence:pic-awareness:synthetic'],
      futureSignature: {
        state: 'PENDING_FUTURE_OFFICIAL_ACT',
        purpose: 'PIC_AWARENESS',
      },
    },
  };
}

function buildMaintenanceAct(): Record<string, unknown> {
  return {
    kind: 'DECLARED_SHADOW',
    occurredAt: '2026-08-02T09:20:00-03:00',
    organization: {
      organizationReference: 'organization:synthetic',
      legalName: 'Synthetic Maintenance Organization',
      authorizationReference: 'authorization:synthetic',
    },
    person: {
      personReference: 'person:synthetic-maintainer',
      displayName: 'Synthetic Maintainer',
      licenseOrCanac: 'LICENSE-SYNTHETIC',
      roleOrPrerogative: 'Synthetic maintenance prerogative',
    },
  };
}

function buildDiscrepancyDeclaration(): Record<string, unknown> {
  return {
    eventId: '00000000-0000-4000-8000-000000000201',
    sequence: 1,
    eventType: 'DISCREPANCY_DECLARED',
    recordedAt: '2026-08-02T09:10:00-03:00',
    supersedesEventId: null,
    informationState: 'DECLARED',
    description: 'Synthetic discrepancy operational content',
    systemCode: 'ATA-SYNTHETIC',
    correctiveAction: null,
    deferredItem: null,
    maintenanceAct: null,
    returnToService: null,
    futureSignature: {
      state: 'PENDING_FUTURE_OFFICIAL_ACT',
      purpose: 'DISCREPANCY_RECORD',
    },
    source: {
      kind: 'AIRTRUST_MANUAL',
      reference: 'source:synthetic-discrepancy',
      observedAt: '2026-08-02T09:10:00-03:00',
    },
    evidenceReferences: ['evidence:synthetic-discrepancy'],
  };
}

function buildCorrectiveActionEvent(): Record<string, unknown> {
  return {
    eventId: '00000000-0000-4000-8000-000000000202',
    sequence: 2,
    eventType: 'CORRECTIVE_ACTION_DECLARED',
    recordedAt: '2026-08-02T09:20:00-03:00',
    supersedesEventId: null,
    informationState: 'DECLARED',
    description: 'Synthetic corrective event',
    systemCode: 'ATA-SYNTHETIC',
    correctiveAction: {
      description: 'Synthetic corrective action operational content',
      declaredAt: '2026-08-02T09:20:00-03:00',
      reference: 'corrective-action:synthetic',
    },
    deferredItem: null,
    maintenanceAct: buildMaintenanceAct(),
    returnToService: null,
    futureSignature: {
      state: 'PENDING_FUTURE_OFFICIAL_ACT',
      purpose: 'CORRECTIVE_ACTION',
    },
    source: {
      kind: 'AIRTRUST_MANUAL',
      reference: 'source:synthetic-corrective-action',
      observedAt: '2026-08-02T09:20:00-03:00',
    },
    evidenceReferences: ['evidence:synthetic-corrective-action'],
  };
}

function buildDeferredEvent(): Record<string, unknown> {
  return {
    eventId: '00000000-0000-4000-8000-000000000203',
    sequence: 2,
    eventType: 'DEFERRED_ITEM_DECLARED',
    recordedAt: '2026-08-02T09:20:00-03:00',
    supersedesEventId: null,
    informationState: 'DECLARED',
    description: 'Synthetic deferred maintenance event',
    systemCode: 'ATA-SYNTHETIC',
    correctiveAction: null,
    deferredItem: {
      authorizationReference: 'MEL-SYNTHETIC-001',
      reason: 'Synthetic deferred reason',
      dueAt: null,
      remainingLimits: [{ value: 5, unit: 'CYCLES' }],
    },
    maintenanceAct: buildMaintenanceAct(),
    returnToService: null,
    futureSignature: {
      state: 'PENDING_FUTURE_OFFICIAL_ACT',
      purpose: 'DEFERRED_ITEM',
    },
    source: {
      kind: 'AIRTRUST_MANUAL',
      reference: 'source:synthetic-deferred-item',
      observedAt: '2026-08-02T09:20:00-03:00',
    },
    evidenceReferences: ['evidence:synthetic-deferred-item'],
  };
}

function setDiscrepancy(
  input: Record<string, unknown>,
  status: string,
  events: Record<string, unknown>[],
): void {
  input.discrepancies = [
    {
      discrepancyId: '00000000-0000-4000-8000-000000000200',
      status,
      events,
    },
  ];
}

describe('eDB technical status shadow contracts', () => {
  it('accepts a provider-agnostic non-official synthetic status', () => {
    const status = createEdbTechnicalStatusShadowSnapshot(buildValidTechnicalStatus());

    expect(status.schemaVersion).toBe('edb.technical-status.shadow.v1');
    expect(status.officialEffect).toBe('NONE');
    expect(validateEdbTechnicalStatusShadow(status)).toEqual([]);
  });

  it('rejects official effect and authentication or typed-name signature shortcuts', () => {
    const official = buildValidTechnicalStatus();
    official.officialEffect = 'OFFICIAL';

    const signatureShortcut = buildValidTechnicalStatus();
    const correctiveAction = buildCorrectiveActionEvent();
    const maintenanceAct = correctiveAction.maintenanceAct as Record<string, unknown>;
    maintenanceAct.authenticatedUserId = 77;
    maintenanceAct.typedName = 'Synthetic Typed Name';
    setDiscrepancy(signatureShortcut, 'CORRECTIVE_ACTION_DECLARED', [
      buildDiscrepancyDeclaration(),
      correctiveAction,
    ]);

    expect(edbTechnicalStatusShadowSchema.safeParse(official).success).toBe(false);
    expect(edbTechnicalStatusShadowSchema.safeParse(signatureShortcut).success).toBe(false);
  });

  it('reports an open discrepancy without copying operational values or PII', () => {
    const input = buildValidTechnicalStatus();
    setDiscrepancy(input, 'OPEN', [buildDiscrepancyDeclaration()]);

    const findings = validateEdbTechnicalStatusShadow(
      createEdbTechnicalStatusShadowSnapshot(input),
    );
    const serialized = JSON.stringify(findings);

    expect(findings).toContainEqual({
      code: 'TECHNICAL_DISCREPANCY_OPEN',
      severity: 'HIGH',
      path: 'discrepancies.0.status',
    });
    expect(serialized).not.toContain('Synthetic discrepancy operational content');
    expect(serialized).not.toContain('ATA-SYNTHETIC');
    for (const finding of findings) {
      expect(Object.keys(finding).sort()).toEqual(['code', 'path', 'severity']);
    }
  });

  it('represents a declared corrective action without treating it as return to service', () => {
    const input = buildValidTechnicalStatus();
    setDiscrepancy(input, 'CORRECTIVE_ACTION_DECLARED', [
      buildDiscrepancyDeclaration(),
      buildCorrectiveActionEvent(),
    ]);

    const status = createEdbTechnicalStatusShadowSnapshot(input);
    const findings = validateEdbTechnicalStatusShadow(status);

    expect(findings).toContainEqual({
      code: 'TECHNICAL_CORRECTIVE_ACTION_DECLARED',
      severity: 'OBSERVATION',
      path: 'discrepancies.0.events.1.eventType',
    });
    expect(status.discrepancies[0].events[1].returnToService).toBeNull();
    expect(status.discrepancies[0].events[1].futureSignature.state).toBe(
      'PENDING_FUTURE_OFFICIAL_ACT',
    );
  });

  it('accepts a deferred item with an authorization reference and remaining limit', () => {
    const input = buildValidTechnicalStatus();
    setDiscrepancy(input, 'DEFERRED', [
      buildDiscrepancyDeclaration(),
      buildDeferredEvent(),
    ]);

    const findings = validateEdbTechnicalStatusShadow(
      createEdbTechnicalStatusShadowSnapshot(input),
    );
    const codes = findings.map((finding) => finding.code);

    expect(codes).toContain('TECHNICAL_DEFERRED_ITEM_DECLARED');
    expect(codes).not.toContain('TECHNICAL_DEFERRED_REFERENCE_REQUIRED');
    expect(codes).not.toContain('TECHNICAL_DEFERRED_LIMIT_REQUIRED');
  });

  it('reports missing deferred deadline or limit and an unknown unit', () => {
    const input = buildValidTechnicalStatus();
    const deferred = buildDeferredEvent();
    const deferredItem = deferred.deferredItem as Record<string, unknown>;
    deferredItem.dueAt = null;
    deferredItem.remainingLimits = [{ value: null, unit: 'FLIGHTS' }];
    setDiscrepancy(input, 'DEFERRED', [buildDiscrepancyDeclaration(), deferred]);

    const findings = validateEdbTechnicalStatusShadow(
      createEdbTechnicalStatusShadowSnapshot(input),
    );
    const codes = findings.map((finding) => finding.code);

    expect(codes).toContain('TECHNICAL_DEFERRED_LIMIT_REQUIRED');
    expect(codes).toContain('TECHNICAL_LIMIT_UNIT_UNKNOWN');
  });

  it('rejects negative remaining hours or cycles', () => {
    const input = buildValidTechnicalStatus();
    const nextIntervention = input.nextIntervention as Record<string, unknown>;
    nextIntervention.remainingLimits = [{ value: -1, unit: 'HOURS' }];

    expect(edbTechnicalStatusShadowSchema.safeParse(input).success).toBe(false);
  });

  it('reports missing organization and insufficient person identification without PII', () => {
    const input = buildValidTechnicalStatus();
    const correctiveAction = buildCorrectiveActionEvent();
    correctiveAction.maintenanceAct = {
      kind: 'DECLARED_SHADOW',
      occurredAt: '2026-08-02T09:20:00-03:00',
      organization: null,
      person: {
        personReference: null,
        displayName: 'Sensitive Synthetic Person',
        licenseOrCanac: null,
        roleOrPrerogative: 'Synthetic role',
      },
    };
    setDiscrepancy(input, 'CORRECTIVE_ACTION_DECLARED', [
      buildDiscrepancyDeclaration(),
      correctiveAction,
    ]);

    const findings = validateEdbTechnicalStatusShadow(
      createEdbTechnicalStatusShadowSnapshot(input),
    );
    const serialized = JSON.stringify(findings);
    const codes = findings.map((finding) => finding.code);

    expect(codes).toContain('TECHNICAL_ORGANIZATION_REQUIRED');
    expect(codes).toContain('TECHNICAL_PERSON_IDENTIFICATION_REQUIRED');
    expect(serialized).not.toContain('Sensitive Synthetic Person');
    expect(serialized).not.toContain('Synthetic corrective action operational content');
  });

  it('reports pending PIC awareness separately from any future signature', () => {
    const input = buildValidTechnicalStatus();
    input.picAwareness = {
      state: 'PENDING',
      declaredAt: null,
      personReference: null,
      evidenceReferences: [],
      futureSignature: {
        state: 'NOT_REQUESTED',
        purpose: 'PIC_AWARENESS',
      },
    };

    const findings = validateEdbTechnicalStatusShadow(
      createEdbTechnicalStatusShadowSnapshot(input),
    );

    expect(findings).toContainEqual({
      code: 'TECHNICAL_PIC_AWARENESS_PENDING',
      severity: 'HIGH',
      path: 'picAwareness.state',
    });
  });

  it('reports imported and declared status conflict plus unknown provenance', () => {
    const input = buildValidTechnicalStatus();
    input.statusAssertions = [
      ...((input.statusAssertions as Record<string, unknown>[]) ?? []),
      {
        assertionId: '00000000-0000-4000-8000-000000000103',
        informationState: 'DECLARED',
        status: 'UNSERVICEABLE',
        source: { kind: 'UNKNOWN' },
        evidenceReferences: [],
      },
    ];

    const findings = validateEdbTechnicalStatusShadow(
      createEdbTechnicalStatusShadowSnapshot(input),
    );
    const codes = findings.map((finding) => finding.code);

    expect(codes).toContain('TECHNICAL_STATUS_SOURCE_CONFLICT');
    expect(codes).toContain('TECHNICAL_SOURCE_UNKNOWN');
    expect(codes).toContain('TECHNICAL_SOURCE_REFERENCE_REQUIRED');
    expect(codes).toContain('TECHNICAL_EVIDENCE_REQUIRED');
  });

  it('preserves the original event when a correction is appended', () => {
    const input = buildValidTechnicalStatus();
    const declaration = buildDiscrepancyDeclaration();
    const correction = {
      ...buildDiscrepancyDeclaration(),
      eventId: '00000000-0000-4000-8000-000000000204',
      sequence: 2,
      eventType: 'CORRECTION_DECLARED',
      supersedesEventId: declaration.eventId,
      description: 'Synthetic corrected content',
    };
    setDiscrepancy(input, 'UNCONFIRMED', [declaration, correction]);

    const snapshot = createEdbTechnicalStatusShadowSnapshot(input);
    correction.description = 'Changed after snapshot';
    const findings = validateEdbTechnicalStatusShadow(snapshot);
    const codes = findings.map((finding) => finding.code);

    expect(snapshot.discrepancies[0].events).toHaveLength(2);
    expect(snapshot.discrepancies[0].events[0].description).toBe(
      'Synthetic discrepancy operational content',
    );
    expect(snapshot.discrepancies[0].events[1].description).toBe(
      'Synthetic corrected content',
    );
    expect(codes).not.toContain('TECHNICAL_CORRECTION_TARGET_REQUIRED');
    expect(codes).not.toContain('TECHNICAL_CORRECTION_TARGET_NOT_FOUND');
    expect(codes).not.toContain('TECHNICAL_CORRECTION_TARGET_NOT_EARLIER');
  });

  it('reports a correction that does not reference an earlier event', () => {
    const input = buildValidTechnicalStatus();
    const correction = {
      ...buildDiscrepancyDeclaration(),
      eventId: '00000000-0000-4000-8000-000000000205',
      sequence: 1,
      eventType: 'CORRECTION_DECLARED',
      supersedesEventId: null,
    };
    setDiscrepancy(input, 'UNCONFIRMED', [correction]);

    const findings = validateEdbTechnicalStatusShadow(
      createEdbTechnicalStatusShadowSnapshot(input),
    );
    const codes = findings.map((finding) => finding.code);

    expect(codes).toContain('TECHNICAL_CORRECTION_TARGET_REQUIRED');
    expect(codes).toContain('TECHNICAL_DISCREPANCY_DECLARATION_REQUIRED');
  });

  it('does not allow a discrepancy to become closed or deleted in shadow status', () => {
    const closed = buildValidTechnicalStatus();
    setDiscrepancy(closed, 'CLOSED', [buildDiscrepancyDeclaration()]);

    const deleted = buildValidTechnicalStatus();
    setDiscrepancy(deleted, 'DELETED', [buildDiscrepancyDeclaration()]);

    expect(edbTechnicalStatusShadowSchema.safeParse(closed).success).toBe(false);
    expect(edbTechnicalStatusShadowSchema.safeParse(deleted).success).toBe(false);
  });
});
