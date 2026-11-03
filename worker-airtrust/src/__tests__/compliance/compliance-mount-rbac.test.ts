/**
 * Auditoria de Compliance — composição das rotas montadas em /api/compliance.
 *
 * index.ts monta, nesta ordem:
 *   app.route('/api/compliance', complianceRecalculateRoutes)  // use('*', requireRole('admin'))
 *   app.route('/api/compliance', complianceRequisitosRoutes)   // POST/PUT/DELETE: admin|manager
 * Em Hono, o middleware '*' do sub-app é re-registrado em '/api/compliance/*' e passa a
 * valer também para as rotas montadas depois. Este teste usa os roteadores reais e um
 * requireRole fiel (papel vem de um cabeçalho) para provar o RBAC efetivo.
 */
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({ getEmpresaId: () => 1 }));
vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...roles: string[]) =>
    async (c: { req: { header: (n: string) => string | undefined }; json: (b: unknown, s: number) => Response }, next: () => Promise<void>) => {
      const role = c.req.header('x-test-role');
      if (!role || !roles.includes(role)) return c.json({ error: 'forbidden' }, 403);
      return next();
    },
}));

import recalc from '../../routes/compliance-recalculate';
import requisitos from '../../routes/compliance-requisitos';

function mountedLikeIndexTs() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/compliance', recalc);
  app.route('/api/compliance', requisitos);
  return app;
}

function db() {
  const stmt = {
    bind: () => stmt,
    all: async () => ({ results: [] }),
    first: async () => null,
    run: async () => ({ success: true, meta: { changes: 0, last_row_id: 1 } }),
  };
  return { prepare: () => stmt } as unknown as D1Database;
}

async function call(role: string, method: string, path: string, body?: unknown) {
  return mountedLikeIndexTs().fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'x-test-role': role, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { DB: db() } as Env,
    {} as ExecutionContext,
  );
}

/*
 * ACHADO (P3, fail-closed — decisão de produto pendente): o contrato declarado em
 * compliance-requisitos.ts é "GET aberto a autenticados; escrita admin|manager", mas o
 * `use('*', requireRole('admin'))` de compliance-recalculate.ts vaza para as rotas montadas depois,
 * tornando TODO /api/compliance/* admin-only. Não houve vazamento de dados; o efeito é manager sem
 * acesso a requisitos. Ampliar o acesso é mudança de autorização e exige decisão explícita, então
 * este teste fixa o comportamento efetivo: qualquer ajuste de ordem/escopo passa a ser deliberado.
 */
describe('RBAC efetivo de /api/compliance/* após a montagem do index.ts (caracterização)', () => {
  it('admin escreve e lê requisitos', async () => {
    const write = await call('admin', 'POST', '/api/compliance/requisitos', {
      funcao: 'Piloto',
      tipo_recurso: 'qualificacao',
      referencia: 'NR35',
    });
    expect(write.status).not.toBe(403);
    const read = await call('admin', 'GET', '/api/compliance/requisitos');
    expect(read.status).not.toBe(403);
  });

  it('manager é negado em requisitos (efetivo: admin-only, apesar do contrato admin|manager)', async () => {
    const write = await call('manager', 'POST', '/api/compliance/requisitos', {
      funcao: 'Piloto',
      tipo_recurso: 'qualificacao',
      referencia: 'NR35',
    });
    expect(write.status).toBe(403);
    expect((await call('manager', 'GET', '/api/compliance/requisitos')).status).toBe(403);
  });

  it('student/instructor negados na leitura e na escrita (fail-closed)', async () => {
    for (const role of ['student', 'instructor']) {
      expect((await call(role, 'GET', '/api/compliance/requisitos')).status).toBe(403);
      expect(
        (await call(role, 'POST', '/api/compliance/requisitos', {
          funcao: 'Piloto',
          tipo_recurso: 'qualificacao',
          referencia: 'NR35',
        })).status,
      ).toBe(403);
    }
  });

  it('recálculo em massa e estatísticas seguem exclusivos de admin', async () => {
    expect((await call('manager', 'POST', '/api/compliance/recalculate', { scope: 'all' })).status).toBe(403);
    expect((await call('manager', 'GET', '/api/compliance/stats')).status).toBe(403);
  });
});
