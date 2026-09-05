import { describe, expect, it } from 'vitest';
import {
  buildSignableEdbPayload,
  canonicalJson,
  hashSignableEdbPayload,
  sha256Hex,
} from '../../services/edb/canonicalization';
import {
  createEmptyEdbFlightRecord,
  type EdbSignatureProof,
} from '../../services/edb/contracts';

function makeRecord() {
  return createEmptyEdbFlightRecord({
    operatorCompanyId: 7,
    operatorRegulation: 'RBAC135',
    sourceFlightId: 101,
    sourceRdvId: 202,
    sourceRdvVersion: 1,
    sourceStageId: 303,
    capturedAt: '2026-09-05T08:00:00.000Z',
    logicalRecordId: 'flight-101-stage-303',
    revisionId: 'edbrev-101-r1',
  });
}

function proof(type: 'PIC_TECHNICAL_ACK' | 'PIC_FLIGHT_RECORD'): EdbSignatureProof {
  return {
    signatureId: `sig-${type}`,
    type,
    targetType: type === 'PIC_TECHNICAL_ACK' ? 'TECHNICAL_SITUATION' : 'FINAL_RECORD_REVISION',
    targetId: type === 'PIC_TECHNICAL_ACK' ? 'tech-101' : 'edbrev-101-r1',
    signer: {
      employeeId: 9,
      fullName: 'Fixture Signer',
      anacCode: null,
    },
    signedAt: '2026-09-05T08:10:00.000Z',
    canonicalPayloadHashSha256: 'a'.repeat(64),
    method: 'ASYMMETRIC_DIGITAL_SIGNATURE',
    proofReference: `fixture/${type}`,
  };
}

describe('eDB canonical final-record payload foundation', () => {
  it('sorts object keys recursively while preserving array order and explicit nulls', () => {
    expect(
      canonicalJson({
        z: 1,
        nested: { b: null, a: 2, ignored: undefined },
        arr: [{ y: 2, x: 1 }, 'keep-order'],
        a: true,
      }),
    ).toBe('{"a":true,"arr":[{"x":1,"y":2},"keep-order"],"nested":{"a":2,"b":null},"z":1}');
  });

  it('fails closed for non-JSON values instead of coercing them', () => {
    expect(() => canonicalJson({ unsafe: Symbol('x') })).toThrow(TypeError);
    expect(() => canonicalJson({ unsafe: () => true })).toThrow(TypeError);
  });

  it('binds PIC final-record payloads to logical and immutable revision identities', () => {
    const record = makeRecord();
    record.signatures.picTechnicalAcknowledgement = proof('PIC_TECHNICAL_ACK');

    const payload = buildSignableEdbPayload(record, 'PIC_FLIGHT_RECORD') as Record<string, unknown>;
    expect(payload.logicalRecordId).toBe('flight-101-stage-303');
    expect(payload.revisionId).toBe('edbrev-101-r1');
    expect(payload).toHaveProperty('picTechnicalAcknowledgement');
    expect(payload).not.toHaveProperty('picFlightRecord');
  });

  it('includes the PIC flight proof in the operator signature payload', () => {
    const record = makeRecord();
    record.signatures.picTechnicalAcknowledgement = proof('PIC_TECHNICAL_ACK');
    record.signatures.picFlightRecord = proof('PIC_FLIGHT_RECORD');

    const payload = buildSignableEdbPayload(record, 'OPERATOR_RECORD') as Record<string, unknown>;
    expect(payload).toHaveProperty('picTechnicalAcknowledgement');
    expect(payload).toHaveProperty('picFlightRecord');
  });

  it('produces deterministic SHA-256 hashes and changes them when revision identity changes', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );

    const record = makeRecord();
    const first = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
    const repeat = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
    expect(repeat).toBe(first);

    record.revisionId = 'edbrev-101-r2';
    const changed = await hashSignableEdbPayload(record, 'PIC_FLIGHT_RECORD');
    expect(changed).not.toBe(first);
  });
});
