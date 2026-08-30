import { describe, expect, it } from 'vitest';
import {
  markEdbRevisionReadyForPicSignature,
  transitionEdbRevisionState,
} from '../../repositories/edb/edb-persistence-repository';
import { canonicalJson, sha256Hex } from '../../services/edb/canonicalization';
import { createEmptyEdbFlightRecord, type EdbLifecycleStatus } from '../../services/edb/contracts';

const neverDb = new Proxy(
  {},
  {
    get() {
      throw new Error('database must not be touched for a reserved transition');
    },
  },
) as D1Database;

async function expectReservedTransition(
  expectedStatus: EdbLifecycleStatus,
  nextStatus: EdbLifecycleStatus,
) {
  await expect(
    transitionEdbRevisionState({
      db: neverDb,
      empresaId: 10,
      revisionId: 'edbrev-1',
      expectedStatus,
      nextStatus,
      expectedVersion: 1,
    }),
  ).rejects.toThrow('EDB_STATE_TRANSITION_NOT_ALLOWED');
}

async function incompleteRevisionDb() {
  const record = createEmptyEdbFlightRecord({
    operatorCompanyId: 10,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 20,
    sourceRdvId: 30,
    sourceRdvVersion: 1,
    sourceStageId: 40,
    capturedAt: '2026-08-28T12:00:00Z',
    logicalRecordId: 'flight-20-stage-40',
    revisionId: 'edbrev-20-40-r1',
  });
  record.signatures.picTechnicalAcknowledgement = {
    signatureId: 'sig-tech-1',
    type: 'PIC_TECHNICAL_ACK',
    targetType: 'TECHNICAL_SITUATION',
    targetId: 'tech-1',
    signer: { employeeId: 10, fullName: 'PIC Test', anacCode: '123456' },
    signedAt: '2026-08-28T11:00:00Z',
    canonicalPayloadHashSha256: 'a'.repeat(64),
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: 'proof/tech-1',
  };
  const payload = canonicalJson(record);
  const hash = await sha256Hex(payload);

  return {
    record,
    db: {
      prepare(sql: string) {
        if (!sql.includes('FROM edb_registro_revisoes r')) {
          throw new Error('state update must not run for an incomplete revision');
        }
        return {
          bind: () => ({
            first: async () => ({
              id: record.revisionId,
              empresa_id: 10,
              logical_record_id: record.logicalRecordId,
              payload_json: payload,
              canonical_payload_sha256: hash,
              status: 'DRAFT',
              state_version: 1,
            }),
          }),
        };
      },
    } as unknown as D1Database,
  };
}

describe('eDB reserved lifecycle transitions', () => {
  it('requires markEdbRevisionReadyForPicSignature for DRAFT -> READY_FOR_PIC_SIGNATURE', async () => {
    await expectReservedTransition('DRAFT', 'READY_FOR_PIC_SIGNATURE');
  });

  it('requires appendEdbSignature for READY_FOR_PIC_SIGNATURE -> PIC_SIGNED', async () => {
    await expectReservedTransition('READY_FOR_PIC_SIGNATURE', 'PIC_SIGNED');
  });

  it('requires appendEdbSignature for PIC_SIGNED -> OPERATOR_SIGNED', async () => {
    await expectReservedTransition('PIC_SIGNED', 'OPERATOR_SIGNED');
  });

  it('requires queueEdbAnacTransmission for OPERATOR_SIGNED -> ANAC_PENDING', async () => {
    await expectReservedTransition('OPERATOR_SIGNED', 'ANAC_PENDING');
  });

  it('reserves ANAC_PENDING -> ANAC_SYNCED for a future official acceptance adapter', async () => {
    await expectReservedTransition('ANAC_PENDING', 'ANAC_SYNCED');
  });

  it('does not mark an incomplete persisted revision ready for PIC signature', async () => {
    const { db, record } = await incompleteRevisionDb();
    await expect(
      markEdbRevisionReadyForPicSignature({
        db,
        empresaId: 10,
        revisionId: record.revisionId!,
      }),
    ).rejects.toThrow('EDB_REVISION_NOT_READY:');
  });
});
