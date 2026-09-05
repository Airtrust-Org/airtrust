import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  hashSignableEdbPayload,
  sha256Hex,
} from '../../services/edb/canonicalization';
import {
  createEmptyEdbFlightRecord,
  type EdbFlightRecord,
  type EdbSignatureProof,
} from '../../services/edb/contracts';
import { loadVerifiedEdbRevisionView } from '../../repositories/edb/edb-revision-view-repository';

const REVISION_ID = 'rev-100-1';

function baseRecord(): EdbFlightRecord {
  const record = createEmptyEdbFlightRecord({
    operatorCompanyId: 1,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 100,
    sourceRdvId: 200,
    sourceRdvVersion: 1,
    sourceStageId: 300,
    capturedAt: '2026-09-05T10:00:00.000Z',
    logicalRecordId: 'flight-100-stage-300',
    revisionId: REVISION_ID,
  });

  record.identity.aircraft = {
    aircraftId: 12,
    manufacturer: 'Leonardo',
    model: 'AW139',
    serialNumber: 'SN-001',
    registrationMarks: 'PR-ABC',
    owners: ['Owner'],
    operators: ['Operator'],
  };
  record.maintenance = {
    lastIntervention: {
      type: 'Inspection',
      date: '2026-09-01',
      returnToServiceApprovedBy: 'Maintenance',
    },
    nextIntervention: {
      type: '50h',
      dueAtAirframeHours: 1520,
    },
  };
  record.flight = {
    date: '2026-09-05',
    origin: 'SBJR',
    destination: 'SSXX',
    times: {
      engineStartAt: '2026-09-05T09:00:00.000Z',
      takeoffAt: '2026-09-05T09:05:00.000Z',
      landingAt: '2026-09-05T09:55:00.000Z',
      engineShutdownAt: '2026-09-05T10:00:00.000Z',
    },
    landingsTotal: 1,
    cycles: null,
    duration: {
      dayMinutes: 50,
      nightMinutes: 0,
      totalMinutes: 50,
      ifrActualMinutes: null,
      ifrSimulatedMinutes: null,
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
        fullName: 'PIC Test',
        anacCode: '123456',
        operationalRole: 'PIC',
        regulatoryFunctionCode: null,
      },
    ],
  };
  record.signatures.picTechnicalAcknowledgement = {
    signatureId: 'tech-sig-1',
    type: 'PIC_TECHNICAL_ACK',
    targetType: 'TECHNICAL_SITUATION',
    targetId: 'tech-1',
    signer: {
      employeeId: 10,
      fullName: 'PIC Test',
      anacCode: '123456',
    },
    signedAt: '2026-09-05T08:50:00.000Z',
    canonicalPayloadHashSha256: 'a'.repeat(64),
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: 'proof/tech-1',
  };
  return record;
}

function signatureProof(
  type: 'PIC_FLIGHT_RECORD' | 'OPERATOR_RECORD',
  hash: string,
): EdbSignatureProof {
  return {
    signatureId: type === 'PIC_FLIGHT_RECORD' ? 'sig-pic-1' : 'sig-operator-1',
    type,
    targetType: 'FINAL_RECORD_REVISION',
    targetId: REVISION_ID,
    signer: {
      employeeId: type === 'PIC_FLIGHT_RECORD' ? 10 : 20,
      fullName: type === 'PIC_FLIGHT_RECORD' ? 'PIC Test' : 'Operator Test',
      anacCode: type === 'PIC_FLIGHT_RECORD' ? '123456' : null,
    },
    signedAt:
      type === 'PIC_FLIGHT_RECORD'
        ? '2026-09-05T10:05:00.000Z'
        : '2026-09-05T11:00:00.000Z',
    canonicalPayloadHashSha256: hash,
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference:
      type === 'PIC_FLIGHT_RECORD' ? 'proof/pic-1' : 'proof/operator-1',
  };
}

async function revisionRow(
  record: EdbFlightRecord,
  status: string = 'DRAFT',
) {
  const payload = canonicalJson(record);
  return {
    id: REVISION_ID,
    empresa_id: 1,
    logical_record_id: 'flight-100-stage-300',
    payload_json: payload,
    canonical_payload_sha256: await sha256Hex(payload),
    status,
    state_version: 1,
    diario_id: 1,
    volume_id: 'vol-1',
    revisao: 1,
    voo_id: 100,
    etapa_id: 300,
  };
}

function signatureRow(proof: EdbSignatureProof) {
  return {
    id: proof.signatureId,
    revision_id: REVISION_ID,
    tipo: proof.type,
    signer_funcionario_id: proof.signer.employeeId,
    signer_nome: proof.signer.fullName,
    signer_codigo_anac: proof.signer.anacCode,
    signed_at: proof.signedAt,
    canonical_payload_sha256: proof.canonicalPayloadHashSha256,
    metodo: proof.method,
    proof_reference: proof.proofReference,
  };
}

function fakeDb(row: unknown, signatures: unknown[] = []): D1Database {
  return {
    prepare(sql: string) {
      if (sql.includes('FROM edb_registro_revisoes r')) {
        return {
          bind() {
            return {
              first: async () => row,
            };
          },
        };
      }
      if (sql.includes('FROM edb_assinaturas')) {
        return {
          bind() {
            return {
              all: async () => ({ results: signatures }),
            };
          },
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as D1Database;
}

describe('eDB verified final revision view', () => {
  it('loads an intact DRAFT revision with no final signatures', async () => {
    const record = baseRecord();
    const row = await revisionRow(record);
    const view = await loadVerifiedEdbRevisionView({
      db: fakeDb(row),
      empresaId: 1,
      revisionId: REVISION_ID,
    });

    expect(view?.record.status).toBe('DRAFT');
    expect(view?.record.logicalRecordId).toBe('flight-100-stage-300');
    expect(view?.stateVersion).toBe(1);
    expect(view?.sourceStageId).toBe(300);
  });

  it('rejects a stored payload whose bytes no longer match the pinned hash', async () => {
    const record = baseRecord();
    const row = await revisionRow(record);
    row.payload_json = canonicalJson({
      ...record,
      logicalRecordId: 'tampered-logical-id',
    });

    await expect(
      loadVerifiedEdbRevisionView({
        db: fakeDb(row),
        empresaId: 1,
        revisionId: REVISION_ID,
      }),
    ).rejects.toThrow('EDB_REVISION_PERSISTED_HASH_MISMATCH');
  });

  it('rejects external or unknown lifecycle states instead of hydrating them', async () => {
    const row = await revisionRow(baseRecord(), 'ANAC_PENDING');

    await expect(
      loadVerifiedEdbRevisionView({
        db: fakeDb(row),
        empresaId: 1,
        revisionId: REVISION_ID,
      }),
    ).rejects.toThrow('EDB_REVISION_STATE_INVALID');
  });

  it('verifies PIC and operator signatures before returning OPERATOR_SIGNED', async () => {
    const payloadRecord = baseRecord();
    const row = await revisionRow(payloadRecord, 'OPERATOR_SIGNED');

    const picHash = await hashSignableEdbPayload(
      payloadRecord,
      'PIC_FLIGHT_RECORD',
    );
    const pic = signatureProof('PIC_FLIGHT_RECORD', picHash);

    const recordWithPic = JSON.parse(
      JSON.stringify(payloadRecord),
    ) as EdbFlightRecord;
    recordWithPic.signatures.picFlightRecord = pic;

    const operatorHash = await hashSignableEdbPayload(
      recordWithPic,
      'OPERATOR_RECORD',
    );
    const operator = signatureProof('OPERATOR_RECORD', operatorHash);

    const view = await loadVerifiedEdbRevisionView({
      db: fakeDb(row, [signatureRow(pic), signatureRow(operator)]),
      empresaId: 1,
      revisionId: REVISION_ID,
    });

    expect(view?.record.status).toBe('OPERATOR_SIGNED');
    expect(view?.record.signatures.picFlightRecord?.signatureId).toBe('sig-pic-1');
    expect(view?.record.signatures.operatorRecord?.signatureId).toBe(
      'sig-operator-1',
    );
  });

  it('fails closed when persisted state requires a PIC signature that is missing', async () => {
    const row = await revisionRow(baseRecord(), 'PIC_SIGNED');

    await expect(
      loadVerifiedEdbRevisionView({
        db: fakeDb(row),
        empresaId: 1,
        revisionId: REVISION_ID,
      }),
    ).rejects.toThrow('EDB_PIC_SIGNATURE_REQUIRED_FOR_STATE');
  });
});
