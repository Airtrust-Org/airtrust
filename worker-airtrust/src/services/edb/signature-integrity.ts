import {
  hashSignableEdbPayload,
  type EdbFinalRecordSignatureType,
} from './canonicalization';
import type { EdbFlightRecord, EdbSignatureProof } from './contracts';

export interface EdbSignatureBindingResult {
  type: EdbFinalRecordSignatureType;
  present: boolean;
  matchesPayload: boolean;
  storedHashSha256: string | null;
  expectedHashSha256: string | null;
}

export function getStoredEdbSignature(
  record: EdbFlightRecord,
  type: EdbFinalRecordSignatureType,
): EdbSignatureProof | null {
  if (type === 'PIC_FLIGHT_RECORD') return record.signatures.picFlightRecord;
  return record.signatures.operatorRecord;
}

/**
 * Verifies postflight/final-record signature payload binding only. Preflight
 * PIC technical acknowledgement integrity is verified against the independent
 * technical snapshot by verifyPicTechnicalAcknowledgementBinding().
 */
export async function verifyEdbSignaturePayloadBinding(
  record: EdbFlightRecord,
  type: EdbFinalRecordSignatureType,
): Promise<EdbSignatureBindingResult> {
  const proof = getStoredEdbSignature(record, type);
  if (!proof) {
    return {
      type,
      present: false,
      matchesPayload: false,
      storedHashSha256: null,
      expectedHashSha256: null,
    };
  }

  const expectedHashSha256 = await hashSignableEdbPayload(record, type);
  return {
    type,
    present: true,
    matchesPayload: proof.canonicalPayloadHashSha256 === expectedHashSha256,
    storedHashSha256: proof.canonicalPayloadHashSha256,
    expectedHashSha256,
  };
}

export async function verifyAllStoredEdbSignatureBindings(
  record: EdbFlightRecord,
): Promise<EdbSignatureBindingResult[]> {
  const types: EdbFinalRecordSignatureType[] = ['PIC_FLIGHT_RECORD', 'OPERATOR_RECORD'];
  const results: EdbSignatureBindingResult[] = [];
  for (const type of types) {
    const proof = getStoredEdbSignature(record, type);
    if (!proof) continue;
    results.push(await verifyEdbSignaturePayloadBinding(record, type));
  }
  return results;
}
