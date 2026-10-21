import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = new URL('../validation/boa/staging-130-readonly.mjs', import.meta.url).pathname;
const baseEnv = {
  ...process.env,
  BOA_QA_READONLY_APPROVED: '',
  BOA_QA_STAGING_BASE_URL: '',
  BOA_QA_EXPECTED_TENANT_ID: '',
  BOA_QA_TOKENS_FILE: '',
  BOA_QA_CONCURRENCY: '',
};
function run(options = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    timeout: 3000,
    env: { ...baseEnv, ...options },
  });
}
test('staging BOA 130-user harness does not access network without explicit approval', () => {
  const attempt = run({
    BOA_QA_STAGING_BASE_URL: 'https://qa-staging.example.test/',
    BOA_QA_EXPECTED_TENANT_ID: '130',
  });
  assert.equal(attempt.status, 1);
  assert.match(attempt.stderr, /validation blocked/);
  assert.doesNotMatch(attempt.stderr, /Bearer|JWT|BOA-QA-001/);
});
test('staging BOA 130-user harness blocks localhost/production hosts before loading credentials', () => {
  for (const url of [
    'https://production.example.test/',
    'http://staging.example.test/',
    'https://prod-staging.example.test/',
    'https://localhost/',
    'https://staging.example.test/other',
  ]) {
    const attempt = run({
      BOA_QA_READONLY_APPROVED: 'SIM',
      BOA_QA_STAGING_BASE_URL: url,
      BOA_QA_EXPECTED_TENANT_ID: '130',
    });
    assert.equal(attempt.status, 1, url);
    assert.match(attempt.stderr, /validation blocked/);
  }
});
test('staging BOA 130-user harness blocks empresa 6 and unsafe concurrency', () => {
  const target = {
    BOA_QA_READONLY_APPROVED: 'SIM',
    BOA_QA_STAGING_BASE_URL: 'https://staging.example.test/',
    BOA_QA_TOKENS_FILE: '/nonexistent/external/credentials.json',
  };
  assert.equal(run({ ...target, BOA_QA_EXPECTED_TENANT_ID: '6' }).status, 1);
  assert.equal(run({ ...target, BOA_QA_EXPECTED_TENANT_ID: '130',
    BOA_QA_CONCURRENCY: '131' }).status, 1);
});
