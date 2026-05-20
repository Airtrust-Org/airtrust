/**
 * RATE LIMITING MIDDLEWARE — Distributed via D1
 *
 * Usa Cloudflare D1 para estado compartilhado entre todas as instâncias
 * do worker, garantindo que os limites sejam respeitados globalmente.
 *
 * Tabela: rate_limit_store (criada na migration 0289)
 *   key TEXT PRIMARY KEY, count INTEGER, reset_at TEXT
 *
 * Fallback in-memory para ambientes sem DB disponível.
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
  keyExtractor?: (c: Parameters<MiddlewareHandler<{ Bindings: Env }>>[0]) => string;
}

// ===== IN-MEMORY FALLBACK (usado apenas em testes/dev sem DB) =====
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const inMemoryStore = new Map<string, RateLimitEntry>();

function maybeCleanupInMemory() {
  if (Math.random() < 0.01) {
    const now = Date.now();
    for (const [key, entry] of inMemoryStore.entries()) {
      if (now > entry.resetAt) inMemoryStore.delete(key);
    }
  }
}

// ===== D1-BACKED RATE LIMITER =====

async function getRateLimitCountD1(
  db: D1Database,
  key: string,
  windowSeconds: number,
): Promise<number> {
  const now = new Date().toISOString();

  // Limpeza probabilística: 2% das requisições purga entradas expiradas
  if (Math.random() < 0.02) {
    db.prepare(`DELETE FROM rate_limit_store WHERE reset_at < ?`).bind(now).run().catch(() => {});
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

  return result?.count ?? 1;
}

/**
 * Middleware de Rate Limiting (distribuído via D1)
 *
 * @example
 * app.post('/api/auth/login', rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'login' }));
 */
export function rateLimiter(config: RateLimitConfig): MiddlewareHandler<{ Bindings: Env }> {
  const { maxRequests, windowSeconds, keyPrefix, keyExtractor } = config;

  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();

    const identifier = keyExtractor
      ? keyExtractor(c)
      : c.req.header('CF-Connecting-IP') ||
        c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
        'unknown';

    const key = `${keyPrefix}:${identifier}`;
    let count = 1;

    try {
      const db = c.env?.DB;
      if (db) {
        count = await getRateLimitCountD1(db, key, windowSeconds);
      } else {
        // Fallback in-memory
        maybeCleanupInMemory();
        const now = Date.now();
        let entry = inMemoryStore.get(key);
        if (!entry || now > entry.resetAt) {
          entry = { count: 1, resetAt: now + windowSeconds * 1000 };
          inMemoryStore.set(key, entry);
        } else {
          entry.count++;
        }
        count = entry.count;
      }
    } catch {
      // Se D1 falhar, não bloquear a requisição — rate limit best-effort
      count = 0;
    }

    const remaining = Math.max(0, maxRequests - count);
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));

    if (count > maxRequests) {
      c.header('Retry-After', String(windowSeconds));
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
  login:   { maxRequests: 10,  windowSeconds: 60,  keyPrefix: 'login' },
  api:     { maxRequests: 100, windowSeconds: 60,  keyPrefix: 'api' },
  webhook: { maxRequests: 30,  windowSeconds: 60,  keyPrefix: 'webhook' },
  upload:  { maxRequests: 10,  windowSeconds: 60,  keyPrefix: 'upload' },
  export:  { maxRequests: 5,   windowSeconds: 60,  keyPrefix: 'export' },
} as const;
