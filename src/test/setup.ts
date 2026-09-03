import '@testing-library/jest-dom';
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect, afterEach, beforeEach, afterAll, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './mocks/server';

expect.extend(matchers);

const BLOCKED_AIRTRUST_HOSTS = new Set([
  'airtrust.online',
  'airtrust.pages.dev',
  'airtrust.workers.dev',
]);

const BLOCKED_AIRTRUST_HOST_SUFFIXES = [
  '.airtrust.online',
  '.airtrust.pages.dev',
  '.airtrust.workers.dev',
] as const;

function getRequestUrl(input: RequestInfo | URL): URL | null {
  try {
    const value =
      input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    return new URL(value, 'http://127.0.0.1');
  } catch {
    return null;
  }
}

function isBlockedAirTrustHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  return (
    BLOCKED_AIRTRUST_HOSTS.has(normalizedHostname) ||
    BLOCKED_AIRTRUST_HOST_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix))
  );
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });

  const interceptedFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input);
    const hostname = url?.hostname;

    if (hostname && isBlockedAirTrustHost(hostname)) {
      return Promise.reject(
        new Error(`TEST_NETWORK_BLOCKED: acesso a ambiente AirTrust real bloqueado (${hostname})`),
      );
    }

    return interceptedFetch(input, init);
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  vi.unstubAllGlobals();
  server.close();
});

let localStorageData = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn<(key: string) => string | null>(),
  setItem: vi.fn<(key: string, value: string) => void>(),
  removeItem: vi.fn<(key: string) => void>(),
  clear: vi.fn<() => void>(),
};

function resetLocalStorageMock(): void {
  localStorageData = new Map<string, string>();
  localStorageMock.getItem
    .mockReset()
    .mockImplementation((key) => localStorageData.get(key) ?? null);
  localStorageMock.setItem.mockReset().mockImplementation((key, value) => {
    localStorageData.set(key, String(value));
  });
  localStorageMock.removeItem.mockReset().mockImplementation((key) => {
    localStorageData.delete(key);
  });
  localStorageMock.clear.mockReset().mockImplementation(() => {
    localStorageData.clear();
  });
}

resetLocalStorageMock();

beforeEach(() => {
  resetLocalStorageMock();
});

// Polyfill de ResizeObserver: @headlessui/react v2 consulta o observer ao abrir
// menus/popovers em jsdom, onde a API não existe.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });
}

// Mock de window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock de localStorage com comportamento equivalente ao Storage do navegador.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});
