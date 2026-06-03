/**
 * QUALIFICACOES SHARED - Helpers e Types compartilhados
 */

import type { Env } from '../../types';
import type { Context } from 'hono';
import { jsonError } from '../../middleware/response';
import { AppError } from '../../utils/errors';

// Cache simples em memória do worker para estatísticas (expira rápido)
export interface HistoricoStatsCacheEntry {
  key: string;
  ts: number;
  data: {
    total: number;
    validas: number;
    vencendo: number;
    vencidas: number;
    renovadas: number;
  };
}

export let historicoStatsCache: HistoricoStatsCacheEntry | null = null;

export function setHistoricoStatsCache(cache: HistoricoStatsCacheEntry | null) {
  historicoStatsCache = cache;
}

// ===== HELPERS PERFORMANCE / CACHING =====
export function generateETag(parts: unknown[]): string {
  try {
    const base = JSON.stringify(parts);
    // Base64 curto para reduzir tamanho do header
    const b64 = btoa(base).substring(0, 24);
    return `"qh-${b64}"`;
  } catch {
    // Fallback simples
    return '"qh-etag-fallback"';
  }
}

// TTL dinâmico para cache de estatísticas (padrão 30s)
export function getCacheTtlMs(env: Env): number {
  const raw = (env as unknown as { CACHE_TTL_SECONDS?: string }).CACHE_TTL_SECONDS || '30';
  const n = parseInt(raw);
  if (isNaN(n) || n <= 0) return 30000;
  return n * 1000;
}

// Invalida materialized stats do dia (todas as chaves) após mutações
export async function invalidateMaterializedStats(db: D1Database) {
  try {
    await db
      .prepare("DELETE FROM qualificacoes_historico_stats_daily WHERE day = date('now')")
      .run();
  } catch (e) {
    console.error('[invalidateMaterializedStats] erro', e);
  }
  historicoStatsCache = null;
}

// Safe wrapper para handlers
type QualificacoesContext = Context<{ Bindings: Env }>;

export function safe(
  fn: (c: QualificacoesContext) => Promise<Response | unknown> | Response | unknown,
) {
  return async (c: QualificacoesContext) => {
    try {
      return await fn(c);
    } catch (e) {
      const err = e as AppError;
      if (err instanceof AppError) {
        return jsonError(c, err.message, err.status || 400, err.code);
      }
      const errorMessage = (e as Error).message || String(e);
      const errorStack = (e as Error).stack || '';
      console.error('[QUALIFICACOES_HANDLER_ERROR] Message:', errorMessage);
      console.error('[QUALIFICACOES_HANDLER_ERROR] Stack:', errorStack);
      console.error('[QUALIFICACOES_HANDLER_ERROR] Full Error:', e);
      return jsonError(c, `Falha inesperada: ${errorMessage}`, 500, 'UNEXPECTED');
    }
  };
}

/**
 * R09-RESOLVED: Runtime DDL removed.
 *
 * Migrations 0075/0107 added `renovada`, `local`, `modalidade` to qualificacoes_historico.
 * Migration 0200 intentionally REMOVED `local` and `modalidade` (not used by the system).
 * `renovada` persists through the 0200 rebuild and is present in the final schema.
 *
 * The active code path (historico-helpers.ts:131) already exports a no-op stub.
 * This function is kept as a compatibility no-op — no ALTER TABLE is executed.
 * See test: __tests__/migrations/qualificacoes-historico-shared-schema.test.ts
 */
export async function ensureHistoricoSchema(_db: D1Database) {
  // No-op: schema is fully covered by migrations.
  // Columns: renovada=present (0200+), local=removed (0200), modalidade=removed (0200).
}
