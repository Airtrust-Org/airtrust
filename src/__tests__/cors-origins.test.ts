import { describe, expect, it } from 'vitest';

import {
  DENIED_CORS_ORIGIN,
  isAllowedOrigin,
  parseEnvAllowedOrigins,
  resolveAllowedOrigin,
} from '../../worker-airtrust/src/config/allowed-origins';

const PRODUCTION_ORIGINS = [
  'https://airtrust.online',
  'https://www.airtrust.online',
  'https://airtrust.pages.dev',
  'https://production.airtrust.pages.dev',
].join(',');

const STAGING_ORIGINS = 'https://staging.airtrust.pages.dev';

const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].join(',');

describe('environment-scoped CORS origins', () => {
  it.each([
    'https://airtrust.online',
    'https://www.airtrust.online',
    'https://airtrust.pages.dev',
    'https://production.airtrust.pages.dev',
  ])('allows explicit production origin %s in production only', (origin) => {
    expect(resolveAllowedOrigin(origin, PRODUCTION_ORIGINS)).toBe(origin);
    expect(resolveAllowedOrigin(origin, STAGING_ORIGINS)).toBe(DENIED_CORS_ORIGIN);
  });

  it('allows the official staging origin in staging only', () => {
    const origin = 'https://staging.airtrust.pages.dev';
    expect(resolveAllowedOrigin(origin, STAGING_ORIGINS)).toBe(origin);
    expect(resolveAllowedOrigin(origin, PRODUCTION_ORIGINS)).toBe(DENIED_CORS_ORIGIN);
  });

  it('denies main.airtrust.pages.dev until it is officially approved', () => {
    expect(resolveAllowedOrigin('https://main.airtrust.pages.dev', STAGING_ORIGINS)).toBe(
      DENIED_CORS_ORIGIN,
    );
  });

  it('allows a known preview only when listed exactly', () => {
    const preview = 'https://feature-123.airtrust.pages.dev';
    const stagingWithPreview = `${STAGING_ORIGINS},${preview}`;

    expect(resolveAllowedOrigin(preview, stagingWithPreview)).toBe(preview);
    expect(resolveAllowedOrigin(preview, STAGING_ORIGINS)).toBe(DENIED_CORS_ORIGIN);
    expect(resolveAllowedOrigin(preview, PRODUCTION_ORIGINS)).toBe(DENIED_CORS_ORIGIN);
  });

  it('rejects arbitrary previews and malicious lookalikes', () => {
    expect(
      resolveAllowedOrigin('https://arbitrary.airtrust.pages.dev', STAGING_ORIGINS),
    ).toBe(DENIED_CORS_ORIGIN);
    expect(
      resolveAllowedOrigin('https://airtrust.pages.dev.evil.example', PRODUCTION_ORIGINS),
    ).toBe(DENIED_CORS_ORIGIN);
    expect(resolveAllowedOrigin('https://airtrust-online.example', PRODUCTION_ORIGINS)).toBe(
      DENIED_CORS_ORIGIN,
    );
  });

  it.each(['http://localhost:3000', 'http://127.0.0.1:5173'])(
    'allows local origin %s only when the local environment lists it',
    (origin) => {
      expect(resolveAllowedOrigin(origin, LOCAL_ORIGINS)).toBe(origin);
      expect(resolveAllowedOrigin(origin, PRODUCTION_ORIGINS)).toBe(DENIED_CORS_ORIGIN);
    },
  );

  it('rejects missing and null origins', () => {
    expect(resolveAllowedOrigin(undefined, PRODUCTION_ORIGINS)).toBe(DENIED_CORS_ORIGIN);
    expect(resolveAllowedOrigin(null, PRODUCTION_ORIGINS)).toBe(DENIED_CORS_ORIGIN);
    expect(resolveAllowedOrigin('null', PRODUCTION_ORIGINS)).toBe(DENIED_CORS_ORIGIN);
    expect(isAllowedOrigin('null', PRODUCTION_ORIGINS)).toBe(false);
  });

  it('ignores wildcard and malformed configured origins', () => {
    const parsed = parseEnvAllowedOrigins(
      '*,https://valid.example,https://valid.example/path,ftp://invalid.example,https://valid.example',
    );

    expect(parsed).toEqual(['https://valid.example']);
    expect(resolveAllowedOrigin('https://evil.example', '*')).toBe(DENIED_CORS_ORIGIN);
  });
});
