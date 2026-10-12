import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { req: { header(name: string): string | undefined }; set(k: string, v: unknown): void; json(v: unknown, code: 401): Response }, next: () => Promise<void>) => {
    // Local test harness ONLY. Production uses its real JWT+tenant auth.
    const user = c.req.header('x-test-user');
    const tenant = c.req.header('x-test-tenant');
    if (!user || !tenant) return c.json({ error: 'Unauthorized' }, 401);
    c.set('userId', Number(user));
    c.set('empresaId', Number(tenant));
    await next();
  },
}));

import nativeRoutes from '../../routes/lms-native';

type Row = {
  id: number; empresa_id: number; curso_id: number; funcionario_id: number;
  status: string; tipo_conteudo: string; ativo: number; publicado: number;
};
const base: Row = {
  id: 51, empresa_id: 6, curso_id: 7, funcionario_id: 19,
  status: 'EM_ANDAMENTO', tipo_conteudo: 'native', ativo: 1, publicado: 1,
};
let data: Row | null;
let employee: { funcionario_id: number | null } | null;
let statements: string[];
let bindings: unknown[][];
const makeDb = () => ({
  prepare(sql: string) {
    statements.push(sql);
    return {
      bind(...values: unknown[]) {
        bindings.push(values);
        return { async first() { return sql.includes('FROM lms_matriculas') ? data : employee; } };
      },
    };
  },
});

function app() {
  const server = new Hono<{ Bindings: Env }>();
  server.route('/api/lms/native', nativeRoutes);
  return server;
}
const req = (params: { id?: string; tenant?: string; user?: string } = {}) =>
  new Request('http://localhost/api/lms/native/matriculas/' + (params.id ?? '51') + '/admissao', {
    headers: {
      'x-test-user': params.user ?? '100',
      'x-test-tenant': params.tenant ?? '6',
    },
  });
const fetch = (request: Request, config: { environment?: string; allowlist?: string } = {}) =>
  app().fetch(request, {
    DB: makeDb(),
    ENVIRONMENT: config.environment ?? 'staging',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: config.allowlist ?? '6',
  } as unknown as Env);

describe('Native integration admission endpoint — read only and tenant scoped', () => {
  beforeEach(() => {
    data = { ...base };
    employee = { funcionario_id: 19 };
    statements = [];
    bindings = [];
  });

  it('returns sanitized admission, no employee PII or grade, no writes', async () => {
    const response = await fetch(req());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({
      success: true,
      data: { matricula_id: 51, curso_id: 7, mode: 'LEARN', native_package: 'NOT_YET_ENABLED' },
    });
    expect(bindings[0]).toEqual([51, 6]);
    expect(bindings[1]).toEqual([51, 6, 100]);
    expect(statements[1]).toContain('u.active=1');
    expect(statements[1]).toContain('f.empresa_id=m.empresa_id');
    expect(statements.every((sql) => sql.trimStart().toUpperCase().startsWith('SELECT'))).toBe(true);
  });

  it('never reads admission data outside explicitly allowlisted staging tenants', async () => {
    for (const config of [
      { environment: 'production', allowlist: '6' },
      { environment: 'staging', allowlist: '' },
      { environment: 'staging', allowlist: '*' },
      { environment: 'staging', allowlist: '60' },
    ]) {
      const response = await fetch(req(), config);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ code: 'NATIVE_PLAYER_NOT_ENABLED' });
    }
    expect(statements).toHaveLength(0);
    expect(bindings).toHaveLength(0);
  });

  it('completed course admits review only, never re-enrollment', async () => {
    data = { ...base, status: 'CONCLUIDO' };
    const response = await fetch(req());
    expect((await response.json() as { data: { mode: string } }).data.mode).toBe('REVIEW');
  });

  it('denies another employee and does not leak the owner', async () => {
    employee = { funcionario_id: 50 };
    const response = await fetch(req());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false, code: 'NATIVE_ENROLLMENT_ACCESS_DENIED',
    });
  });

  it('rejects course in another tenant even if database returns a row', async () => {
    data = { ...base, empresa_id: 10 };
    const response = await fetch(req());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, code: 'NATIVE_ENROLLMENT_NOT_FOUND' });
  });

  it('rejects existing SCORM, not published and cancelled enrollments', async () => {
    for (const [override, expected] of [
      [{ tipo_conteudo: 'scorm' }, 404],
      [{ publicado: 0 }, 409],
      [{ status: 'CANCELADO' }, 409],
    ] as const) {
      data = { ...base, ...override };
      const response = await fetch(req());
      expect(response.status).toBe(expected);
    }
  });

  it('refuses malformed IDs without querying a database', async () => {
    const response = await fetch(req({ id: '1e3' }));
    expect(response.status).toBe(400);
    expect(statements).toEqual([]);
  });

  it('route requires authentication before querying even read-only data', async () => {
    const response = await fetch(new Request('http://localhost/api/lms/native/matriculas/51/admissao'));
    expect(response.status).toBe(401);
    expect(statements).toEqual([]);
  });
});
