import { describe, expect, it } from 'vitest';
import type { EdbAircraftIdentity, EdbMaintenanceSnapshot, EdbSignatureProof } from '../../services/edb/contracts';
import {
  bindPicTechnicalAcknowledgement,
  createTechnicalSituationSnapshot,
  technicalSituationMatches,
} from '../../services/edb/technical-awareness';

const aircraft: EdbAircraftIdentity = {
  aircraftId: 12,
  manufacturer: 'Leonardo',
  model: 'AW139',
  serialNumber: 'SN-001',
  registrationMarks: 'PR-ABC',
  owners: ['Empresa Proprietaria'],
  operators: ['Empresa Operadora'],
};

const maintenance: EdbMaintenanceSnapshot = {
  lastIntervention: {
    type: 'Inspecao programada',
    date: '2026-08-20',
    returnToServiceApprovedBy: 'Responsavel Manutencao',
  },
  nextIntervention: {
    type: 'Inspecao 50h',
    dueAtAirframeHours: 1520,
  },
};

describe('eDB preflight technical awareness', () => {
  it('binds the PIC acknowledgement to the exact preflight snapshot hash', async () => {
    const snapshot = await createTechnicalSituationSnapshot({
      snapshotId: 'tech-1',
      operatorCompanyId: 1,
      sourceFlightId: 100,
      aircraft,
      maintenance,
      capturedAt: '2026-08-28T09:00:00.000Z',
    });
    const signature: EdbSignatureProof = {
      signatureId: 'sig-tech-1',
      type: 'PIC_TECHNICAL_ACK',
      signer: { employeeId: 10, fullName: 'Piloto em Comando', anacCode: '123456' },
      signedAt: '2026-08-28T09:30:00.000Z',
      canonicalPayloadHashSha256: snapshot.canonicalSnapshotSha256,
      method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
      proofReference: 'proof/tech-1',
    };

    const acknowledgement = bindPicTechnicalAcknowledgement({
      acknowledgementId: 'ack-1',
      snapshot,
      signature,
    });
    expect(acknowledgement.technicalSituationId).toBe('tech-1');

    expect(
      await technicalSituationMatches({
        snapshot,
        operatorCompanyId: 1,
        sourceFlightId: 100,
        aircraft,
        maintenance,
      }),
    ).toBe(true);
  });

  it('invalidates the acknowledgement only when aircraft/maintenance content changes', async () => {
    const snapshot = await createTechnicalSituationSnapshot({
      snapshotId: 'tech-2',
      operatorCompanyId: 1,
      sourceFlightId: 100,
      aircraft,
      maintenance,
      capturedAt: '2026-08-28T09:00:00.000Z',
    });

    const changedMaintenance: EdbMaintenanceSnapshot = {
      ...maintenance,
      nextIntervention: {
        ...maintenance.nextIntervention,
        dueAtAirframeHours: 1510,
      },
    };

    expect(
      await technicalSituationMatches({
        snapshot,
        operatorCompanyId: 1,
        sourceFlightId: 100,
        aircraft,
        maintenance: changedMaintenance,
      }),
    ).toBe(false);
  });

  it('rejects a signature proof for a different payload', async () => {
    const snapshot = await createTechnicalSituationSnapshot({
      snapshotId: 'tech-3',
      operatorCompanyId: 1,
      sourceFlightId: 100,
      aircraft,
      maintenance,
      capturedAt: '2026-08-28T09:00:00.000Z',
    });

    expect(() =>
      bindPicTechnicalAcknowledgement({
        acknowledgementId: 'ack-bad',
        snapshot,
        signature: {
          signatureId: 'sig-bad',
          type: 'PIC_TECHNICAL_ACK',
          signer: { employeeId: 10, fullName: 'Piloto em Comando', anacCode: '123456' },
          signedAt: '2026-08-28T09:30:00.000Z',
          canonicalPayloadHashSha256: 'f'.repeat(64),
          method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
          proofReference: 'proof/bad',
        },
      }),
    ).toThrow('EDB_TECHNICAL_ACK_HASH_MISMATCH');
  });
});
