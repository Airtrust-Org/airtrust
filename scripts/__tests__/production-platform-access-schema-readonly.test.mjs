import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { analyzePlatformSchema, classifySqlProbeError } from '../production/platform-access-schema-readonly.mjs';

describe('production platform-access diagnostics (read-only)', () => {
  it('detects a missing role column without making assumptions about live grants', () => {
    const report = analyzePlatformSchema(
      [{ name: 'user_platform_roles' }],
      { user_platform_roles: [{ name: 'user_id' }, { name: 'role_code' }, { name: 'revoked_at' }] },
    );
    assert.equal(report.user_platform_roles.present, true);
    assert.deepEqual(report.user_platform_roles.missingColumns, ['expires_at']);
    assert.equal(report.support_access_grants.present, false);
    assert.deepEqual(report.support_access_grants.missingColumns, []);
  });

  it('accepts the expected schema and classifies failures without leaking raw messages', () => {
    const report = analyzePlatformSchema(
      [{ name: 'user_platform_roles' }, { name: 'support_access_grants' }],
      {
        user_platform_roles: ['user_id', 'role_code', 'revoked_at', 'expires_at'].map((name) => ({ name })),
        support_access_grants: ['user_id', 'empresa_id', 'access_level', 'revoked_at', 'expires_at'].map((name) => ({ name })),
      },
    );
    assert.deepEqual(report.user_platform_roles.missingColumns, []);
    assert.deepEqual(report.support_access_grants.missingColumns, []);
    assert.equal(classifySqlProbeError('D1_ERROR: no such column: expires_at'), 'COLUMN_MISSING');
    assert.equal(classifySqlProbeError('D1 timed out while checking user 777'), 'TIMEOUT');
    assert.equal(classifySqlProbeError('credentials user@example.com denied'), 'OTHER_D1_FAILURE');
  });

  it('pins main, exact production SHA, eight gates and read-only workflow queries', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/production-platform-access-schema-readonly.yml', import.meta.url),
      'utf8',
    );
    const script = readFileSync(
      new URL('../production/platform-access-schema-readonly.mjs', import.meta.url),
      'utf8',
    );
    assert.match(workflow, /refs\/heads\/main/);
    assert.match(workflow, /RELEASE_SHA="\$GITHUB_SHA"/);
    assert.match(workflow, /RELEASE_SHA="\$EXPECTED_WORKER_SHA"/);
    assert.match(workflow, /environment: production/);
    assert.match(workflow, /PRODUCTION_WORKER_SHA_MISMATCH/);
    assert.match(workflow, /AIRTRUST_PRODUCTION_PLATFORM_ACCESS_READONLY/);
    assert.match(workflow, /concurrency:/);
    assert.match(script, /SELECT name FROM sqlite_master/);
    assert.match(script, /PRAGMA table_info/);
    assert.match(script, /'--remote', '--json', '--command'/);
    assert.doesNotMatch(script, /\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+TABLE)\b/i);
  });
});
