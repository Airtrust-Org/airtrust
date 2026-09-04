import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertLiveFrontendShaFromOrigin,
  assertLiveShaMatches,
  extractBuildVersion,
} from './live-sha-guard.mjs';

const SHORT = 'd8507b3';
const META = (v) => `<meta name="build-version" content="${v}">`;

test('extractBuildVersion pulls the meta content', () => {
  assert.equal(
    extractBuildVersion(`<head>${META('staging-2026-09-03T23:32:38Z-d8507b3')}</head>`),
    'staging-2026-09-03T23:32:38Z-d8507b3',
  );
  assert.equal(extractBuildVersion('<head></head>'), null);
});

test('matching short SHA passes', () => {
  assert.equal(
    assertLiveShaMatches({
      buildVersion: 'staging-2026-09-03T23:32:38Z-d8507b3',
      expectedShortSha: SHORT,
    }),
    'staging-2026-09-03T23:32:38Z-d8507b3',
  );
});

test('a frontend that changed SHA between guard and UI QA fails closed', () => {
  assert.throws(
    () =>
      assertLiveShaMatches({
        buildVersion: 'staging-2026-09-04T08:00:00Z-0000000',
        expectedShortSha: SHORT,
        where: 'pre-playwright',
      }),
    /STAGING_FRONTEND_SHA_MISMATCH:pre-playwright/,
  );
});

test('a frontend that changes SHA mid-matrix fails closed', () => {
  assert.throws(
    () =>
      assertLiveShaMatches({
        buildVersion: 'staging-2026-09-04T09:15:00Z-cafef00',
        expectedShortSha: SHORT,
        where: 'navigation:mobile_375/dark',
      }),
    /STAGING_FRONTEND_SHA_MISMATCH:navigation/,
  );
});

test('a missing meta tag fails closed', () => {
  assert.throws(
    () => assertLiveShaMatches({ buildVersion: null, expectedShortSha: SHORT }),
    /BUILD_VERSION_META_MISSING/,
  );
});

test('assertLiveFrontendShaFromOrigin GETs and validates', async () => {
  const ok = await assertLiveFrontendShaFromOrigin(
    'https://staging.airtrust.pages.dev',
    SHORT,
    async () => ({ ok: true, status: 200, text: async () => META(`x-${SHORT}`) }),
  );
  assert.equal(ok, `x-${SHORT}`);

  await assert.rejects(
    assertLiveFrontendShaFromOrigin('https://staging.airtrust.pages.dev', SHORT, async () => ({
      ok: true,
      status: 200,
      text: async () => META('x-deadbee'),
    })),
    /STAGING_FRONTEND_SHA_MISMATCH/,
  );
});
