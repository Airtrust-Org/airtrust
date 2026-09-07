import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public certificate validation resource bounds', () => {
  it('caps the transitional historical scan', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/certificados/validacao.ts'), 'utf8');
    expect(source).toContain('const CERTIFICATE_SCAN_MAX_ROWS = 1_000');
    expect(source).toContain('while (scanned < CERTIFICATE_SCAN_MAX_ROWS)');
    expect(source).toContain("code: 'CERTIFICATE_VALIDATION_SCAN_LIMIT'");
  });

  it('fails closed when the distributed rate limiter cannot decide', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/middleware/rate-limit.ts'), 'utf8');
    const preset = source.slice(source.indexOf('certificateValidation:'), source.indexOf('} as const;'));
    expect(preset).toContain("failureMode: 'closed'");
    expect(preset).toContain('allowLocalFallback: false');
  });
});
