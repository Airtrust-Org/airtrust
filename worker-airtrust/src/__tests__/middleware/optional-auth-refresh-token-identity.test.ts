/**
 * TEN-AUTH-009 (Tenant Readiness Matrix V3) — optionalAuth() nunca materializa
 * identidade a partir de um refresh token usado como Bearer.
 *
 * Refresh tokens são strings hex opacas de 64 caracteres (generateRefreshToken,
 * src/utils/security.ts), não JWTs — verifyJWT() falha ao processá-los (sem os
 * três segmentos separados por '.'), então optionalAuth() nunca seta
 * userId/empresaId/userRole para essa requisição, mas também nunca bloqueia a
 * rota (é "optional"). Prova real, não apenas inspeção de código.
 */
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { optionalAuth } from '../../middleware/auth';
import { generateRefreshToken } from '../../utils/security';
import type { Env, Variables } from '../../types';

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use('*', optionalAuth());
  app.get('/public', (c) =>
    c.json({
      userId: c.get('userId') ?? null,
      empresaId: c.get('empresaId') ?? null,
      userRole: c.get('userRole') ?? null,
    }),
  );
  return app;
}

describe('optionalAuth — refresh token usado como Bearer nunca vira identidade', () => {
  it('refresh token (hex opaco) como Bearer: requisição continua pública, nenhuma identidade materializada', async () => {
    const app = buildApp();
    const refreshToken = generateRefreshToken();

    const response = await app.fetch(
      new Request('http://localhost/public', {
        headers: { Authorization: `Bearer ${refreshToken}` },
      }),
      { JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200); // rota opcional nunca bloqueia
    const body = await response.json();
    expect(body).toEqual({ userId: null, empresaId: null, userRole: null });
  });

  it('sem Authorization: mesma resposta anônima (contraste de comportamento normal)', async () => {
    const app = buildApp();

    const response = await app.fetch(
      new Request('http://localhost/public'),
      { JWT_SECRET: 'test-secret', ENVIRONMENT: 'test' } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ userId: null, empresaId: null, userRole: null });
  });
});
