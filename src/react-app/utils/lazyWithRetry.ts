/* eslint-disable @typescript-eslint/no-explicit-any */
import { lazy, type ComponentType } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

const LAZY_RETRY_PREFIX = 'airtrust_lazy_retry_';
const CHUNK_ERROR_REGEX =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|dynamically imported module/i;

const telemetryDedup = new Set<string>();

async function clearAirtrustCaches(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('airtrust-'))
          .map((name) => caches.delete(name)),
      );
    }

    const registration = await navigator.serviceWorker?.getRegistration?.();
    registration?.active?.postMessage({ type: 'CLEAR_CACHE' });
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHE' });
  } catch {
    // best-effort cache cleanup
  }
}

function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_ERROR_REGEX.test(message);
}

function makeTelemetryId(scope: string, moduleKey: string, message: string): string {
  return `${scope}|${moduleKey}|${message.slice(0, 120)}`;
}

export async function reportChunkError(
  scope: string,
  moduleKey: string,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (typeof window === 'undefined') return;

  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const stack = error instanceof Error ? error.stack : undefined;
  const telemetryId = makeTelemetryId(scope, moduleKey, message);

  if (telemetryDedup.has(telemetryId)) return;
  telemetryDedup.add(telemetryId);

  const payload = {
    type: 'chunk_load_error',
    scope,
    moduleKey,
    message,
    stack,
    path: window.location.pathname,
    href: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    ...extra,
  };

  try {
    console.warn('[ChunkErrorTelemetry]', payload);
    const token = getAccessToken();
    await fetch(`${API_BASE_URL}/telemetry/client-error`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // best-effort telemetry
  }
}

export async function importWithRetry<T>(
  importer: () => Promise<T>,
  key: string,
  options?: { reloadOnChunkError?: boolean; maxAttempts?: number },
): Promise<T> {
  const reloadOnChunkError = options?.reloadOnChunkError ?? false;
  const maxAttempts = options?.maxAttempts ?? 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const module = await importer();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`${LAZY_RETRY_PREFIX}${key}`);
      }
      return module;
    } catch (error) {
      const chunkError = isChunkError(error);
      await reportChunkError('dynamic-import', key, error, { attempt, maxAttempts });

      if (!chunkError || attempt >= maxAttempts) {
        throw error;
      }

      if (reloadOnChunkError && typeof window !== 'undefined') {
        const retryKey = `${LAZY_RETRY_PREFIX}${key}`;
        const hasRetried = sessionStorage.getItem(retryKey) === '1';
        if (!hasRetried) {
          sessionStorage.setItem(retryKey, '1');
          await clearAirtrustCaches();
          window.location.reload();
          await new Promise<never>(() => {
            return;
          });
        }
      }
    }
  }

  throw new Error(`Import falhou para ${key}`);
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  key: string,
) {
  return lazy(async () => {
    return importWithRetry(importer, key, { reloadOnChunkError: true, maxAttempts: 2 });
  });
}

let listenersInstalled = false;

export function installChunkErrorListeners(): void {
  if (typeof window === 'undefined' || listenersInstalled) return;
  listenersInstalled = true;

  window.addEventListener('error', (event) => {
    const message = event.message || event.error?.message || '';
    if (CHUNK_ERROR_REGEX.test(message)) {
      void reportChunkError('window-error', 'global', event.error ?? event.message);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? '');
    if (CHUNK_ERROR_REGEX.test(message)) {
      void reportChunkError('unhandled-rejection', 'global', reason);
    }
  });
}
