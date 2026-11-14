import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PERF-04 Sistema readiness contract', () => {
  it('shows fast D1 status without treating untested R2 as healthy', () => {
    const src = readFileSync('src/react-app/pages/Sistema.tsx', 'utf8');
    expect(src).toContain("'/api/health?depth=light'");
    expect(src).toContain('enabled: deepRequested');
    expect(src).toContain('Verificação completa (D1 + R2)');
    expect(src).toContain("check.status === 'not_checked'");
    expect(src).toContain('deepError');
  });
});
