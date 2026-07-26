export type SigvoosRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is SigvoosRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function nestedRecord(record: SigvoosRecord, key: string): SigvoosRecord {
  return isRecord(record[key]) ? (record[key] as SigvoosRecord) : {};
}

export function getArrayPayload(data: unknown): SigvoosRecord[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];

  for (const key of ['items', 'records', 'results', 'variants', 'main', 'data', 'result', 'payload']) {
    const val = data[key];
    if (Array.isArray(val)) return val.filter(isRecord);
  }

  for (const key of ['data', 'result', 'payload']) {
    const nested = getArrayPayload(data[key]);
    if (nested.length > 0) return nested;
  }
  return [];
}
