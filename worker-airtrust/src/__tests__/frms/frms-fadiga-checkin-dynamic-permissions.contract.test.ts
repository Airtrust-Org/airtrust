import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  decodeURIComponent(new URL('../../routes/frms-fadiga-checkin-legacy.ts', import.meta.url).pathname),
  'utf8',
);

describe('FRMS dynamic permission wiring', () => {
  it('governs manager read surfaces with frms/visualizar', () => {
    expect(source.match(/requirePermission\('frms', 'visualizar', 'manager'\)/g)?.length).toBe(4);
  });

  it('governs manager response writes with frms/editar', () => {
    expect(source).toContain("requirePermission('frms', 'editar', 'manager')");
    expect(source).not.toContain("requireRole('manager')");
  });
});
