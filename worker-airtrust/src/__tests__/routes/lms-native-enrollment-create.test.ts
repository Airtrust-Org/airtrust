import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const mocks = vi.hoisted(() => ({
  select: vi.fn(), provision: vi.fn(),
}));
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { req: { header(name: string): string | undefined };
    set(k: string, v: unknown): void; json(v: unknown, code: 401): Response },
    next: () => Promise<void>) => {
    if (!c.req.header('x-test-user') || !c.req.header('x-test-tenant')) {
      return c.json({ code: 'UNAUTHORIZED' }, 401);
    }
    c.set('userId', Number(c.req.header('x-test-user')));
    c.set('empresaId', Number(c.req.header('x-test-tenant')));
    await next();
  },
}));
vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: (c: { get(key: string): number }) => c.get('empresaId'),
}));
vi.mock('../../services/lms-native-enrollment-edition-selector', async original => {
  const real = await original<typeof import('../../services/lms-native-enrollment-edition-selector')>();
  return { ...real, selectNativeEnrollmentEdition: mocks.select };
});
vi.mock('../../services/lms-native-enrollment-provisioner', async original => {
  const real = await original<typeof import('../../services/lms-native-enrollment-provisioner')>();
  return { ...real, provisionNativeEnrollment: mocks.provision };
});
import nativeRoutes from '../../routes/lms-native';

function call(opts: { environment?: string; create?: string; preview?: string;
  write?: string; marker?: string; user?: number; company?: number;
  anonymous?: boolean; course?: string; body?: string } = {}) {
  const root = new Hono<{ Bindings: Env }>();
  root.route('/api/lms/native', nativeRoutes);
  const headers = opts.anonymous ? {} : {
    'x-test-user': String(opts.user ?? 900), 'x-test-tenant': String(opts.company ?? 6),
  };
  return root.fetch(new Request('http://localhost/api/lms/native/cursos/' +
    (opts.course ?? '10') + '/matricular', {
    method: 'POST', headers, body: opts.body,
  }), {
    ENVIRONMENT: opts.environment ?? 'staging',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: opts.marker ?? '6',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: opts.preview ?? '6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS: opts.write ?? '6',
    NATIVE_LEARNER_ENROLLMENT_CREATE_ENABLED_TENANTS: opts.create ?? '6',
    DB: {} as D1Database, BUCKET: {} as R2Bucket,
  } as Env);
}
describe('Native enrollment creation — separate staging authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockResolvedValue(77);
    mocks.provision.mockResolvedValue({ matriculaId: 101, cicloId: 1001, edicaoId: 77 });
  });
  it('denies production, disabled flags, mismatched tenants before DB/R2', async () => {
    for (const v of [
      { environment: 'production' }, { create: '' }, { create: '*' },
      { create: '60' }, { preview: '' }, { write: '' }, { marker: '' },
      { company: 60 },
    ]) {
      const r = await call(v);
      expect(r.status).toBe(404);
      expect(await r.json()).toMatchObject({ code: 'NATIVE_ENROLLMENT_CREATE_NOT_ENABLED' });
    }
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it('requires inherited JWT auth and refuses malformed IDs', async () => {
    expect((await call({ anonymous: true })).status).toBe(401);
    expect((await call({ course: '2e9' })).status).toBe(400);
    expect((await call({ user: 0 })).status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('refuses employee, edition or grade data from browser', async () => {
    for (const body of ['{}','{"funcionario_id":19}','{"edicao_id":77}','{"score":100}']) {
      expect((await call({ body })).status).toBe(400);
    }
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('selects reviewed private edition and provisions same-tenant actor once', async () => {
    const r = await call();
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ success: true, data: {
      matricula_id: 101, ciclo_id: 1001, completion_supported: false,
    } });
    expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, cursoId: 10,
    }));
    expect(mocks.provision).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, cursoId: 10, actorUserId: 900, edicaoId: 77,
    }));
  });
});
