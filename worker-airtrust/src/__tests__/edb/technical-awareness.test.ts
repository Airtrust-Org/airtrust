import { describe, expect, it } from 'vitest';
import type { EdbAircraftIdentity, EdbMaintenanceSnapshot, EdbSignatureProof } from '../../services/edb/contracts';
import {
  bindPicTechnicalAcknowledgement,
  createTechnicalSituationSnapshot,
  technicalSituationMatches,
  verifyPicTechnicalAcknowledgementBinding,
} from '../../services/edb/technical-awareness';

const aircraft: EdbAircraftIdentity = {
  aircraftId: 12,
  manufacturer: 'Leonardo',
  model: 'AW139',
  serialNumber: 'SN-001',
  registrationMarks: 'PR-ABC',
  owners: ['Owner'],
  operators: ['Operator'],
};

const maintenance: EdbMaintenanceSnapshot = {
  lastIntervention: {
    type: 'Scheduled inspection',
    date: '2026-08-20',
    returnToServiceApprovedBy: 'Maintenance Responsible',
  },
  nextIntervention: {
    type: '50h inspection',
    dueAtAirframeHours: 1520,
  },
};

async function fixture() {
  const snapshot = await createTechnicalSituationSnapshot({
    snapshotId: 'tech-1', operatorCompanyId: 1, sourceFlightId: 100, aircraft, maintenance,
    capturedAt: '2026-08-28T09:00:00.000Z',
  });
  const proof: EdbSignatureProof = {
    signatureId: 'sig-tech-1', type: 'PIC_TECHNICAL_ACK', targetType: 'TECHNICAL_SITUATION',
    targetId: snapshot.snapshotId, signer: { employeeId: 10, fullName: 'PIC', anacCode: null },
    signedAt: '2026-08-28T09:30:00.000Z', canonicalPayloadHashSha256: snapshot.canonicalSnapshotSha256,
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE', proofReference: 'proof/tech-1',
  };
  return { snapshot, acknowledgement: bindPicTechnicalAcknowledgement({ snapshot, signature: proof }) };
}

describe('eDB technical awareness boundary', () => {
  it('binds acknowledgement to the exact immutable snapshot', async () => {
    const { snapshot, acknowledgement } = await fixture();
    expect(await verifyPicTechnicalAcknowledgementBinding({ snapshot, acknowledgement })).toMatchObject({
      present: true, snapshotIntegrity: true, matchesSnapshot: true,
      storedHashSha256: snapshot.canonicalSnapshotSha256,
      expectedHashSha256: snapshot.canonicalSnapshotSha256,
    });
  });

  it('fails closed after persisted snapshot mutation', async () => {
    const { snapshot, acknowledgement } = await fixture();
    snapshot.capturedAt = '2026-08-28T09:05:00.000Z';
    const result = await verifyPicTechnicalAcknowledgementBinding({ snapshot, acknowledgement });
    expect(result.snapshotIntegrity).toBe(false);
    expect(result.matchesSnapshot).toBe(false);
  });

  it('detects maintenance drift', async () => {
    const { snapshot } = await fixture();
    expect(await technicalSituationMatches({
      snapshot, operatorCompanyId: 1, sourceFlightId: 100, aircraft,
      maintenance: { ...maintenance, nextIntervention: { ...maintenance.nextIntervention, dueAtAirframeHours: 1510 } },
    })).toBe(false);
  });

  it('rejects target substitution', async () => {
    const { snapshot, acknowledgement } = await fixture();
    expect(() => bindPicTechnicalAcknowledgement({
      snapshot, signature: { ...acknowledgement.signature, targetId: 'tech-other' },
    })).toThrow('EDB_TECHNICAL_ACK_TARGET_MISMATCH');
  });

  it('rejects canonical hash substitution', async () => {
    const { snapshot, acknowledgement } = await fixture();
    expect(() => bindPicTechnicalAcknowledgement({
      snapshot, signature: { ...acknowledgement.signature, canonicalPayloadHashSha256: 'f'.repeat(64) },
    })).toThrow('EDB_TECHNICAL_ACK_HASH_MISMATCH');
  });
});
