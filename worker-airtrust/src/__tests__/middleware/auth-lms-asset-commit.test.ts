import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, JwtPayload, Variables } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

let jwtPayload: JwtPayload | null = null;

vi.mock('../../utils/security', () => ({
  extractBearerToken: (value: string) => value.replace(/^Bearer\s+/i, ''),
  verifyJWT: vi.fn(async () => jwtPayload),
}));

vi.mock('../../utils/db-schema', () => ({
  getUsuariosSchema: vi.fn(async () => ({ activeWhere: '' })),
  hasUsuariosEmpresasTable: vi.fn(async () => true),
}));

import { auth } from '../../middleware/auth';

function createDb() {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ id: 7, perfil: 'USUARIO', role: 'USUARIO' }),
      }),
    }),
  } as unknown as D1Database;
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use('*', auth());
  app.post('/api/lms/matriculas/scorm/commit', (c) =>
    c.json({
      userId: c.get('userId'),
      empresaId: c.get('empresaId'),
      funcionarioId: c.get('funcionarioId'),
      userRole: c.get('userRole'),
    }),
  );
  app.post('/api/lms/matriculas/other', (c) => c.json({ ok: true }));
  app.onError(errorHandler);
  return app;
}

function scopedPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 7,
    email: 'aluno@example.test',
    role: 'USUARIO',
    token_type: 'lms_asset',
    asset_scope: 'course_assets',
    asset_curso_id: 32,
    asset_matricula_id: 346,
    empresa_id: 6,
    funcionario_id: 77,
    ...overrides,
  } as JwtPayload;
}

describe('auth scoped LMS asset capability for SCORM commit', () => {
  beforeEach(() => {
    jwtPayload = scopedPayload();
  });

  it('accepts the HttpOnly asset cookie only on the exact SCORM commit path', async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/api/lms/matriculas/scorm/commit', {
        method: 'POST',
        headers: { cookie: 'airtrust_lms_asset_token=test-cookie' },
      }),
      { DB: createDb(), JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      userId: 7,
      empresaId: 6,
      funcionarioId: 77,
      userRole: 'USUARIO',
    });

    const other = await app.fetch(
      new Request('http://localhost/api/lms/matriculas/other', {
        method: 'POST',
        headers: { cookie: 'airtrust_lms_asset_token=test-cookie' },
      }),
      { DB: createDb(), JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
    );
    expect(other.status).toBe(401);
  });

  it('rejects preview or non-course asset capabilities for commit authentication', async () => {
    const app = createApp();

    for (const payload of [
      scopedPayload({ asset_preview: true }),
      scopedPayload({ asset_scope: 'pptx_viewer' }),
      scopedPayload({ token_type: 'access' }),
    ]) {
      jwtPayload = payload;
      const response = await app.fetch(
        new Request('http://localhost/api/lms/matriculas/scorm/commit', {
          method: 'POST',
          headers: { cookie: 'airtrust_lms_asset_token=test-cookie' },
        }),
        { DB: createDb(), JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      );
      expect(response.status).toBe(401);
    }
  });

  it('fails closed when enrollment scope claims are incomplete', async () => {
    jwtPayload = scopedPayload({ asset_matricula_id: undefined });
    const response = await createApp().fetch(
      new Request('http://localhost/api/lms/matriculas/scorm/commit', {
        method: 'POST',
        headers: { cookie: 'airtrust_lms_asset_token=test-cookie' },
      }),
      { DB: createDb(), JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
    );
    expect(response.status).toBe(401);
  });
});
