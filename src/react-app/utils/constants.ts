/**
 * Constantes globais da aplicação
 * Evita magic numbers e centraliza configurações
 */

// ⏱️ INTERVALOS DE POLLING
// ATENÇÃO: Limite Cloudflare Free = 100k requests/dia
// Qualquer redução aqui tem impacto direto no consumo
export const POLLING_INTERVALS = {
  DASHBOARD_METRICS: 15 * 60 * 1000, // 15 minutos
  SYSTEM_HEALTH: 10 * 60 * 1000, // 10 minutos
  RECENT_ACTIVITY: 10 * 60 * 1000, // 10 minutos
  NOTIFICATIONS: 10 * 60 * 1000, // 10 minutos
  ALERTS: 15 * 60 * 1000, // 15 minutos
} as const;

// ⏱️ TIMEOUTS
export const TIMEOUTS = {
  API_REQUEST: 60 * 1000, // 60 segundos
  RETRY_DELAY: 500, // 500ms
  DEBOUNCE_DEFAULT: 300, // 300ms
  CIRCUIT_BREAKER_RESET: 60 * 1000, // 60 segundos
} as const;

// 📦 CACHE
export const CACHE_TTL = {
  SHORT: 30 * 1000, // 30 segundos
  MEDIUM: 60 * 1000, // 1 minuto
  LONG: 10 * 60 * 1000, // 10 minutos
  PREFETCH: 60 * 1000, // 1 minuto para dados pré-carregados
} as const;

// 🔢 LIMITES DE REQUISIÇÕES
export const REQUEST_LIMITS = {
  PER_MINUTE: 200,
  PER_DAY: 80_000, // 80% do limite Cloudflare (100k)
  MINUTE_WINDOW: 60 * 1000,
  DAY_WINDOW: 24 * 60 * 60 * 1000,
} as const;

// ⏱️ CONVERSÃO DE TEMPO
export const TIME_CONVERSION = {
  SECOND_MS: 1000,
  MINUTE_MS: 60 * 1000,
  HOUR_MS: 60 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,
} as const;

// 🔄 RETRY
export const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY: 1000,
  MAX_DELAY: 30 * 1000,
} as const;
