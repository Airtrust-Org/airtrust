import { describe, expect, it } from 'vitest';
import {
  ApiEnvironmentConfigurationError,
  PRODUCTION_API_BASE_URL,
  STAGING_API_BASE_URL,
  resolveApiBase,
} from '../config/api-environment';

describe('resolveApiBase environment isolation', () => {
  it.each([
    ['airtrust.online', 'https://airtrust.online'],
    ['www.airtrust.online', 'https://www.airtrust.online'],
    ['airtrust.pages.dev', 'https://airtrust.pages.dev'],
    ['production.airtrust.pages.dev', 'https://production.airtrust.pages.dev'],
  ])('routes official production host %s only to production', (host, origin) => {
    expect(resolveApiBase({ host, origin, envUrl: '' })).toBe(PRODUCTION_API_BASE_URL);
    expect(() => resolveApiBase({ host, origin, envUrl: STAGING_API_BASE_URL })).toThrow(
      ApiEnvironmentConfigurationError,
    );
  });

  it('routes the official staging host only to staging', () => {
    const host = 'staging.airtrust.pages.dev';
    const origin = `https://${host}`;
    expect(resolveApiBase({ host, origin, envUrl: '' })).toBe(STAGING_API_BASE_URL);
    expect(() => resolveApiBase({ host, origin, envUrl: PRODUCTION_API_BASE_URL })).toThrow(
      ApiEnvironmentConfigurationError,
    );
  });

  it('fails closed for the ambiguous main.airtrust.pages.dev host', () => {
    expect(() =>
      resolveApiBase({
        host: 'main.airtrust.pages.dev',
        origin: 'https://main.airtrust.pages.dev',
        envUrl: STAGING_API_BASE_URL,
      }),
    ).toThrow(/ambiguous and is not an approved environment/);
  });

  it('allows an explicitly configured Pages preview to use staging', () => {
    expect(
      resolveApiBase({
        host: 'feature-123.airtrust.pages.dev',
        origin: 'https://feature-123.airtrust.pages.dev',
        envUrl: STAGING_API_BASE_URL,
      }),
    ).toBe(STAGING_API_BASE_URL);
  });

  it('fails closed for an arbitrary Pages preview without VITE_API_URL', () => {
    expect(() =>
      resolveApiBase({
        host: 'unreviewed-preview.airtrust.pages.dev',
        origin: 'https://unreviewed-preview.airtrust.pages.dev',
        envUrl: '',
      }),
    ).toThrow(/requires VITE_API_URL/);
  });

  it('blocks every Pages preview from the production API', () => {
    expect(() =>
      resolveApiBase({
        host: 'feature-123.airtrust.pages.dev',
        origin: 'https://feature-123.airtrust.pages.dev',
        envUrl: PRODUCTION_API_BASE_URL,
      }),
    ).toThrow(/may only use the staging API/);
  });

  it.each([
    ['localhost', 'http://localhost:3000'],
    ['127.0.0.1', 'http://127.0.0.1:5173'],
  ])('keeps %s on the same-origin local proxy', (host, origin) => {
    expect(resolveApiBase({ host, origin, envUrl: PRODUCTION_API_BASE_URL })).toBe(
      `${origin}/api`,
    );
  });

  it('requires an explicit API for an unknown custom host', () => {
    expect(() =>
      resolveApiBase({
        host: 'custom.example.test',
        origin: 'https://custom.example.test',
        envUrl: '',
      }),
    ).toThrow(/Unknown frontend host/);

    expect(
      resolveApiBase({
        host: 'custom.example.test',
        origin: 'https://custom.example.test',
        envUrl: 'https://custom-api.example.test/api/',
      }),
    ).toBe('https://custom-api.example.test/api');
  });

  it('blocks a malicious lookalike host from production', () => {
    expect(() =>
      resolveApiBase({
        host: 'airtrust.pages.dev.evil.example',
        origin: 'https://airtrust.pages.dev.evil.example',
        envUrl: PRODUCTION_API_BASE_URL,
      }),
    ).toThrow(/not authorized to use the production API/);
  });

  it('rejects invalid or insecure remote VITE_API_URL values', () => {
    expect(() =>
      resolveApiBase({
        host: 'custom.example.test',
        origin: 'https://custom.example.test',
        envUrl: 'not-a-url',
      }),
    ).toThrow(/valid absolute URL/);

    expect(() =>
      resolveApiBase({
        host: 'custom.example.test',
        origin: 'https://custom.example.test',
        envUrl: 'http://custom-api.example.test/api',
      }),
    ).toThrow(/must use HTTPS/);
  });
});
