const LOCAL_E2E_BASE_URL = 'http://127.0.0.1:5173';

const PRODUCTION_WORKER_HOSTS = new Set([
  'airtrust-api-production.airtrust.workers.dev',
  'airtrust-api.airtrust.workers.dev',
]);

const STAGING_HOSTS = new Set([
  'main.airtrust.pages.dev',
  'staging.airtrust.pages.dev',
  'airtrust-api-staging.airtrust.workers.dev',
]);

type E2EEnvironment = Record<string, string | undefined>;

function isProductionHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  if (normalizedHostname === 'airtrust.online' || normalizedHostname.endsWith('.airtrust.online')) {
    return true;
  }

  if (PRODUCTION_WORKER_HOSTS.has(normalizedHostname)) {
    return true;
  }

  if (
    normalizedHostname === 'airtrust.pages.dev' ||
    (normalizedHostname.endsWith('.airtrust.pages.dev') && !STAGING_HOSTS.has(normalizedHostname))
  ) {
    return true;
  }

  return false;
}

export function resolveE2EBaseUrl(env: E2EEnvironment = process.env): string {
  const configuredBaseUrl = env.BASE_URL?.trim();
  const rawBaseUrl = configuredBaseUrl || LOCAL_E2E_BASE_URL;
  const parsed = new URL(rawBaseUrl);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('BASE_URL de E2E deve usar protocolo HTTP ou HTTPS');
  }

  if (parsed.username || parsed.password) {
    throw new Error('BASE_URL de E2E não pode conter credenciais');
  }

  if (isProductionHost(parsed.hostname) && env.E2E_ALLOW_PRODUCTION !== 'true') {
    throw new Error('E2E contra produção exige E2E_ALLOW_PRODUCTION=true de forma explícita');
  }

  return parsed.toString().replace(/\/$/, '');
}
