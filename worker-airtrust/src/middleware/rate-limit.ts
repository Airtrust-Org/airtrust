/**
 * RATE LIMITING MIDDLEWARE — distributed via D1.
 *
 * Security contract:
 * - authentication flows fail closed when D1 cannot validate the limit;
 * - only CF-Connecting-IP is trusted as a network identifier;
 * - X-Forwarded-For is deliberately ignored because clients can forge it;
 * - non-critical routes may use a bounded local fallback to avoid broad outage;
 * - missing IP never shares a global "unknown" bucket.
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

export type RateLimitFailureMode = 'closed' | 'open';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
  keyExtractor?: (c: Parameters<MiddlewareHandler<{ Bindings: Env }>>[0]) => string;
  failureMode?: RateLimitFailureMode;
  allowLocalFallback?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const inMemoryStore = new Map<string, RateLimitEntry>();
const SAFE_CF_IP = /^[0-9a-fA-F:.]{2,64}$/;

function maybeCleanupInMemory() {
  if (Math.random() < 0.01) {
    const now = Date.now();
    for (const [key, entry] of inMemoryStore.entries()) {
      if (now > entry.resetAt) inMemoryStore.delete(key);
    }
  }
}

function getLocalRateLimitCount(key: string, windowSeconds: number): number {
  maybeCleanupInMemory();
  const now = Date.now();
  let entry = inMemoryStore.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowSeconds * 1000 };
    inMemoryStore.set(key, entry);
  } else {
    entry.count += 1;
  }
  return entry.count;
}

async function getRateLimitCountD1(
  db: D1Database,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const now = new Date().toISOString();

  // Best-effort cleanup never changes the decision for the current request.
  if (Math.random() < 0.02) {
    db.prepare(`DELETE FROM rate_limit_store WHERE reset_at < ?`)
      .bind(now)
      .run()
      .catch(() => undefined);
  }

  const result = await db
    .prepare(
      `INSERT INTO rate_limit_store (key, count, reset_at)
       VALUES (?, 1, datetime('now', '+' || ? || ' seconds'))
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN reset_at < datetime('now') THEN 1
           ELSE count + 1
         END,
         reset_at = CASE
           WHEN reset_at < datetime('now') THEN datetime('now', '+' || ? || ' seconds')
           ELSE reset_at
         END
       RETURNING count, reset_at`,
    )
    .bind(key, String(windowSeconds), String(windowSeconds))
    .first<{ count: number; reset_at: string }>();

  if (!result || !Number.isFinite(Number(result.count))) {
    throw new Error('RATE_LIMIT_D1_NO_RESULT');
  }
  return Number(result.count);
}

function inferFailureMode(config: RateLimitConfig): RateLimitFailureMode {
  if (config.failureMode) return config.failureMode;
  return /^(auth-|login$)/i.test(config.keyPrefix) ? 'closed' : 'open';
}

function normalizeCfConnectingIp(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !SAFE_CF_IP.test(trimmed)) return null;
  return trimmed;
}

export function resolveRateLimitIdentifier(
  headers: { cfConnectingIp?: string; requestId?: string },
  failureMode: RateLimitFailureMode,
): { identifier: string | null; source: 'cf' | 'request' | 'missing' } {
  const cfIp = normalizeCfConnectingIp(headers.cfConnectingIp);
  if (cfIp) return { identifier: cfIp, source: 'cf' };

  if (failureMode === 'closed') {
    return { identifier: null, source: 'missing' };
  }

  const requestId = String(headers.requestId || crypto.randomUUID())
    .replace(/[^A-Za-z0-9._:-]/g, '_')
    .slice(0, 128);
  return { identifier: `missing:${requestId || crypto.randomUUID()}`, source: 'request' };
}

function unavailableResponse(c: Parameters<MiddlewareHandler<{ Bindings: Env }>>[0]) {
  c.header('Retry-After', '30');
  return c.json(
    {
      success: false,
      error: 'Serviço temporariamente indisponível.',
      code: 'RATE_LIMIT_UNAVAILABLE',
    },
    503,
  );
}

export function rateLimiter(config: RateLimitConfig): MiddlewareHandler<{ Bindings: Env }> {
  const { maxRequests, windowSeconds, keyPrefix, keyExtractor } = config;
  const failureMode = inferFailureMode(config);

  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();

    const resolved = keyExtractor
      ? { identifier: keyExtractor(c)?.trim() || null, source: 'request' as const }
      : resolveRateLimitIdentifier(
          {
            cfConnectingIp: c.req.header('CF-Connecting-IP'),
            requestId: c.req.header('X-Request-ID'),
          },
          failureMode,
        );

    if (!resolved.identifier) {
      console.warn(
        JSON.stringify({
          event: 'operational_metric',
          operation: 'rate_limit',
          category: 'missing_client_ip',
          key_prefix: keyPrefix,
          failure_mode: failureMode,
        }),
      );
      return unavailableResponse(c);
    }

    const key = `${keyPrefix}:${resolved.identifier}`;
    const environment = c.env?.ENVIRONMENT || 'development';
    const allowLocalFallback =
      config.allowLocalFallback ?? (failureMode === 'open' || environment === 'development');

    let count: number;
    try {
      if (!c.env?.DB) throw new Error('RATE_LIMIT_DB_UNAVAILABLE');
      count = await getRateLimitCountD1(c.env.DB, key, windowSeconds);
    } catch {
      console.warn(
        JSON.stringify({
          event: 'operational_metric',
          operation: 'rate_limit',
          category: 'd1_unavailable',
          key_prefix: keyPrefix,
          failure_mode: failureMode,
          fallback: allowLocalFallback ? 'local' : 'none',
        }),
      );

      if (failureMode === 'closed' && !allowLocalFallback) {
        return unavailableResponse(c);
      }
      count = getLocalRateLimitCount(key, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - count);
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));

    if (count > maxRequests) {
      c.header('Retry-After', String(windowSeconds));
      console.warn(
        JSON.stringify({
          event: 'operational_metric',
          operation: 'rate_limit',
          category: 'limit_exceeded',
          key_prefix: keyPrefix,
        }),
      );
      return c.json(
        {
          success: false,
          error: 'Muitas requisições. Tente novamente em alguns segundos.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: windowSeconds,
        },
        429,
      );
    }

    return next();
  };
}

export const rateLimitPresets = {
  login: {
    maxRequests: 5,
    windowSeconds: 60,
    keyPrefix: 'login',
    failureMode: 'closed',
    allowLocalFallback: false,
  },
  api: { maxRequests: 100, windowSeconds: 60, keyPrefix: 'api', failureMode: 'open' },
  webhook: {
    maxRequests: 30,
    windowSeconds: 60,
    keyPrefix: 'webhook',
    failureMode: 'open',
  },
  upload: {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: 'upload',
    failureMode: 'open',
  },
  export: {
    maxRequests: 5,
    windowSeconds: 60,
    keyPrefix: 'export',
    failureMode: 'open',
  },
  certificateValidation: {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: 'certificate-validation',
    failureMode: 'closed',
    allowLocalFallback: false,
  },
} as const;
