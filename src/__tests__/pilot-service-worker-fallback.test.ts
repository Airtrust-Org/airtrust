import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const swSource = readFileSync(resolve(process.cwd(), 'public/pilot/pilot-sw.js'), 'utf8');

type TestRequest = { method: string; mode: string; url: string };
type TestEvent = { request: TestRequest; respondWith: (promise: Promise<unknown>) => void };
type NetworkMode = 'stall' | 'http-503';

async function exercisePilotFetch(path: string, mode: string, networkMode: NetworkMode) {
  const handlers = new Map<string, (event: TestEvent) => void>();
  const cachedResponse = { ok: true, source: 'verified-offline-cache' };
  const requested: string[] = [];
  let abortCount = 0;
  let cacheLookups = 0;

  const mockFetch = (request: string | TestRequest, options: { signal: AbortSignal }) => {
    requested.push(typeof request === 'string' ? request : request.url);
    if (networkMode === 'http-503') return Promise.resolve({ ok: false, status: 503 });
    return new Promise<unknown>((_resolve, reject) => {
      if (options.signal.aborted) {
        abortCount += 1;
        reject(new Error('AbortError'));
        return;
      }
      options.signal.addEventListener('abort', () => {
        abortCount += 1;
        reject(new Error('AbortError'));
      }, { once: true });
    });
  };

  runInNewContext(swSource, {
    URL,
    Response,
    AbortController,
    self: {
      location: { origin: 'https://airtrust.online' },
      addEventListener(type: string, handler: (event: TestEvent) => void) {
        handlers.set(type, handler);
      },
    },
    fetch: mockFetch,
    caches: {
      async match(_path: string) {
        cacheLookups += 1;
        return cachedResponse;
      },
      open: async () => ({ put: async () => undefined }),
    },
    setTimeout(callback: () => void) {
      // Flush the simulated network deadline without waiting four real seconds.
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout: () => undefined,
  });

  let responsePromise: Promise<unknown> | undefined;
  const request = { method: 'GET', mode, url: 'https://airtrust.online' + path };
  handlers.get('fetch')?.({
    request,
    respondWith(promise) { responsePromise = promise; },
  });
  const response = responsePromise ? await responsePromise : undefined;
  return { response, cachedResponse, requested, abortCount, cacheLookups };
}

describe('Pilot Service Worker — rede móvel intermitente', () => {
  it('não deixa a navegação esperando indefinidamente no 5G e abre o shell cifrado já cacheado', async () => {
    const result = await exercisePilotFetch('/pilot/', 'navigate', 'stall');
    expect(result.response).toBe(result.cachedResponse);
    expect(result.requested).toEqual(['/pilot/']);
    expect(result.abortCount).toBe(1);
    expect(result.cacheLookups).toBe(1);
  });

  it('reutiliza o JavaScript já cacheado quando a rede trava, sem interceptar API', async () => {
    const result = await exercisePilotFetch('/pilot/pilot-app.js', 'cors', 'stall');
    expect(result.response).toBe(result.cachedResponse);
    expect(result.abortCount).toBe(1);
    expect(result.cacheLookups).toBe(1);
  });

  it('usa o cache se a rede responder erro HTTP na navegação ou em asset do Pilot App', async () => {
    for (const [path, mode] of [['/pilot/', 'navigate'], ['/pilot/pilot-vault.js', 'cors']]) {
      const result = await exercisePilotFetch(path, mode, 'http-503');
      expect(result.response).toBe(result.cachedResponse);
      expect(result.abortCount).toBe(0);
    }
  });

  it('não intercepta caminhos da API ou fora do escopo /pilot/', async () => {
    const api = await exercisePilotFetch('/api/controle-voos/voos/meus', 'cors', 'stall');
    const other = await exercisePilotFetch('/frms', 'navigate', 'stall');
    expect(api.response).toBeUndefined();
    expect(other.response).toBeUndefined();
    expect(api.requested).toEqual([]);
    expect(other.requested).toEqual([]);
  });
});
