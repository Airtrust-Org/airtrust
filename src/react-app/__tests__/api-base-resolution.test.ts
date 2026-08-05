import { describe, expect, it } from 'vitest';
import {
  ApiEnvironmentConfigurationError,
  PRODUCTION_API_BASE_URL,
  STAGING_API_BASE_URL,
  resolveApiBase,
} from '../config/api-environment';

type ApiBaseInput = Parameters<typeof resolveApiBase>[0];

function expectResolution(input: ApiBaseInput, expected: string): void {
  expect(resolveApiBase(input)).toBe(expected);
}

function expectConfigurationError(input: ApiBaseInput, expected: RegExp): void {
  expect(() => resolveApiBase(input)).toThrow(expected);
}

describe('resolveApiBase environment isolation', () => {
  it('routes official production hosts only to production', () => {
    const productionHosts = [
      ['airtrust.online', 'https://airtrust.online'],
      ['www.airtrust.online', 'https://www.airtrust.online'],
      ['airtrust.pages.dev', 'https://airtrust.pages.dev'],
      ['production.airtrust.pages.dev', 'https://production.airtrust.pages.dev'],
    ] as const;

    for (const [host, origin] of productionHosts) {
      expectResolution({ host, origin, envUrl: '' }, PRODUCTION_API_BASE_URL);
      expect(() =>
        resolveApiBase({ host, origin, envUrl: STAGING_API_BASE_URL }),
      ).toThrow(ApiEnvironmentConfigurationError);
    }
  });

  it('routes the official staging host only to staging', () => {
    const host = 'staging.airtrust.pages.dev';
    const origin = `https://${host}`;

    expectResolution({ host, origin, envUrl: '' }, STAGING_API_BASE_URL);
    expect(() =>
      resolveApiBase({ host, origin, envUrl: PRODUCTION_API_BASE_URL }),
    ).toThrow(ApiEnvironmentConfigurationError);
  });

  it('fails closed for the ambiguous main.airtrust.pages.dev host', () => {
    expectConfigurationError(
      {
        host: 'main.airtrust.pages.dev',
        origin: 'https://main.airtrust.pages.dev',
        envUrl: STAGING_API_BASE_URL,
      },
      /ambiguous and is not an approved environment/,
    );
  });

  it('allows an explicitly configured Pages preview to use staging', () => {
    expectResolution(
      {
        host: 'feature-123.airtrust.pages.dev',
        origin: 'https://feature-123.airtrust.pages.dev',
        envUrl: STAGING_API_BASE_URL,
      },
      STAGING_API_BASE_URL,
    );
  });

  it('fails closed for an arbitrary Pages preview without VITE_API_URL', () => {
    expectConfigurationError(
      {
        host: 'unreviewed-preview.airtrust.pages.dev',
        origin: 'https://unreviewed-preview.airtrust.pages.dev',
        envUrl: '',
      },
      /requires VITE_API_URL/,
    );
  });

  it('blocks every Pages preview from the production API', () => {
    expectConfigurationError(
      {
        host: 'feature-123.airtrust.pages.dev',
        origin: 'https://feature-123.airtrust.pages.dev',
        envUrl: PRODUCTION_API_BASE_URL,
      },
      /may only use the staging API/,
    );
  });

  it('keeps localhost and 127.0.0.1 on the same-origin proxy', () => {
    const localHosts = [
      ['localhost', 'http://localhost:3000'],
      ['127.0.0.1', 'http://127.0.0.1:5173'],
    ] as const;

    for (const [host, origin] of localHosts) {
      expectResolution(
        { host, origin, envUrl: PRODUCTION_API_BASE_URL },
        `${origin}/api`,
      );
    }
  });

  it('requires an explicit API for an unknown custom host', () => {
    expectConfigurationError(
      {
        host: 'custom.example.test',
        origin: 'https://custom.example.test',
        envUrl: '',
      },
      /Unknown frontend host/,
    );

    expectResolution(
      {
        host: 'custom.example.test',
        origin: 'https://custom.example.test',
        envUrl: 'https://custom-api.example.test/api/',
      },
      'https://custom-api.example.test/api',
    );
  });

  it('blocks a malicious lookalike host from production', () => {
    expectConfigurationError(
      {
        host: 'airtrust.pages.dev.evil.example',
        origin: 'https://airtrust.pages.dev.evil.example',
        envUrl: PRODUCTION_API_BASE_URL,
      },
      /not authorized to use the production API/,
    );
  });

  it('rejects invalid or insecure remote VITE_API_URL values', () => {
    expectConfigurationError(
      {
        host: 'custom.example.test',
        origin: 'https://custom.example.test',
        envUrl: 'not-a-url',
      },
      /valid absolute URL/,
    );

    expectConfigurationError(
      {
        host: 'custom.example.test',
        origin: 'https://custom.example.test',
        envUrl: 'http://custom-api.example.test/api',
      },
      /must use HTTPS/,
    );
  });
});
