import { describe, expect, it, vi } from 'vitest';
import * as parameterGovernanceModule from '../../lib/frms/parameter-governance';
import { frmsDailyCheck } from '../../cron/frms-daily-check';
import type { Env } from '../../types';

function createDb(opts: {
  tripulantes: Array<{ id: number; nome: string; empresa_id: number | null }>;
  watermark?: string | null;
}) {
  const db = {
    prepare: (query: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () => {
          if (query.includes('FROM frms_jornada j') && query.includes('LEFT JOIN funcionarios')) {
            return { results: opts.tripulantes };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes("FROM cron_job_state") && query.includes("sigvoos-ingest")) {
            return opts.watermark === undefined ? { watermark_to: '2026-08-01' } : opts.watermark ? { watermark_to: opts.watermark } : null;
          }
          return null;
        },
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;
  return db;
}

describe('frmsDailyCheck — governed alerts (fail-closed per tenant)', () => {
  it('tripulante sem empresa_id: falha fechado para esse tripulante, sem usar LIMITES_DEFAULT, e não derruba o cron inteiro', async () => {
    const resolveSpy = vi.spyOn(parameterGovernanceModule, 'resolveFrmsOperationalContext');
    const db = createDb({
      tripulantes: [{ id: 99, nome: 'Sem Empresa', empresa_id: null }],
    });
    const env = { DB: db } as unknown as Env;

    const result = await frmsDailyCheck(env);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(result.erros).toHaveLength(1);
    expect(result.erros[0]).toMatch(/FRMS_CONTEXT_UNAVAILABLE/);
    expect(result.alertasGerados).toBe(0);
  });

  it('sem watermark SIGVOOS não declara tripulante como processado nem chama governança operacional', async () => {
    const resolveSpy = vi.spyOn(parameterGovernanceModule, 'resolveFrmsOperationalContext');
    const db = createDb({
      tripulantes: [{ id: 7, nome: 'Piloto Sem Watermark', empresa_id: 10 }],
      watermark: null,
    });
    const env = { DB: db } as unknown as Env;

    const result = await frmsDailyCheck(env);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(result.tripulantesEncontrados).toBe(1);
    expect(result.tripulantesProcessados).toBe(0);
    expect(result.semWatermarkSigvoos).toBe(1);
    expect(result.alertasGerados).toBe(0);
  });

  it('sem assignment de perfil FRMS vigente para a empresa: falha fechado e usa o watermark SIGVOOS como data de referência', async () => {
    const resolveSpy = vi.spyOn(parameterGovernanceModule, 'resolveFrmsOperationalContext').mockRejectedValue(
      Object.assign(new Error('Expected exactly one effective FRMS profile assignment for empresa=10.'), {
        code: 'FRMS_CONTEXT_UNAVAILABLE',
      }),
    );
    const db = createDb({
      tripulantes: [{ id: 1, nome: 'Piloto Um', empresa_id: 10 }],
    });
    const env = { DB: db } as unknown as Env;

    const result = await frmsDailyCheck(env);

    expect(resolveSpy).toHaveBeenCalledWith(db, {
      empresaId: 10,
      referenceAt: '2026-08-01',
      funcionarioId: 1,
    });
    expect(result.erros).toHaveLength(1);
    expect(result.erros[0]).toMatch(/FRMS profile assignment/);
    expect(result.alertasGerados).toBe(0);
  });
});
