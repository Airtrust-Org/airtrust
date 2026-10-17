import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
const mock = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { req: { header(k: string): string | undefined };
    set(k: string, v: unknown): void; json(v: unknown, status: 401): Response },
    next: () => Promise<void>) => {
    if (!c.req.header('x-test-user') || !c.req.header('x-test-tenant'))
      return c.json({ code: 'UNAUTHORIZED' }, 401);
    c.set('userId', Number(c.req.header('x-test-user')));
    c.set('empresaId', Number(c.req.header('x-test-tenant')));
    await next();
  },
}));
vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: (c: { get(k: string): number }) => c.get('empresaId'),
}));
vi.mock('../../services/lms-native-canonical-completion-preflight', () => ({
  preflightNativeCanonicalCompletion: mock.check,
}));
import routes from '../../routes/lms-native';
type Args = { stage?: string; tenant?: number; actor?: number; completion?: string;
  catalog?: string; preview?: string; write?: string; id?: string; anonymous?: boolean };
function call(args: Args = {}) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/lms/native', routes);
  const headers: Record<string,string> = args.anonymous ? {} : {
    'x-test-tenant': String(args.tenant ?? 6), 'x-test-user': String(args.actor ?? 900),
  };
  const env = { ENVIRONMENT: args.stage ?? 'staging',
    NATIVE_COMPLETION_PREFLIGHT_ENABLED_TENANTS: args.completion ?? '6',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: args.catalog ?? '6',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: args.preview ?? '6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS: args.write ?? '6',
    DB: {} as D1Database, BUCKET: {} as R2Bucket } as Env;
  return app.fetch(new Request(
    'http://localhost/api/lms/native/matriculas/' + (args.id ?? '101') + '/conclusao-prontidao',
    { headers },
  ), env);
}
describe('Native completion diagnostic never writes or certifies learners', () => {
  beforeEach(() => {
    mock.check.mockReset().mockResolvedValue({
      ready: true, reason: 'READY',
      canonical: { empresaId: 6, funcionarioId: 19,
        qualificacaoCodigo: 'PRIVATE', qualificacaoTipoId: 44, editionHash: 'a'.repeat(64) },
    });
  });
  it('discloses only readiness, never private qualification, grade or certificate', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toContain('no-store');
    expect(await r.json()).toEqual({ success: true, data: {
      matricula_id: 101, ready_for_canonical_completion: true,
      reason: 'READY', completion_supported: false,
    } });
    expect(mock.check).toHaveBeenCalledTimes(1);
    expect(mock.check).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, matriculaId: 101, actorUserId: 900,
    }));
  });
  it('returns a sanitized negative readiness reason without assuming completion', async () => {
    mock.check.mockResolvedValueOnce({ ready: false, reason: 'ASSESSMENT_EVIDENCE_MISSING' });
    const r=await call();
    expect(await r.json()).toMatchObject({ data: {
      ready_for_canonical_completion: false,
      reason: 'ASSESSMENT_EVIDENCE_MISSING', completion_supported: false,
    } });
  });
  it('does not access D1/R2 under production, disabled or mis-scoped flags', async () => {
    for (const args of [{ stage: 'production' }, { completion: '' },
      { completion: '*' }, { completion: '60' }, { catalog: '' },
      { catalog: '60' }, { preview: '' }, { write: '' }, { tenant: 7 }]) {
      const r=await call(args);
      expect(r.status).toBe(404);
      expect(await r.json()).toMatchObject({ code: 'NATIVE_COMPLETION_PREFLIGHT_NOT_ENABLED' });
    }
    expect(mock.check).not.toHaveBeenCalled();
  });
  it('inherits authentication and refuses invalid user/course context', async () => {
    expect((await call({ anonymous: true })).status).toBe(401);
    expect((await call({ id: '9e3' })).status).toBe(400);
    expect((await call({ actor: 0 })).status).toBe(403);
    expect(mock.check).not.toHaveBeenCalled();
  });
  it('conceals backend state after a lookup failure instead of falling back to SCORM', async () => {
    mock.check.mockRejectedValueOnce(Error('PRIVATE_R2_OR_FK_STATE'));
    const r=await call();
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      success: false, code: 'NATIVE_COMPLETION_PREFLIGHT_UNAVAILABLE',
    });
  });
});
