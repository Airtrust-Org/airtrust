import { describe, expect, it, vi } from 'vitest';

import { runFrmsIogpShadowForJornada } from '../../lib/frms/frms-iogp-shadow-caller';

describe('FRMS IOGP shadow caller feature gate', () => {
  it('does not issue any SQL, REDEMET request, or canonical mutation when feature is OFF', async () => {
    // Pass the already tenant-scoped queue value: the gate must return before
    // looking up CV legs, the 0463 tables, or any other shadow dependency.
    const prepare = vi.fn();
    const db = { prepare } as never;
    const canonical = {
      fatorizacao: { effectiveness_nivel: 'verde', effectiveness_pct: 100 },
      acumulo: {
        hv_dia_min: 120,
        hv_7_dias_min: 600,
        hv_28_dias_min: 1200,
        hv_365_dias_min: 6000,
      },
    };

    await expect(
      runFrmsIogpShadowForJornada(
        db,
        {
          id: 'j-off',
          tripulante_id: 42,
          data: '2026-08-20',
          status: 'ES',
          origem: 'SIGVOOS',
        },
        canonical,
        { ENVIRONMENT: 'staging' },
        6,
      ),
    ).resolves.toBeNull();

    expect(prepare).not.toHaveBeenCalled();
    expect(canonical).toEqual({
      fatorizacao: { effectiveness_nivel: 'verde', effectiveness_pct: 100 },
      acumulo: {
        hv_dia_min: 120,
        hv_7_dias_min: 600,
        hv_28_dias_min: 1200,
        hv_365_dias_min: 6000,
      },
    });
  });
});
