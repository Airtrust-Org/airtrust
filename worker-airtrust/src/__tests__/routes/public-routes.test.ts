import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { registerPublicRoutes } from '../../routes/public-routes';

function createPublicApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  registerPublicRoutes(app);
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('public routes extraction', () => {
  it('mantém GET /api/public/locale com status e payload esperados', async () => {
    const app = createPublicApp();
    const response = await app.request('/api/public/locale', {
      headers: { 'CF-IPCountry': 'BR' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Origin');
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        country: 'BR',
        language: 'pt-BR',
      },
    });
  });

  it('mantém POST /api/public/translate com 400 sem text', async () => {
    const app = createPublicApp();
    const response = await app.request('/api/public/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'text is required',
    });
  });

  it('preserva fallback quando from == to', async () => {
    const app = createPublicApp();
    const response = await app.request('/api/public/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Teste', from: 'pt', to: 'pt' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        translatedText: 'Teste',
        source: 'pt',
        target: 'pt',
      },
    });
  });

  it('faz fallback com status 200 quando provider responde não-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      }),
    );

    const app = createPublicApp();
    const response = await app.request('/api/public/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Olá', from: 'pt', to: 'en' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        translatedText: 'Olá',
        source: 'pt',
        target: 'en',
        fallback: true,
      },
    });
  });

  it('faz fallback com status 200 quando fetch dispara erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network connection timeout')),
    );

    const app = createPublicApp();
    const response = await app.request('/api/public/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Funcionários', from: 'pt', to: 'en' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        translatedText: 'Funcionários',
        source: 'pt',
        target: 'en',
        fallback: true,
      },
    });
  });

  it('mantém sucesso quando provider responde payload válido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [[['Hello', 'Olá']]],
      }),
    );

    const app = createPublicApp();
    const response = await app.request('/api/public/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Olá', from: 'pt', to: 'en' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        translatedText: 'Hello',
        source: 'pt',
        target: 'en',
      },
    });
  });

  it('limita o proxy público de tradução por IP', async () => {
    const app = createPublicApp();
    const headers = {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.77',
    };
    const body = JSON.stringify({ text: 'Teste', from: 'pt', to: 'pt' });

    for (let requestNumber = 1; requestNumber <= 20; requestNumber += 1) {
      const response = await app.request('/api/public/translate', {
        method: 'POST',
        headers,
        body,
      });
      expect(response.status).toBe(200);
    }

    const blocked = await app.request('/api/public/translate', {
      method: 'POST',
      headers,
      body,
    });

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('x-ratelimit-limit')).toBe('20');
    expect(blocked.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(blocked.headers.get('retry-after')).toBe('60');
    await expect(blocked.json()).resolves.toMatchObject({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60,
    });
  });
});
