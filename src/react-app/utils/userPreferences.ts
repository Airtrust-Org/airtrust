const AUTH_USER_KEY = 'airtrust_user';

type StoredUser = {
  id?: number | string;
  email?: string;
};

function readStorageItem(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

function getCurrentUserScope(): string {
  try {
    const rawUser = readStorageItem(AUTH_USER_KEY);
    if (!rawUser) return 'anonymous';

    const parsedUser = JSON.parse(rawUser) as StoredUser;
    const userId = String(parsedUser?.id ?? '').trim();
    const userEmail = String(parsedUser?.email ?? '')
      .trim()
      .toLowerCase();

    if (userId) return `id:${userId}`;
    if (userEmail) return `email:${userEmail}`;
  } catch {
    // ignore parsing errors and fallback to anonymous scope
  }

  return 'anonymous';
}

export function buildUserScopedStorageKey(baseKey: string): string {
  return `${baseKey}__user:${getCurrentUserScope()}`;
}

export function readUserPreference<T>(baseKey: string, fallback: T): T {
  const key = buildUserScopedStorageKey(baseKey);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeUserPreference<T>(baseKey: string, value: T): void {
  const key = buildUserScopedStorageKey(baseKey);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore write errors (quota/full/private mode)
  }
}
