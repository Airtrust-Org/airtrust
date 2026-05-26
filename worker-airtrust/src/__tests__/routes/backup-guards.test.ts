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
    c.set('empresaId', 1);
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

describe('backup routes guards', () => {
  it('retorna 401 quando não autenticado', async () => {
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

  it('retorna 403 para role sem permissão (fail-closed)', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPLETO' }),
      },
      { __authMode: 'ok', __mockRole: 'user' } as unknown as Env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'RBAC_FORBIDDEN',
    });
  });

  it('retorna 503 com BUCKET_NOT_BOUND para manager autorizado sem bucket', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'COMPLETO' }),
      },
      { __authMode: 'ok', __mockRole: 'manager' } as unknown as Env,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'BUCKET_NOT_BOUND',
    });
  });

  it('retorna 400 em payload inválido quando bucket existe', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'INVALIDO' }),
      },
      {
        __authMode: 'ok',
        __mockRole: 'admin',
        BUCKET: {} as R2Bucket,
      } as unknown as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
    });
  });

  it('retorna 400 em módulo inválido antes de orquestrar backup', async () => {
    const app = createBackupApp();

    const response = await app.request(
      '/backup/manual',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'MODULAR',
          modulos: ['MODULO_INEXISTENTE'],
        }),
      },
      {
        __authMode: 'ok',
        __mockRole: 'admin',
        BUCKET: {} as R2Bucket,
      } as unknown as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'INVALID_MODULES',
    });
  });
});
