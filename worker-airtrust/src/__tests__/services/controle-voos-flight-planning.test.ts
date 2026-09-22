import { describe, expect, it, vi } from 'vitest';
import {
  parseFlightPlanningInput,
  updateFlightStagePlanningIfSupported,
} from '../../services/controle-voos/flight-planning';

describe('controle de voos — planejamento de peso', () => {
  it('aceita pesos separados de passageiros e bagagem em LB', () => {
    expect(parseFlightPlanningInput({
      pax_planejado: 5,
      peso_passageiros: 900,
      peso_bagagem: 180,
      unidade_peso_planejado: 'LB',
      combustivel_solicitado: 1200,
      unidade_combustivel_solicitado: 'LB',
    })).toEqual({
      paxPlanejado: 5,
      pesoPlanejado: null,
      pesoPassageiros: 900,
      pesoBagagem: 180,
      unidadePesoPlanejado: 'LB',
      combustivelSolicitado: 1200,
      unidadeCombustivelSolicitado: 'LB',
    });
  });

  it('propaga o peso básico exato da aeronave e mantém passageiros/bagagem na primeira etapa', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 2 } });
    const first = vi.fn().mockResolvedValue({ peso_vazio: 4200, unidade_peso: 'KG' });
    const bind = vi.fn((...args: unknown[]) => ({ run, first }));
    const prepare = vi.fn((_sql: string) => ({ bind }));
    const db = { prepare } as unknown as D1Database;

    await updateFlightStagePlanningIfSupported(db, 6, 42, 99, {
      paxPlanejado: 5,
      pesoPlanejado: null,
      pesoPassageiros: 900,
      pesoBagagem: 180,
      unidadePesoPlanejado: 'LB',
      combustivelSolicitado: 1200,
      unidadeCombustivelSolicitado: 'LB',
    });

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(String(prepare.mock.calls[0][0])).toContain('FROM aeronaves');
    expect(String(prepare.mock.calls[1][0])).toContain('peso_passageiros = CASE WHEN numero_etapa = 1');
    expect(String(prepare.mock.calls[1][0])).toContain('peso_vazio = ?');
    expect(String(prepare.mock.calls[1][0])).toContain('empresa_id = ?');
    expect(String(prepare.mock.calls[1][0])).not.toContain('numero_etapa = 1 AND');
    expect(bind).toHaveBeenNthCalledWith(1, 99, 6);
    expect(bind).toHaveBeenNthCalledWith(2, 900, 180, 9259.415, 'LB', 6, 42);
    expect(run).toHaveBeenCalledOnce();
  });

  it('não bloqueia ambiente legado sem colunas de peso da aeronave', async () => {
    const legacyError = new Error('D1_ERROR: no such column: peso_vazio');
    const first = vi.fn().mockRejectedValue(legacyError);
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bind = vi.fn((..._args: unknown[]) => ({ first, run }));
    const prepare = vi.fn((_sql: string) => ({ bind }));
    const db = { prepare } as unknown as D1Database;

    await expect(
      updateFlightStagePlanningIfSupported(db, 6, 42, 99, {
        paxPlanejado: 5,
        pesoPlanejado: null,
        pesoPassageiros: null,
        pesoBagagem: null,
        unidadePesoPlanejado: 'LB',
        combustivelSolicitado: null,
        unidadeCombustivelSolicitado: 'LB',
      }),
    ).resolves.toBeUndefined();
  });
});
