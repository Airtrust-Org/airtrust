const REDACTED = '[REDACTED]';
const MAX_DEPTH = 5;
const MAX_KEYS = 50;
const MAX_ARRAY_ITEMS = 25;
const MAX_STRING_LENGTH = 280;

const SENSITIVE_KEY_PATTERN =
  /(password|senha|token|cookie|authorization|invite|convite|cpf|documento|aso|anexo|attachment|medical|medico|health|email|telefone|phone|address|endereco|link|url|sleep|sono|kss|fadiga|fatigue|fit[_-]?for[_-]?duty)/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitizeString(value: string): string {
  if (/^bearer\s+/i.test(value)) {
    return REDACTED;
  }

  if (/https?:\/\/\S*(invite|convite|token|reset|magic)\S*/i.test(value)) {
    return REDACTED;
  }

  return truncateString(value);
}

function sanitizeInternal(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= MAX_DEPTH) {
    return '[TRUNCATED_DEPTH]';
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeInternal(item, depth + 1, seen));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[TRUNCATED_ITEMS:${value.length - MAX_ARRAY_ITEMS}]`);
    }
    return items;
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return '[CIRCULAR]';
  }

  seen.add(value);

  const output: Record<string, unknown> = {};
  const entries = Object.entries(value).slice(0, MAX_KEYS);

  for (const [key, nestedValue] of entries) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED
      : sanitizeInternal(nestedValue, depth + 1, seen);
  }

  if (Object.keys(value).length > MAX_KEYS) {
    output._truncated_keys = Object.keys(value).length - MAX_KEYS;
  }

  seen.delete(value);
  return output;
}

export function sanitizeAuditPayload<T = unknown>(value: T): unknown {
  try {
    return sanitizeInternal(value, 0, new WeakSet<object>());
  } catch {
    return '[UNSERIALIZABLE_AUDIT_PAYLOAD]';
  }
}
