import type { EdbFlightRecord, EdbSignatureType } from './contracts';

type JsonScalar = string | number | boolean | null;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

export type EdbFinalRecordSignatureType = Exclude<EdbSignatureType, 'PIC_TECHNICAL_ACK'>;

function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value as JsonScalar;
  }

  if (Array.isArray(value)) return value.map(normalizeJson);

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      const nested = source[key];
      if (nested === undefined) continue;
      normalized[key] = normalizeJson(nested);
    }
    return normalized;
  }

  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

/**
 * Builds only postflight/final-record signature payloads. The preflight PIC
 * technical acknowledgement signs an independent technical-situation snapshot
 * and is canonicalized in technical-awareness.ts.
 */
export function buildSignableEdbPayload(
  record: EdbFlightRecord,
  type: EdbFinalRecordSignatureType,
): unknown {
  const base = {
    contractVersion: record.contractVersion,
    recordId: record.recordId,
    identity: record.identity,
    correction: record.correction,
    source: record.source,
  };

  if (type === 'PIC_FLIGHT_RECORD') {
    return {
      ...base,
      maintenance: record.maintenance,
      flight: record.flight,
      picTechnicalAcknowledgement: record.signatures.picTechnicalAcknowledgement,
    };
  }

  return {
    ...base,
    maintenance: record.maintenance,
    flight: record.flight,
    picTechnicalAcknowledgement: record.signatures.picTechnicalAcknowledgement,
    picFlightRecord: record.signatures.picFlightRecord,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const copy = new Uint8Array(encoded.byteLength);
  copy.set(encoded);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function hashSignableEdbPayload(
  record: EdbFlightRecord,
  type: EdbFinalRecordSignatureType,
): Promise<string> {
  return sha256Hex(canonicalJson(buildSignableEdbPayload(record, type)));
}
