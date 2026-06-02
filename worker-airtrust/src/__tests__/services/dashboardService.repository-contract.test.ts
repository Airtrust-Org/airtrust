import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTaxaConclusaoMensalMetricRowsMock = vi.fn();
const getUtilizacaoSimuladoresMetricRowsMock = vi.fn();

vi.mock('../../repositories/dashboardMetricsRepository', () => ({
  getTaxaConclusaoMensalMetricRows: (...args: unknown[]) =>
    getTaxaConclusaoMensalMetricRowsMock(...args),
  getUtilizacaoSimuladoresMetricRows: (...args: unknown[]) =>
    getUtilizacaoSimuladoresMetricRowsMock(...args),
}));

import {
  getTaxaConclusaoMensal,
  getUtilizacaoSimuladores,
} from '../../services/dashboardService';

describe('dashboardService repository contract', () => {
  beforeEach(() => {
    getTaxaConclusaoMensalMetricRowsMock.mockReset();
    getUtilizacaoSimuladoresMetricRowsMock.mockReset();
  });

  it('keeps taxa conclusao mensal response shape while delegating to repository', async () => {
    const db = {} as D1Database;
    getTaxaConclusaoMensalMetricRowsMock.mockResolvedValueOnce([
      { mes: '2026-01', taxa: 88.6 },
      { mes: '2026-02', taxa: 90.2 },
    ]);

    const result = await getTaxaConclusaoMensal(db, 8);

    expect(getTaxaConclusaoMensalMetricRowsMock).toHaveBeenCalledWith(db, 8);
    expect(result).toEqual({
      meses: ['Jan', 'Fev'],
      taxas: [89, 90],
      meta: 90,
    });
  });

  it('keeps utilizacao simuladores response shape while delegating to repository', async () => {
    const db = {} as D1Database;
    getUtilizacaoSimuladoresMetricRowsMock.mockResolvedValueOnce([
      {
        id: 2,
        nome: 'SIM-02',
        fabricante: 'TRU',
        modelo: 'AW139',
        horas_programadas: 19.7,
        horas_disponiveis: 720,
        taxa_utilizacao: 2.6,
        status: 'operacional',
      },
    ]);

    const result = await getUtilizacaoSimuladores(db, 14);

    expect(getUtilizacaoSimuladoresMetricRowsMock).toHaveBeenCalledWith(db, 14);
    expect(result).toEqual({
      simuladores: [
        {
          id: 2,
          nome: 'SIM-02',
          fabricante: 'TRU',
          modelo: 'AW139',
          horasProgramadas: 20,
          horasDisponiveis: 720,
          taxaUtilizacao: 3,
          status: 'operacional',
        },
      ],
    });
  });

  it('preserves empty fallback when repository throws on taxa conclusao mensal', async () => {
    const db = {} as D1Database;
    getTaxaConclusaoMensalMetricRowsMock.mockRejectedValueOnce(new Error('db failure'));

    await expect(getTaxaConclusaoMensal(db, 5)).resolves.toEqual({
      meses: [],
      taxas: [],
      meta: 90,
    });
  });
});
