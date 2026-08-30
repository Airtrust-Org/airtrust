import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { safeServerErrorResponseBoundary } from '../../middleware/safe-server-error-response';
import type { Env } from '../../types';

type JsonPayload = Record<string, unknown>;

function buildApp(environment: string) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', safeServerErrorResponseBoundary());

  app.get('/manual-500', (c) => {
    c.header('X-Request-ID', 'req-manual-500');
    return c.json(
      {
        success: false,
        error: 'D1_ERROR: no such table: usuarios_empresas',
        code: 'QUALIFICATION_QUERY_FAILED',
        details: { sql: 'SELECT * FROM usuarios_empresas', stack: 'worker.ts:418:11' },
      },
      500,
    );
  });

  app.get('/manual-503', (c) =>
    c.json(
      {
        success: false,
        error: 'upstream auth database unavailable',
        code: 'AUTH_SECURITY_INFRA_ERROR',
        requestId: 'req-payload-503',
      },
      503,
    ),
  );

  app.get('/business-409', (c) =>
    c.json(
      {
        success: false,
        error: 'Categoria possui qualificações vinculadas',
        code: 'CATEGORY_IN_USE',
        details: { linked: 3 },
      },
      409,
    ),
  );

  app.get('/development-500', (c) =>
    c.json(
      {
        success: false,
        error: 'SQLITE_ERROR: debug detail',
        stack: 'debug-stack',
      },
      500,
    ),
  );

  return (path: string) =>
    app.request(path, undefined, {
      ENVIRONMENT: environment,
    } as unknown as Env);
}

async function json(response: Response): Promise<JsonPayload> {
  return (await response.json()) as JsonPayload;
}

describe('safeServerErrorResponseBoundary', () => {
  it.each(['production', 'staging'])(
    'replaces manually-built 500 payloads in %s and preserves diagnostics only',
    async (environment) => {
      const response = await buildApp(environment)('/manual-500');
      const payload = await json(response);

      expect(response.status).toBe(500);
      expect(payload).toEqual({
        success: false,
        error: 'Erro interno do servidor',
        code: 'QUALIFICATION_QUERY_FAILED',
        requestId: 'req-manual-500',
      });
      expect(JSON.stringify(payload)).not.toMatch(/D1_ERROR|usuarios_empresas|SELECT|worker\.ts/i);
    },
  );

  it('uses the safe 503 message and preserves payload requestId/code', async () => {
    const response = await buildApp('staging')('/manual-503');
    const payload = await json(response);

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      success: false,
      error: 'Serviço temporariamente indisponível.',
      code: 'AUTH_SECURITY_INFRA_ERROR',
      requestId: 'req-payload-503',
    });
    expect(JSON.stringify(payload)).not.toMatch(/upstream|database unavailable/i);
  });

  it('leaves 4xx business responses unchanged', async () => {
    const response = await buildApp('production')('/business-409');
    const payload = await json(response);

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      success: false,
      error: 'Categoria possui qualificações vinculadas',
      code: 'CATEGORY_IN_USE',
      details: { linked: 3 },
    });
  });

  it('leaves local-development 5xx details available for debugging', async () => {
    const response = await buildApp('development')('/development-500');
    const payload = await json(response);

    expect(response.status).toBe(500);
    expect(payload.error).toBe('SQLITE_ERROR: debug detail');
    expect(payload.stack).toBe('debug-stack');
  });
});
