import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const read = (path: string) =>
  readFileSync(resolve(root, path), 'utf8');

describe('SGSO HFA integration contract', () => {
  it('keeps integration manual, tenant-scoped and secret-safe', () => {
    const route = read('src/routes/sgso-hfa-integration.ts');
    const lib = read('src/lib/hfa-integration.ts');
    const env = read('src/types/index.ts');

    expect(route).toContain("app.post('/relprev/:id/sync'");
    expect(route).toContain('external_tenant_ref: String(empresaId)');
    expect(route).toContain('analysis_started: false');
    expect(route).toContain("requireRole('admin', 'manager')");
    expect(route).not.toContain('console.log(token');
    expect(lib).toContain("AES-GCM");
    expect(lib).toContain('HFA_INTEGRATION_ENCRYPTION_KEY_MISSING');
    expect(env).toContain('HFA_INTEGRATION_ENCRYPTION_KEY?: string');
  });
});
