import { afterEach, describe, expect, it, vi } from 'vitest';
import httpClient, { safeHttpClientErrorMessage } from '../http-client';

describe('safeHttpClientErrorMessage', () => {
  it('preserves useful business feedback', () => {
    expect(
      safeHttpClientErrorMessage('Qualificação já cadastrada para este período.', 400),
    ).toBe('Qualificação já cadastrada para este período.');
  });

  it('replaces technical client errors with a generic safe message', () => {
    expect(
      safeHttpClientErrorMessage(
        'SQLITE_ERROR: no such column: qualificacoes.secret_token',
        400,
      ),
    ).toBe('Não foi possível concluir a operação.');
  });

  it('uses status-specific safe fallbacks for technical server and permission errors', () => {
    expect(
      safeHttpClientErrorMessage('D1_ERROR: database unavailable', 500),
    ).toBe('O servidor não conseguiu concluir a operação.');

    expect(
      safeHttpClientErrorMessage('SQLSTATE permission lookup failed', 403),
    ).toBe('Você não tem permissão para executar esta ação.');
  });

  it('never exposes transport details after retries are exhausted', () => {
    expect(
      safeHttpClientErrorMessage('TypeError: Failed to fetch', 'NETWORK_ERROR'),
    ).toBe('Falha de rede. Verifique sua conexão e tente novamente.');
  });
});

describe('httpClient CORS preflight hygiene (PERF-07)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('omits non-CORS-safelisted cache-bypass headers on default GET requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await httpClient.get('/health', { skipRequestControl: true, retry: 0 });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.cache).toBe('no-store');
    const headers = (init?.headers || {}) as Record<string, string>;
    expect(headers['Cache-Control']).toBeUndefined();
    expect(headers.Pragma).toBeUndefined();
    expect(headers['X-AirTrust-Bypass-Cache']).toBeUndefined();
  });
});
