import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { onRequest } from '../../functions/assets/[[path]]';

const routes = JSON.parse(readFileSync(resolve(process.cwd(), 'public/_routes.json'), 'utf8')) as {
  include: string[];
};
const redirectsSource = readFileSync(resolve(process.cwd(), 'public/_redirects'), 'utf8');

describe('Pages asset fail-closed guard', () => {
  it('routes /assets through Pages Functions so SPA fallback can be inspected', () => {
    expect(routes.include).toContain('/assets/*');
    expect(redirectsSource).not.toContain('/assets/* /assets/:splat 200');
  });

  it('turns a missing asset SPA fallback into an uncached 404', async () => {
    const response = await onRequest({
      request: new Request('https://airtrust.online/assets/stale-release.js'),
      next: async () =>
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=14400',
          },
        }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('preserves a real javascript asset and forces revalidation', async () => {
    const asset = new Response('export const ok = true;', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript' },
    });

    const response = await onRequest({
      request: new Request('https://airtrust.online/assets/current-release.js'),
      next: async () => asset,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('export const ok = true;');
    expect(response.headers.get('content-type')).toContain('application/javascript');
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
