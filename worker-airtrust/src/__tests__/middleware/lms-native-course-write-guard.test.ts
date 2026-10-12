import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { guardLegacyCourseMutation } from '../../middleware/lms-native-course-write-guard';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

function setup(kind: 'native' | 'scorm', activated: boolean, flag = '6') {
  const first = vi.fn(async () => ({ id: 99, tipo_conteudo: kind }));
  const markerFirst = vi.fn(async () => activated ? { curso_id: 99 } : null);
  const prepare = vi.fn((sql: string) => {
    const fn = sql.includes('lms_native_catalog_activation') ? markerFirst : first;
    return { bind: vi.fn(() => ({ first: fn })) };
  });
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('empresaId' as never, 6 as never);
    await next();
  });
  app.use('/:id{[0-9]+}/*', guardLegacyCourseMutation);
  app.post('/99/upload/init', (c) => c.json({ reached: true }));
  app.post('/99/scorm-package-versions/12/activate', (c) => c.json({ reached: true }));
  app.put('/99', (c) => c.json({ reached: true }));
  app.patch('/99', (c) => c.json({ reached: true }));
  app.delete('/99', (c) => c.json({ reached: true }));
  app.get('/99', (c) => c.json({ reached: true }));
  return { app, prepare, env: {
    ENVIRONMENT: 'staging',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: flag,
    DB: { prepare } as unknown as D1Database,
  } as Env };
}

describe('Native marked courses cannot mutate through legacy admin CRUD / upload', () => {
  it.each([
    ['POST','/99/upload/init'],
    ['POST','/99/scorm-package-versions/12/activate'],
    ['PUT','/99'],
    ['PATCH','/99'],
    ['DELETE','/99'],
  ] as const)('rejects %s %s before reaching a legacy handler', async (method,path) => {
    const { app, env, prepare } = setup('scorm', true);
    const res = await app.fetch(new Request('http://localhost'+path,{ method }), env, {} as ExecutionContext);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code:'NATIVE_LEGACY_COURSE_MUTATION_BLOCKED' });
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it('preserves ordinary SCORM edits if no activation record exists', async () => {
    const { app, env } = setup('scorm', false);
    const res = await app.fetch(new Request('http://localhost/99',{ method:'PUT' }),env,{} as ExecutionContext);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reached:true });
  });
  it('does not query activation without explicit staging tenant enablement', async () => {
    const { app, env, prepare } = setup('scorm', true, '');
    const res = await app.fetch(new Request('http://localhost/99',{ method:'PATCH' }),env,{} as ExecutionContext);
    expect(res.status).toBe(200);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('blocks physical Native even with the activation read flag off', async () => {
    const { app, env, prepare } = setup('native', false, '');
    const res = await app.fetch(new Request('http://localhost/99',{ method:'PUT' }),env,{} as ExecutionContext);
    expect(res.status).toBe(409);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('does not run write barrier on read-only course details', async () => {
    const { app, env, prepare } = setup('scorm', true);
    const res = await app.fetch(new Request('http://localhost/99'),env,{} as ExecutionContext);
    expect(res.status).toBe(200);
    expect(prepare).not.toHaveBeenCalled();
  });
});
