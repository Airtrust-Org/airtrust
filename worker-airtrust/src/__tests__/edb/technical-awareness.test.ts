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

  it('fails closed when persisted acknowledgement tenant scope is substituted', async () => {
    const { snapshot, acknowledgement } = await fixture();
    const result = await verifyPicTechnicalAcknowledgementBinding({
      snapshot,
      acknowledgement: { ...acknowledgement, operatorCompanyId: 2 },
    });
    expect(result.snapshotIntegrity).toBe(true);
    expect(result.matchesSnapshot).toBe(false);
  });

  it('fails closed when persisted acknowledgement flight scope is substituted', async () => {
    const { snapshot, acknowledgement } = await fixture();
    const result = await verifyPicTechnicalAcknowledgementBinding({
      snapshot,
      acknowledgement: { ...acknowledgement, sourceFlightId: 101 },
    });
    expect(result.snapshotIntegrity).toBe(true);
    expect(result.matchesSnapshot).toBe(false);
  });

  it('fails closed when persisted signature time is invalid or predates the snapshot', async () => {
    const { snapshot, acknowledgement } = await fixture();
    for (const signedAt of ['not-a-timestamp', '2026-08-28T08:59:59.999Z']) {
      const result = await verifyPicTechnicalAcknowledgementBinding({
        snapshot,
        acknowledgement: {
          ...acknowledgement,
          signature: { ...acknowledgement.signature, signedAt },
        },
      });
      expect(result.snapshotIntegrity).toBe(true);
      expect(result.matchesSnapshot).toBe(false);
    }
  });

  it('rejects acknowledgement that predates the technical snapshot at bind time', async () => {
    const { snapshot, acknowledgement } = await fixture();
    expect(() => bindPicTechnicalAcknowledgement({
      snapshot,
      signature: { ...acknowledgement.signature, signedAt: '2026-08-28T08:59:59.999Z' },
    })).toThrow('EDB_TECHNICAL_ACK_PREDATES_SNAPSHOT');
  });

  it('rejects non-technical signature types at bind time', async () => {
    const { snapshot, acknowledgement } = await fixture();
    expect(() => bindPicTechnicalAcknowledgement({
      snapshot,
      signature: { ...acknowledgement.signature, type: 'PIC_FLIGHT_RECORD' },
    })).toThrow('EDB_TECHNICAL_ACK_SIGNATURE_TYPE_INVALID');
  });

  it('clones mutable aircraft and maintenance evidence into the snapshot', async () => {
    const mutableAircraft: EdbAircraftIdentity = {
      ...aircraft,
      owners: ['Original Owner'],
      operators: ['Original Operator'],
    };
    const mutableMaintenance: EdbMaintenanceSnapshot = {
      lastIntervention: { ...maintenance.lastIntervention },
      nextIntervention: { ...maintenance.nextIntervention },
    };
    const snapshot = await createTechnicalSituationSnapshot({
      snapshotId: 'tech-clone',
      operatorCompanyId: 1,
      sourceFlightId: 100,
      aircraft: mutableAircraft,
      maintenance: mutableMaintenance,
      capturedAt: '2026-08-28T09:00:00.000Z',
    });

    mutableAircraft.owners?.push('Injected Owner');
    mutableAircraft.operators?.push('Injected Operator');
    mutableMaintenance.lastIntervention.type = 'Mutated inspection';
    mutableMaintenance.nextIntervention.dueAtAirframeHours = 1;

    expect(snapshot.aircraft.owners).toEqual(['Original Owner']);
    expect(snapshot.aircraft.operators).toEqual(['Original Operator']);
    expect(snapshot.maintenance.lastIntervention.type).toBe('Scheduled inspection');
    expect(snapshot.maintenance.nextIntervention.dueAtAirframeHours).toBe(1520);
  });
});
