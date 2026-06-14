export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CanonicalizeOptions = {
  volatileFields?: readonly string[];
};

export type CanonicalPayloadEnvelope = {
  canonical_schema_version: string;
  canonicalization_version: string;
  payload: unknown;
};

const defaultVolatileFields = new Set(['updated_at', 'rendered_at', 'request_id', 'cache_key', 'ui_label']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function normalizeCanonicalValue(
  value: unknown,
  volatileFields: ReadonlySet<string>,
  path: string,
): JsonValue {
  if (value === undefined) {
    throw new TypeError(`Undefined is not allowed in regulated canonical JSON at ${path}`);
  }

  if (value === null) return null;

  if (typeof value === 'string') return value.normalize('NFC');

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite numbers are not allowed in regulated canonical JSON at ${path}`);
    }
    return value;
  }

  if (typeof value === 'boolean') return value;

  if (value instanceof Date) {
    throw new TypeError(`Date objects are not allowed in regulated canonical JSON at ${path}; use UTC ISO-8601 strings`);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeCanonicalValue(item, volatileFields, `${path}[${index}]`));
  }

  if (isPlainObject(value)) {
    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      if (volatileFields.has(key)) continue;
      normalized[key] = normalizeCanonicalValue(value[key], volatileFields, `${path}.${key}`);
    }
    return normalized;
  }

  throw new TypeError(`Unsupported value in regulated canonical JSON at ${path}`);
}

export function canonicalizeJson(value: unknown, options: CanonicalizeOptions = {}): string {
  const volatileFields = new Set([...defaultVolatileFields, ...(options.volatileFields ?? [])]);
  return JSON.stringify(normalizeCanonicalValue(value, volatileFields, '$'));
}

export function canonicalizePayloadEnvelope(
  input: CanonicalPayloadEnvelope,
  options: CanonicalizeOptions = {},
): string {
  if (!input.canonical_schema_version.trim()) {
    throw new TypeError('canonical_schema_version is required');
  }
  if (!input.canonicalization_version.trim()) {
    throw new TypeError('canonicalization_version is required');
  }

  return canonicalizeJson(
    {
      canonical_schema_version: input.canonical_schema_version,
      canonicalization_version: input.canonicalization_version,
      payload: input.payload,
    },
    options,
  );
}
