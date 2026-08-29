import { describe, expect, it } from 'vitest';
import {
  appendEdbSignature,
  persistEdbDraftRevision,
} from '../../repositories/edb/edb-persistence-repository';
import { createEmptyEdbFlightRecord } from '../../services/edb/contracts';

const neverDb = new Proxy(
  {},
  {
    get() {
      throw new Error('database must not be touched when a persistence guard fails');
    },
  },
) as D1Database;

function baseRecord() {
  return createEmptyEdbFlightRecord({
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
}

const common = {
  empresaId: 10,
  diarioId: 1,
  volumeId: 'volume-1',
  technicalAcknowledgementSignatureId: 'sig-tech-1',
};

describe('eDB persistence guards', () => {
  it('fails closed before D1 when the record has no explicit source stage', async () => {
    const record = baseRecord();
    record.source.sourceStageId = null;

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('requires an explicit source stage');
  });

  it('fails closed before D1 on cross-tenant persistence', async () => {
    const record = baseRecord();

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        empresaId: 11,
        record,
      }),
    ).rejects.toThrow('tenant does not match');
  });

  it('refuses to persist a non-draft record as a new revision', async () => {
    const record = baseRecord();
    record.status = 'PIC_SIGNED';

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('Only DRAFT');
  });

  it('requires immutable logical/revision identity before touching D1', async () => {
    const record = baseRecord();
    record.revisionId = null;

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('EDB_REVISION_ID_REQUIRED');
  });

  it('requires the preflight acknowledgement evidence before touching D1', async () => {
    const record = baseRecord();

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('payload requires the preflight PIC technical acknowledgement');
  });

  it('rejects a mismatch between the requested acknowledgement signature and embedded proof before D1', async () => {
    const record = baseRecord();
    record.signatures.picTechnicalAcknowledgement = {
      signatureId: 'sig-other',
      type: 'PIC_TECHNICAL_ACK',
      targetType: 'TECHNICAL_SITUATION',
      targetId: 'tech-1',
      signer: { employeeId: 10, fullName: 'PIC Test', anacCode: '123456' },
      signedAt: '2026-08-28T11:00:00Z',
      canonicalPayloadHashSha256: 'a'.repeat(64),
      method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
      proofReference: 'proof/other',
    };

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('EDB_TECHNICAL_ACK_SIGNATURE_ID_MISMATCH');
  });

  it('requires an explicit technical-situation target before querying D1', async () => {
    const record = baseRecord();
    record.signatures.picTechnicalAcknowledgement = {
      signatureId: 'sig-tech-1',
      type: 'PIC_TECHNICAL_ACK',
      signer: { employeeId: 10, fullName: 'PIC Test', anacCode: '123456' },
      signedAt: '2026-08-28T11:00:00Z',
      canonicalPayloadHashSha256: 'a'.repeat(64),
      method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
      proofReference: 'proof/tech-1',
    };

    await expect(
      persistEdbDraftRevision(neverDb, {
        ...common,
        record,
      }),
    ).rejects.toThrow('EDB_TECHNICAL_ACK_TARGET_REQUIRED');
  });

  it('rejects a final-record proof bound to another revision before touching D1', async () => {
    await expect(
      appendEdbSignature({
        db: neverDb,
        empresaId: 10,
        revisionId: 'edbrev-1',
        signature: {
          signatureId: 'sig-flight-1',
          type: 'PIC_FLIGHT_RECORD',
          targetType: 'FINAL_RECORD_REVISION',
          targetId: 'edbrev-other',
          signer: { employeeId: 10, fullName: 'PIC Test', anacCode: '123456' },
          signedAt: '2026-08-28T13:00:00Z',
          canonicalPayloadHashSha256: 'b'.repeat(64),
          method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
          proofReference: 'proof/flight-1',
        },
      }),
    ).rejects.toThrow('EDB_FINAL_SIGNATURE_TARGET_MISMATCH');
  });
});
