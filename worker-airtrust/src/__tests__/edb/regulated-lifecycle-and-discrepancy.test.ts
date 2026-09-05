import { describe, expect, it } from 'vitest';

import {
  canEditEdbRegulatedContent,
  createEdbCorrectionRevision,
  evaluateEdbRegulatedLifecycleAction,
  isEdbRegulatedContentLocked,
  type EdbRegulatedRevision,
  type EdbRegulatedSignatureProof,
} from '../../services/edb/regulated-lifecycle';
import {
  appendEdbCorrectiveAction,
  appendEdbDeferredAction,
  appendEdbReturnToService,
  createEdbTechnicalDiscrepancyLedger,
  getEdbTechnicalDiscrepancyStatus,
  isEdbTechnicalDiscrepancyClosed,
} from '../../services/edb/technical-discrepancy-ledger';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function signature(
  intent: EdbRegulatedSignatureProof['intent'],
  targetType: EdbRegulatedSignatureProof['targetType'],
  targetId: string,
  hash: string,
): EdbRegulatedSignatureProof {
  return {
    signatureId: `sig-${intent}`,
    intent,
    targetType,
    targetId,
    signerRef: 'employee:10',
    signedAt: '2026-09-04T12:00:00.000Z',
    boundContentHashSha256: hash,
  };
}

function revision(): EdbRegulatedRevision {
  return {
    logicalRecordId: 'flight:100:leg:1',
    revisionId: 'edb-rev-1',
    revisionNumber: 1,
    status: 'DRAFT',
    technicalSituationId: 'tech-snapshot-1',
    technicalSituationHashSha256: HASH_A,
    contentHashSha256: HASH_B,
    capturedAt: '2026-09-04T11:00:00.000Z',
    signatures: {
      picTechnicalAcknowledgement: null,
      picFlightRecord: null,
      operatorRecord: null,
    },
    correction: {
      supersedesRevisionId: null,
      correctionReason: null,
    },
  };
}

describe('eDB regulated lifecycle policy', () => {
  it('requires PIC technical acknowledgement bound to the exact technical snapshot', () => {
    const record = revision();

    expect(evaluateEdbRegulatedLifecycleAction(record, 'MARK_READY_FOR_PIC_SIGNATURE')).toMatchObject({
      allowed: false,
      reasons: ['EDB_VALID_PIC_TECHNICAL_ACK_REQUIRED'],
    });

    record.signatures.picTechnicalAcknowledgement = signature(
      'PIC_TECHNICAL_ACK',
      'TECHNICAL_SITUATION',
      record.technicalSituationId,
      record.technicalSituationHashSha256,
    );

    expect(evaluateEdbRegulatedLifecycleAction(record, 'MARK_READY_FOR_PIC_SIGNATURE')).toMatchObject({
      allowed: true,
      to: 'READY_FOR_PIC_SIGNATURE',
    });
  });

  it('fails closed when a final signature targets another revision or content hash', () => {
    const record = revision();
    record.status = 'READY_FOR_PIC_SIGNATURE';
    record.signatures.picTechnicalAcknowledgement = signature(
      'PIC_TECHNICAL_ACK',
      'TECHNICAL_SITUATION',
      record.technicalSituationId,
      record.technicalSituationHashSha256,
    );
    record.signatures.picFlightRecord = signature(
      'PIC_FLIGHT_RECORD',
      'FINAL_RECORD_REVISION',
      'edb-rev-other',
      record.contentHashSha256,
    );

    expect(evaluateEdbRegulatedLifecycleAction(record, 'CONFIRM_PIC_SIGNED')).toMatchObject({
      allowed: false,
      reasons: ['EDB_PIC_FLIGHT_SIGNATURE_BINDING_INVALID'],
    });

    record.signatures.picFlightRecord = signature(
      'PIC_FLIGHT_RECORD',
      'FINAL_RECORD_REVISION',
      record.revisionId,
      HASH_C,
    );

    expect(evaluateEdbRegulatedLifecycleAction(record, 'CONFIRM_PIC_SIGNED')).toMatchObject({
      allowed: false,
      reasons: ['EDB_PIC_FLIGHT_SIGNATURE_BINDING_INVALID'],
    });
  });

  it('locks signed evidence and creates correction as a new revision without mutating history', () => {
    const original = revision();
    original.status = 'PIC_SIGNED';
    original.signatures.picTechnicalAcknowledgement = signature(
      'PIC_TECHNICAL_ACK',
      'TECHNICAL_SITUATION',
      original.technicalSituationId,
      original.technicalSituationHashSha256,
    );
    original.signatures.picFlightRecord = signature(
      'PIC_FLIGHT_RECORD',
      'FINAL_RECORD_REVISION',
      original.revisionId,
      original.contentHashSha256,
    );

    expect(isEdbRegulatedContentLocked(original)).toBe(true);
    expect(canEditEdbRegulatedContent(original)).toBe(false);
    expect(evaluateEdbRegulatedLifecycleAction(original, 'CANCEL').reasons).toContain(
      'EDB_SIGNED_RECORD_CANNOT_BE_CANCELLED',
    );

    const correction = createEdbCorrectionRevision({
      original,
      newRevisionId: 'edb-rev-2',
      newContentHashSha256: HASH_C,
      correctionReason: 'Correção de informação pós-assinatura',
      capturedAt: '2026-09-04T13:00:00.000Z',
    });

    expect(correction).toMatchObject({
      logicalRecordId: original.logicalRecordId,
      revisionId: 'edb-rev-2',
      revisionNumber: 2,
      status: 'DRAFT',
      correction: {
        supersedesRevisionId: 'edb-rev-1',
        correctionReason: 'Correção de informação pós-assinatura',
      },
    });
    expect(correction.signatures.picTechnicalAcknowledgement).toEqual(
      original.signatures.picTechnicalAcknowledgement,
    );
    expect(correction.signatures.picFlightRecord).toBeNull();
    expect(correction.signatures.operatorRecord).toBeNull();

    expect(original.revisionId).toBe('edb-rev-1');
    expect(original.status).toBe('PIC_SIGNED');
    expect(original.signatures.picFlightRecord).not.toBeNull();
  });
});

describe('eDB append-only technical discrepancy ledger', () => {
  const pic = { actorRef: 'employee:10', displayName: 'PIC' };
  const mechanic = { actorRef: 'employee:20', displayName: 'Maintenance' };

  function openLedger() {
    return createEdbTechnicalDiscrepancyLedger({
      discrepancyId: 'disc-1',
      revisionId: 'edb-rev-1',
      description: 'Discrepância técnica registrada pela tripulação',
      detectedBy: pic,
      detectedAt: '2026-09-04T10:00:00.000Z',
      createdAt: '2026-09-04T10:05:00.000Z',
    });
  }

  it('derives status from appended events and preserves every prior event', () => {
    const original = openLedger();
    const deferred = appendEdbDeferredAction(original, {
      eventId: 'evt-1',
      reason: 'Ação diferida conforme referência aplicável',
      limitationOrControl: 'Controle operacional registrado',
      authorizedBy: mechanic,
      occurredAt: '2026-09-04T10:30:00.000Z',
      reference: 'DEF-001',
    });
    const corrected = appendEdbCorrectiveAction(deferred, {
      eventId: 'evt-2',
      correctiveActionId: 'ca-1',
      description: 'Ação corretiva executada',
      performedBy: mechanic,
      occurredAt: '2026-09-04T11:00:00.000Z',
      reference: 'OS-123',
    });
    const released = appendEdbReturnToService(corrected, {
      eventId: 'evt-3',
      approvalId: 'rts-1',
      correctiveActionId: 'ca-1',
      description: 'Retorno ao serviço aprovado',
      approvedBy: mechanic,
      occurredAt: '2026-09-04T11:15:00.000Z',
      reference: 'RTS-123',
    });

    expect(getEdbTechnicalDiscrepancyStatus(original)).toBe('OPEN');
    expect(getEdbTechnicalDiscrepancyStatus(deferred)).toBe('DEFERRED_ACTION_AUTHORIZED');
    expect(getEdbTechnicalDiscrepancyStatus(corrected)).toBe('CORRECTIVE_ACTION_RECORDED');
    expect(getEdbTechnicalDiscrepancyStatus(released)).toBe('RETURN_TO_SERVICE_RECORDED');
    expect(isEdbTechnicalDiscrepancyClosed(released)).toBe(true);

    expect(original.events).toHaveLength(0);
    expect(deferred.events).toHaveLength(1);
    expect(corrected.events).toHaveLength(2);
    expect(released.events).toHaveLength(3);
    expect(released.identity.description).toBe(original.identity.description);
  });

  it('rejects orphan/stale RTS, chronological rewrites and events after RTS', () => {
    const original = openLedger();

    expect(() =>
      appendEdbReturnToService(original, {
        eventId: 'evt-orphan',
        approvalId: 'rts-orphan',
        correctiveActionId: 'missing',
        description: 'RTS inválido',
        approvedBy: mechanic,
        occurredAt: '2026-09-04T11:00:00.000Z',
        reference: null,
      }),
    ).toThrow('requires a recorded corrective action');

    const corrected = appendEdbCorrectiveAction(original, {
      eventId: 'evt-corrective',
      correctiveActionId: 'ca-1',
      description: 'Ação corretiva',
      performedBy: mechanic,
      occurredAt: '2026-09-04T11:00:00.000Z',
      reference: null,
    });

    expect(() =>
      appendEdbDeferredAction(corrected, {
        eventId: 'evt-backdated',
        reason: 'Evento retroativo',
        limitationOrControl: null,
        authorizedBy: mechanic,
        occurredAt: '2026-09-04T10:45:00.000Z',
        reference: null,
      }),
    ).toThrow('must be chronological');

    const released = appendEdbReturnToService(corrected, {
      eventId: 'evt-rts',
      approvalId: 'rts-1',
      correctiveActionId: 'ca-1',
      description: 'RTS válido',
      approvedBy: mechanic,
      occurredAt: '2026-09-04T11:15:00.000Z',
      reference: null,
    });

    expect(() =>
      appendEdbCorrectiveAction(released, {
        eventId: 'evt-after-rts',
        correctiveActionId: 'ca-2',
        description: 'Não pode ser anexado após RTS',
        performedBy: mechanic,
        occurredAt: '2026-09-04T11:30:00.000Z',
        reference: null,
      }),
    ).toThrow('closed after return to service');
  });
});
