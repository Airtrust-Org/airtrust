/**
 * Regressao 2026-08-10: o preflight OPTIONS de /api/lms/cursos/:id/content-upload/init
 * era bloqueado pelo navegador porque o catch-all de OPTIONS em index.ts (que
 * intercepta a requisicao ANTES do middleware cors()) nao incluia
 * "Idempotency-Key" em Access-Control-Allow-Headers, mesmo com o response
 * status 204 "correto". O middleware cors() (src/middleware/cors.ts) tinha a
 * lista certa, mas nunca chega a rodar para OPTIONS porque o catch-all ja
 * responde antes. Isso bloqueava o upload de pacote SCORM em produzido mesmo
 * apos o PUT de metadados ser corrigido.
 */
import { describe, expect, it } from 'vitest';
import { app } from '../../index';
import type { Env } from '../../types';

function minimalEnv(): Env {
  return {} as unknown as Env;
}

describe('CORS preflight — catch-all de OPTIONS em index.ts', () => {
  it('libera o header Idempotency-Key usado pelo upload estruturado de LMS', async () => {
    const res = await app.request(
      '/api/lms/cursos/43/content-upload/init',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://airtrust.online',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type, idempotency-key',
        },
      },
      minimalEnv(),
    );

    expect(res.status).toBe(204);
    const allowHeaders = (res.headers.get('Access-Control-Allow-Headers') || '').toLowerCase();
    expect(allowHeaders).toContain('idempotency-key');
  });
});
