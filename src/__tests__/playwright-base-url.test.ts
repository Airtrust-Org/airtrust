import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveE2EBaseUrl } from '../../e2e/config/resolve-base-url';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('resolveE2EBaseUrl', () => {
  it('defaults to a loopback URL', () => {
    expect(resolveE2EBaseUrl({})).toBe('http://127.0.0.1:5173');
    expect(resolveE2EBaseUrl({ BASE_URL: '   ' })).toBe('http://127.0.0.1:5173');
  });

  it.each([
    'https://main.airtrust.pages.dev/',
    'https://airtrust-api-staging.airtrust.workers.dev/',
  ])('accepts an explicitly configured staging URL: %s', (baseUrl) => {
    expect(resolveE2EBaseUrl({ BASE_URL: baseUrl })).toBe(baseUrl.replace(/\/$/, ''));
  });

  it.each([
    'https://airtrust.online',
    'https://www.airtrust.online',
    'https://api.airtrust.online',
    'https://airtrust-api-production.airtrust.workers.dev',
    'https://airtrust-api.airtrust.workers.dev',
    'https://airtrust.pages.dev',
    'https://production.airtrust.pages.dev',
    'https://preview.airtrust.pages.dev',
  ])('blocks an official production host without explicit confirmation: %s', (baseUrl) => {
    expect(() => resolveE2EBaseUrl({ BASE_URL: baseUrl })).toThrow(
      'E2E contra produção exige E2E_ALLOW_PRODUCTION=true',
    );
  });

  it('blocks production hosts case-insensitively even with a path and port', () => {
    expect(() =>
      resolveE2EBaseUrl({ BASE_URL: 'https://API.AIRTRUST.ONLINE:443/api/health' }),
    ).toThrow('E2E contra produção exige E2E_ALLOW_PRODUCTION=true');
  });

  it('allows production only with explicit confirmation', () => {
    expect(
      resolveE2EBaseUrl({
        BASE_URL: 'https://airtrust.online',
        E2E_ALLOW_PRODUCTION: 'true',
      }),
    ).toBe('https://airtrust.online');
  });

  it('rejects unsupported protocols', () => {
    expect(() => resolveE2EBaseUrl({ BASE_URL: 'file:///tmp/e2e' })).toThrow(
      'BASE_URL de E2E deve usar protocolo HTTP ou HTTPS',
    );
  });

  it('rejects credentials embedded in the URL', () => {
    expect(() => resolveE2EBaseUrl({ BASE_URL: 'https://placeholder@example.test' })).toThrow(
      'BASE_URL de E2E não pode conter credenciais',
    );
  });

  it('keeps environment-based resolution local without opening a browser', () => {
    vi.stubEnv('BASE_URL', '');
    vi.stubEnv('E2E_ALLOW_PRODUCTION', '');

    expect(resolveE2EBaseUrl(process.env)).toBe('http://127.0.0.1:5173');
  });
});
