import { describe, expect, it } from 'vitest';
import type { EdbSignatureProof } from '../../services/edb/contracts';
import {
  bindPicTechnicalAcknowledgement,
  createTechnicalSituationSnapshot,
} from '../../services/edb/technical-awareness';
import {
  appendEdbPicTechnicalAcknowledgement,
  persistEdbTechnicalSituation,
} from '../../repositories/edb/edb-technical-awareness-repository';

const neverDb = new Proxy(
  {},
  {
    get() {
      throw new Error('database must not be touched when integrity guard fails');
    },
  },
) as D1Database;

async function evidence() {
  const snapshot = await createTechnicalSituationSnapshot({
    snapshotId: 'tech-1',
    operatorCompanyId: 1,
    sourceFlightId: 100,
    aircraft: {
      aircraftId: 12,
      manufacturer: 'Leonardo',
      model: 'AW139',
      serialNumber: 'SN-001',
      registrationMarks: 'PR-ABC',
      owners: ['Owner'],
      operators: ['Operator'],
    },
    maintenance: {
      lastIntervention: {
        type: 'Inspection',
        date: '2026-08-20',
        returnToServiceApprovedBy: 'Maintenance',
      },
      nextIntervention: { type: '50h', dueAtAirframeHours: 1520 },
    },
    capturedAt: '2026-08-28T09:00:00.000Z',
  });
  const signature: EdbSignatureProof = {
    signatureId: 'sig-tech-1',
    type: 'PIC_TECHNICAL_ACK',
    targetType: 'TECHNICAL_SITUATION',
    targetId: snapshot.snapshotId,
    signer: { employeeId: 10, fullName: 'PIC Test', anacCode: '123456' },
    signedAt: '2026-08-28T09:30:00.000Z',
    canonicalPayloadHashSha256: snapshot.canonicalSnapshotSha256,
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: 'proof/tech-1',
  };
  return {
    snapshot,
    acknowledgement: bindPicTechnicalAcknowledgement({
      snapshot,
      signature,
    }),
  };
}

describe('eDB preflight persistence guards', () => {
  it('rejects a mutated technical snapshot before D1', async () => {
    const { snapshot } = await evidence();
    snapshot.maintenance.nextIntervention.dueAtAirframeHours = 1510;

    await expect(
      persistEdbTechnicalSituation({ db: neverDb, snapshot }),
    ).rejects.toThrow('EDB_TECHNICAL_CONTENT_HASH_MISMATCH');
  });

  it('rejects target substitution before looking up the technical snapshot', async () => {
    const { acknowledgement } = await evidence();
    acknowledgement.signature.targetId = 'tech-other';

    await expect(
      appendEdbPicTechnicalAcknowledgement({
        db: neverDb,
        acknowledgement,
      }),
    ).rejects.toThrow('EDB_TECHNICAL_ACK_TARGET_MISMATCH');
  });

  it('requires the referenced snapshot to exist in the same company/flight scope', async () => {
    const { acknowledgement } = await evidence();
    const missingSnapshotDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
        }),
      }),
    } as unknown as D1Database;

    await expect(
      appendEdbPicTechnicalAcknowledgement({
        db: missingSnapshotDb,
        acknowledgement,
      }),
    ).rejects.toThrow('EDB_TECHNICAL_SNAPSHOT_NOT_FOUND_OR_SCOPE_MISMATCH');
  });
});
