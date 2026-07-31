import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { jsonInternalError } from '../../middleware/response';

const routesDir = join(process.cwd(), 'src', 'routes');

const excludedPathFragments: string[] = [];

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) return listRouteFiles(fullPath);
    if (!entry.endsWith('.ts')) return [];
    return [fullPath];
  });
}

function isClientFacingRoute(file: string): boolean {
  const routePath = relative(routesDir, file);
  return !excludedPathFragments.some((fragment) => routePath.includes(fragment));
}

function collectMatches(text: string, regex: RegExp): string[] {
  return [...text.matchAll(regex)].map((match) => match[0].replace(/\s+/g, ' ').trim());
}

function collectJsonReturns(text: string): string[] {
  return [...text.matchAll(/return\s+c\.json\([\s\S]*?\n\s*\);/g)].map((match) => match[0]);
}

describe('client-facing error payloads', () => {
  it('does not return raw internal error messages or stacks in 500 responses', () => {
    const violations = listRouteFiles(routesDir)
      .filter(isClientFacingRoute)
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        const routePath = relative(process.cwd(), file);
        const jsonReturns = collectJsonReturns(source).filter((block) => block.includes('success: false'));
        const rawMessageIn500 = jsonReturns.flatMap((block) =>
          block.includes(',\n      500') || block.includes(', 500')
            ? collectMatches(block, /error:\s*(?:error|err|e)\??\.message/g)
            : [],
        );
        const stackOrDetailsInPayload = jsonReturns.flatMap((block) =>
          collectMatches(
            block,
            /(?:details:\s*(?:error|err|e)(?:[\s\S]{0,80})(?:message|stack)|stack:\s*(?:error|err|e)\??\.stack)/g,
          ),
        );

        return [...rawMessageIn500, ...stackOrDetailsInPayload].map(
          (match) => `${routePath}: ${match}`,
        );
      });

    expect(violations).toEqual([]);
  });

  it('returns a generic payload for internal route failures', async () => {
    const app = new Hono();
    app.get('/boom', (c) => jsonInternalError(c));

    const response = await app.request('/boom');
    const payload = await response.json<{
      success: boolean;
      error?: string;
      code?: string;
      details?: string;
      stack?: string;
    }>();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      success: false,
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(payload)).not.toContain('SQL');
    expect(payload.details).toBeUndefined();
    expect(payload.stack).toBeUndefined();
  });
});
