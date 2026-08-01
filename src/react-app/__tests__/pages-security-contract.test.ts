import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { onRequest as onApiRootRequest } from '../../../functions/api';
import { onRequest as onApiPathRequest } from '../../../functions/api/[[path]]';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const headers = readFileSync(resolve(currentDirectory, '../../../public/_headers'), 'utf8');
const redirects = readFileSync(resolve(currentDirectory, '../../../public/_redirects'), 'utf8');
const functionRoutes = JSON.parse(
  readFileSync(resolve(currentDirectory, '../../../public/_routes.json'), 'utf8'),
) as {
  version: number;
  include: string[];
  exclude: string[];
};

describe('Cloudflare Pages security contract', () => {
  it('never publicly caches /api/* responses', () => {
    const apiBlock = headers.slice(headers.indexOf('/api/*'));
    expect(apiBlock).toContain('Cache-Control: private, no-store');
    expect(apiBlock).toContain('CDN-Cache-Control: no-store');
    expect(apiBlock).not.toContain('Cache-Control: public');
  });

  it('invokes Pages Functions only for the fail-closed API surface', () => {
    // Static application routes must remain outside the Pages Functions invocation path.
    expect(functionRoutes).toEqual({
      version: 1,
      include: ['/api', '/api/*'],
      exclude: [],
    });
  });

  it('returns a real fail-closed 404 for /api and nested API paths', () => {
    expect(redirects).not.toMatch(/^\/api(?:\/\*)?\s+/m);
    expect(redirects).not.toContain('/api/* /api/:splat 200');

    for (const handler of [onApiRootRequest, onApiPathRequest]) {
      const response = handler();
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toContain('private, no-store');
      expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
      expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Type')).toContain('application/json');
    }
  });

  it('removes unsafe-eval and closes network destinations in production CSP', () => {
    const cspLine = headers
      .split('\n')
      .find((line) => line.trim().startsWith('Content-Security-Policy:'));
    expect(cspLine).toBeTruthy();
    expect(cspLine).not.toContain("'unsafe-eval'");
    expect(cspLine).not.toContain("connect-src 'self' https: http: ws: wss:");
    expect(cspLine).toContain(
      "connect-src 'self' https://api.airtrust.online https://airtrust-api-staging.airtrust.workers.dev",
    );
    expect(cspLine).not.toContain('https://airtrust-api-production.airtrust.workers.dev');
    expect(cspLine).not.toContain('http://localhost:8787');
  });
});
