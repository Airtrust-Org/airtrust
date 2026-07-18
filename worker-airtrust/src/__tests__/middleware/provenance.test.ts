import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { provenanceHeadersMiddleware } from '../../middleware/provenance';
import type { Env } from '../../types';

type TestEnv = { Bindings: Env };

function appWithProvenance() {
  const app = new Hono<TestEnv>();
  app.use('*', provenanceHeadersMiddleware());
  app.get('/ok', (c) => c.json({ success: true }));
  app.get('/forbidden', (c) => c.json({ success: false }, 403));
  app.notFound((c) => c.json({ success: false }, 404));
  return app;
}

const STAGING_ENV_WITH_PROVENANCE: Env = {
  ENVIRONMENT: 'staging',
  APP_VERSION: 'staging-2026-07-18T02:55:18Z-fd0a6c9b',
  APP_BUILD_TIME: '2026-07-18T02:55:18Z',
  CF_VERSION_METADATA: {
    id: 'ffb376ae-bad3-44b9-a8b6-ad5a444b8906',
    tag: 'release-fd0a6c9b',
    timestamp: '2026-07-18T02:55:27Z',
  },
  AIRTRUST_SOURCE_SHA: '92286686ec42d5779ffd74e3df1796e0ea1dd0fe',
  AIRTRUST_SOURCE_TREE: 'a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e',
  AIRTRUST_WORKER_BUNDLE_SHA256: 'b'.repeat(64),
  AIRTRUST_RELEASE_MANIFEST_SHA256: 'c'.repeat(64),
} as Env;

describe('provenance headers', () => {
  it.each([
    ['/ok', 200],
    ['/forbidden', 403],
    ['/missing', 404],
  ])('identifies the deployed runtime on %s', async (path, expectedStatus) => {
    const response = await appWithProvenance().request(path, {}, STAGING_ENV_WITH_PROVENANCE);

    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get('X-AirTrust-App-Version')).toBe(
      'staging-2026-07-18T02:55:18Z-fd0a6c9b',
    );
    expect(response.headers.get('X-AirTrust-Worker-Version')).toBe(
      'ffb376ae-bad3-44b9-a8b6-ad5a444b8906',
    );
    expect(response.headers.get('X-AirTrust-Environment')).toBe('staging');
  });

  it.each([
    ['/ok', 200],
    ['/forbidden', 403],
    ['/missing', 404],
  ])('exposes the full provenance chain on %s', async (path) => {
    const response = await appWithProvenance().request(path, {}, STAGING_ENV_WITH_PROVENANCE);

    expect(response.headers.get('X-AirTrust-Source-SHA')).toBe(
      '92286686ec42d5779ffd74e3df1796e0ea1dd0fe',
    );
    expect(response.headers.get('X-AirTrust-Source-Tree')).toBe(
      'a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e',
    );
    expect(response.headers.get('X-AirTrust-Worker-Bundle-SHA256')).toBe('b'.repeat(64));
    expect(response.headers.get('X-AirTrust-Release-Manifest-SHA256')).toBe('c'.repeat(64));
  });

  it('does not manufacture a Worker Version ID or provenance chain when metadata is absent', async () => {
    const response = await appWithProvenance().request(
      '/ok',
      {},
      { ENVIRONMENT: 'production', APP_VERSION: '2026-07-18T03:00:00Z-fd0a6c9b' } as Env,
    );

    expect(response.headers.get('X-AirTrust-Worker-Version')).toBeNull();
    expect(response.headers.get('X-AirTrust-App-Version')).toBe('2026-07-18T03:00:00Z-fd0a6c9b');
    expect(response.headers.get('X-AirTrust-Source-SHA')).toBeNull();
    expect(response.headers.get('X-AirTrust-Source-Tree')).toBeNull();
    expect(response.headers.get('X-AirTrust-Worker-Bundle-SHA256')).toBeNull();
    expect(response.headers.get('X-AirTrust-Release-Manifest-SHA256')).toBeNull();
  });

  it('rejects placeholder provenance values the same way as APP_VERSION placeholders', async () => {
    const response = await appWithProvenance().request(
      '/ok',
      {},
      {
        ENVIRONMENT: 'staging',
        APP_VERSION: 'staging-2026-07-18T00:00:00Z-abcdef0',
        AIRTRUST_SOURCE_SHA: 'managed-by-script',
        AIRTRUST_WORKER_BUNDLE_SHA256: 'managed-by-script',
      } as Env,
    );

    // "managed-by-script" is one of the values sanitizeDeployMetadata() treats
    // as an unset placeholder — an unreleased/misconfigured deploy must never
    // present a fake-looking hash.
    expect(response.headers.get('X-AirTrust-Source-SHA')).toBeNull();
    expect(response.headers.get('X-AirTrust-Worker-Bundle-SHA256')).toBeNull();
  });
});
