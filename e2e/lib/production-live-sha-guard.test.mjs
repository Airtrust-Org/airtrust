import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertProductionLiveShaMatches,
  extractBuildVersion,
  matchesProductionBuildVersion,
} from './production-live-sha-guard.mjs';

test('production build version requires exact timestamp-shortsha shape', () => {
  assert.equal(matchesProductionBuildVersion('2026-09-14T15:12:24Z-181e52b', '181e52b'), true);
  assert.equal(
    matchesProductionBuildVersion('staging-2026-09-14T15:12:24Z-181e52b', '181e52b'),
    false,
  );
  assert.equal(matchesProductionBuildVersion('2026-09-14T15:12:24Z-deadbee', '181e52b'), false);
});

test('production build version extraction and assertion are fail closed', () => {
  const version = extractBuildVersion(
    '<meta name="build-version" content="2026-09-14T15:12:24Z-181e52b">',
  );
  assert.equal(version, '2026-09-14T15:12:24Z-181e52b');
  assert.equal(
    assertProductionLiveShaMatches({ buildVersion: version, expectedShortSha: '181e52baa77ad' }),
    version,
  );
  assert.throws(
    () => assertProductionLiveShaMatches({ buildVersion: version, expectedShortSha: 'deadbee' }),
    /PRODUCTION_FRONTEND_SHA_MISMATCH/,
  );
});
