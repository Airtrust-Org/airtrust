export function normalizeAircraftModel(value: unknown): string | null {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return normalized || null;
}

export function parseLegacyAircraftModels(value: unknown): string[] {
  const seen = new Set<string>();
  for (const raw of String(value ?? '').split(/[\/,;|]+/)) {
    const model = normalizeAircraftModel(raw);
    if (model) seen.add(model);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export function resolveEmployeeAircraftModels(canonicalModels: string[], legacyValue: unknown): string[] {
  const canonical = Array.from(
    new Set(
      canonicalModels
        .map((model) => normalizeAircraftModel(model))
        .filter((model): model is string => Boolean(model)),
    ),
  ).sort((a, b) => a.localeCompare(b));
  return canonical.length > 0 ? canonical : parseLegacyAircraftModels(legacyValue);
}
