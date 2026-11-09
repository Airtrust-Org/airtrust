/**
 * P01-07: access token sem `jti` nao pode contornar a blocklist de revogacao.
 * Todo token emitido por generateJWT() carrega jti; um token assinado com o mesmo
 * segredo mas sem jti deve ser rejeitado por auth() e tratado como anonimo por
 * optionalAuth().
 */
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  auth,
  optionalAuth,
  resetBlocklistCache,
  resetPlatformAccessCache,
  resetUserSecurityCache,
} from '../../middleware/auth';
import { errorHandler } from '../../middleware/error-handler';
import { generateJWT } from '../../utils/security';
import { resetSchemaCache } from '../../utils/db-schema';
import type { Env, Variables } from '../../types';

const JWT_SECRET = 'test-secret-256-bit-key-for-testing-only-not-production';

function createDb(): D1Database {
  return {
    prepare: (sql: string) => {
      const statement = {
        bind: () => statement,
        async first<T>() {
          if (sql.includes("name = 'usuarios_empresas'")) return { found: 1 } as T;
          if (sql.includes('FROM token_blocklist')) return null as T;
          if (sql.includes('LEFT JOIN usuarios_empresas ue')) {
            return { id: 7, perfil: 'ALUNO', role: 'viewer' } as T;
          }
          if (sql.includes('FROM usuarios WHERE id')) {
            return { id: 7, perfil: 'ALUNO', role: null } as T;
          }
          return null as T;
        },
        async run() {
          return { success: true, meta: { changes: 0 } };
        },
        async all<T>() {
          return { results: [] } as T;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

async function tokenWithoutJti(): Promise<string> {
  return new SignJWT({ email: 'user7@test.invalid', role: 'ALUNO', empresa_id: 999002, sub: '7' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

function request(guard: 'auth' | 'optionalAuth', token: string) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.get('/probe', guard === 'auth' ? auth() : optionalAuth(), (c) =>
    c.json({ userId: c.get('userId') ?? null }),
  );
  return app.request(
    '/probe',
    { headers: { Authorization: `Bearer ${token}` } },
    { DB: createDb(), JWT_SECRET, ENVIRONMENT: 'production' } as unknown as Env,
  );
}

beforeEach(() => {
  resetSchemaCache();
  resetBlocklistCache();
  resetUserSecurityCache();
  resetPlatformAccessCache();
});

describe('P01-07 - jti obrigatorio em access tokens', () => {
  it('auth() rejeita token valido sem jti com 401 TOKEN_JTI_REQUIRED', async () => {
    const response = await request('auth', await tokenWithoutJti());
    const body = (await response.json()) as { code?: string };
    expect(response.status).toBe(401);
    expect(body.code).toBe('TOKEN_JTI_REQUIRED');
  });

  it('optionalAuth() trata token sem jti como anonimo', async () => {
    const response = await request('optionalAuth', await tokenWithoutJti());
    const body = (await response.json()) as { userId: unknown };
    expect(response.status).toBe(200);
    expect(body.userId).toBeNull();
  });

  it('token emitido por generateJWT (com jti) continua autenticando', async () => {
    const { token } = await generateJWT(
      { sub: 7, email: 'user7@test.invalid', role: 'ALUNO', empresa_id: 999002 },
      JWT_SECRET,
      1800,
    );
    const response = await request('auth', token);
    expect(response.status).toBe(200);
  });
});
