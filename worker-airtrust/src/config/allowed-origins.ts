const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://airtrust.online',
  'https://www.airtrust.online',
  'https://api.airtrust.online',
  'https://airtrust.pages.dev',
  'https://production.airtrust.pages.dev',
] as const;

export const ALLOWED_ORIGINS = [...DEFAULT_ALLOWED_ORIGINS];
export const DEFAULT_ALLOWED_ORIGIN = DEFAULT_ALLOWED_ORIGINS[0];

function parseEnvAllowedOrigins(corsOrigins?: string | null): string[] {
  if (!corsOrigins) return [];

  return corsOrigins
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '*');
}

export function resolveAllowedOrigin(origin?: string | null, corsOrigins?: string | null): string {
  if (!origin) return DEFAULT_ALLOWED_ORIGIN;

  const runtimeAllowedOrigins = parseEnvAllowedOrigins(corsOrigins);

  if ((ALLOWED_ORIGINS as string[]).includes(origin)) return origin;

  if (runtimeAllowedOrigins.includes(origin)) return origin;

  if (/^https:\/\/[a-z0-9-]+\.airtrust\.pages\.dev$/i.test(origin)) return origin;

  // Multi-level Pages preview subdomains (e.g. <hash>.branch-name.airtrust.pages.dev)
  if (/^https:\/\/[a-z0-9.-]+\.airtrust\.pages\.dev$/i.test(origin)) return origin;

  return DEFAULT_ALLOWED_ORIGIN;
}
