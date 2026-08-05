export const DENIED_CORS_ORIGIN = 'https://cors-denied.invalid';
export const DEFAULT_ALLOWED_ORIGIN = DENIED_CORS_ORIGIN;

function normalizeOrigin(value?: string | null): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate === '*' || candidate === 'null') return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
    return null;
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  return parsed.origin;
}

export function parseEnvAllowedOrigins(corsOrigins?: string | null): string[] {
  if (!corsOrigins) return [];

  return [
    ...new Set(
      corsOrigins
        .split(',')
        .map((item) => normalizeOrigin(item))
        .filter((item): item is string => item !== null),
    ),
  ];
}

export function isAllowedOrigin(
  origin?: string | null,
  corsOrigins?: string | null,
): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  return parseEnvAllowedOrigins(corsOrigins).includes(normalizedOrigin);
}

export function resolveAllowedOrigin(
  origin?: string | null,
  corsOrigins?: string | null,
): string {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin || !isAllowedOrigin(normalizedOrigin, corsOrigins)) {
    return DENIED_CORS_ORIGIN;
  }

  return normalizedOrigin;
}
