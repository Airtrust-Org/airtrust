import { describe, expect, it } from 'vitest';
import { hashSignableEdbPayload } from '../../services/edb/canonicalization';
import {
  createEmptyEdbFlightRecord,
  type EdbSignatureProof,
  type EdbSignatureType,
} from '../../services/edb/contracts';
import {
  verifyAllStoredEdbSignatureBindings,
  verifyEdbSignaturePayloadBinding,
} from '../../services/edb/signature-integrity';

const REVISION_ID = 'edbrev-1-r1';

function proof(type: EdbSignatureType, hash: string): EdbSignatureProof {
  return {
    signatureId: `sig-${type}`,
    type,
    targetType: type === 'PIC_TECHNICAL_ACK' ? 'TECHNICAL_SITUATION' : 'FINAL_RECORD_REVISION',
    targetId: type === 'PIC_TECHNICAL_ACK' ? 'tech-fixture-1' : REVISION_ID,
    signer: {
      employeeId: 10,
      fullName: type === 'OPERATOR_RECORD' ? 'Operador Designado' : 'Piloto em Comando',
      anacCode: type === 'OPERATOR_RECORD' ? null : '123456',
    },
    signedAt: '2026-08-28T12:00:00.000Z',
    canonicalPayloadHashSha256: hash,
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: `proof/${type}`,
  };
}

function record() {
  const value = createEmptyEdbFlightRecord({
    operatorCompanyId: 1,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 100,
    sourceRdvId: 200,
    sourceRdvVersion: 1,
    sourceStageId: 300,
    capturedAt: '2026-08-28T10:00:00.000Z',
    logicalRecordId: 'flight-100-stage-300',
    revisionId: REVISION_ID,
  });
  value.identity.aircraft.registrationMarks = 'PR-ABC';
  value.maintenance.lastIntervention.type = 'Inspecao';
  value.flight.date = '2026-08-28';
  value.flight.origin = 'SBJR';
  value.flight.destination = 'SSXX';
  value.flight.personsOnBoard = 8;
  value.signatures.picTechnicalAcknowledgement = proof('PIC_TECHNICAL_ACK', 'a'.repeat(64));
  return value;
}

describe('eDB final-record signature payload binding', () => {
  it('matches a stored PIC flight proof when payload and immutable target are unchanged', async () => {
    const value = record();
    const hash = await hashSignableEdbPayload(value, 'PIC_FLIGHT_RECORD');
    value.signatures.picFlightRecord = proof('PIC_FLIGHT_RECORD', hash);

    const result = await verifyEdbSignaturePayloadBinding(value, 'PIC_FLIGHT_RECORD', REVISION_ID);
    expect(result).toMatchObject({
      present: true,
      matchesPayload: true,
      targetMatches: true,
      storedTargetId: REVISION_ID,
      storedHashSha256: hash,
      expectedHashSha256: hash,
    });
  });

  it('fails closed when the expected signature is absent', async () => {
    const result = await verifyEdbSignaturePayloadBinding(record(), 'PIC_FLIGHT_RECORD', REVISION_ID);
    expect(result).toEqual({
      type: 'PIC_FLIGHT_RECORD',
      present: false,
      matchesPayload: false,
      targetMatches: false,
      storedTargetId: null,
      storedHashSha256: null,
      expectedHashSha256: null,
    });
  });

  it('detects mutation of final flight data covered by the PIC signature', async () => {
    const value = record();
    const hash = await hashSignableEdbPayload(value, 'PIC_FLIGHT_RECORD');
    value.signatures.picFlightRecord = proof('PIC_FLIGHT_RECORD', hash);

    value.flight.personsOnBoard = 9;
    const result = await verifyEdbSignaturePayloadBinding(value, 'PIC_FLIGHT_RECORD', REVISION_ID);
    expect(result.present).toBe(true);
    expect(result.matchesPayload).toBe(false);
    expect(result.expectedHashSha256).not.toBe(result.storedHashSha256);
  });

  it('detects a valid payload proof copied to another final-record revision', async () => {
    const value = record();
    const hash = await hashSignableEdbPayload(value, 'PIC_FLIGHT_RECORD');
    value.signatures.picFlightRecord = proof('PIC_FLIGHT_RECORD', hash);

    const result = await verifyEdbSignaturePayloadBinding(value, 'PIC_FLIGHT_RECORD', 'edbrev-1-r2');
    expect(result.present).toBe(true);
    expect(result.targetMatches).toBe(false);
    expect(result.matchesPayload).toBe(false);
    expect(result.storedHashSha256).toBe(result.expectedHashSha256);
  });

  it('rejects an empty immutable target id even when the payload hash is valid', async () => {
    const value = record();
    const hash = await hashSignableEdbPayload(value, 'PIC_FLIGHT_RECORD');
    value.signatures.picFlightRecord = { ...proof('PIC_FLIGHT_RECORD', hash), targetId: '   ' };

    const result = await verifyEdbSignaturePayloadBinding(value, 'PIC_FLIGHT_RECORD');
    expect(result.present).toBe(true);
    expect(result.targetMatches).toBe(false);
    expect(result.matchesPayload).toBe(false);
  });

  it('detects revision identity mutation even when all flight fields are unchanged', async () => {
    const value = record();
    const hash = await hashSignableEdbPayload(value, 'PIC_FLIGHT_RECORD');
    value.signatures.picFlightRecord = proof('PIC_FLIGHT_RECORD', hash);

    value.revisionId = 'edbrev-1-r2';
    const result = await verifyEdbSignaturePayloadBinding(value, 'PIC_FLIGHT_RECORD', 'edbrev-1-r2');
    expect(result.targetMatches).toBe(false);
    expect(result.matchesPayload).toBe(false);
    expect(result.expectedHashSha256).not.toBe(hash);
  });

  it('validates only postflight signatures; preflight integrity has its own verifier', async () => {
    const value = record();
    const flightHash = await hashSignableEdbPayload(value, 'PIC_FLIGHT_RECORD');
    value.signatures.picFlightRecord = proof('PIC_FLIGHT_RECORD', flightHash);

    const operatorHash = await hashSignableEdbPayload(value, 'OPERATOR_RECORD');
    value.signatures.operatorRecord = proof('OPERATOR_RECORD', operatorHash);

    const results = await verifyAllStoredEdbSignatureBindings(value, REVISION_ID);
    expect(results).toHaveLength(2);
    expect(results.map((item) => item.type)).toEqual(['PIC_FLIGHT_RECORD', 'OPERATOR_RECORD']);
    expect(results.every((item) => item.matchesPayload)).toBe(true);

    value.flight.personsOnBoard = 9;
    const afterMutation = await verifyAllStoredEdbSignatureBindings(value, REVISION_ID);
    expect(afterMutation.every((item) => item.matchesPayload)).toBe(false);
  });
});
