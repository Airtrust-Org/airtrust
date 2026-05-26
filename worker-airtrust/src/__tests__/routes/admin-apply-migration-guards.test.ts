import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

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

    c.set('userId', 1);
    c.set('userRole', 'admin');
    c.set('empresaId', 1);
    await next();
  },
}));

import adminApplyMigrationRoutes from '../../routes/admin-apply-migration';

function createMockDb(execImpl?: (sql: string) => Promise<unknown>) {
  const execSpy = vi.fn(execImpl || (async () => ({ success: true })));
  const db = {
    exec: execSpy,
  } as unknown as D1Database;

  return { db, execSpy };
}

describe('admin apply migration guard contract', () => {
  it('retorna 401 quando não autenticado', async () => {
    const response = await adminApplyMigrationRoutes.fetch(
      new Request('http://localhost/apply-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ migration_sql: 'SELECT 1' }),
      }),
      { DB: createMockDb().db, __authMode: 'missing' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'AUTH_REQUIRED',
    });
  });

  it('retorna 400 quando migration_sql não é enviado', async () => {
    const response = await adminApplyMigrationRoutes.fetch(
      new Request('http://localhost/apply-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { DB: createMockDb().db, __authMode: 'ok' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'migration_sql é obrigatório',
    });
  });

  it('executa migration_sql quando autenticado e payload válido', async () => {
    const { db, execSpy } = createMockDb(async () => ({ ok: true, changes: 1 }));

    const response = await adminApplyMigrationRoutes.fetch(
      new Request('http://localhost/apply-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ migration_sql: 'SELECT 1' }),
      }),
      { DB: db, __authMode: 'ok' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      result: { ok: true, changes: 1 },
    });
    expect(execSpy).toHaveBeenCalledWith('SELECT 1');
  });

  it('retorna 500 com success=false quando db.exec falha', async () => {
    const { db } = createMockDb(async () => {
      throw new Error('boom');
    });

    const response = await adminApplyMigrationRoutes.fetch(
      new Request('http://localhost/apply-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ migration_sql: 'SELECT 1' }),
      }),
      { DB: db, __authMode: 'ok' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Error: boom'),
    });
  });
});
