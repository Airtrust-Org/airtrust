import { describe, expect, it, vi } from 'vitest';
import {
  applyAircraftBasicWeightToFlightStages,
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
      pesoCarga: null,
      unidadePesoPlanejado: 'LB',
      combustivelSolicitado: 1200,
      unidadeCombustivelSolicitado: 'LB',
    });
  });

  it('propaga o peso básico exato da aeronave e mantém passageiros/bagagem na primeira etapa', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 2 } });
    const first = vi.fn().mockResolvedValue({ peso_vazio: 4200, unidade_peso: 'KG' });
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bind = vi.fn((...args: unknown[]) => ({ run, first, all }));
    const prepare = vi.fn((_sql: string) => ({ bind }));
    const db = { prepare } as unknown as D1Database;

    await updateFlightStagePlanningIfSupported(db, 6, 42, 99, {
      paxPlanejado: 5,
      pesoPlanejado: null,
      pesoPassageiros: 900,
      pesoBagagem: 180,
      pesoCarga: null,
      unidadePesoPlanejado: 'LB',
      combustivelSolicitado: 1200,
      unidadeCombustivelSolicitado: 'LB',
    });

    expect(prepare).toHaveBeenCalledTimes(4);
    expect(String(prepare.mock.calls[0][0])).toContain('FROM aeronaves');
    expect(String(prepare.mock.calls[1][0])).toContain('FROM cv_voo_etapas');
    expect(String(prepare.mock.calls[2][0])).toContain('peso_passageiros = CASE WHEN numero_etapa = 1 AND ? IS NOT NULL');
    expect(String(prepare.mock.calls[2][0])).toContain('peso_vazio = COALESCE(?, peso_vazio)');
    expect(String(prepare.mock.calls[2][0])).toContain('empresa_id = ?');
    expect(bind).toHaveBeenNthCalledWith(1, 99, 6);
    expect(bind).toHaveBeenNthCalledWith(2, 6, 42);
    expect(bind).toHaveBeenNthCalledWith(3, 5, 5, 900, 900, 180, 180, null, null,
      9259.415, 9259.415, 'LB', 6, 42);
    expect(bind).toHaveBeenNthCalledWith(4, 6, 42);
    expect(run).toHaveBeenCalledOnce();
  });

  it('recalcula o total das etapas do voo criado pelo piloto após propagar o peso básico', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 2 } });
    const first = vi.fn().mockResolvedValue({ peso_vazio: 4200, unidade_peso: 'KG' });
    const all = vi.fn().mockResolvedValue({
      results: [
        {
          id: 101, payload: 100, combustivel_inicio: 300, unidade_combustivel: 'LB',
          peso_vazio: 9259.415, peso_tripulacao: 400,
          peso_passageiros: 900, peso_bagagem: 180, unidade_peso: 'LB',
        },
        {
          id: 102, payload: null, combustivel_inicio: null, unidade_combustivel: null,
          peso_vazio: 9259.415, peso_tripulacao: null,
          peso_passageiros: null, peso_bagagem: null, unidade_peso: 'LB',
        },
      ],
    });
    const bind = vi.fn((..._args: unknown[]) => ({ run, first, all }));
    const prepare = vi.fn((_sql: string) => ({ bind }));
    const batch = vi.fn().mockResolvedValue([]);
    const db = { prepare, batch } as unknown as D1Database;

    await applyAircraftBasicWeightToFlightStages(db, 6, 42, 99);

    expect(String(prepare.mock.calls[0][0])).toContain('FROM aeronaves');
    expect(String(prepare.mock.calls[1][0])).toContain('SELECT unidade_peso, peso_tripulacao');
    expect(String(prepare.mock.calls[2][0])).toContain('SET peso_vazio = ?');
    expect(bind).toHaveBeenCalledWith(9259.415, 'LB', 6, 42);
    expect(String(prepare.mock.calls[3][0])).toContain('FROM cv_voo_etapas');
    expect(bind).toHaveBeenCalledWith(6, 42);
    expect(bind).toHaveBeenCalledWith(11259.877, 101, 42, 6);
    expect(bind).toHaveBeenCalledWith(9259.415, 102, 42, 6);
    expect(batch).toHaveBeenCalledOnce();
    expect(batch.mock.calls[0][0]).toHaveLength(2);
  });


  it('preserva o peso e a unidade certificados ao alterar somente PAX sem peso básico no cadastro', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const first = vi.fn().mockResolvedValue({ peso_vazio: null, unidade_peso: null });
    const prepare = vi.fn((_sql: string) => ({ bind: vi.fn(() => ({ first, run })) }));
    const db = { prepare } as unknown as D1Database;
    await updateFlightStagePlanningIfSupported(db, 6, 42, 99, {
      paxPlanejado: 5, pesoPlanejado: null, pesoPassageiros: null,
      pesoBagagem: null, pesoCarga: null, unidadePesoPlanejado: 'KG',
      combustivelSolicitado: null, unidadeCombustivelSolicitado: 'LB',
    });
    expect(prepare).toHaveBeenCalledTimes(2);
    const sql = String(prepare.mock.calls[1][0]);
    expect(sql).toContain('SET pax = ?');
    expect(sql).not.toMatch(/peso_vazio|unidade_peso|peso_total/);
    expect(run).toHaveBeenCalledOnce();
  });

  it('rejeita planejamento em KG quando a etapa possui pesos certificados em LB antes de escrever', async () => {
    const run = vi.fn();
    const first = vi.fn().mockResolvedValue({ peso_vazio: null, unidade_peso: null });
    const all = vi.fn().mockResolvedValue({ results: [{
      unidade_peso: 'LB', peso_vazio: 8800,
      peso_tripulacao: 350, peso_passageiros: 800, peso_bagagem: 150,
    }] });
    const prepare = vi.fn((_sql: string) => ({ bind: vi.fn(() => ({ first, all, run })) }));
    const db = { prepare } as unknown as D1Database;
    await expect(updateFlightStagePlanningIfSupported(db, 6, 42, 99, {
      paxPlanejado: null, pesoPlanejado: null, pesoPassageiros: 500,
      pesoBagagem: null, pesoCarga: null, unidadePesoPlanejado: 'KG',
      combustivelSolicitado: null, unidadeCombustivelSolicitado: 'KG',
    })).rejects.toMatchObject({
      statusCode: 409, code: 'CONTROLE_VOOS_WEIGHT_UNIT_MISMATCH',
    });
    expect(run).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('preserva campos ausentes e a unidade LB quando atualização de peso usa a mesma unidade', async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const first = vi.fn().mockResolvedValue({ peso_vazio: null, unidade_peso: null });
    const all = vi.fn()
      .mockResolvedValueOnce({ results: [{
        unidade_peso: 'LB', peso_vazio: 8800,
        peso_tripulacao: 350, peso_passageiros: 800, peso_bagagem: 150,
      }] })
      .mockResolvedValueOnce({ results: [] });
    const prepare = vi.fn((_sql: string) => ({ bind: vi.fn(() => ({ first, all, run })) }));
    const db = { prepare } as unknown as D1Database;
    await updateFlightStagePlanningIfSupported(db, 6, 42, 99, {
      paxPlanejado: null, pesoPlanejado: null, pesoPassageiros: 900,
      pesoBagagem: null, pesoCarga: null, unidadePesoPlanejado: 'LB',
      combustivelSolicitado: null, unidadeCombustivelSolicitado: 'LB',
    });
    expect(run).toHaveBeenCalledOnce();
    const sql = String(prepare.mock.calls[2][0]);
    expect(sql).toContain('peso_vazio = COALESCE(?, peso_vazio)');
    expect(sql).toContain('AND ? IS NOT NULL THEN ? ELSE peso_bagagem');
    expect(sql).toContain('THEN ? ELSE unidade_peso');
  });


  it('bloqueia propagação em LB se tripulação e passageiros estão registrados em KG', async () => {
    const run = vi.fn();
    const first = vi.fn().mockResolvedValue({ peso_vazio: 4200, unidade_peso: 'KG' });
    const all = vi.fn().mockResolvedValue({ results: [{
      unidade_peso: 'KG', peso_tripulacao: 220,
      peso_passageiros: 500, peso_bagagem: 80,
    }] });
    const prepare = vi.fn((_sql: string) => ({ bind: vi.fn(() => ({ first, all, run })) }));
    const db = { prepare } as unknown as D1Database;
    await expect(applyAircraftBasicWeightToFlightStages(db, 6, 42, 99))
      .rejects.toMatchObject({
        statusCode: 409, code: 'CONTROLE_VOOS_WEIGHT_UNIT_MISMATCH',
      });
    expect(run).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('não bloqueia ambiente legado sem colunas de peso da aeronave', async () => {
    const legacyError = new Error('D1_ERROR: no such column: peso_vazio');
    const first = vi.fn().mockRejectedValue(legacyError);
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const all = vi.fn().mockResolvedValue({ results: [] });
    const bind = vi.fn((..._args: unknown[]) => ({ first, run, all }));
    const prepare = vi.fn((_sql: string) => ({ bind }));
    const db = { prepare } as unknown as D1Database;

    await expect(
      updateFlightStagePlanningIfSupported(db, 6, 42, 99, {
        paxPlanejado: 5,
        pesoPlanejado: null,
        pesoPassageiros: null,
        pesoBagagem: null,
        pesoCarga: null,
        unidadePesoPlanejado: 'LB',
        combustivelSolicitado: null,
        unidadeCombustivelSolicitado: 'LB',
      }),
    ).resolves.toBeUndefined();
  });
});
