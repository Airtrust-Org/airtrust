/**
 * Auth Storage — helpers escopados por empresa e usuário
 *
 * Toda chave de permissão/RBAC/usuário deve ser namespaced com
 * empresaId + userId para evitar que dados de uma empresa ou
 * usuário sejam reutilizados em outra sessão no mesmo navegador.
 *
 * Chaves legadas sem escopo (ex.: airtrust_perfis_custom) são
 * detectadas e ignoradas — nunca usadas como fonte de permissão.
 */

const LEGACY_PERFIS_KEY = 'airtrust_perfis_custom';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota excedida — ignorar */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignorar */
  }
}

export interface AuthStorageScope {
  empresaId: number | string;
  userId: number | string;
}

function buildScopedKey(baseKey: string, scope: AuthStorageScope): string {
  const empresaId = String(scope.empresaId || 'unknown');
  const userId = String(scope.userId || 'unknown');
  return `airtrust:${empresaId}:${userId}:${baseKey}`;
}

export function readScopedAuthStorage(
  baseKey: string,
  scope: AuthStorageScope,
): string | null {
  if (!scope.empresaId || !scope.userId) return null;
  return safeGet(buildScopedKey(baseKey, scope));
}

export function writeScopedAuthStorage(
  baseKey: string,
  scope: AuthStorageScope,
  value: string,
): void {
  if (!scope.empresaId || !scope.userId) return;
  safeSet(buildScopedKey(baseKey, scope), value);
}

export function removeScopedAuthStorage(
  baseKey: string,
  scope: AuthStorageScope,
): void {
  if (!scope.empresaId || !scope.userId) return;
  safeRemove(buildScopedKey(baseKey, scope));
}

export function clearAllScopedAuthStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('airtrust:')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => safeRemove(k));
  } catch {
    /* ignorar */
  }
}

export function clearLegacyPerfisCache(): void {
  safeRemove(LEGACY_PERFIS_KEY);
}

export function hasLegacyPerfisCache(): boolean {
  return safeGet(LEGACY_PERFIS_KEY) !== null;
}

export function readScopedPerfis(
  scope: AuthStorageScope,
): Array<{ value: string; permissoes: string[] | null }> | null {
  const raw = readScopedAuthStorage('perfis_custom', scope);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeScopedPerfis(
  scope: AuthStorageScope,
  perfis: Array<{ value: string; permissoes: string[] | null }>,
): void {
  writeScopedAuthStorage('perfis_custom', scope, JSON.stringify(perfis));
}
