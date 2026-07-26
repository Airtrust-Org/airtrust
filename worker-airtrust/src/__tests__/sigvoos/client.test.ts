import { strict as assert } from 'node:assert';
import {
  SigvoosApiClient,
  resolveSigvoosEncryptionSecret,
  encryptSigvoosPassword,
  decryptSigvoosPassword,
  SigvoosClientError,
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
      const mockFetch = async (url: string, init?: RequestInit) => {
        callCount++;
        return new Response(JSON.stringify({ accessToken: 'token-123' }), { status: 200 });
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch as any });
      const t1 = await client.authenticate();
      const t2 = await client.authenticate(); // should use cache
      
      assert.equal(t1, 'token-123');
      assert.equal(t1, t2);
      assert.equal(callCount, 1);
    });

    it('retries auth on 401 during postSearch', async () => {
      let calls = 0;
      const mockFetch = async (url: string, init?: RequestInit) => {
        calls++;
        if (url.endsWith('/get/token')) {
          return new Response(JSON.stringify({ token: `t-${calls}` }), { status: 200 });
        }
        if (calls === 2) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };
      
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch as any });
      const res = await client.postSearch('/data', {});
      assert.equal(res.success, true);
      assert.equal(calls, 4); // 1: token, 2: search(401), 3: token(force), 4: search(200)
    });

    it('handles timeouts properly', async () => {
      const mockFetch = async (url: string, init?: RequestInit) => {
        if (init?.signal) {
          return new Promise<Response>((_, reject) => {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            init.signal?.addEventListener('abort', () => reject(err));
          });
        }
        return new Response();
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch as any });
      await assert.rejects(
        client.fetchJson('https://api.sigvoos.test/data', {}, 10),
        (err: any) => err.code === 'SIGVOOS_TIMEOUT'
      );
    });

    it('honors dependency injection fetchImpl', async () => {
      let urlCalled = '';
      const mockFetch = async (url: string) => {
        urlCalled = url;
        return new Response(JSON.stringify({ token: 't' }), { status: 200 });
      };
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch as any });
      await client.authenticate();
      assert.equal(urlCalled, 'https://api.sigvoos.test/get/token');
    });

    it('masks tokens and passwords in logs', async () => {
      const mockFetch = async () => new Response(JSON.stringify({ pwd: 'pwd', tkn: 'tkn' }), { status: 400 });
      const client = new SigvoosApiClient(config, { fetchImpl: mockFetch as any });
      try {
        await client.fetchJson('http://err', {});
      } catch (err: any) {
        assert.ok(err.message.includes('[MASKED]'));
        assert.ok(!err.message.includes('"pwd":"pwd"'));
        assert.ok(err.message.includes('HTTP 400'));
      }
    });
  });
});
