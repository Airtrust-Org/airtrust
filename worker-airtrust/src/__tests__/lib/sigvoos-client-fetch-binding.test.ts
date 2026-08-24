import { afterEach, describe, expect, it, vi } from 'vitest';
import { SigvoosApiClient } from '../../lib/sigvoos/client';

/**
 * Regression test for a real bug found while validating the SIGVOOS shadow
 * ingestion against a real credential in staging: `this.fetchImpl = fetch`
 * in the constructor detaches `fetch` from its required receiver. Node's
 * fetch (used by vitest) tolerates this, but the real Cloudflare Workers
 * runtime throws "Illegal invocation: function called with incorrect `this`
 * reference." — never caught by ordinary mocked-fetch unit tests because
 * they don't enforce receiver identity. This test simulates that Workers
 * behavior directly: a `fetch` stand-in that throws unless invoked with
 * `this === globalThis` (i.e. called unbound, the same way a raw `fetch(...)`
 * call site would receive it).
 */
function installWorkersLikeFetch() {
  const workersLikeFetch = function (this: unknown) {
    if (this !== globalThis) {
      throw new TypeError(
        "Illegal invocation: function called with incorrect `this` reference.",
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ accessToken: 'tok-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  const original = globalThis.fetch;
  globalThis.fetch = workersLikeFetch as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe('SigvoosApiClient fetch binding (Cloudflare Workers "Illegal invocation" regression)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('authenticate() succeeds even when the default fetchImpl is used and global fetch enforces correct `this`', async () => {
    const restore = installWorkersLikeFetch();
    try {
      const client = new SigvoosApiClient({
        base_url: 'https://api.sigvoos.com.br/api',
        username: 'user',
        password: 'pass',
        system: 'sigtrip',
      });

      const token = await client.authenticate();
      expect(token).toBe('tok-123');
    } finally {
      restore();
    }
  });
});

describe('SigvoosApiClient authenticate() safe diagnosis when token is missing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes only response key names (never values) when the token field is absent', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_credentials', message: 'bad login' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    try {
      const client = new SigvoosApiClient({
        base_url: 'https://api.sigvoos.com.br/api',
        username: 'user',
        password: 'pass',
        system: 'sigtrip',
      });
      await expect(client.authenticate()).rejects.toThrow(
        /Token não retornado ou inválido\. \[responseKeys=error,message\]/,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('SigvoosApiClient authenticate() accepts a token nested under `data`', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves the token from response.data.accessToken when top-level fields are absent', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ status: 'ok', message: 'login ok', data: { accessToken: 'nested-tok-456' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    try {
      const client = new SigvoosApiClient({
        base_url: 'https://api.sigvoos.com.br/api',
        username: 'user',
        password: 'pass',
        system: 'sigtrip',
      });
      const token = await client.authenticate();
      expect(token).toBe('nested-tok-456');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('includes both top-level and nested data key names when neither shape has a token', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ status: 'error', message: 'bad login', data: { reason: 'invalid' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    try {
      const client = new SigvoosApiClient({
        base_url: 'https://api.sigvoos.com.br/api',
        username: 'user',
        password: 'pass',
        system: 'sigtrip',
      });
      await expect(client.authenticate()).rejects.toThrow(
        /\[responseKeys=status,message,data\] \[dataKeys=reason\]/,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});
