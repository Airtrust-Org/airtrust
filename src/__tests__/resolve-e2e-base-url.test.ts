import { describe, expect, it } from 'vitest';
import { resolveE2EBaseUrl } from '../../e2e/config/resolve-base-url';

describe('resolveE2EBaseUrl', () => {
  it('allows the canonical staging Pages branch without production override', () => {
    expect(resolveE2EBaseUrl({ BASE_URL: 'https://staging.airtrust.pages.dev' })).toBe(
      'https://staging.airtrust.pages.dev',
    );
  });

  it('continues to block production without an explicit override', () => {
    expect(() => resolveE2EBaseUrl({ BASE_URL: 'https://airtrust.online' })).toThrow(
      'E2E contra produção exige E2E_ALLOW_PRODUCTION=true de forma explícita',
    );
  });

  it('does not silently classify arbitrary Pages previews as staging', () => {
    expect(() => resolveE2EBaseUrl({ BASE_URL: 'https://feature.airtrust.pages.dev' })).toThrow(
      'E2E contra produção exige E2E_ALLOW_PRODUCTION=true de forma explícita',
    );
  });
});
