import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const accessSource = readFileSync(
  decodeURIComponent(new URL('../../middleware/frms-fatigue-checkin-access.ts', import.meta.url).pathname),
  'utf8',
);

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


  it('supports an explicit per-user deny for fatigue check-in writes', () => {
    expect(accessSource).toContain("'frms.checkin'");
    expect(accessSource).toContain('FRMS_CHECKIN_FORBIDDEN');
    expect(source).toContain("router.post('/daily-fatigue', requireFatigueCheckinAccess");
    expect(source).toContain("router.post('/fadiga-checkin', requireFatigueCheckinAccess");
    expect(source).toContain("router.post('/fadiga-checkin/me', requireFatigueCheckinAccess");
  });
});
