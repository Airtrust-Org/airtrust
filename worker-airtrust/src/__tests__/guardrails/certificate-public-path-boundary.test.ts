import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public certificate auth-boundary prefix', () => {
  const source = readFileSync('src/index.ts', 'utf8');

  it('whitelists only the validation root or descendants separated by slash', () => {
    expect(source).toContain("pathname === '/api/certificados/validar'");
    expect(source).toContain("pathname.startsWith('/api/certificados/validar/')");
    expect(source).not.toContain("pathname.startsWith('/api/certificados/validar') ||");
  });
});
