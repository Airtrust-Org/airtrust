export const STAGING_API_BASE_URL = 'https://airtrust-api-staging.airtrust.workers.dev/api';
export const PRODUCTION_API_BASE_URL = 'https://api.airtrust.online/api';

const PRODUCTION_FRONTEND_HOSTS = new Set([
  'airtrust.online',
  'www.airtrust.online',
  'airtrust.pages.dev',
  'production.airtrust.pages.dev',
]);

const STAGING_FRONTEND_HOSTS = new Set([
  'staging.airtrust.pages.dev',
  'airtrust-staging.pages.dev',
]);
const BLOCKED_FRONTEND_HOSTS = new Set(['main.airtrust.pages.dev']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export class ApiEnvironmentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiEnvironmentConfigurationError';
  }
}

function normalizeApiUrl(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ApiEnvironmentConfigurationError(
      `VITE_API_URL is not a valid absolute URL: ${trimmed}`,
    );
  }

  const isLocalApi = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLocalApi) {
    throw new ApiEnvironmentConfigurationError(
      'VITE_API_URL must use HTTPS outside local development.',
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ApiEnvironmentConfigurationError(
      'VITE_API_URL must not include credentials, query parameters, or fragments.',
    );
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

function isPagesPreviewHost(host: string): boolean {
  return host.endsWith('.pages.dev');
}

function requireCanonicalApi(
  configuredApi: string | undefined,
  expectedApi: string,
  environmentName: 'production' | 'staging',
): string {
  if (!configuredApi) return expectedApi;
  if (configuredApi !== expectedApi) {
    throw new ApiEnvironmentConfigurationError(
      `${environmentName} frontend must use ${expectedApi}; received ${configuredApi}.`,
    );
  }
  return expectedApi;
}

export function resolveApiBase({
  envUrl = import.meta.env.VITE_API_URL,
  origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '',
  host = typeof window !== 'undefined' ? window.location.hostname : '',
}: {
  envUrl?: string;
  origin?: string;
  host?: string;
} = {}): string {
  const normalizedHost = normalizeHost(host);
  const configuredApi = normalizeApiUrl(envUrl);

  // Build/test evaluation without a browser keeps the relative API contract.
  if (!normalizedHost) return configuredApi ?? '/api';

  // Local development remains same-origin through the Vite proxy. An explicit
  // VITE_API_URL cannot silently redirect localhost to a remote environment.
  if (LOCAL_HOSTS.has(normalizedHost)) {
    const normalizedOrigin = origin.trim().replace(/\/+$/, '');
    return `${normalizedOrigin}/api`;
  }

  if (PRODUCTION_FRONTEND_HOSTS.has(normalizedHost)) {
    return requireCanonicalApi(configuredApi, PRODUCTION_API_BASE_URL, 'production');
  }

  if (STAGING_FRONTEND_HOSTS.has(normalizedHost)) {
    return requireCanonicalApi(configuredApi, STAGING_API_BASE_URL, 'staging');
  }

  if (BLOCKED_FRONTEND_HOSTS.has(normalizedHost)) {
    throw new ApiEnvironmentConfigurationError(
      `Frontend host ${normalizedHost} is ambiguous and is not an approved environment.`,
    );
  }

  // Cloudflare Pages previews are never inferred as production. They must be
  // built explicitly against staging; otherwise the application fails closed.
  if (isPagesPreviewHost(normalizedHost)) {
    if (!configuredApi) {
      throw new ApiEnvironmentConfigurationError(
        `Preview host ${normalizedHost} requires VITE_API_URL=${STAGING_API_BASE_URL}.`,
      );
    }
    if (configuredApi !== STAGING_API_BASE_URL) {
      throw new ApiEnvironmentConfigurationError(
        `Preview host ${normalizedHost} may only use the staging API.`,
      );
    }
    return STAGING_API_BASE_URL;
  }

  // Unknown/custom hosts require an explicit declaration and can never be
  // pointed at production until added to the production host allowlist.
  if (!configuredApi) {
    throw new ApiEnvironmentConfigurationError(
      `Unknown frontend host ${normalizedHost}; configure VITE_API_URL explicitly.`,
    );
  }
  if (configuredApi === PRODUCTION_API_BASE_URL) {
    throw new ApiEnvironmentConfigurationError(
      `Unknown frontend host ${normalizedHost} is not authorized to use the production API.`,
    );
  }

  return configuredApi;
}
