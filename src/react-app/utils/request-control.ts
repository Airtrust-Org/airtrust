/**
 * Sistema de controle global de requests para evitar rate limiting
 *
 * Monitora e limita o número de requests feitos pela aplicação
 */

import { REQUEST_LIMITS } from './constants';
import { apiFetch } from '../lib/apiFetch';
import { logger } from './logger';

interface RequestStats {
  count: number;
  lastReset: number;
  windowMs: number;
}

class RequestController {
  private stats: RequestStats = {
    count: 0,
    lastReset: Date.now(),
    windowMs: REQUEST_LIMITS.MINUTE_WINDOW,
  };

  private readonly MAX_REQUESTS_PER_MINUTE = REQUEST_LIMITS.PER_MINUTE;
  private readonly MAX_REQUESTS_PER_DAY = REQUEST_LIMITS.PER_DAY;

  private dailyStats: RequestStats = {
    count: 0,
    lastReset: Date.now(),
    windowMs: REQUEST_LIMITS.DAY_WINDOW,
  };

  /**
   * Verifica se pode fazer um request
   */
  canMakeRequest(): boolean {
    this.resetIfNeeded();

    // Verifica limite por minuto
    if (this.stats.count >= this.MAX_REQUESTS_PER_MINUTE) {
      logger.warn(
        `[RequestControl] Limite de ${this.MAX_REQUESTS_PER_MINUTE} requests/min atingido`,
      );
      return false;
    }

    // Verifica limite diário
    if (this.dailyStats.count >= this.MAX_REQUESTS_PER_DAY) {
      logger.error(
        `[RequestControl] Limite diário de ${this.MAX_REQUESTS_PER_DAY} requests atingido!`,
      );
      return false;
    }

    return true;
  }

  /**
   * Registra um novo request
   */
  recordRequest(): void {
    this.resetIfNeeded();
    this.stats.count++;
    this.dailyStats.count++;
  }

  /**
   * Obtém estatísticas atuais
   */
  getStats() {
    this.resetIfNeeded();
    return {
      perMinute: this.stats.count,
      maxPerMinute: this.MAX_REQUESTS_PER_MINUTE,
      perDay: this.dailyStats.count,
      maxPerDay: this.MAX_REQUESTS_PER_DAY,
      percentDay: Math.round((this.dailyStats.count / this.MAX_REQUESTS_PER_DAY) * 100),
    };
  }

  /**
   * Reseta contadores se necessário
   */
  private resetIfNeeded(): void {
    const now = Date.now();

    // Reset contador por minuto
    if (now - this.stats.lastReset >= this.stats.windowMs) {
      this.stats.count = 0;
      this.stats.lastReset = now;
    }

    // Reset contador diário
    if (now - this.dailyStats.lastReset >= this.dailyStats.windowMs) {
      this.dailyStats.count = 0;
      this.dailyStats.lastReset = now;
    }
  }

  /**
   * Reseta manualmente os contadores (para testes)
   */
  reset(): void {
    this.stats.count = 0;
    this.stats.lastReset = Date.now();
    this.dailyStats.count = 0;
    this.dailyStats.lastReset = Date.now();
  }
}

// Instância global
export const requestController = new RequestController();

/**
 * Hook para usar o request controller
 */
export function useRequestControl() {
  return {
    canMakeRequest: () => requestController.canMakeRequest(),
    recordRequest: () => requestController.recordRequest(),
    getStats: () => requestController.getStats(),
  };
}

/**
 * Wrapper para fetch que controla requests
 */
export async function controlledFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!requestController.canMakeRequest()) {
    const stats = requestController.getStats();
    throw new Error(
      `Request bloqueado: limite atingido (${stats.perMinute}/${stats.maxPerMinute} por min, ${stats.perDay}/${stats.maxPerDay} por dia)`,
    );
  }

  requestController.recordRequest();
  return apiFetch(input, init);
}
