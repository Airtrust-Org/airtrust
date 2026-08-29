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

function proof(type: EdbSignatureType, hash: string): EdbSignatureProof {
  return {
    signatureId: `sig-${type}`,
    type,
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
  });
  value.recordId = 'edb-1-r1';
  value.identity.aircraft.registrationMarks = 'PR-ABC';
  value.maintenance.lastIntervention.type = 'Inspecao';
  value.flight.date = '2026-08-28';
  value.flight.origin = 'SBJR';
  value.flight.destination = 'SSXX';
  value.flight.personsOnBoard = 8;
  return value;
}

describe('eDB signature payload binding', () => {
  it('matches a stored proof when the canonical payload is unchanged', async () => {
    const value = record();
    const hash = await hashSignableEdbPayload(value, 'PIC_TECHNICAL_ACK');
    value.signatures.picTechnicalAcknowledgement = proof('PIC_TECHNICAL_ACK', hash);

    const result = await verifyEdbSignaturePayloadBinding(value, 'PIC_TECHNICAL_ACK');
    expect(result).toMatchObject({
      present: true,
      matchesPayload: true,
      storedHashSha256: hash,
      expectedHashSha256: hash,
    });
  });

  it('detects mutation of data covered by a signature', async () => {
    const value = record();
    const hash = await hashSignableEdbPayload(value, 'PIC_TECHNICAL_ACK');
    value.signatures.picTechnicalAcknowledgement = proof('PIC_TECHNICAL_ACK', hash);

    value.maintenance.lastIntervention.type = 'Alteracao indevida apos assinatura';
    const result = await verifyEdbSignaturePayloadBinding(value, 'PIC_TECHNICAL_ACK');
    expect(result.present).toBe(true);
    expect(result.matchesPayload).toBe(false);
    expect(result.expectedHashSha256).not.toBe(result.storedHashSha256);
  });

  it('validates each stored signature against the payload layer it protects', async () => {
    const value = record();
    const techHash = await hashSignableEdbPayload(value, 'PIC_TECHNICAL_ACK');
    value.signatures.picTechnicalAcknowledgement = proof('PIC_TECHNICAL_ACK', techHash);

    const flightHash = await hashSignableEdbPayload(value, 'PIC_FLIGHT_RECORD');
    value.signatures.picFlightRecord = proof('PIC_FLIGHT_RECORD', flightHash);

    const results = await verifyAllStoredEdbSignatureBindings(value);
    expect(results).toHaveLength(2);
    expect(results.every((item) => item.matchesPayload)).toBe(true);

    value.flight.personsOnBoard = 9;
    const afterMutation = await verifyAllStoredEdbSignatureBindings(value);
    expect(afterMutation.find((item) => item.type === 'PIC_TECHNICAL_ACK')?.matchesPayload).toBe(true);
    expect(afterMutation.find((item) => item.type === 'PIC_FLIGHT_RECORD')?.matchesPayload).toBe(false);
  });
});
