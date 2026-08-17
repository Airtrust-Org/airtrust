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

// Delimits each `c.json(...)` call by balancing parens from the opening `(`
// instead of stopping at the first `\n\s*);` anywhere after it. The old
// non-greedy regex could run past the real end of a call (e.g. into a
// subsequent multi-line function call, or the enclosing catch block) whenever
// the call's own closing looked like `\n    });` (object literal, then paren)
// rather than a bare `\n    );` — producing both false positives (unrelated
// code swept into the "block") and false negatives (the real violation
// sitting past the accidental early match).
function collectJsonReturns(text: string): string[] {
  const results: string[] = [];
  const opener = /return\s+c\.json\(/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(text))) {
    const start = match.index;
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      i++;
    }
    if (depth !== 0) continue; // unbalanced — skip rather than mis-slice
    if (text[i] === ';') i++;
    results.push(text.slice(start, i));
  }
  return results;
}

describe('client-facing error payloads', () => {
  it('does not return raw internal error messages or stacks in 500 responses', () => {
    const violations = listRouteFiles(routesDir)
      .filter(isClientFacingRoute)
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        const routePath = relative(process.cwd(), file);
        const jsonReturns = collectJsonReturns(source).filter((block) =>
          block.includes('success: false'),
        );
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
