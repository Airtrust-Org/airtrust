import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { authRoutes } from '../../routes/auth';
import { errorHandler } from '../../middleware/error-handler';
import { generateJWT } from '../../utils/security';
import type { Env } from '../../types';

const JWT_SECRET = 'test-secret-256-bit-key-for-testing-only-not-production';

function createDb(options: { blocklistInsertThrows?: boolean; refreshUpdateThrows?: boolean } = {}) {
  const blocklistedJtis: string[] = [];
  const revokedTokens: string[] = [];

  const db = {
    prepare: (sql: string) => {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async run() {
          if (sql.includes('INSERT OR IGNORE INTO token_blocklist')) {
            if (options.blocklistInsertThrows) {
              throw new Error('simulated D1 write failure on token_blocklist');
            }
            blocklistedJtis.push(String(statement.params[0]));
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE refresh_tokens') && sql.includes('WHERE user_id')) {
            if (options.refreshUpdateThrows) {
              throw new Error('simulated D1 write failure revoking refresh tokens by user_id');
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE refresh_tokens') && sql.includes('WHERE token')) {
            revokedTokens.push(String(statement.params[statement.params.length - 1]));
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('DELETE FROM refresh_tokens')) {
            return { success: true, meta: { changes: 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        async first<T>() {
          if (sql.includes('SELECT access_token_jti FROM refresh_tokens')) {
            return null as T; // schema-drift-tolerant secondary path: column absent in some envs
          }
          return null as T;
        },
        async all<T>() {
          return { results: [] } as T;
        },
      };
      return statement;
    },
    __blocklistedJtis: blocklistedJtis,
    __revokedTokens: revokedTokens,
  };

  return db as unknown as D1Database & { __blocklistedJtis: string[]; __revokedTokens: string[] };
}

async function makeToken(sub: number, empresaId: number) {
  return generateJWT({ sub, email: `user${sub}@test.invalid`, role: 'USUARIO', empresa_id: empresaId }, JWT_SECRET, 3600);
}

function buildApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/auth', authRoutes);
  return (init: RequestInit) =>
    app.request('/api/auth/logout', init, { DB: db, JWT_SECRET, ENVIRONMENT: 'production' } as unknown as Env);
}

describe('POST /api/auth/logout — fail-closed revocation', () => {
  it('returns 200 and blocklists the current access token jti on success', async () => {
    const db = createDb();
    const { token, jti } = await makeToken(7, 999002);

    const response = await buildApp(db)({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ refreshToken: 'some-refresh-token' }),
    });
    const payload = (await response.json()) as { success?: boolean };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(db.__blocklistedJtis).toContain(jti);
    expect(db.__revokedTokens).toContain('some-refresh-token');
  });

  it('does NOT return 200 when writing the access token jti to the blocklist fails', async () => {
    const db = createDb({ blocklistInsertThrows: true });
    const { token } = await makeToken(7, 999002);

    const response = await buildApp(db)({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ refreshToken: 'some-refresh-token' }),
    });

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(500);
  });

  it('does NOT return 200 when revoking all refresh tokens (access-token-only logout) fails', async () => {
    const db = createDb({ refreshUpdateThrows: true });
    const { token } = await makeToken(7, 999002);

    const response = await buildApp(db)({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}), // no refreshToken -> hits the "revoke all for user" branch
    });

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(500);
  });

  it('never logs the raw access or refresh token', async () => {
    const db = createDb();
    const { token } = await makeToken(7, 999002);
    const logs: string[] = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    console.warn = (...args: unknown[]) => logs.push(args.map(String).join(' '));

    try {
      await buildApp(db)({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ refreshToken: 'super-secret-refresh-token-value' }),
      });
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
    }

    const joined = logs.join('\n');
    expect(joined).not.toContain(token);
    expect(joined).not.toContain('super-secret-refresh-token-value');
  });
});
