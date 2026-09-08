import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  decodeURIComponent(new URL('../../routes/simuladores-relatorios.ts', import.meta.url).pathname),
  'utf8',
);

describe('simulator reports dynamic permission wiring', () => {
  it('uses simulator visualizar authority with the existing admin/manager baseline', () => {
    expect(source).toContain("requirePermission('simuladores', 'visualizar', 'admin', 'manager')");
    expect(source).not.toContain("requireRole('admin', 'manager')");
  });
});
