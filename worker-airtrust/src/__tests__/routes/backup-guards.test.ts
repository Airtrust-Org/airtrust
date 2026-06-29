/**
 * Backup Routes — Tenant Isolation Disable Guard Tests
 *
 * Todos os endpoints de /api/backup estão temporariamente desativados.
 * auth() roda primeiro → 401 sem token.
 * Após auth → 503 BACKUP_DISABLED_PENDING_TENANT_ISOLATION para qualquer role.
 */

import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const authMode = String(c.env?.__authMode || 'ok');
    if (authMode === 'missing') {
      return c.json(
        {
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Token de autenticação não fornecido',
        },
        401,
      );
    }

    c.set('userId', 101);
    c.set('userRole', String(c.env?.__mockRole || 'manager'));
    c.set('empresaId', String(c.env?.__mockEmpresaId ?? 6));
    await next();
  },
}));

import backupRoutes from '../../routes/backup';

function createBackupApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/backup', backupRoutes);
  return app;
}

const DISABLED_BODY = {
  success: false,
  code: 'BACKUP_DISABLED_PENDING_TENANT_ISOLATION',
};

describe('backup routes — DISABLED pending tenant isolation', () => {
  // ─── Auth runs first — unauthenticated returns 401 ─────────────────────────

  it('retorna 401 sem autenticação (auth roda antes do disable guard)', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPLETO' }),
      },
      { __authMode: 'missing' } as unknown as Env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('retorna 503 para admin autenticado da empresa 6', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPLETO' }),
      },
      {
        __authMode: 'ok',
        __mockRole: 'admin',
        __mockEmpresaId: 6,
        BUCKET: {} as R2Bucket,
      } as unknown as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  it('retorna 503 para manager autenticado da empresa 6', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPLETO' }),
      },
      {
        __authMode: 'ok',
        __mockRole: 'manager',
        __mockEmpresaId: 6,
        BUCKET: {} as R2Bucket,
      } as unknown as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  it('retorna 503 para admin de outra empresa (empresa 1)', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPLETO' }),
      },
      {
        __authMode: 'ok',
        __mockRole: 'admin',
        __mockEmpresaId: 1,
        BUCKET: {} as R2Bucket,
      } as unknown as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  // ─── Role without permission also gets 503 (feature disabled, not RBAC) ───

  it('retorna 503 para editor (role sem permissão de backup)', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPLETO' }),
      },
      {
        __authMode: 'ok',
        __mockRole: 'editor',
        __mockEmpresaId: 6,
      } as unknown as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  // ─── ALL endpoints are blocked ─────────────────────────────────────────────

  it('GET /backup (lista) retorna 503', async () => {
    const app = createBackupApp();
    const response = await app.request('/backup', {}, {
      __authMode: 'ok',
      __mockRole: 'admin',
      __mockEmpresaId: 6,
    } as unknown as Env);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  it('GET /backup/:uuid (detalhes) retorna 503', async () => {
    const app = createBackupApp();
    const response = await app.request('/backup/test-uuid-123', {}, {
      __authMode: 'ok',
      __mockRole: 'admin',
      __mockEmpresaId: 6,
    } as unknown as Env);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  it('POST /backup/manual (criação) retorna 503', async () => {
    const app = createBackupApp();
    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPLETO' }),
      },
      {
        __authMode: 'ok',
        __mockRole: 'admin',
        __mockEmpresaId: 6,
        BUCKET: {} as R2Bucket,
      } as unknown as Env,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  it('POST /backup/:uuid/restore (restauração) retorna 503', async () => {
    const app = createBackupApp();
    const response = await app.request(
      '/backup/test-uuid-123/restore',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modulos: ['PESSOAS'] }),
      },
      {
        __authMode: 'ok',
        __mockRole: 'admin',
        __mockEmpresaId: 6,
        BUCKET: {} as R2Bucket,
      } as unknown as Env,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  it('DELETE /backup/:uuid (remoção) retorna 503', async () => {
    const app = createBackupApp();
    const response = await app.request(
      '/backup/test-uuid-123',
      { method: 'DELETE' },
      {
        __authMode: 'ok',
        __mockRole: 'admin',
        __mockEmpresaId: 6,
      } as unknown as Env,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  it('GET /backup/:uuid/download (exportação completa) retorna 503', async () => {
    const app = createBackupApp();
    const response = await app.request(
      '/backup/test-uuid-123/download',
      {},
      {
        __authMode: 'ok',
        __mockRole: 'admin',
        __mockEmpresaId: 6,
        BUCKET: {} as R2Bucket,
      } as unknown as Env,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject(DISABLED_BODY);
  });

  // ─── Cache-Control headers are still applied ───────────────────────────────

  it('aplica cache-control: no-store em todos os endpoints bloqueados', async () => {
    const app = createBackupApp();

    for (const [method, path] of [
      ['GET', '/backup'],
      ['GET', '/backup/test-uuid-123'],
      ['POST', '/backup/manual'],
      ['POST', '/backup/test-uuid-123/restore'],
      ['DELETE', '/backup/test-uuid-123'],
      ['GET', '/backup/test-uuid-123/download'],
    ] as const) {
      const body = method === 'POST' ? JSON.stringify({ tipo: 'COMPLETO' }) : undefined;
      const response = await app.request(
        path,
        {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body,
        },
        { __authMode: 'ok', __mockRole: 'admin', __mockEmpresaId: 6 } as unknown as Env,
      );
      expect(response.headers.get('cache-control')).toContain('no-store');
    }
  });
});
