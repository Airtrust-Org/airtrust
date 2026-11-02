import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractImports, findViolationsInFile } from '../../../../scripts/guard-layer-boundaries.mjs';

const REPO = '/repo';
const SRC = '/repo/worker-airtrust/src';
const at = (rel: string) => path.join(SRC, rel);
const check = (rel: string, source: string): string[] =>
  findViolationsInFile(at(rel), source, SRC, REPO);

describe('layer-boundaries guard', () => {
  it('flags a service importing a route module', () => {
    expect(check('services/x.ts', "import { a } from '../routes/foo';")).toEqual([
      'no-inner-to-routes|worker-airtrust/src/services/x.ts|worker-airtrust/src/routes/foo',
    ]);
  });

  it('flags type-only, export-from and dynamic imports as well', () => {
    const src = [
      "import type { T } from '../routes/a';",
      "export { b } from '../routes/b';",
      "const c = await import('../routes/c');",
    ].join('\n');
    expect(check('lib/x.ts', src)).toHaveLength(3);
  });

  it('flags middleware importing a route, but allows routes importing middleware', () => {
    expect(check('middleware/m.ts', "import { a } from '../routes/foo';")).toHaveLength(1);
    expect(check('routes/r.ts', "import { a } from '../middleware/auth';")).toEqual([]);
  });

  it('flags repositories/utils/shared importing services', () => {
    expect(check('repositories/r.ts', "import { a } from '../services/s';")).toHaveLength(1);
    expect(check('utils/u.ts', "import { a } from '../services/s';")).toHaveLength(1);
    expect(check('routes/r.ts', "import { a } from '../services/s';")).toEqual([]);
    expect(check('lib/l.ts', "import { a } from '../services/s';")).toEqual([]);
  });

  it('flags hono in services/lib/repositories only', () => {
    expect(check('services/s.ts', "import type { Context } from 'hono';")).toHaveLength(1);
    expect(check('lib/l.ts', "import { Hono } from 'hono';")).toHaveLength(1);
    expect(check('routes/r.ts', "import { Hono } from 'hono';")).toEqual([]);
    expect(check('utils/tenant-context.ts', "import type { Context } from 'hono';")).toEqual([]);
  });

  it('ignores imports that only appear in comments', () => {
    const src = "// import { a } from '../routes/foo';\n/* import { b } from '../routes/bar'; */";
    expect(extractImports(src)).toEqual([]);
    expect(check('services/x.ts', src)).toEqual([]);
  });
});
