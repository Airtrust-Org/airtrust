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

  it('persiste os pesos separados apenas na primeira etapa e dentro do tenant', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));
    const db = { prepare } as unknown as D1Database;

    await updateFlightStagePlanningIfSupported(db, 6, 42, {
      paxPlanejado: 5,
      pesoPlanejado: null,
      pesoPassageiros: 900,
      pesoBagagem: 180,
      unidadePesoPlanejado: 'LB',
      combustivelSolicitado: 1200,
      unidadeCombustivelSolicitado: 'LB',
    });

    expect(prepare).toHaveBeenCalledOnce();
    expect(String(prepare.mock.calls[0][0])).toContain('peso_passageiros = ?');
    expect(String(prepare.mock.calls[0][0])).toContain('peso_bagagem = ?');
    expect(String(prepare.mock.calls[0][0])).toContain('empresa_id = ?');
    expect(String(prepare.mock.calls[0][0])).toContain('numero_etapa = 1');
    expect(bind).toHaveBeenCalledWith(900, 180, 'LB', 6, 42);
    expect(run).toHaveBeenCalledOnce();
  });
});
