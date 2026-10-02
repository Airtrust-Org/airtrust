import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.example.test/api',
  getAccessToken: () => 'token-test',
}));

import { api } from '@/react-app/utils/api-client';

describe('ApiClient getBlob', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('preserva autenticação e aceita POST para PDFs gerados sob demanda', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['%PDF-test'], { type: 'application/pdf' }), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );

    const blob = await api.getBlob('/simuladores/fichas/91/pdf', {
      method: 'POST',
      headers: { 'X-AirTrust-Test': '1' },
    });

    expect(blob.type).toBe('application/pdf');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.test/api/simuladores/fichas/91/pdf');
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-test');
    expect(headers.get('X-AirTrust-Test')).toBe('1');
  });
});
