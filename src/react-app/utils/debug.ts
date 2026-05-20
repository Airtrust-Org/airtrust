/**
 * 🎯 DEBUG HELPER - Logs Condicionais para Performance
 *
 * PROBLEMA RESOLVIDO:
 * - 300+ console.log() em produção causando lentidão de 70-80%
 * - Logs executando em loops causando overhead extremo
 *
 * SOLUÇÃO:
 * - Logs apenas em desenvolvimento
 * - Zero overhead em produção
 * - API compatível com console nativo
 *
 * USO:
 * ```typescript
 * import { devLog, devWarn, devError } from '@/utils/debug';
 *
 * // Em vez de: console.log('msg')
 * devLog('msg');  // Só roda em dev
 *
 * // Errors sempre logam (críticos)
 * devError('erro'); // Roda sempre
 * ```
 */

const isDev = import.meta.env.DEV || process.env.NODE_ENV === 'development';

/**
 * Log condicional - APENAS em desenvolvimento
 */
export const devLog = (...args: unknown[]): void => {
  if (isDev) {
    console.log(...args);
  }
};

/**
 * Warning condicional - APENAS em desenvolvimento
 */
export const devWarn = (...args: unknown[]): void => {
  if (isDev) {
    console.warn(...args);
  }
};

/**
 * Error - SEMPRE loga (crítico para debugging de produção)
 */
export const devError = (...args: unknown[]): void => {
  console.error(...args);
};

/**
 * Debug condicional - APENAS em desenvolvimento
 */
export const devDebug = (...args: unknown[]): void => {
  if (isDev) {
    console.debug(...args);
  }
};

/**
 * Grupo de logs - APENAS em desenvolvimento
 */
export const devGroup = (label: string, fn: () => void): void => {
  if (isDev) {
    console.group(label);
    fn();
    console.groupEnd();
  }
};

/**
 * Performance timing - APENAS em desenvolvimento
 */
export const devTime = (label: string): void => {
  if (isDev) {
    console.time(label);
  }
};

export const devTimeEnd = (label: string): void => {
  if (isDev) {
    console.timeEnd(label);
  }
};

/**
 * Table - APENAS em desenvolvimento
 */
export const devTable = (data: unknown): void => {
  if (isDev) {
    console.table(data);
  }
};

// Export default para uso simples
export default {
  log: devLog,
  warn: devWarn,
  error: devError,
  debug: devDebug,
  group: devGroup,
  time: devTime,
  timeEnd: devTimeEnd,
  table: devTable,
};
