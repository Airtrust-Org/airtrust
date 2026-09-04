#!/usr/bin/env node
/**
 * CLI wrapper: GET the staging frontend and assert the LIVE build-version still
 * carries the short SHA of RELEASE_SHA. Used by the workflow immediately before
 * Playwright and again after the matrix (TOCTOU guard — staging is shared).
 *
 *   RELEASE_SHA=<40hex> [STAGING_FRONTEND_ORIGIN=https://staging.airtrust.pages.dev] \
 *     node scripts/ci/assert-live-frontend-sha.mjs [where]
 */
import { assertLiveFrontendShaFromOrigin } from '../../e2e/lib/live-sha-guard.mjs';

const origin = process.env.STAGING_FRONTEND_ORIGIN || 'https://staging.airtrust.pages.dev';
const short = String(process.env.RELEASE_SHA || '')
  .toLowerCase()
  .slice(0, 7);
const where = process.argv[2] || 'workflow';

if (!/^[0-9a-f]{7}$/.test(short)) {
  console.error('RELEASE_SHA_INVALID');
  process.exit(1);
}

assertLiveFrontendShaFromOrigin(origin, short)
  .then((buildVersion) => {
    console.log(`LIVE_FRONTEND_SHA_OK ${where} build-version=${buildVersion}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
