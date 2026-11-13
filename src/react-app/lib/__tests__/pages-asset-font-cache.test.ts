import { describe, expect, it } from 'vitest';
import { onRequest } from '../../../../functions/assets/[[path]]';

function makeContext(path: string, status = 200, type = 'font/woff2') {
  return {
    request: new Request(`https://airtrust.online${path}`),
    next: async () =>
      new Response('asset', {
        status,
        headers: { 'Content-Type': type },
      }),
  };
}

describe('Cloudflare Pages hashed font browser caching', () => {
  it('caches content-hashed WOFF2 across frontend releases', async () => {
    const res = await onRequest(makeContext('/assets/material-symbols-outlined-Bgl3Icaq.woff2'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('keeps JS chunks revalidated so stale edges cannot poison a new release', async () => {
    const res = await onRequest(makeContext('/assets/index-abc12345.js', 200, 'application/javascript'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
  });

  it('does not cache an HTML fallback as a missing asset', async () => {
    const res = await onRequest(makeContext('/assets/missing-abc12345.woff2', 200, 'text/html'));
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
});
