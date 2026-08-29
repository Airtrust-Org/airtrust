import {
  hashSignableEdbPayload,
  type EdbFinalRecordSignatureType,
} from './canonicalization';
import type { EdbFlightRecord, EdbSignatureProof } from './contracts';

export interface EdbSignatureBindingResult {
  type: EdbFinalRecordSignatureType;
  present: boolean;
  matchesPayload: boolean;
  targetMatches: boolean;
  storedTargetId: string | null;
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
 * technical snapshot by verifyPicTechnicalAcknowledgementBinding(). When the
 * persistence revision id is known, pass it as expectedTargetId so target
 * substitution is checked together with payload integrity.
 */
export async function verifyEdbSignaturePayloadBinding(
  record: EdbFlightRecord,
  type: EdbFinalRecordSignatureType,
  expectedTargetId?: string,
): Promise<EdbSignatureBindingResult> {
  const proof = getStoredEdbSignature(record, type);
  if (!proof) {
    return {
      type,
      present: false,
      matchesPayload: false,
      targetMatches: false,
      storedTargetId: null,
      storedHashSha256: null,
      expectedHashSha256: null,
    };
  }

  const expectedHashSha256 = await hashSignableEdbPayload(record, type);
  const targetMatches =
    proof.targetType === 'FINAL_RECORD_REVISION' &&
    Boolean(proof.targetId?.trim()) &&
    (expectedTargetId === undefined || proof.targetId === expectedTargetId);
  return {
    type,
    present: true,
    matchesPayload:
      targetMatches && proof.canonicalPayloadHashSha256 === expectedHashSha256,
    targetMatches,
    storedTargetId: proof.targetId ?? null,
    storedHashSha256: proof.canonicalPayloadHashSha256,
    expectedHashSha256,
  };
}

export async function verifyAllStoredEdbSignatureBindings(
  record: EdbFlightRecord,
  expectedTargetId?: string,
): Promise<EdbSignatureBindingResult[]> {
  const types: EdbFinalRecordSignatureType[] = ['PIC_FLIGHT_RECORD', 'OPERATOR_RECORD'];
  const results: EdbSignatureBindingResult[] = [];
  for (const type of types) {
    const proof = getStoredEdbSignature(record, type);
    if (!proof) continue;
    results.push(await verifyEdbSignaturePayloadBinding(record, type, expectedTargetId));
  }
  return results;
}
