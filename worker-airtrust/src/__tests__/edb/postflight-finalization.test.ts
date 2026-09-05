import { describe, expect, it } from 'vitest';
import { createEmptyEdbFlightRecord, type EdbFlightRecord, type EdbSignatureProof } from '../../services/edb/contracts';
import { finalizePostflightEdbRecord } from '../../services/edb/postflight-finalization';
import {
  bindPicTechnicalAcknowledgement,
  createTechnicalSituationSnapshot,
} from '../../services/edb/technical-awareness';

function completeRecord(): EdbFlightRecord {
  const record = createEmptyEdbFlightRecord({
    operatorCompanyId: 1,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 100,
    sourceRdvId: 200,
    sourceRdvVersion: 3,
    sourceStageId: 300,
    capturedAt: '2026-08-28T11:05:00.000Z',
    logicalRecordId: 'flight-100-stage-300',
    revisionId: 'edbrev-100-300-r1',
  });
  record.identity.aircraft = {
    aircraftId: 12,
    manufacturer: 'Leonardo',
    model: 'AW139',
    serialNumber: 'SN-001',
    registrationMarks: 'PR-ABC',
    owners: ['Empresa Proprietaria'],
    operators: ['Empresa Operadora'],
  };
  record.maintenance = {
    lastIntervention: {
      type: 'Inspecao programada',
      date: '2026-08-20',
      returnToServiceApprovedBy: 'Responsavel Manutencao',
    },
    nextIntervention: { type: 'Inspecao 50h', dueAtAirframeHours: 1520 },
  };
  record.flight = {
    date: '2026-08-28',
    origin: 'SBJR',
    destination: 'SSXX',
    times: {
      engineStartAt: '2026-08-28T10:00:00.000Z',
      takeoffAt: '2026-08-28T10:05:00.000Z',
      landingAt: '2026-08-28T10:55:00.000Z',
      engineShutdownAt: '2026-08-28T11:00:00.000Z',
    },
    landingsTotal: 1,
    cycles: 1,
    duration: {
      dayMinutes: 50,
      nightMinutes: 0,
      totalMinutes: 50,
      ifrActualMinutes: 0,
      ifrSimulatedMinutes: 0,
    },
    fuelBeforeEngineStart: 900,
    personsOnBoard: 8,
    cargoKg: 0,
    nature: 'TRANSPORTE',
    occurrences: [],
    technicalDiscrepancies: [],
    crew: [
      {
        employeeId: 10,
        fullName: 'Piloto em Comando',
        anacCode: '123456',
        operationalRole: 'PIC',
        regulatoryFunctionCode: null,
      },
    ],
  };
  return record;
}

async function preflight(record: EdbFlightRecord, signedAt = '2026-08-28T09:30:00.000Z') {
  const snapshot = await createTechnicalSituationSnapshot({
    snapshotId: 'tech-1',
    operatorCompanyId: record.identity.operatorCompanyId,
    sourceFlightId: record.source.sourceFlightId,
    aircraft: record.identity.aircraft,
    maintenance: record.maintenance,
    capturedAt: '2026-08-28T09:00:00.000Z',
  });
  const signature: EdbSignatureProof = {
    signatureId: 'sig-tech-1',
    type: 'PIC_TECHNICAL_ACK',
    targetType: 'TECHNICAL_SITUATION',
    targetId: snapshot.snapshotId,
    signer: { employeeId: 10, fullName: 'Piloto em Comando', anacCode: '123456' },
    signedAt,
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

describe('eDB postflight finalization', () => {
  it('accepts postflight operational completion without invalidating preflight awareness', async () => {
    const record = completeRecord();
    const { snapshot, acknowledgement } = await preflight(record);

    record.flight.personsOnBoard = 9;
    record.flight.cycles = 2;
    const finalized = await finalizePostflightEdbRecord({
      draftRecord: record,
      technicalSituation: snapshot,
      technicalAcknowledgement: acknowledgement,
    });

    expect(finalized.logicalRecordId).toBe('flight-100-stage-300');
    expect(finalized.revisionId).toBe('edbrev-100-300-r1');
    expect(finalized.technicalAcknowledgementSignatureId).toBe('sig-tech-1');
    expect(finalized.record.flight.personsOnBoard).toBe(9);
    expect(finalized.record.flight.cycles).toBe(2);
    expect(finalized.record.signatures.picTechnicalAcknowledgement?.signatureId).toBe('sig-tech-1');
    expect(finalized.record.signatures.picTechnicalAcknowledgement?.targetId).toBe('tech-1');
  });

  it('rejects finalization before an immutable revision identity is assigned', async () => {
    const record = completeRecord();
    record.revisionId = null;
    const { snapshot, acknowledgement } = await preflight(record);

    await expect(
      finalizePostflightEdbRecord({
        draftRecord: record,
        technicalSituation: snapshot,
        technicalAcknowledgement: acknowledgement,
      }),
    ).rejects.toThrow('EDB_REVISION_ID_REQUIRED');
  });

  it('rejects finalization when the acknowledged maintenance situation changed', async () => {
    const record = completeRecord();
    const { snapshot, acknowledgement } = await preflight(record);
    record.maintenance.nextIntervention.dueAtAirframeHours = 1510;

    await expect(
      finalizePostflightEdbRecord({
        draftRecord: record,
        technicalSituation: snapshot,
        technicalAcknowledgement: acknowledgement,
      }),
    ).rejects.toThrow('EDB_TECHNICAL_SITUATION_CHANGED_AFTER_ACK');
  });

  it('rejects an acknowledgement made exactly at engine start', async () => {
    const record = completeRecord();
    const { snapshot, acknowledgement } = await preflight(record, '2026-08-28T10:00:00.000Z');

    await expect(
      finalizePostflightEdbRecord({
        draftRecord: record,
        technicalSituation: snapshot,
        technicalAcknowledgement: acknowledgement,
      }),
    ).rejects.toThrow('EDB_TECHNICAL_ACK_NOT_BEFORE_FLIGHT');
  });

  it('rejects an acknowledgement made after engine start', async () => {
    const record = completeRecord();
    const { snapshot, acknowledgement } = await preflight(record, '2026-08-28T10:01:00.000Z');

    await expect(
      finalizePostflightEdbRecord({
        draftRecord: record,
        technicalSituation: snapshot,
        technicalAcknowledgement: acknowledgement,
      }),
    ).rejects.toThrow('EDB_TECHNICAL_ACK_NOT_BEFORE_FLIGHT');
  });
});
