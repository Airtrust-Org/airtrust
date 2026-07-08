/**
 * Cache Cleaner Utility
 * Limpa todos os tipos de cache para garantir dados frescos
 * Executa em: startup, logout, ou quando usuário solicitar
 */

export interface CacheStats {
  localStorage: number;
  sessionStorage: number;
  indexedDB: number;
  memory: number;
  cdnCache: boolean;
  timestamp: string;
}

/**
 * Limpar localStorage
 */
export function clearLocalStorage(): void {
  const keysToKeep = ['theme-preference', 'user-language'];
  const allKeys = Object.keys(localStorage);
  let cleared = 0;

  for (const key of allKeys) {
    // Preservar chaves auth escopadas (airtrust:*) durante limpeza geral
    if (key.startsWith('airtrust:')) continue;
    if (!keysToKeep.includes(key)) {
      localStorage.removeItem(key);
      cleared++;
    }
  }

  console.log(`🗑️  localStorage: ${cleared} itens removidos`);
}

/**
 * Limpar sessionStorage
 */
export function clearSessionStorage(): void {
  const beforeSize = Object.keys(sessionStorage).length;
  sessionStorage.clear();
  console.log(`🗑️  sessionStorage: ${beforeSize} itens removidos`);
}

/**
 * Limpar IndexedDB (usado por React Query, etc)
 */
export async function clearIndexedDB(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const dbs = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);

      Promise.resolve(dbs).then((databases) => {
        let cleared = 0;

        const dbArray = Array.isArray(databases) ? databases : (databases as unknown[]);

        for (const db of dbArray) {
          const dbName = (db as { name: string }).name || '';
          indexedDB.deleteDatabase(dbName);
          cleared++;
        }

        console.log(`🗑️  IndexedDB: ${cleared} bancos removidos`);
        resolve();
      });
    } catch (err) {
      console.warn('⚠️  Erro ao limpar IndexedDB:', err);
      resolve();
    }
  });
}

/**
 * Limpar Service Worker cache
 */
export async function clearServiceWorkerCache(): Promise<void> {
  try {
    if (!('caches' in window)) {
      console.log('⚠️  Cache API não disponível');
      return;
    }

    const cacheNames = await caches.keys();
    let cleared = 0;

    for (const cacheName of cacheNames) {
      await caches.delete(cacheName);
      cleared++;
    }

    console.log(`🗑️  Service Worker cache: ${cleared} caches removidos`);
  } catch (err) {
    console.warn('⚠️  Erro ao limpar SW cache:', err);
  }
}

/**
 * Limpar React Query cache (memoria)
 */
export function clearReactQueryCache(queryClient?: Record<string, unknown>): void {
  if (queryClient && 'clear' in queryClient && typeof queryClient.clear === 'function') {
    (queryClient.clear as () => void)();
    console.log('🗑️  React Query cache: limpo');
  }
}

/**
 * Limpar cookies
 */
export function clearCookies(): void {
  const cookies = document.cookie.split(';');
  let cleared = 0;

  for (const cookie of cookies) {
    const eqPos = cookie.indexOf('=');
    const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();

    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    cleared++;
  }

  console.log(`🗑️  Cookies: ${cleared} removidos`);
}

/**
 * Requisitar limpeza de CDN cache (via header)
 * Backend deve suportar: Cache-Control: no-cache, max-age=0
 */
import { API_BASE_URL } from '../config/api';

export async function clearCDNCache(): Promise<boolean> {
  try {
    // Fazer requisição PRAGMA com header especial
    const response = await fetch(`${API_BASE_URL}/cache/clear`, {
      method: 'POST',
      headers: {
        'Cache-Control': 'no-cache, max-age=0',
        Pragma: 'no-cache',
      },
    });

    if (response.ok) {
      console.log('✅ CDN cache clear requisitado');
      return true;
    } else {
      console.warn('⚠️  CDN cache clear falhou:', response.status);
      return false;
    }
  } catch (err) {
    console.warn('⚠️  Erro ao requisitar CDN clear:', err);
    return false;
  }
}

/**
 * ⚡ LIMPEZA COMPLETA - Executa tudo
 */
export async function clearAllCaches(): Promise<CacheStats> {
  console.log('🧹 Iniciando limpeza completa de cache...');

  const startTime = performance.now();

  // 1. Limpar storages síncronos
  clearLocalStorage();
  clearSessionStorage();
  clearCookies();

  // 2. Limpar IndexedDB (async)
  await clearIndexedDB();

  // 3. Limpar Service Worker cache (async)
  await clearServiceWorkerCache();

  // 4. Tentar limpar CDN (async)
  const cdnCleared = await clearCDNCache();

  const endTime = performance.now();
  const duration = Math.round(endTime - startTime);

  const stats: CacheStats = {
    localStorage: Object.keys(localStorage).length,
    sessionStorage: Object.keys(sessionStorage).length,
    indexedDB: 0, // Já deletados
    memory: 0, // Limpo
    cdnCache: cdnCleared,
    timestamp: new Date().toISOString(),
  };

  console.log(`✅ Cache completo limpo em ${duration}ms`, stats);
  return stats;
}

/**
 * Monitorar tamanho de cache
 */
export function getCacheSize(): CacheStats {
  let localStorageSize = 0;
  let sessionStorageSize = 0;

  // Calcular localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      localStorageSize += (value?.length || 0) + key.length;
    }
  }

  // Calcular sessionStorage
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key) {
      const value = sessionStorage.getItem(key);
      sessionStorageSize += (value?.length || 0) + key.length;
    }
  }

  return {
    localStorage: localStorageSize,
    sessionStorage: sessionStorageSize,
    indexedDB: 0,
    memory: localStorageSize + sessionStorageSize,
    cdnCache: false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Limpar cache periodicamente (ex: a cada 1 hora)
 */
export function setupPeriodicCacheClear(intervalMs = 60 * 60 * 1000): () => void {
  const intervalId = setInterval(() => {
    clearLocalStorage();
    clearSessionStorage();
    console.log('🔄 Cache periódico limpo');
  }, intervalMs);

  // Retornar função para cancelar
  return () => clearInterval(intervalId);
}
