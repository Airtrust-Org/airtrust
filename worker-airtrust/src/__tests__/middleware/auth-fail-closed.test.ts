import { Hono } from 'hono';
import type { Context } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  auth,
  optionalAuth,
  isTransientD1Error,
  withD1Retry,
  resetBlocklistCache,
  invalidateJtiCache,
  getValidJtiCacheSize,
  resetUserSecurityCache,
  resetPlatformAccessCache,
} from '../../middleware/auth';
import { errorHandler } from '../../middleware/error-handler';
import { generateJWT } from '../../utils/security';
import type { Env, Variables } from '../../types';
import { resetSchemaCache } from '../../utils/db-schema';

const JWT_SECRET = 'test-secret-256-bit-key-for-testing-only-not-production';

type UsuarioRow = {
  id: number;
  perfil: string;
  active: number;
  role?: string | null;
};

type CallCounts = {
  blocklist: number;
  userSecurity: number;
  platformAccess: number;
};

function createDb(options: {
  usuarios?: UsuarioRow[];
  memberships?: Array<{ usuarioId: number; empresaId: number; role: string }>;
  blocklisted?: string[] | Set<string>;
  expiredBlocklisted?: string[];
  blocklistReadThrows?: boolean;
  transientBlocklistFailures?: number;
  transientUserSecurityFailures?: number;
  blocklistPermanentSqlError?: string;
  userSecurityPermanentSqlError?: string;
  callCounts?: CallCounts;
  asyncDelayMs?: number;
} = {}) {
  let transientFailuresRemaining = options.transientBlocklistFailures ?? 0;
  let transientUserSecurityRemaining = options.transientUserSecurityFailures ?? 0;
  const usuarios = options.usuarios || [];
  const memberships = options.memberships || [];
  const blocklisted = options.blocklisted instanceof Set ? options.blocklisted : new Set(options.blocklisted || []);
  const expiredBlocklisted = new Set(options.expiredBlocklisted || []);
  const callCounts = options.callCounts || { blocklist: 0, userSecurity: 0, platformAccess: 0 };

  return {
    prepare: (sql: string) => {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (options.asyncDelayMs) {
            await new Promise((r) => setTimeout(r, options.asyncDelayMs));
          }
          if (sql.includes("name = 'usuarios_empresas'")) return { found: 1 } as T;
          if (sql.includes('PRAGMA table_info')) return null as T;

          if (sql.includes('FROM token_blocklist')) {
            callCounts.blocklist++;
            if (options.blocklistPermanentSqlError) {
              throw new Error(options.blocklistPermanentSqlError);
            }
            if (transientFailuresRemaining > 0) {
              transientFailuresRemaining--;
              throw new Error('transient D1 network connection error');
            }
            if (options.blocklistReadThrows) {
              throw new Error('database is locked');
            }
            const jti = String(statement.params[0]);
            if (blocklisted.has(jti)) return { 1: 1 } as T;
            if (expiredBlocklisted.has(jti)) return null as T; // expires_at > now() filters it out
            return null as T;
          }

          if (sql.includes('LEFT JOIN usuarios_empresas ue')) {
            callCounts.userSecurity++;
            if (options.userSecurityPermanentSqlError) {
              throw new Error(options.userSecurityPermanentSqlError);
            }
            if (transientUserSecurityRemaining > 0) {
              transientUserSecurityRemaining--;
              throw new Error('transient D1 network connection error');
            }
            const empresaId = Number(statement.params[0]);
            const userId = Number(statement.params[1]);
            const usuario = usuarios.find((u) => u.id === userId);
            if (!usuario || !usuario.active) return null as T;
            const link = memberships.find((m) => m.usuarioId === userId && m.empresaId === empresaId);
            return { id: usuario.id, perfil: usuario.perfil, role: link?.role ?? null } as T;
          }

          if (sql.includes('FROM usuarios WHERE id')) {
            callCounts.userSecurity++;
            if (options.userSecurityPermanentSqlError) {
              throw new Error(options.userSecurityPermanentSqlError);
            }
            const userId = Number(statement.params[0]);
            const usuario = usuarios.find((u) => u.id === userId);
            if (!usuario || !usuario.active) return null as T;
            return { id: usuario.id, perfil: usuario.perfil, role: null } as T;
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

async function makeToken(sub: number, empresaId: number, role = 'USUARIO') {
  return generateJWT({ sub, email: `user${sub}@test.invalid`, role, empresa_id: empresaId }, JWT_SECRET, 3600);
}

function buildApp(db: D1Database, guard: 'auth' | 'optionalAuth') {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  const middleware = guard === 'auth' ? auth() : optionalAuth();
  app.get('/probe', middleware, (c) =>
    c.json({
      success: true,
      userId: c.get('userId') ?? null,
      userRole: c.get('userRole') ?? null,
    }),
  );
  return (init: RequestInit = {}) =>
    app.request(
      '/probe',
      init,
      { DB: db, JWT_SECRET, ENVIRONMENT: 'production' } as unknown as Env,
    );
}

beforeEach(() => {
  resetSchemaCache();
  resetBlocklistCache();
  resetUserSecurityCache();
  resetPlatformAccessCache();
});

describe('auth() — blocklist fail-closed', () => {
  it('rejects a token whose jti is in the blocklist with 401 TOKEN_REVOKED', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token, jti } = await makeToken(7, 999002);

    const response = await buildApp(createDb({ usuarios, memberships, blocklisted: [jti] }), 'auth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(401);
    expect(payload.code).toBe('TOKEN_REVOKED');
  });

  it('allows a token whose jti is only in the (expired) blocklist window', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token, jti } = await makeToken(7, 999002);

    const response = await buildApp(
      createDb({ usuarios, memberships, expiredBlocklisted: [jti] }),
      'auth',
    )({ headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
  });

  it('coalesces concurrent requests during burst to avoid duplicate D1 blocklist queries', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002);
    const callCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };

    const app = buildApp(createDb({ usuarios, memberships, callCounts, asyncDelayMs: 15 }), 'auth');

    // Requisições concorrentes no mesmo isolate (rajada de chamadas): coalescência in-flight evita consultas redundantes
    const [res1, res2] = await Promise.all([
      app({ headers: { Authorization: `Bearer ${token}` } }),
      app({ headers: { Authorization: `Bearer ${token}` } }),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(callCounts.blocklist).toBe(1);

    // Próxima requisição sequencial revalida contra D1 (revalidação mutável crítica para evitar revogação obsoleta entre isolates #2014)
    const res3 = await app({ headers: { Authorization: `Bearer ${token}` } });
    expect(res3.status).toBe(200);
    expect(callCounts.blocklist).toBe(2);
  });

  it('immediately invalidates cached token when invalidateJtiCache is called (e.g. on logout/password change)', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token, jti } = await makeToken(7, 999002);
    const blocklisted = new Set<string>();
    const callCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };

    const app = buildApp(createDb({ usuarios, memberships, blocklisted, callCounts }), 'auth');

    // 1. Primeira chamada: valida e popula cache
    const res1 = await app({ headers: { Authorization: `Bearer ${token}` } });
    expect(res1.status).toBe(200);
    expect(callCounts.blocklist).toBe(1);

    // 2. Token é revogado (simula logout ou troca de senha)
    blocklisted.add(jti);
    invalidateJtiCache(jti);

    // 3. Próxima requisição deve consultar o D1 imediatamente e rejeitar com 401 TOKEN_REVOKED
    const res2 = await app({ headers: { Authorization: `Bearer ${token}` } });
    expect(res2.status).toBe(401);
    expect(callCounts.blocklist).toBe(2);
    const body = (await res2.json()) as { code?: string };
    expect(body.code).toBe('TOKEN_REVOKED');
  });

  it('bounds cache size and prunes entries when capacity is reached', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const callCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };
    const app = buildApp(createDb({ usuarios, memberships, callCounts }), 'auth');

    // Gera 1050 tokens distintos para exceder o limite de 1000
    for (let i = 0; i < 1050; i++) {
      const { token } = await makeToken(7, 999002);
      await app({ headers: { Authorization: `Bearer ${token}` } });
    }

    // O tamanho do cache não deve exceder 1000
    expect(getValidJtiCacheSize()).toBeLessThanOrEqual(1000);
  });

  it('fails closed (503) when the blocklist read itself errors, instead of treating it as not-blocked', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002);

    const response = await buildApp(
      createDb({ usuarios, memberships, blocklistReadThrows: true }),
      'auth',
    )({ headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(503);
    expect(payload.code).toBe('AUTH_REVOCATION_CHECK_UNAVAILABLE');
  });

  it('fails closed immediately (503) without retrying when a permanent SQL/schema error occurs on blocklist', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002);
    const callCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };

    const response = await buildApp(
      createDb({
        usuarios,
        memberships,
        blocklistPermanentSqlError: 'SQLITE_ERROR: no such table: token_blocklist',
        callCounts,
      }),
      'auth',
    )({ headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(503);
    expect(payload.code).toBe('AUTH_REVOCATION_CHECK_UNAVAILABLE');
    // Permanent error must NOT trigger retries: exactly 1 attempt
    expect(callCounts.blocklist).toBe(1);
  });

  it('recovers from transient D1 read failure on blocklist and authenticates successfully', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002);
    const callCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };

    const response = await buildApp(
      createDb({ usuarios, memberships, transientBlocklistFailures: 1, callCounts }),
      'auth',
    )({ headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    expect(callCounts.blocklist).toBe(2);
  });
});

describe('auth() — usuário inativo e membership', () => {
  it('rejects a valid JWT for a deactivated user with 401 USER_INACTIVE', async () => {
    const usuarios: UsuarioRow[] = [{ id: 5, perfil: 'ADMIN', active: 0 }];
    const { token } = await makeToken(5, 999002);

    const response = await buildApp(createDb({ usuarios }), 'auth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(401);
    expect(payload.code).toBe('USER_INACTIVE');
  });

  it('fails closed immediately (503) without retry when permanent SQL error occurs resolving user security state', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002);
    const callCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };

    const response = await buildApp(
      createDb({
        usuarios,
        memberships,
        userSecurityPermanentSqlError: 'SQLITE_ERROR: no such column: deleted_at',
        callCounts,
      }),
      'auth',
    )({ headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(503);
    expect(payload.code).toBe('AUTH_USER_STATE_CHECK_UNAVAILABLE');
    // Permanent SQL error must NOT be retried: exactly 1 attempt
    expect(callCounts.userSecurity).toBe(1);
  });

  it('rejects a valid JWT whose tenant membership no longer exists, without falling back to the JWT role', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const { token } = await makeToken(7, 999002, 'ADMIN'); // JWT claims a stale/forged role

    const response = await buildApp(createDb({ usuarios, memberships: [] }), 'auth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(401);
    expect(payload.code).toBe('TENANT_MEMBERSHIP_INVALID');
  });

  it('allows the canonical viewer smoke account to authenticate normally', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002, 'USUARIO');

    const response = await buildApp(createDb({ usuarios, memberships }), 'auth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { userId?: number | string; userRole?: string };

    expect(response.status).toBe(200);
    expect(Number(payload.userId)).toBe(7);
    expect(payload.userRole).toBe('USUARIO');
  });

  it('coalesces concurrent requests during burst to avoid duplicate D1 user security queries', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 7, empresaId: 999002, role: 'viewer' }];
    const { token } = await makeToken(7, 999002, 'USUARIO');
    const callCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };

    const app = buildApp(createDb({ usuarios, memberships, callCounts, asyncDelayMs: 15 }), 'auth');

    // Requisições concorrentes no mesmo isolate (rajada de chamadas): coalescência in-flight evita consultas redundantes
    const [res1, res2] = await Promise.all([
      app({ headers: { Authorization: `Bearer ${token}` } }),
      app({ headers: { Authorization: `Bearer ${token}` } }),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(callCounts.userSecurity).toBe(1);

    // Próxima requisição sequencial revalida contra D1 (revalidação mutável crítica para evitar revogação obsoleta entre isolates #2014)
    const res3 = await app({ headers: { Authorization: `Bearer ${token}` } });
    expect(res3.status).toBe(200);
    expect(callCounts.userSecurity).toBe(2);
  });
});

describe('optionalAuth() — revoked token never authenticates silently', () => {
  it('proceeds without identity (never blocks) when the token jti is blocklisted', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const { token, jti } = await makeToken(7, 999002);

    const response = await buildApp(createDb({ usuarios, blocklisted: [jti] }), 'optionalAuth')({
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json()) as { userId?: number | null };

    expect(response.status).toBe(200);
    expect(payload.userId).toBeNull();
  });

  it('proceeds without identity (never blocks) when the blocklist read errors, instead of authenticating silently', async () => {
    const usuarios: UsuarioRow[] = [{ id: 7, perfil: 'ALUNO', active: 1 }];
    const { token } = await makeToken(7, 999002);

    const response = await buildApp(
      createDb({ usuarios, blocklistReadThrows: true }),
      'optionalAuth',
    )({ headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json()) as { userId?: number | null };

    expect(response.status).toBe(200);
    expect(payload.userId).toBeNull();
  });

  it('proceeds without identity when no Authorization header is sent (existing optional behavior preserved)', async () => {
    const response = await buildApp(createDb(), 'optionalAuth')({});
    const payload = (await response.json()) as { userId?: number | null };

    expect(response.status).toBe(200);
    expect(payload.userId).toBeNull();
  });
});

describe('isTransientD1Error', () => {
  it('classifies recognized transient errors as true', () => {
    expect(isTransientD1Error(new Error('D1_ERROR: SQLITE_BUSY: database is locked'))).toBe(true);
    expect(isTransientD1Error(new Error('database is locked'))).toBe(true);
    expect(isTransientD1Error(new Error('The operation timed out'))).toBe(true);
    expect(isTransientD1Error(new Error('deadline exceeded'))).toBe(true);
    expect(isTransientD1Error(new Error('service temporarily unavailable'))).toBe(true);
    expect(isTransientD1Error(new Error('Service Unavailable'))).toBe(true);
    expect(isTransientD1Error(new Error('D1_EXEC_ERROR: Error in D1: 503 Service Unavailable'))).toBe(true);
    expect(isTransientD1Error(new Error('D1_EXEC_ERROR: Network connection lost'))).toBe(true);
    expect(isTransientD1Error(new Error('D1_EXEC_ERROR: upstream request failed: 502 Bad Gateway'))).toBe(true);
    expect(isTransientD1Error(new Error('rate limit reached'))).toBe(true);
    expect(isTransientD1Error(new Error('too many requests'))).toBe(true);
    expect(isTransientD1Error(new Error('fetch failed'))).toBe(true);
    expect(isTransientD1Error(new Error('failed to fetch'))).toBe(true);
    expect(isTransientD1Error(new Error('connection reset by peer'))).toBe(true);
    expect(isTransientD1Error(new Error('connection closed'))).toBe(true);
    expect(isTransientD1Error(new Error('connection lost'))).toBe(true);
    expect(isTransientD1Error(new Error('connection aborted'))).toBe(true);
    expect(isTransientD1Error(new Error('socket hang up'))).toBe(true);
    expect(isTransientD1Error(new Error('network connection error'))).toBe(true);
    expect(isTransientD1Error(new Error('ECONNRESET'))).toBe(true);
    expect(isTransientD1Error(new Error('ETIMEDOUT'))).toBe(true);
    expect(isTransientD1Error(new Error('ECONNABORTED'))).toBe(true);
    expect(isTransientD1Error(new Error('ECONNREFUSED'))).toBe(true);
    expect(isTransientD1Error(new Error('internal error in D1 RPC'))).toBe(true);
    expect(isTransientD1Error(new Error('internal server error'))).toBe(true);
    expect(isTransientD1Error(new Error('storage error'))).toBe(true);
    expect(isTransientD1Error(new Error('could not execute query'))).toBe(true);
    expect(isTransientD1Error(new Error('failed to execute statement'))).toBe(true);
    expect(isTransientD1Error(new Error('subrequest limit exceeded'))).toBe(false);
    expect(isTransientD1Error(new Error('resource limit reached'))).toBe(false);
    // Generic D1_EXEC_ERROR and other retryable wording must never override
    // a hard Cloudflare invocation ceiling.
    expect(isTransientD1Error(new Error('D1_EXEC_ERROR: subrequest limit exceeded'))).toBe(false);
    expect(isTransientD1Error(new Error('D1_EXEC_ERROR: resource limit reached'))).toBe(false);
    expect(isTransientD1Error(new Error('maximum number of subrequests exceeded'))).toBe(false);
    expect(isTransientD1Error(new Error('CPU time limit exceeded'))).toBe(false);
    expect(isTransientD1Error(new Error('sqlite_ioerr: disk I/O error'))).toBe(true);
    expect(isTransientD1Error(new Error('sqlite_cantopen: unable to open database file'))).toBe(true);
    expect(isTransientD1Error({ name: 'D1Error', code: 'ETIMEDOUT', message: 'failed' })).toBe(true);
    expect(isTransientD1Error(new Error('wrapped error', { cause: new Error('connection lost') }))).toBe(true);
  });

  it('classifies permanent SQL and schema errors as false (never transient)', () => {
    expect(isTransientD1Error(new Error('SQLITE_ERROR: no such table: token_blocklist'))).toBe(false);
    expect(isTransientD1Error(new Error('D1_EXEC_ERROR: no such table: token_blocklist'))).toBe(false);
    expect(isTransientD1Error(new Error('SQLITE_ERROR: no such column: deleted_at'))).toBe(false);
    expect(isTransientD1Error(new Error('SQLITE_ERROR: table usuarios has no column named foo'))).toBe(false);
    expect(isTransientD1Error(new Error('near "FROM": syntax error'))).toBe(false);
    expect(isTransientD1Error(new Error('D1_EXEC_ERROR: near "FROM": syntax error'))).toBe(false);
    expect(isTransientD1Error(new Error('UNIQUE constraint failed: token_blocklist.jti'))).toBe(false);
    expect(isTransientD1Error(new Error('CHECK constraint failed: status_check'))).toBe(false);
    expect(isTransientD1Error(new Error('datatype mismatch'))).toBe(false);
    expect(isTransientD1Error(new Error('sqlite_corrupt: database disk image is malformed'))).toBe(false);
    expect(isTransientD1Error(new Error('User not authorized to access tenant'))).toBe(false);
  });

  it('classifies null, undefined, or unrelated non-transient errors as false', () => {
    expect(isTransientD1Error(null)).toBe(false);
    expect(isTransientD1Error(undefined)).toBe(false);
    expect(isTransientD1Error(new Error('Invalid argument provided'))).toBe(false);
    expect(isTransientD1Error('arbitrary string without transient cues')).toBe(false);
  });
});

describe('withD1Retry', () => {
  it('returns value on first attempt when operation succeeds', async () => {
    let attempts = 0;
    const result = await withD1Retry(async () => {
      attempts++;
      return 'ok';
    }, 4, 5);

    expect(result).toBe('ok');
    expect(attempts).toBe(1);
  });

  it('retries on transient failure and succeeds on subsequent attempt', async () => {
    let attempts = 0;
    const result = await withD1Retry(async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('D1_ERROR: SQLITE_BUSY: database is locked');
      }
      return 'recovered';
    }, 4, 5);

    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('retries on D1_EXEC_ERROR 503 and succeeds on 3rd attempt', async () => {
    let attempts = 0;
    const result = await withD1Retry(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('D1_EXEC_ERROR: Error in D1: 503 Service Unavailable');
      }
      return 'recovered-503';
    }, 4, 5);

    expect(result).toBe('recovered-503');
    expect(attempts).toBe(3);
  });

  it('fails after exhausting maxAttempts on persistent transient failure', async () => {
    let attempts = 0;
    await expect(
      withD1Retry(async () => {
        attempts++;
        throw new Error('network connection error: socket hang up');
      }, 4, 5),
    ).rejects.toThrow('socket hang up');

    expect(attempts).toBe(4);
  });

  it('does not retry a resource ceiling already exhausted in this Worker invocation', async () => {
    for (const failure of [
      'D1_EXEC_ERROR: subrequest limit exceeded',
      'D1_EXEC_ERROR: resource limit reached',
      'CPU time limit exceeded',
    ]) {
      let attempts = 0;
      await expect(
        withD1Retry(async () => {
          attempts++;
          throw new Error(failure);
        }, 7, 5),
      ).rejects.toThrow(failure);
      expect(attempts).toBe(1);
    }
  });

  it('fails immediately on attempt 1 without any retry when encountering permanent SQL error', async () => {
    let attempts = 0;
    await expect(
      withD1Retry(async () => {
        attempts++;
        throw new Error('SQLITE_ERROR: no such table: token_blocklist');
      }, 4, 5),
    ).rejects.toThrow('no such table: token_blocklist');

    // Crucial fail-closed requirement: 0 retries, exactly 1 attempt
    expect(attempts).toBe(1);
  });
});

describe('auth() — nested sub-router reuse (idempotency)', () => {
  it('does not re-execute token verification or D1 queries when userId and platformAccessState already exist on context', async () => {
    const usuarios: UsuarioRow[] = [{ id: 42, perfil: 'ADMIN', active: 1 }];
    const memberships = [{ usuarioId: 42, empresaId: 999002, role: 'admin' }];
    const { token } = await makeToken(42, 999002, 'admin');
    const callCounts: CallCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };
    const db = createDb({ usuarios, memberships, callCounts });

    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.onError(errorHandler);

    // Middleware global auth (simulando index.ts /api/*)
    app.use('/api/*', auth());

    // Sub-router aninhado que também monta auth() (simulando compliance-treinamentos.ts)
    const subRouter = new Hono<{ Bindings: Env; Variables: Variables }>();
    subRouter.use('*', auth());
    subRouter.get('/reconciliacao', (c) =>
      c.json({
        success: true,
        userId: c.get('userId'),
        platformAccess: Boolean(c.get('platformAccessState')),
      }),
    );
    app.route('/api/compliance-treinamentos', subRouter);

    const response = await app.request(
      '/api/compliance-treinamentos/reconciliacao',
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      { DB: db, JWT_SECRET, ENVIRONMENT: 'production' } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success: boolean; userId: string | number; platformAccess: boolean };
    expect(payload.success).toBe(true);
    expect(String(payload.userId)).toBe('42');
    expect(payload.platformAccess).toBe(true);

    // Sem duplicação de queries ao D1: cada query executou exatamente 1 vez, não 2
    expect(callCounts.blocklist).toBe(1);
    expect(callCounts.userSecurity).toBe(1);
  });

  it('does not re-execute token verification or D1 queries on nested sub-router when userId already exists on context', async () => {
    // Usuário comum sem admin
    const usuarios: UsuarioRow[] = [{ id: 84, perfil: 'ALUNO', active: 1 }];
    const memberships = [{ usuarioId: 84, empresaId: 999002, role: 'aluno' }];
    const { token } = await makeToken(84, 999002, 'aluno');
    const callCounts: CallCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };
    const db = createDb({ usuarios, memberships, callCounts });

    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.onError(errorHandler);

    // Middleware global auth (simulando index.ts /api/*)
    app.use('/api/*', auth());

    // Sub-router aninhado que também monta auth() (simulando compliance-treinamentos.ts)
    const subRouter = new Hono<{ Bindings: Env; Variables: Variables }>();
    subRouter.use('*', auth());
    subRouter.get('/reconciliacao', (c) =>
      c.json({
        success: true,
        userId: c.get('userId'),
      }),
    );
    app.route('/api/compliance-treinamentos', subRouter);

    const response = await app.request(
      '/api/compliance-treinamentos/reconciliacao',
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      { DB: db, JWT_SECRET, ENVIRONMENT: 'production' } as unknown as Env,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success: boolean; userId: string | number };
    expect(payload.success).toBe(true);
    expect(String(payload.userId)).toBe('84');

    // Curto-circuito ativado: exatamente 1 execução no global, 0 execuções extras no sub-router
    expect(callCounts.blocklist).toBe(1);
    expect(callCounts.userSecurity).toBe(1);
  });

  it('recovers from transient D1 read failure on user security resolution and authenticates successfully', async () => {
    const usuarios: UsuarioRow[] = [{ id: 99, perfil: 'USUARIO', active: 1 }];
    const memberships = [{ usuarioId: 99, empresaId: 999002, role: 'usuario' }];
    const { token } = await makeToken(99, 999002, 'usuario');
    const callCounts: CallCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };
    const db = createDb({
      usuarios,
      memberships,
      callCounts,
      transientUserSecurityFailures: 1,
    });

    const response = await buildApp(
      db,
      'auth',
    )({ headers: { Authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    // 1ª tentativa falhou transitoriamente, 2ª tentativa via withD1Retry teve sucesso
    expect(callCounts.userSecurity).toBe(2);
  });
});

describe('auth() — revalidação mutável crítica entre múltiplos isolates (Issue #2014)', () => {
  it('adversarial: dois isolates simulados com cache aquecido exigem 401/403 na instância distinta imediatamente após revogação no D1', async () => {
    const usuarios: UsuarioRow[] = [
      { id: 101, perfil: 'USUARIO', active: 1 },
      { id: 102, perfil: 'USUARIO', active: 1 },
      { id: 103, perfil: 'USUARIO', active: 1 },
      { id: 104, perfil: 'ADMIN', active: 1 },
    ];
    const memberships = [
      { usuarioId: 101, empresaId: 999002, role: 'viewer' },
      { usuarioId: 102, empresaId: 999002, role: 'viewer' },
      { usuarioId: 103, empresaId: 999002, role: 'viewer' },
      { usuarioId: 104, empresaId: 999002, role: 'admin' },
    ];
    const blocklisted = new Set<string>();
    const callCounts = { blocklist: 0, userSecurity: 0, platformAccess: 0 };

    const sharedDb = createDb({ usuarios, memberships, blocklisted, callCounts });

    // Instância / Isolate A
    const appA = buildApp(sharedDb, 'auth');
    // Instância / Isolate B (distinta da Instância A no Cloudflare Workers)
    const appB = buildApp(sharedDb, 'auth');

    const t101 = await makeToken(101, 999002, 'USUARIO');
    const t102 = await makeToken(102, 999002, 'USUARIO');
    const t103 = await makeToken(103, 999002, 'USUARIO');
    const t104 = await makeToken(104, 999002, 'ADMIN');

    // 1. Ambas as instâncias recebem requisições com sucesso (ambos os isolates têm caches aquecidos)
    expect((await appA({ headers: { Authorization: `Bearer ${t101.token}` } })).status).toBe(200);
    expect((await appB({ headers: { Authorization: `Bearer ${t101.token}` } })).status).toBe(200);
    expect((await appA({ headers: { Authorization: `Bearer ${t102.token}` } })).status).toBe(200);
    expect((await appB({ headers: { Authorization: `Bearer ${t102.token}` } })).status).toBe(200);
    expect((await appA({ headers: { Authorization: `Bearer ${t103.token}` } })).status).toBe(200);
    expect((await appB({ headers: { Authorization: `Bearer ${t103.token}` } })).status).toBe(200);
    expect((await appA({ headers: { Authorization: `Bearer ${t104.token}` } })).status).toBe(200);
    expect((await appB({ headers: { Authorization: `Bearer ${t104.token}` } })).status).toBe(200);

    // 2. Mutações críticas ocorrem no D1 (logout, desativação, remoção de tenant, revogação de role)
    // Caso 1: Logout / revogação de token no D1
    blocklisted.add(t101.jti);

    // Caso 2: Desativação de conta no D1
    const u102 = usuarios.find((u) => u.id === 102);
    if (u102) u102.active = 0;

    // Caso 3: Remoção de vínculo de tenant no D1
    const idx103 = memberships.findIndex((m) => m.usuarioId === 103);
    if (idx103 >= 0) memberships.splice(idx103, 1);

    // Caso 4: Revogação de cargo / tenant admin no D1
    const m104 = memberships.find((m) => m.usuarioId === 104);
    if (m104) m104.role = 'viewer';

    // 3. A Instância B (outro isolate que não recebeu invalidação local) DEVE falhar fechada imediatamente
    // Caso 1: Token revogado -> 401 TOKEN_REVOKED
    const resB1 = await appB({ headers: { Authorization: `Bearer ${t101.token}` } });
    expect(resB1.status).toBe(401);
    expect(((await resB1.json()) as { code: string }).code).toBe('TOKEN_REVOKED');

    // Caso 2: Conta desativada -> 401 USER_INACTIVE
    const resB2 = await appB({ headers: { Authorization: `Bearer ${t102.token}` } });
    expect(resB2.status).toBe(401);
    expect(((await resB2.json()) as { code: string }).code).toBe('USER_INACTIVE');

    // Caso 3: Vínculo de tenant removido -> 401 TENANT_MEMBERSHIP_INVALID
    const resB3 = await appB({ headers: { Authorization: `Bearer ${t103.token}` } });
    expect(resB3.status).toBe(401);
    expect(((await resB3.json()) as { code: string }).code).toBe('TENANT_MEMBERSHIP_INVALID');

    // Caso 4: Cargo alterado para viewer, mas token alega ADMIN -> 401 SESSION_ROLE_INVALID
    const resB4 = await appB({ headers: { Authorization: `Bearer ${t104.token}` } });
    expect(resB4.status).toBe(401);
    expect(((await resB4.json()) as { code: string }).code).toBe('SESSION_ROLE_INVALID');
  });
});

