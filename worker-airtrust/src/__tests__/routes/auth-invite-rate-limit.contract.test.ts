import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public invite rate-limit contract', () => {
  it('fails closed around validation and acceptance in production', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/auth.ts'), 'utf8');

    expect(source).toContain("keyPrefix: 'auth-invite-validate'");
    expect(source).toContain("keyPrefix: 'auth-invite-accept'");
    expect(source).toContain("failureMode: 'closed'");
    expect(source).toContain('allowLocalFallback: false');
    expect(source).toContain('allowLocalFallbackOutsideProduction: true');

    const validate = source.indexOf("'/invite/validate'");
    const validateLimiter = source.indexOf("keyPrefix: 'auth-invite-validate'");
    const accept = source.indexOf("'/invite/accept'");
    const acceptLimiter = source.indexOf("keyPrefix: 'auth-invite-accept'");
    expect(validateLimiter).toBeGreaterThan(validate);
    expect(accept).toBeGreaterThan(validateLimiter);
    expect(acceptLimiter).toBeGreaterThan(accept);
  });
});
