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
  const isSecure = parsed.protocol === 'https:';
  const isLocalHttp = parsed.protocol === 'http:' && isLocalhost;
  if (!isSecure && !isLocalHttp) return null;

  const hasPath = parsed.pathname !== '/';
  const hasCredentials = Boolean(parsed.username || parsed.password);
  const hasExtraParts = Boolean(parsed.search || parsed.hash);
  if (hasPath || hasCredentials || hasExtraParts) return null;

  return parsed.origin;
}

export function parseEnvAllowedOrigins(
  corsOrigins?: string | null,
): string[] {
  if (!corsOrigins) return [];

  const normalizedOrigins = corsOrigins
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter((item): item is string => item !== null);

  return [...new Set(normalizedOrigins)];
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
  if (!normalizedOrigin) return DENIED_CORS_ORIGIN;
  if (!isAllowedOrigin(normalizedOrigin, corsOrigins)) {
    return DENIED_CORS_ORIGIN;
  }

  return normalizedOrigin;
}
