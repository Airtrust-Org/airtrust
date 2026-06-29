import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({ empresaId: 6, userId: 101, role: 'admin' }),
}));

vi.mock('../../routes/simuladores-shared', () => ({
  audit: vi.fn(async () => undefined),
}));

import simuladoresFichasExtrasRoutes from '../../routes/simuladores-fichas-extras';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/simuladores', simuladoresFichasExtrasRoutes);
  return app;
}

describe('simuladores fichas extras limit guard', () => {
  it('aplica teto de 200 no histórico de notas', async () => {
    const bindSpy = vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ id: 15 }),
      all: vi.fn().mockResolvedValue({ results: [] }),
    });

    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: bindSpy,
        }),
      },
    } as unknown as Env;

    const app = createApp();
    const response = await app.request(
      '/simuladores/historico-notas/15?limit=9999',
      {},
      env,
    );

    expect(response.status).toBe(200);
    // First bind: funcionario tenant check (funcionarioId=15, empresaId=6)
    expect(bindSpy).toHaveBeenCalledWith(15, 6);
    // Second bind: historico query (funcionarioId=15, empresaId=6, limit=200)
    expect(bindSpy).toHaveBeenCalledWith(15, 6, 200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [],
    });
  });

  it('mantem default seguro quando limit e invalido', async () => {
    const bindSpy = vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue({ id: 27 }),
      all: vi.fn().mockResolvedValue({ results: [] }),
    });

    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: bindSpy,
        }),
      },
    } as unknown as Env;

    const app = createApp();
    const response = await app.request(
      '/simuladores/historico-notas/27?limit=abc',
      {},
      env,
    );

    expect(response.status).toBe(200);
    // First bind: funcionario tenant check (funcionarioId=27, empresaId=6)
    expect(bindSpy).toHaveBeenCalledWith(27, 6);
    // Second bind: historico query (funcionarioId=27, empresaId=6, limit=100)
    expect(bindSpy).toHaveBeenCalledWith(27, 6, 100);
  });
});
