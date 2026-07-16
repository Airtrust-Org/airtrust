/**
 * Testes de regressão — política de cache multi-tenant.
 *
 * Garante que respostas JSON autenticadas/tenant-scoped nunca recebem
 * `Cache-Control: public`, que mutações e erros de rotas autenticadas
 * não são cacheáveis, e que a allowlist explícita de rotas públicas
 * continua funcionando. Assets estáticos preservam seu comportamento.
 */

import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { cacheControl } from '../../middleware/cache';

function buildApp() {
  const app = new Hono();
  app.use('*', cacheControl());

  // Rota pública allowlisted (metadados estáticos, sem dado de tenant).
  app.get('/api/health', (c) => c.json({ success: true }));

  // Rota autenticada/tenant-scoped simulada (sem allowlist).
  app.get('/api/qualificacoes/:id', (c) =>
    c.json({ success: true, data: { id: c.req.param('id'), empresa_id: 5 } }),
  );

  // Mesma rota simulando erro de autorização.
  app.get('/api/frms/relatorio', (c) => c.json({ success: false, error: 'forbidden' }, 403));
  app.get('/api/qualificacoes/inexistente', (c) =>
    c.json({ success: false, error: 'not found' }, 404),
  );
  app.get('/api/qualificacoes/boom', (c) => c.json({ success: false, error: 'boom' }, 500));

  // Mutações.
  app.post('/api/qualificacoes', (c) => c.json({ success: true, data: {} }));
  app.put('/api/qualificacoes/:id', (c) => c.json({ success: true, data: {} }));
  app.patch('/api/qualificacoes/:id', (c) => c.json({ success: true, data: {} }));
  app.delete('/api/qualificacoes/:id', (c) => c.json({ success: true }));

  // Rota que já define seu próprio Cache-Control explicitamente.
  app.get('/api/custom-cache', (c) => {
    c.header('Cache-Control', 'private, max-age=10');
    return c.json({ success: true });
  });

  // Assets estáticos.
  app.get('/index-abc12345.js', (c) => {
    c.header('Content-Type', 'application/javascript');
    return c.body('console.log(1)');
  });
  app.get('/logo.png', (c) => {
    c.header('Content-Type', 'image/png');
    return c.body('binary');
  });

  // HTML da SPA.
  app.get('/', (c) => {
    c.header('Content-Type', 'text/html');
    return c.body('<html></html>');
  });

  return app;
}

async function fetchPath(app: Hono, path: string, method = 'GET') {
  return app.request(path, { method });
}

describe('cacheControl middleware — política multi-tenant segura', () => {
  it('rota tenant-scoped nunca retorna Cache-Control public', async () => {
    const app = buildApp();
    const res = await fetchPath(app, '/api/qualificacoes/123');
    const cacheControlHeader = res.headers.get('Cache-Control') || '';
    expect(cacheControlHeader).not.toMatch(/\bpublic\b/);
    expect(cacheControlHeader).toContain('private');
    expect(cacheControlHeader).toContain('no-store');
  });

  it('rota sensível (FRMS) retorna private/no-store mesmo em 403', async () => {
    const app = buildApp();
    const res = await fetchPath(app, '/api/frms/relatorio');
    expect(res.status).toBe(403);
    const cacheControlHeader = res.headers.get('Cache-Control') || '';
    expect(cacheControlHeader).not.toMatch(/\bpublic\b/);
    expect(cacheControlHeader).toContain('no-store');
  });

  it.each([404, 500])('erro %i de rota autenticada não é publicamente cacheável', async () => {
    const app = buildApp();
    const path = '/api/qualificacoes/inexistente';
    const res = await fetchPath(app, path);
    const cacheControlHeader = res.headers.get('Cache-Control') || '';
    expect(cacheControlHeader).not.toMatch(/\bpublic\b/);
    expect(cacheControlHeader).toContain('no-store');
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'método %s nunca é cacheável',
    async (method) => {
      const app = buildApp();
      const path = method === 'POST' ? '/api/qualificacoes' : '/api/qualificacoes/123';
      const res = await fetchPath(app, path, method);
      const cacheControlHeader = res.headers.get('Cache-Control') || '';
      expect(cacheControlHeader).not.toMatch(/\bpublic\b/);
      expect(cacheControlHeader).toContain('no-store');
    },
  );

  it('rota pública explicitamente autorizada mantém cache curto e público', async () => {
    const app = buildApp();
    const res = await fetchPath(app, '/api/health');
    const cacheControlHeader = res.headers.get('Cache-Control') || '';
    expect(cacheControlHeader).toMatch(/\bpublic\b/);
  });

  it('rota que já define seu próprio Cache-Control é respeitada sem sobrescrita', async () => {
    const app = buildApp();
    const res = await fetchPath(app, '/api/custom-cache');
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=10');
  });

  it('assets estáticos com hash preservam cache agressivo e imutável', async () => {
    const app = buildApp();
    const res = await fetchPath(app, '/index-abc12345.js');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('HTML da SPA nunca é cacheado', async () => {
    const app = buildApp();
    const res = await fetchPath(app, '/');
    const cacheControlHeader = res.headers.get('Cache-Control') || '';
    expect(cacheControlHeader).toContain('no-store');
  });

  it('duas requisições com Authorization diferentes na mesma rota tenant-scoped nunca são marcadas como cacheáveis publicamente', async () => {
    const app = buildApp();
    const resTenantA = await app.request('/api/qualificacoes/123', {
      headers: { Authorization: 'Bearer tenant-a-token' },
    });
    const resTenantB = await app.request('/api/qualificacoes/123', {
      headers: { Authorization: 'Bearer tenant-b-token' },
    });

    for (const res of [resTenantA, resTenantB]) {
      const cacheControlHeader = res.headers.get('Cache-Control') || '';
      expect(cacheControlHeader).not.toMatch(/\bpublic\b/);
      expect(cacheControlHeader).toContain('no-store');
    }
  });
});
