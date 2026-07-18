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

describe('provenance headers', () => {
  it.each([
    ['/ok', 200],
    ['/forbidden', 403],
    ['/missing', 404],
  ])('identifies the deployed runtime on %s', async (path, expectedStatus) => {
    const response = await appWithProvenance().request(
      path,
      {},
      {
        ENVIRONMENT: 'staging',
        APP_VERSION: 'staging-2026-07-18T02:55:18Z-fd0a6c9b',
        APP_BUILD_TIME: '2026-07-18T02:55:18Z',
        CF_VERSION_METADATA: {
          id: 'ffb376ae-bad3-44b9-a8b6-ad5a444b8906',
          tag: 'release-fd0a6c9b',
          timestamp: '2026-07-18T02:55:27Z',
        },
      } as Env,
    );

    expect(response.status).toBe(expectedStatus);
    expect(response.headers.get('X-AirTrust-App-Version')).toBe(
      'staging-2026-07-18T02:55:18Z-fd0a6c9b',
    );
    expect(response.headers.get('X-AirTrust-Worker-Version')).toBe(
      'ffb376ae-bad3-44b9-a8b6-ad5a444b8906',
    );
    expect(response.headers.get('X-AirTrust-Environment')).toBe('staging');
  });

  it('does not manufacture a Worker Version ID when metadata is absent', async () => {
    const response = await appWithProvenance().request(
      '/ok',
      {},
      { ENVIRONMENT: 'production', APP_VERSION: '2026-07-18T03:00:00Z-fd0a6c9b' } as Env,
    );

    expect(response.headers.get('X-AirTrust-Worker-Version')).toBeNull();
    expect(response.headers.get('X-AirTrust-App-Version')).toBe('2026-07-18T03:00:00Z-fd0a6c9b');
  });
});
