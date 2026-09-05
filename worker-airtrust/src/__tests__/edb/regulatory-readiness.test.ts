import { describe, expect, it } from 'vitest';
import { hashSignableEdbPayload } from '../../services/edb/canonicalization';
import {
  createEmptyEdbFlightRecord,
  type EdbFlightRecord,
  type EdbSignatureProof,
  type EdbSignatureType,
} from '../../services/edb/contracts';
import { assessEdbRegulatoryReadiness } from '../../services/edb/regulatory-readiness';
import {
  bindPicTechnicalAcknowledgement,
  createTechnicalSituationSnapshot,
  type EdbPicTechnicalAcknowledgement,
  type EdbTechnicalSituationSnapshot,
} from '../../services/edb/technical-awareness';

const REVISION_ID = 'edbrev-1-r1';

function proof(type: EdbSignatureType, hash: string, signedAt: string): EdbSignatureProof {
  return {
    signatureId: `sig-${type}`,
    type,
    targetType: type === 'PIC_TECHNICAL_ACK' ? 'TECHNICAL_SITUATION' : 'FINAL_RECORD_REVISION',
    targetId: type === 'PIC_TECHNICAL_ACK' ? 'tech-1' : REVISION_ID,
    signer: {
      employeeId: 10,
      fullName: type === 'OPERATOR_RECORD' ? 'Operador Designado' : 'Piloto em Comando',
      anacCode: type === 'OPERATOR_RECORD' ? null : '123456',
    },
    signedAt,
    canonicalPayloadHashSha256: hash,
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: `proof/${type}`,
  };
}

function completeRecord(): EdbFlightRecord {
  const record = createEmptyEdbFlightRecord({
    operatorCompanyId: 1,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 100,
    sourceRdvId: 200,
    sourceRdvVersion: 1,
    sourceStageId: 300,
    capturedAt: '2026-08-28T11:00:00.000Z',
    logicalRecordId: 'flight-100-stage-300',
    revisionId: REVISION_ID,
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
    nextIntervention: {
      type: 'Inspecao 50h',
      dueAtAirframeHours: 1520,
    },
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

async function preflight(record: EdbFlightRecord): Promise<{
  technicalSituation: EdbTechnicalSituationSnapshot;
  technicalAcknowledgement: EdbPicTechnicalAcknowledgement;
}> {
  const technicalSituation = await createTechnicalSituationSnapshot({
    snapshotId: 'tech-1',
    operatorCompanyId: record.identity.operatorCompanyId,
    sourceFlightId: record.source.sourceFlightId,
    aircraft: record.identity.aircraft,
    maintenance: record.maintenance,
    capturedAt: '2026-08-28T09:00:00.000Z',
  });
  const technicalAcknowledgement = bindPicTechnicalAcknowledgement({
    snapshot: technicalSituation,
    signature: proof(
      'PIC_TECHNICAL_ACK',
      technicalSituation.canonicalSnapshotSha256,
      '2026-08-28T09:55:00.000Z',
    ),
  });
  record.signatures.picTechnicalAcknowledgement = {
    ...technicalAcknowledgement.signature,
    signer: { ...technicalAcknowledgement.signature.signer },
  };
  return { technicalSituation, technicalAcknowledgement };
}

async function operatorSignedRecord() {
  const record = completeRecord();
  const evidence = await preflight(record);
  const picHash = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
  record.signatures.picFlightRecord = proof(
    'PIC_FLIGHT_RECORD',
    picHash,
    '2026-08-28T11:05:00.000Z',
  );
  const operatorHash = await hashSignableEdbPayload(record, 'OPERATOR_RECORD');
  record.signatures.operatorRecord = proof(
    'OPERATOR_RECORD',
    operatorHash,
    '2026-08-28T12:00:00.000Z',
  );
  record.status = 'OPERATOR_SIGNED';
  return { record, evidence };
}

describe('eDB regulatory readiness', () => {
  it('shows technical snapshot as the first action for an empty draft', async () => {
    const record = createEmptyEdbFlightRecord({
      operatorCompanyId: 1,
      operatorRegulation: 'RBAC135',
      sourceFlightId: 100,
      capturedAt: '2026-08-28T10:00:00.000Z',
    });
    const readiness = await assessEdbRegulatoryReadiness(
      record,
      new Date('2026-08-28T12:00:00.000Z'),
    );
    expect(readiness.internalRecordComplete).toBe(false);
    expect(readiness.readyForExternalAnacIntegration).toBe(false);
    expect(readiness.nextAction).toBe('TECHNICAL_SNAPSHOT');
    expect(readiness.steps.find((step) => step.id === 'PIC_TECHNICAL_ACK')?.status).toBe(
      'BLOCKED',
    );
  });

  it('marks internal completion after valid local signatures while ANAC remains external', async () => {
    const { record, evidence } = await operatorSignedRecord();
    const readiness = await assessEdbRegulatoryReadiness(
      record,
      new Date('2026-08-28T12:01:00.000Z'),
      evidence,
    );
    expect(readiness.internalRecordComplete).toBe(true);
    expect(readiness.readyForExternalAnacIntegration).toBe(true);
    expect(readiness.steps.find((step) => step.id === 'ANAC_SYNC')?.status).toBe(
      'PENDING_EXTERNAL',
    );
    expect(readiness.nextAction).toBeNull();
  });

  it('fails closed when immutable revision identity is missing', async () => {
    const { record, evidence } = await operatorSignedRecord();
    record.revisionId = null;
    const readiness = await assessEdbRegulatoryReadiness(
      record,
      new Date('2026-08-28T12:01:00.000Z'),
      evidence,
    );
    expect(readiness.internalRecordComplete).toBe(false);
    expect(readiness.readyForExternalAnacIntegration).toBe(false);
    expect(
      readiness.steps.find((step) => step.id === 'FLIGHT_RECORD')?.blockingCodes,
    ).toContain('EDB_REVISION_ID_REQUIRED');
  });

  it('fails closed when a final signature is copied to another revision target', async () => {
    const { record, evidence } = await operatorSignedRecord();
    if (!record.signatures.picFlightRecord) throw new Error('fixture missing PIC signature');
    record.signatures.picFlightRecord.targetId = 'edbrev-1-r2';
    const readiness = await assessEdbRegulatoryReadiness(
      record,
      new Date('2026-08-28T12:01:00.000Z'),
      evidence,
    );
    const picStep = readiness.steps.find((step) => step.id === 'PIC_FLIGHT_SIGNATURE');
    expect(readiness.internalRecordComplete).toBe(false);
    expect(readiness.readyForExternalAnacIntegration).toBe(false);
    expect(picStep?.status).toBe('ACTION_REQUIRED');
    expect(picStep?.blockingCodes).toContain('EDB_PIC_FLIGHT_SIGNATURE_TARGET_MISMATCH');
  });

  it('fails closed when signed flight data changes', async () => {
    const { record, evidence } = await operatorSignedRecord();
    record.flight.personsOnBoard = 9;
    const readiness = await assessEdbRegulatoryReadiness(
      record,
      new Date('2026-08-28T12:01:00.000Z'),
      evidence,
    );
    expect(readiness.internalRecordComplete).toBe(false);
    expect(readiness.readyForExternalAnacIntegration).toBe(false);
    expect(readiness.steps.find((step) => step.id === 'PIC_FLIGHT_SIGNATURE')?.status).toBe(
      'ACTION_REQUIRED',
    );
    expect(readiness.steps.find((step) => step.id === 'OPERATOR_SIGNATURE')?.status).toBe(
      'ACTION_REQUIRED',
    );
  });

  it('fails closed when preflight evidence is missing even if final signatures exist', async () => {
    const { record } = await operatorSignedRecord();
    const readiness = await assessEdbRegulatoryReadiness(
      record,
      new Date('2026-08-28T12:01:00.000Z'),
    );
    expect(readiness.internalRecordComplete).toBe(false);
    expect(readiness.readyForExternalAnacIntegration).toBe(false);
    expect(readiness.nextAction).toBe('TECHNICAL_SNAPSHOT');
  });
});
