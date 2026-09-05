import { describe, expect, it } from 'vitest';
import { createEmptyEdbFlightRecord } from '../../services/edb/contracts';
import { isPersistedEdbFlightRecord } from '../../services/edb/persisted-record-validation';

function record() {
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

describe('eDB persisted record runtime validation', () => {
  it('accepts the canonical contract shape before business completeness validation', () => {
    expect(isPersistedEdbFlightRecord(record())).toBe(true);
  });

  it('rejects unverified ANAC transport lifecycle states', () => {
    for (const status of ['ANAC_PENDING', 'ANAC_SYNCED']) {
      const value = record() as unknown as { status: string };
      value.status = status;
      expect(isPersistedEdbFlightRecord(value)).toBe(false);
    }
  });

  it('rejects non-integer persistent identities', () => {
    const value = record();
    value.source.sourceFlightId = 20.5;
    expect(isPersistedEdbFlightRecord(value)).toBe(false);
  });

  it('rejects malformed persisted timestamps', () => {
    const value = record();
    value.source.capturedAt = 'not-a-timestamp';
    expect(isPersistedEdbFlightRecord(value)).toBe(false);
  });

  it('rejects malformed signature hashes even when the rest of the proof shape exists', () => {
    const value = record();
    value.signatures.picTechnicalAcknowledgement = {
      signatureId: 'sig-tech-1',
      type: 'PIC_TECHNICAL_ACK',
      targetType: 'TECHNICAL_SITUATION',
      targetId: 'tech-1',
      signer: { employeeId: 10, fullName: 'PIC Test', anacCode: '123456' },
      signedAt: '2026-08-28T11:00:00Z',
      canonicalPayloadHashSha256: 'invalid',
      method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
      proofReference: 'proof/tech-1',
    };
    expect(isPersistedEdbFlightRecord(value)).toBe(false);
  });
});
