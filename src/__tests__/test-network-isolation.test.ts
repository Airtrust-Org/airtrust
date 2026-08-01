import { describe, expect, it } from 'vitest';

const REAL_AIRTRUST_URLS = [
  'https://airtrust.online/',
  'https://www.airtrust.online/',
  'https://api.airtrust.online/health',
  'https://airtrust-api-production.airtrust.workers.dev/api/version',
  'https://airtrust-api.airtrust.workers.dev/api/version',
  'https://airtrust-api-staging.airtrust.workers.dev/api/version',
  'https://main.airtrust.pages.dev/',
  'https://preview-123.airtrust.pages.dev/',
] as const;

describe('isolamento de rede dos testes', () => {
  it('usa uma API local fail-closed por padrão', () => {
    const apiUrl = new URL(import.meta.env.VITE_API_URL);

    expect(apiUrl.hostname).toBe('127.0.0.1');
    expect(apiUrl.port).toBe('9');
    expect(apiUrl.pathname).toBe('/api');
  });

  it.each(REAL_AIRTRUST_URLS)('bloqueia chamadas para ambiente AirTrust real: %s', async (url) => {
    await expect(fetch(url)).rejects.toThrow('TEST_NETWORK_BLOCKED');
  });
});
