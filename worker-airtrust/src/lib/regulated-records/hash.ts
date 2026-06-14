import { canonicalizePayloadEnvelope, type CanonicalizeOptions } from './canonical';

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashCanonicalPayload(
  input: {
    canonicalSchemaVersion: string;
    canonicalizationVersion: string;
    payload: unknown;
  },
  options: CanonicalizeOptions = {},
): Promise<{ canonicalJson: string; payloadHash: string }> {
  const canonicalJson = canonicalizePayloadEnvelope(
    {
      canonical_schema_version: input.canonicalSchemaVersion,
      canonicalization_version: input.canonicalizationVersion,
      payload: input.payload,
    },
    options,
  );

  return {
    canonicalJson,
    payloadHash: await sha256Hex(canonicalJson),
  };
}
