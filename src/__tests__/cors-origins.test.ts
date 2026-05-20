import { describe, expect, it } from 'vitest';

import {
  ALLOWED_ORIGINS,
  DEFAULT_ALLOWED_ORIGIN,
  resolveAllowedOrigin,
} from '../../worker-airtrust/src/config/allowed-origins';

describe('allowed origins', () => {
  it('permite localhost e 127.0.0.1 nas portas de desenvolvimento', () => {
    expect(ALLOWED_ORIGINS).toContain('http://localhost:3000');
    expect(ALLOWED_ORIGINS).toContain('http://127.0.0.1:3000');
    expect(ALLOWED_ORIGINS).toContain('http://localhost:4173');
    expect(ALLOWED_ORIGINS).toContain('http://127.0.0.1:4173');
  });

  it('preserva a origem quando ela e permitida', () => {
    expect(resolveAllowedOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('faz fallback para a origem padrao quando a origem nao e permitida', () => {
    expect(resolveAllowedOrigin('https://example.com')).toBe(DEFAULT_ALLOWED_ORIGIN);
    expect(resolveAllowedOrigin(undefined)).toBe(DEFAULT_ALLOWED_ORIGIN);
  });
});