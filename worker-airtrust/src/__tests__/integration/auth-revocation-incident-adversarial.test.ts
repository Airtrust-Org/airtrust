import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  auth,
  resetBlocklistCache,
  invalidateJtiCache,
  resetUserSecurityCache,
  resetPlatformAccessCache,
} from '../../middleware/auth';
import { errorHandler } from '../../middleware/error-handler';
import { generateJWT } from '../../utils/security';
import type { Env, Variables } from '../../types';

const JWT_SECRET = 'test-secret-256-bit-key-for-testing-only-not-production';

type DbOptions = {
  blocklisted?: Set<string>;
  transientBlocklistFailures?: number;
  blocklistReadThrows?: boolean;
  transientPlatformFailures?: number;
  platformReadThrows?: boolean;
  asyncDelayMs?: number;
};

function createMockD1(options: DbOptions = {}) {
  let transientRemaining = options.transientBlocklistFailures ?? 0;
  let transientPlatformRemaining = options.transientPlatformFailures ?? 0;
  const blocklisted = options.blocklisted || new Set<string>();

  return {
    prepare: (sql: string) => {
      const stmt = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          stmt.params = params;
          return stmt;
        },
        async first<T>() {
          if (options.asyncDelayMs) {
            await new Promise((r) => setTimeout(r, options.asyncDelayMs));
          }
          if (sql.includes("name = 'usuarios_empresas'")) return { found: 1 } as T;
          if (sql.includes('sqlite_master')) {
            const target = stmt.params[0];
            if (target === 'user_platform_roles' || target === 'usuarios_empresas') {
              return { found: 1 } as T;
            }
          }
          if (sql.includes('PRAGMA table_info')) return null as T;

          if (sql.includes('FROM token_blocklist')) {
            if (transientRemaining > 0) {
              transientRemaining--;
              throw new Error('D1_EXEC_ERROR: transient database busy lock');
            }
            if (options.blocklistReadThrows) {
              throw new Error('D1_ERROR: storage backend completely unavailable');
            }
            const jti = String(stmt.params[0]);
            if (blocklisted.has(jti)) return { 1: 1 } as T;
            return null as T;
          }

          if (sql.includes('LEFT JOIN usuarios_empresas ue')) {
            return {
              id: 42,
              active: 1,
              role: 'admin',
              empresa_id: 6,
            } as T;
          }

          if (sql.includes('FROM usuarios') && sql.includes('perfil')) {
            return { id: 42, perfil: 'ADMIN', active: 1 } as T;
          }

          if (sql.includes('FROM empresas')) {
            return { id: 6, ativo: 1 } as T;
          }

          return null as T;
        },
        async all<T>() {
          if (options.asyncDelayMs) {
            await new Promise((r) => setTimeout(r, options.asyncDelayMs));
          }
          if (sql.includes('FROM user_platform_roles')) {
            if (transientPlatformRemaining > 0) {
              transientPlatformRemaining--;
              throw new Error('D1_EXEC_ERROR: 503 Service Unavailable: database resource limit');
            }
            if (options.platformReadThrows) {
              throw new Error('D1_ERROR: storage backend completely unavailable');
            }
            return { results: [] } as T;
          }
          if (sql.includes('FROM usuarios') || sql.includes('usuarios_empresas')) {
            return {
              results: [{ id: 42, active: 1, role: 'admin', empresa_id: 6 }],
            };
          }
          return { results: [] } as T;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

function buildTestApp(db: ReturnType<typeof createMockD1>) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('/api/*', auth());
  app.get('/api/compliance-treinamentos/reconciliacao', (c) =>
    c.json({
      success: true,
      endpoint: '/api/compliance-treinamentos/reconciliacao',
      empresaId: c.get('empresaId'),
      userId: c.get('userId'),
    }),
  );

  return (path: string, options: { headers?: Record<string, string> } = {}) => {
    const req = new Request(`http://localhost${path}`, {
      method: 'GET',
      headers: options.headers || {},
    });
    const env: Env = {
      DB: db as unknown as D1Database,
      JWT_SECRET,
      ENVIRONMENT: 'production',
    } as unknown as Env;
    return app.fetch(req, env, {} as ExecutionContext);
  };
}

async function makeToken(jti: string, empresaId = 6, userId = 42) {
  const result = await generateJWT(
    {
      sub: userId,
      email: 'pilot@example.invalid',
      empresa_id: empresaId,
      role: 'ADMIN',
      jti,
      token_type: 'access',
    },
    JWT_SECRET,
    3600,
  );
  return result.token;
}

describe('Pendência 6 — Incidente 503 e Verificação Adversarial de Revogação JWT (Issue #2078)', () => {
  beforeEach(() => {
    resetBlocklistCache();
    resetUserSecurityCache();
    resetPlatformAccessCache();
  });

  it('1. JWT válido não revogado: autoriza e responde 200 no endpoint de reconciliação', async () => {
    const db = createMockD1();
    const app = buildTestApp(db);
    const token = await makeToken('jti-valid-1');

    const res = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; empresaId: number; userId: string };
    expect(body.success).toBe(true);
    expect(body.empresaId).toBe(6);
    expect(body.userId).toBe('42');
  });

  it('2. JWT revogado: rejeita imediatamente com 401 TOKEN_REVOKED', async () => {
    const blocklisted = new Set(['jti-revoked-2']);
    const db = createMockD1({ blocklisted });
    const app = buildTestApp(db);
    const token = await makeToken('jti-revoked-2');

    const res = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; code: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('TOKEN_REVOKED');
  });

  it('3. Banco temporariamente indisponível: fail-closed estrito retornando 503 AUTH_REVOCATION_CHECK_UNAVAILABLE', async () => {
    const db = createMockD1({ blocklistReadThrows: true });
    const app = buildTestApp(db);
    const token = await makeToken('jti-unavailable-3');

    const res = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { success: boolean; code: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('AUTH_REVOCATION_CHECK_UNAVAILABLE');
  });

  it('4. Resposta lenta: resolve assincronamente com segurança sem corromper estado ou bypassar verificação', async () => {
    const db = createMockD1({ asyncDelayMs: 25 });
    const app = buildTestApp(db);
    const token = await makeToken('jti-slow-4');

    const res = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('5. Falhas intermitentes: absorvidas pelo retry com backoff, alcançando sucesso sem 503 espúrio', async () => {
    // 2 falhas transitórias de rede/lock seguidas de sucesso na 3ª tentativa
    const db = createMockD1({ transientBlocklistFailures: 2 });
    const app = buildTestApp(db);
    const token = await makeToken('jti-transient-5');

    const res = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('6. Revogação simultânea em diferentes isolates: dois isolates distintos rejeitam com 401 após inserção no D1', async () => {
    const blocklisted = new Set<string>();
    const sharedDb = createMockD1({ blocklisted });

    // Isolate 1 e Isolate 2
    const isolate1 = buildTestApp(sharedDb);
    const isolate2 = buildTestApp(sharedDb);

    const token = await makeToken('jti-multi-isolate-6');

    // Requisições iniciais em ambos os isolates passam com sucesso (caches quentes locais)
    const res1 = await isolate1('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res1.status).toBe(200);

    const res2 = await isolate2('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res2.status).toBe(200);

    // Logout central registrado na tabela token_blocklist do D1
    blocklisted.add('jti-multi-isolate-6');

    // O Isolate 2 (outro isolate Cloudflare sem aviso em memória) DEVE consultar o D1 e falhar fechado com 401
    const resAfterRevoke = await isolate2('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resAfterRevoke.status).toBe(401);
    expect(((await resAfterRevoke.json()) as { code: string }).code).toBe('TOKEN_REVOKED');
  });

  it('7. Recuperação após falha: após restabelecimento do D1, requisição subsequente autentica sem reiniciar worker', async () => {
    // Inicialmente com falhas transitórias
    const db = createMockD1({ transientBlocklistFailures: 8 }); // excede maxAttempts (7)
    const app = buildTestApp(db);
    const token = await makeToken('jti-recover-7');

    const failRes = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(failRes.status).toBe(503);

    // Banco restabelece a conectividade (transientRemaining já esgotado no mock)
    const recoverRes = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(recoverRes.status).toBe(200);
  });

  it('8. Ausência de reutilização indevida de autorização positiva: token previamente validado nunca ignora revogação posterior', async () => {
    const blocklisted = new Set<string>();
    const db = createMockD1({ blocklisted });
    const app = buildTestApp(db);
    const token = await makeToken('jti-no-stale-positive-8');

    // 1ª chamada: autorizado com 200
    const firstRes = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(firstRes.status).toBe(200);

    // Revogação no D1
    blocklisted.add('jti-no-stale-positive-8');

    // 2ª chamada imediata: DEVE ser rejeitada com 401 TOKEN_REVOKED, provando que não há cache positivo
    const secondRes = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(secondRes.status).toBe(401);
    expect(((await secondRes.json()) as { code: string }).code).toBe('TOKEN_REVOKED');
  });

  it('9. Incidente #2078: falhas intermitentes no platform access são absorvidas pelo retry e respondem 200', async () => {
    // 2 falhas transitórias consecutivas de platform access (ex: 503 Service Unavailable / resource limit)
    const db = createMockD1({ transientPlatformFailures: 2 });
    const app = buildTestApp(db);
    const token = await makeToken('jti-transient-platform-9');

    const res = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('10. Incidente #2078 (fail-closed): indisponibilidade persistente em platform access retorna 503 PLATFORM_ACCESS_CHECK_UNAVAILABLE', async () => {
    const db = createMockD1({ platformReadThrows: true });
    const app = buildTestApp(db);
    const token = await makeToken('jti-unavailable-platform-10');

    const res = await app('/api/compliance-treinamentos/reconciliacao', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('PLATFORM_ACCESS_CHECK_UNAVAILABLE');
  });
  it('11. Leituras JTI coalescidas propagam contagem real de tentativas para ambos os requests', async () => {
    const db = createMockD1({ blocklistReadThrows: true, asyncDelayMs: 25 });
    const app = buildTestApp(db);
    const token = await makeToken('jti-coalesced-diagnostics-11');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [a, b] = await Promise.all([
        app('/api/compliance-treinamentos/reconciliacao', { headers }),
        app('/api/compliance-treinamentos/reconciliacao', { headers }),
      ]);
      expect([a.status, b.status]).toEqual([503, 503]);
      const events = log.mock.calls
        .filter(([tag]) => tag === '[AUTH_INFRASTRUCTURE_ERROR]')
        .map(([, payload]) => JSON.parse(String(payload)) as { code: string; attempts: number });
      const jtiEvents = events.filter((event) => event.code === 'AUTH_REVOCATION_CHECK_UNAVAILABLE');
      expect(jtiEvents).toHaveLength(2);
      expect(jtiEvents.map((event) => event.attempts)).toEqual([7, 7]);
    } finally {
      log.mockRestore();
    }
  });

});
