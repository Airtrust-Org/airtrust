import { hashSignableEdbPayload } from './canonicalization';
import type {
  EdbFlightRecord,
  EdbSignatureProof,
  EdbSignatureType,
} from './contracts';

export interface EdbSignatureBindingResult {
  type: EdbSignatureType;
  present: boolean;
  matchesPayload: boolean;
  storedHashSha256: string | null;
  expectedHashSha256: string | null;
}

export function getStoredEdbSignature(
  record: EdbFlightRecord,
  type: EdbSignatureType,
): EdbSignatureProof | null {
  if (type === 'PIC_TECHNICAL_ACK') return record.signatures.picTechnicalAcknowledgement;
  if (type === 'PIC_FLIGHT_RECORD') return record.signatures.picFlightRecord;
  return record.signatures.operatorRecord;
}

/**
 * Verifies only that the stored signature proof is bound to the current
 * canonical AirTrust payload. It does NOT verify a certificate chain or the
 * cryptographic signature itself; those controls belong to the accepted
 * signature provider/architecture required before regulatory production use.
 */
export async function verifyEdbSignaturePayloadBinding(
  record: EdbFlightRecord,
  type: EdbSignatureType,
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
  const types: EdbSignatureType[] = [
    'PIC_TECHNICAL_ACK',
    'PIC_FLIGHT_RECORD',
    'OPERATOR_RECORD',
  ];
  const results: EdbSignatureBindingResult[] = [];
  for (const type of types) {
    const proof = getStoredEdbSignature(record, type);
    if (!proof) continue;
    results.push(await verifyEdbSignaturePayloadBinding(record, type));
  }
  return results;
}
