import assert from 'node:assert/strict';
import test from 'node:test';

import {
  syncEnrollmentReminder,
  validateConfig,
} from '../sync-whatsapp-enrollment-reminder.mjs';

const SHA = 'dba38c907c766fc4976d7a785f963a3c07e87991';

function baseEnv(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    EXPECTED_WORKER_SHA: SHA,
    AIRTRUST_PRODUCTION_WHATSAPP_TEMPLATE_SYNC_CONFIRMATION:
      'AIRTRUST_PRODUCTION_WHATSAPP_TEMPLATE_SYNC',
    PROD_EMAIL: 'admin@example.invalid',
    PROD_PASSWORD: 'secret-value',
    PROD_API_BASE_URL: 'https://api.airtrust.online',
    ...overrides,
  };
}

function loginPayload() {
  return {
    success: true,
    data: {
      accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.signature',
    },
  };
}

test('validateConfig requires GitHub Actions and exact confirmation', () => {
  assert.throws(
    () => validateConfig(baseEnv({ GITHUB_ACTIONS: 'false' })),
    /GITHUB_ACTIONS_ONLY/,
  );
  assert.throws(
    () =>
      validateConfig(
        baseEnv({ AIRTRUST_PRODUCTION_WHATSAPP_TEMPLATE_SYNC_CONFIRMATION: 'WRONG' }),
      ),
    /PRODUCTION_WHATSAPP_TEMPLATE_SYNC_CONFIRMATION_INVALID/,
  );
});

test('syncEnrollmentReminder pins the live Worker SHA and syncs only the enrollment reminder', async () => {
  const calls = [];
  const fetchJsonImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/api/version')) {
      return {
        status: 200,
        json: {
          success: true,
          data: { environment: 'production', sourceSha: SHA },
        },
      };
    }
    if (url.endsWith('/api/auth/me')) {
      return {
        status: 200,
        json: { success: true, data: { role: 'administrador' } },
      };
    }
    if (url.endsWith('/api/alertas/whatsapp/templates/sync')) {
      return {
        status: 200,
        json: {
          success: true,
          data: {
            total: 1,
            synced: [
              {
                templateKey: 'ead_enrollment_reminder',
                templateName: 'airtrust_lembrete_treinamento_matriculado',
                twilioContentSid: 'HX1234567890',
                approvalStatus: 'pending',
                approvalError: null,
              },
            ],
          },
        },
      };
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  const result = await syncEnrollmentReminder({
    env: baseEnv(),
    fetchJsonImpl,
    loginImpl: async () => loginPayload(),
  });

  assert.equal(result.templateKey, 'ead_enrollment_reminder');
  assert.equal(result.workerSha, SHA);
  const syncCall = calls.find((call) =>
    call.url.endsWith('/api/alertas/whatsapp/templates/sync'),
  );
  assert.ok(syncCall);
  assert.deepEqual(JSON.parse(syncCall.options.body), {
    templateKeys: ['ead_enrollment_reminder'],
  });
});

test('syncEnrollmentReminder fails closed on Worker SHA mismatch', async () => {
  await assert.rejects(
    () =>
      syncEnrollmentReminder({
        env: baseEnv(),
        loginImpl: async () => loginPayload(),
        fetchJsonImpl: async (url) => {
          if (url.endsWith('/api/version')) {
            return {
              status: 200,
              json: {
                success: true,
                data: {
                  environment: 'production',
                  sourceSha: '1111111111111111111111111111111111111111',
                },
              },
            };
          }
          throw new Error('should not continue after SHA mismatch');
        },
      }),
    /PRODUCTION_WORKER_SHA_MISMATCH/,
  );
});

test('syncEnrollmentReminder requires admin role before the write', async () => {
  let syncCalled = false;
  await assert.rejects(
    () =>
      syncEnrollmentReminder({
        env: baseEnv(),
        loginImpl: async () => loginPayload(),
        fetchJsonImpl: async (url) => {
          if (url.endsWith('/api/version')) {
            return {
              status: 200,
              json: {
                success: true,
                data: { environment: 'production', sourceSha: SHA },
              },
            };
          }
          if (url.endsWith('/api/auth/me')) {
            return {
              status: 200,
              json: { success: true, data: { role: 'manager' } },
            };
          }
          if (url.endsWith('/api/alertas/whatsapp/templates/sync')) {
            syncCalled = true;
          }
          throw new Error('unexpected URL');
        },
      }),
    /PRODUCTION_ADMIN_ROLE_REQUIRED_manager/,
  );
  assert.equal(syncCalled, false);
});
