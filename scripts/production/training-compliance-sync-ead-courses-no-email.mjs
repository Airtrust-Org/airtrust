import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE_URL = 'https://api.airtrust.online';
const CONFIRMATION = 'AIRTRUST_PRODUCTION_TRAINING_COMPLIANCE_SYNC_EAD_NO_EMAIL';

async function login(fetchImpl, apiBaseUrl, email, password) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetchImpl(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password }),
      });
      const json = await response.json().catch(() => null);
      if (response.status === 429 && attempt < 5) {
        await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(1000 * 2 ** (attempt - 1), 8000)));
        continue;
      }
      const token = String(json?.data?.accessToken || '');
      if (!response.ok || json?.success !== true || token.length < 20) {
        throw new Error(`PRODUCTION_AUTH_HTTP_${response.status}:${String(json?.code || json?.error || 'LOGIN_FAILED').slice(0, 120)}`);
      }
      return token;
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(1000 * 2 ** (attempt - 1), 8000)));
    }
  }
  throw lastError || new Error('PRODUCTION_AUTH_FAILED');
}

async function authenticatedJson(fetchImpl, apiBaseUrl, token, path, options = {}) {
  const response = await fetchImpl(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success === false) {
    const code = String(json?.code || json?.error || '').slice(0, 160);
    throw new Error(`SYNC_EAD_HTTP_${response.status}${code ? `:${code}` : ''}`);
  }
  return json;
}

function countResult(value) {
  if (Array.isArray(value)) return value.length;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function appendOutput(values) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`);
  appendFileSync(output, `${lines.join('\n')}\n`);
}

export async function executeEadCourseSync({
  fetchImpl = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  email,
  password,
} = {}) {
  if (!email || !password) throw new Error('PRODUCTION_SMOKE_CREDENTIALS_MISSING');
  const normalizedApiBaseUrl = String(apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const token = await login(fetchImpl, normalizedApiBaseUrl, email, password);

  const json = await authenticatedJson(
    fetchImpl,
    normalizedApiBaseUrl,
    token,
    '/api/lms/cursos/sync-ead',
    { method: 'POST' },
  );
  const data = json?.data && typeof json.data === 'object' ? json.data : {};

  const summary = {
    ead_qualification_types: countResult(data.totalTiposEad ?? data.total_tipos_ead ?? data.total),
    courses_created: countResult(data.created ?? data.criados),
    courses_updated: countResult(data.updated ?? data.atualizados),
    non_ead_skipped: countResult(data.skipped ?? data.ignorados),
  };

  console.log(
    `EAD_COURSE_SYNC=PASS ead_types=${summary.ead_qualification_types} created=${summary.courses_created} updated=${summary.courses_updated} non_ead_skipped=${summary.non_ead_skipped}`,
  );
  return summary;
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GITHUB_ACTIONS_ONLY');
  if (process.env.AIRTRUST_PRODUCTION_SYNC_EAD_CONFIRMATION !== CONFIRMATION) {
    throw new Error('CONFIRMATION_REJECTED');
  }
  const summary = await executeEadCourseSync({
    apiBaseUrl: process.env.PROD_API_BASE_URL || DEFAULT_API_BASE_URL,
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
  });
  appendOutput(summary);
}

const isDirectExecution = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`Production EAD course sync failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
