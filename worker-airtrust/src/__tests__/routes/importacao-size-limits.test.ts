import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';
import { IMPORT_FILE_LIMITS } from '../../utils/parseImportFile';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('empresaId', 1);
    c.set('userRole', 'admin');
    c.set('tenantContext', { empresaId: 1, role: 'admin', userId: 1 });
    await next();
  },
}));

import importacaoRoutes from '../../routes/importacao';

describe('P00-03/P2 Codex review: importacao routes status code and size limit preservation', () => {
  it('retorna HTTP 413 com mensagem clara quando arquivo na rota validar excede o tamanho máximo', async () => {
    const app = new Hono<any>();
    app.onError(errorHandler);
    app.route('/api/importacao', importacaoRoutes);

    const oversizedFile = new File(
      [new Uint8Array(IMPORT_FILE_LIMITS.maxCompressedBytes + 1024)],
      'oversized.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    );

    const formData = new FormData();
    formData.append('file', oversizedFile);

    const env = {
      DB: { prepare: vi.fn() },
      ENVIRONMENT: 'test',
    } as any;

    const res = await app.request(
      '/api/importacao/validar/funcionarios',
      {
        method: 'POST',
        body: formData,
      },
      env,
    );

    expect(res.status).toBe(413);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/excede o tamanho máximo/i);
  });

  it('retorna HTTP 413 com mensagem clara quando arquivo na rota executar excede o tamanho máximo', async () => {
    const app = new Hono<any>();
    app.onError(errorHandler);
    app.route('/api/importacao', importacaoRoutes);

    const oversizedFile = new File(
      [new Uint8Array(IMPORT_FILE_LIMITS.maxCompressedBytes + 1024)],
      'oversized.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    );

    const formData = new FormData();
    formData.append('file', oversizedFile);
    formData.append('mode', 'UPSERT');

    const env = {
      DB: { prepare: vi.fn() },
      ENVIRONMENT: 'test',
    } as any;

    const res = await app.request(
      '/api/importacao/executar/funcionarios',
      {
        method: 'POST',
        body: formData,
      },
      env,
    );

    expect(res.status).toBe(413);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/excede o tamanho máximo/i);
  });
});
