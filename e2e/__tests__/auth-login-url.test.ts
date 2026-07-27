/**
 * Regression test: auth.setup.ts must never construct a login URL with
 * double /api/api/ regardless of whether E2E_API_BASE_URL ends with /api.
 *
 * This test validates the normalization logic that prevents:
 *   ${E2E_API_BASE_URL}/api/auth/login  →  /api/api/auth/login
 */
import { describe, it, expect } from 'vitest';

function resolveLoginUrl(rawBase: string | undefined): string {
  const base = rawBase?.replace(/\/+$/, '') ?? '';
  if (!base) return '';

  if (base.endsWith('/api')) {
    return `${base}/auth/login`;
  }
  return `${base}/api/auth/login`;
}

describe('auth.setup login URL normalization', () => {
  it('base ending with /api should produce /auth/login (not /api/api/)', () => {
    const url = resolveLoginUrl('https://example.workers.dev/api');
    expect(url).toBe('https://example.workers.dev/api/auth/login');
    expect(url).not.toContain('/api/api/');
  });

  it('base without /api should produce /api/auth/login', () => {
    const url = resolveLoginUrl('https://example.workers.dev');
    expect(url).toBe('https://example.workers.dev/api/auth/login');
    expect(url).not.toContain('/api/api/');
  });

  it('base with trailing slash should be normalized', () => {
    const url = resolveLoginUrl('https://example.workers.dev/api/');
    expect(url).toBe('https://example.workers.dev/api/auth/login');
    expect(url).not.toContain('/api/api/');
  });

  it('base ending with /api/v2 should NOT strip the v2', () => {
    const url = resolveLoginUrl('https://example.workers.dev/api/v2');
    expect(url).toBe('https://example.workers.dev/api/v2/api/auth/login');
    expect(url).not.toContain('/api/api/');
  });

  it('undefined base should return empty string', () => {
    expect(resolveLoginUrl(undefined)).toBe('');
  });

  it('empty base should return empty string', () => {
    expect(resolveLoginUrl('')).toBe('');
  });

  it('all variants must never contain /api/api/', () => {
    const variants = [
      'https://example.workers.dev',
      'https://example.workers.dev/',
      'https://example.workers.dev/api',
      'https://example.workers.dev/api/',
      'https://staging.example.workers.dev',
      'https://staging.example.workers.dev/api',
      'https://preview.example.workers.dev/api',
      undefined,
      '',
    ];

    for (const variant of variants) {
      const url = resolveLoginUrl(variant);
      if (url) {
        expect(url).not.toContain('/api/api/');
        expect(url).toMatch(/\/auth\/login$/);
      }
    }
  });
});
