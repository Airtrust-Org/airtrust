import {
  assert,
  assertAllowedProductionBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const TEMPLATE_KEY = 'ead_enrollment_reminder';
const TEMPLATE_NAME = 'airtrust_lembrete_treinamento_matriculado';
const CONFIRMATION = 'AIRTRUST_PRODUCTION_WHATSAPP_TEMPLATE_SYNC';

function normalizeSha(value) {
  return String(value || '').trim().toLowerCase();
}

export function validateConfig(env = process.env) {
  assert(env.GITHUB_ACTIONS === 'true', 'GITHUB_ACTIONS_ONLY');

  const expectedWorkerSha = normalizeSha(env.EXPECTED_WORKER_SHA);
  assert(/^[0-9a-f]{40}$/.test(expectedWorkerSha), 'EXPECTED_WORKER_SHA_INVALID');

  const confirmation = String(env.AIRTRUST_PRODUCTION_WHATSAPP_TEMPLATE_SYNC_CONFIRMATION || '');
  assert(confirmation === CONFIRMATION, 'PRODUCTION_WHATSAPP_TEMPLATE_SYNC_CONFIRMATION_INVALID');

  const email = String(env.PROD_EMAIL || '').trim().toLowerCase();
  const password = String(env.PROD_PASSWORD || '');
  assert(email && password, 'PRODUCTION_ADMIN_CREDENTIALS_MISSING');

  const baseUrl = assertAllowedProductionBaseUrl(
    env.PROD_API_BASE_URL || 'https://api.airtrust.online',
  );

  return { expectedWorkerSha, email, password, baseUrl };
}

export async function syncEnrollmentReminder({
  env = process.env,
  fetchJsonImpl = fetchJson,
  loginImpl = login,
} = {}) {
  const { expectedWorkerSha, email, password, baseUrl } = validateConfig(env);

  const version = await fetchJsonImpl(`${baseUrl}/api/version`);
  assert(version.status === 200, `PRODUCTION_VERSION_HTTP_${version.status}`);
  assert(version.json?.success === true, 'PRODUCTION_VERSION_SUCCESS_FALSE');
  const liveSha = normalizeSha(version.json?.data?.sourceSha || version.json?.sourceSha);
  const environment = String(version.json?.data?.environment || version.json?.environment || '');
  assert(environment === 'production', `PRODUCTION_ENVIRONMENT_MISMATCH_${environment || 'missing'}`);
  assert(liveSha === expectedWorkerSha, 'PRODUCTION_WORKER_SHA_MISMATCH');

  const session = await loginImpl(baseUrl, email, password);
  const token = extractAccessToken(session);

  const me = await fetchJsonImpl(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(me.status === 200 && me.json?.success === true, `AUTH_ME_HTTP_${me.status}`);
  const role = String(me.json?.data?.role || '').trim().toLowerCase();
  assert(role === 'admin', `PRODUCTION_ADMIN_ROLE_REQUIRED_${role || 'missing'}`);

  const sync = await fetchJsonImpl(`${baseUrl}/api/alertas/whatsapp/templates/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ templateKeys: [TEMPLATE_KEY] }),
  });

  assert(sync.status === 200, `WHATSAPP_TEMPLATE_SYNC_HTTP_${sync.status}`);
  assert(sync.json?.success === true, 'WHATSAPP_TEMPLATE_SYNC_SUCCESS_FALSE');
  const rows = sync.json?.data?.synced;
  assert(Array.isArray(rows) && rows.length === 1, 'WHATSAPP_TEMPLATE_SYNC_RESULT_COUNT_INVALID');

  const item = rows[0] || {};
  assert(item.templateKey === TEMPLATE_KEY, 'WHATSAPP_TEMPLATE_SYNC_KEY_MISMATCH');
  assert(item.templateName === TEMPLATE_NAME, 'WHATSAPP_TEMPLATE_SYNC_NAME_MISMATCH');
  assert(
    typeof item.twilioContentSid === 'string' && item.twilioContentSid.startsWith('HX'),
    'WHATSAPP_TEMPLATE_SYNC_CONTENT_SID_MISSING',
  );
  assert(item.approvalStatus !== 'submission_error', 'WHATSAPP_TEMPLATE_APPROVAL_SUBMISSION_FAILED');

  return {
    templateKey: item.templateKey,
    templateName: item.templateName,
    approvalStatus: item.approvalStatus || null,
    approvalError: item.approvalError || null,
    workerSha: liveSha,
  };
}

async function main() {
  const result = await syncEnrollmentReminder();
  console.log(`PRODUCTION_WHATSAPP_TEMPLATE_SYNC_OK=${result.templateKey}`);
  console.log(`EXPECTED_WORKER_SHA=${result.workerSha}`);
  console.log(`APPROVAL_STATUS=${result.approvalStatus || 'unknown'}`);
  if (result.approvalError) {
    console.log('APPROVAL_ERROR_PRESENT=true');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
