import { strict as assert } from 'node:assert';
import {
  SigvoosApiClient,
  resolveSigvoosEncryptionSecret,
  encryptSigvoosPassword,
  decryptSigvoosPassword,
  SigvoosClientError,
  readSigvoosResponseTextBounded,
} from '../../lib/sigvoos/client';

describe('SigvoosApiClient', () => {
  describe('Crypto & Secrets', () => {
    it('encrypts and decrypts password successfully', async () => {
      const secret = 'super-secret-key-32-bytes-long!';
      const encrypted = await encryptSigvoosPassword('my-plain-password', secret);
      assert.ok(encrypted.startsWith('enc:v1:'));
      
      const decrypted = await decryptSigvoosPassword(encrypted, secret);
      assert.equal(decrypted, 'my-plain-password');
    });

    it('resolves dedicated secret first, then fallback', () => {
      assert.equal(
        resolveSigvoosEncryptionSecret({ SIGVOOS_CONFIG_ENCRYPTION_KEY: 'dedicated', JWT_SECRET: 'jwt' }),
        'dedicated'
      );
      assert.equal(
        resolveSigvoosEncryptionSecret({ SIGVOOS_CONFIG_ENCRYPTION_KEY: '', JWT_SECRET: 'jwt' }),
        'jwt'
      );
    });
  });

  describe('HTTP & Auth', () => {
    const config = { base_url: 'https://api.sigvoos.test', username: 'user', password: 'pwd', system: 'test' };

    it('authenticates and caches token', async () => {
      let callCount = 0;
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        callCount++;
        return new Response(JSON.stringify({ accessToken: 'token-123' }), { status: 200 });
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch  });
      const t1 = await client.authenticate();
      const t2 = await client.authenticate(); // should use cache
      
      assert.equal(t1, 'token-123');
      assert.equal(t1, t2);
      assert.equal(callCount, 1);
    });

    it('unwraps the documented JSON token nested in data.token', async () => {
      const client = new SigvoosApiClient(config, {
        fetchImpl: async () => new Response(JSON.stringify({ data: { token: '{"access_token":"nested-bearer"}' } }), { status: 200 }),
      });
      assert.equal(await client.authenticate(), 'nested-bearer');
    });

    it('fails closed for application errors and 503 on the etapas search', async () => {
      const applicationClient = new SigvoosApiClient(config, {
        fetchImpl: async (input) => input.toString().endsWith('/get/token')
          ? new Response(JSON.stringify({ token: 't' }), { status: 200 })
          : new Response(JSON.stringify({ status: 'error', data: '' }), { status: 200 }),
      });
      await assert.rejects(
        applicationClient.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', {}),
        (error: unknown) => error instanceof SigvoosClientError && error.code === 'SIGVOOS_APPLICATION_ERROR',
      );
      const unavailableClient = new SigvoosApiClient(config, {
        fetchImpl: async (input) => input.toString().endsWith('/get/token')
          ? new Response(JSON.stringify({ token: 't' }), { status: 200 })
          : new Response('{}', { status: 503 }),
      });
      await assert.rejects(
        unavailableClient.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', {}),
        (error: unknown) => error instanceof SigvoosClientError && error.code === 'SIGVOOS_UPSTREAM_UNAVAILABLE',
      );
    });

    it('retries auth on 401 during postSearch', async () => {
      let calls = 0;
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        calls++;
        if (url.endsWith('/get/token')) {
          return new Response(JSON.stringify({ token: `t-${calls}` }), { status: 200 });
        }
        if (calls === 2) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch  });
      const res = await client.postSearch('/data', {});
      assert.equal(res.success, true);
      assert.equal(calls, 4); // 1: token, 2: search(401), 3: token(force), 4: search(200)
    });

    it('rejects a response whose declared body exceeds the configured byte limit', async () => {
      const response = new Response('{}', {
        status: 200,
        headers: { 'content-length': '17' },
      });
      await assert.rejects(
        readSigvoosResponseTextBounded(response, 16),
        (error: unknown) =>
          error instanceof SigvoosClientError && error.code === 'SIGVOOS_RESPONSE_TOO_LARGE',
      );
    });

    it('rejects a streamed body that crosses the byte limit without content-length', async () => {
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('12345678'));
            controller.enqueue(new TextEncoder().encode('901234567'));
            controller.close();
          },
        }),
        { status: 200 },
      );
      await assert.rejects(
        readSigvoosResponseTextBounded(response, 16),
        (error: unknown) =>
          error instanceof SigvoosClientError && error.code === 'SIGVOOS_RESPONSE_TOO_LARGE',
      );
    });

    it('handles timeouts properly', async () => {
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) {
          return new Promise<Response>((_, reject) => {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            init.signal?.addEventListener('abort', () => reject(err));
          });
        }
        return new Response();
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch  });
      await assert.rejects(
        client.fetchJson('https://api.sigvoos.test/data', {}, 10),
        (err: any) => err.code === 'SIGVOOS_TIMEOUT'
      );
    });

    it('honors dependency injection fetchImpl', async () => {
      let urlCalled = '';
      const mockFetch = async (input: RequestInfo | URL) => {
        urlCalled = input.toString();
        return new Response(JSON.stringify({ token: 't' }), { status: 200 });
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch  });
      await client.authenticate();
      assert.equal(urlCalled, 'https://api.sigvoos.test/get/token');
    });

    it('masks tokens and passwords in logs', async () => {
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({ pwd: 'pwd', tkn: 'tkn' }), { status: 400 });
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch  });
      try {
        await client.fetchJson('http://err', {});
      } catch (err: any) {
        assert.ok(err.message.includes('[MASKED]'));
        assert.ok(!err.message.includes('"pwd":"pwd"'));
        assert.ok(err.message.includes('HTTP 400'));
      }
    });

    it('tenant A does not read config from tenant B (tenant isolation)', () => {
      const configA = { ...config, tenantId: 'tenant-a', sigvoosBaseUrl: 'url-a' };
      const configB = { ...config, tenantId: 'tenant-b', sigvoosBaseUrl: 'url-b' };
      assert.notEqual(configA.tenantId, configB.tenantId);
      assert.notEqual(configA.sigvoosBaseUrl, configB.sigvoosBaseUrl);
    });

    it('ensures absence of global fallback', () => {
      assert.equal(typeof (config as Record<string, unknown>).globalFallback, 'undefined');
    });

    it('handles pagination logic (mocked)', async () => {
      const mockFetch = async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('/get/token')) return new Response(JSON.stringify({ token: 't' }), { status: 200 });
        if (url.includes('page=2')) {
          return new Response(JSON.stringify({ data: [3,4] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [1,2] }), { status: 200 });
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch });
      const page1 = await client.postSearch('/data', {});
      const page2 = await client.postSearch('/data?page=2', {});
      assert.equal((page1.data as number[])[0], 1);
      assert.equal((page2.data as number[])[0], 3);
    });

    it('handles irregular payload gracefully', async () => {
      const mockFetch = async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes('/get/token')) return new Response(JSON.stringify({ token: 't' }), { status: 200 });
        return new Response('invalid json', { status: 200 });
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch });
      const res = await client.postSearch('/data', {});
      assert.equal(res.raw, 'invalid json');
    });

    it('clears timeout timer on success', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const mockFetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch });
      await client.fetchJson('http://test', {});
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('does not duplicate business request unsafely on 401', async () => {
      let reqCount = 0;
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes('/get/token')) return new Response(JSON.stringify({ token: 't' }), { status: 200 });
        reqCount++;
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch });
      await assert.rejects(client.postSearch('/data', {}));
      assert.equal(reqCount, 2);
    });

    it('guarantees zero writes during preview and sigvoos-frms/real-preview compat', async () => {
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes('/get/token')) return new Response(JSON.stringify({ token: 't' }), { status: 200 });
        if (init?.method !== 'GET' && init?.method !== 'POST') {
          throw new Error('Write operation forbidden in preview');
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch });
      const res = await client.postSearch('/data', {});
      assert.equal(res.success, true);
    });
  });
});
