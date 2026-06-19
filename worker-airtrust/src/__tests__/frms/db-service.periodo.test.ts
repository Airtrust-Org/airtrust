import { afterEach, describe, expect, it, vi } from 'vitest';

import * as activeFortnight from '../../lib/escalas/active-fortnight';
import {
  calcularDiaDoCiclo,
  calcularPeriodoEmbarcadoPorFaixa,
} from '../../lib/frms/db-service-jornadas';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('calcularPeriodoEmbarcadoPorFaixa', () => {
  it('prioriza o intervalo da quinzena quando presente', () => {
    const periodo = calcularPeriodoEmbarcadoPorFaixa('2026-03-10', {
      data_inicio: '2026-03-08',
      data_fim: '2026-03-12',
      quinzena_data_inicio: '2026-03-01',
      quinzena_data_fim: '2026-03-15',
    });

    expect(periodo).toEqual({ dia: 10, total: 15 });
  });

  it('usa o intervalo da alocacao quando nao houver quinzena vinculada', () => {
    const periodo = calcularPeriodoEmbarcadoPorFaixa('2026-03-10', {
      data_inicio: '2026-03-08',
      data_fim: '2026-03-12',
      quinzena_data_inicio: null,
      quinzena_data_fim: null,
    });

    expect(periodo).toEqual({ dia: 3, total: 5 });
  });

  it('retorna null quando a data estiver fora do intervalo resolvido', () => {
    const periodo = calcularPeriodoEmbarcadoPorFaixa('2026-03-16', {
      data_inicio: '2026-03-08',
      data_fim: '2026-03-12',
      quinzena_data_inicio: '2026-03-01',
      quinzena_data_fim: '2026-03-15',
    });

    expect(periodo).toBeNull();
  });

  it('ignora intervalo parcial de quinzena e nao mistura inicio/fim com a alocacao', () => {
    const periodo = calcularPeriodoEmbarcadoPorFaixa('2026-03-10', {
      data_inicio: '2026-03-08',
      data_fim: '2026-03-12',
      quinzena_data_inicio: '2026-03-01',
      quinzena_data_fim: null,
    });

    expect(periodo).toEqual({ dia: 3, total: 5 });
  });
});

describe('calcularDiaDoCiclo', () => {
  it('usa a quinzena base do funcionario antes do fallback frms_escala_quinzenal', async () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('FROM escala_alocacoes ea')) {
          return {
            bind: () => ({
              first: async () => null,
            }),
          };
        }

        if (sql.includes('FROM frms_escala_quinzenal')) {
          return {
            bind: () => ({
              first: async () => ({
                data_inicio_embarque: '2026-06-10',
                data_fim_embarque: '2026-06-23',
                dias_embarcado: 14,
              }),
            }),
          };
        }

        throw new Error(`Unhandled query: ${sql}`);
      }),
    } as any;

    vi.spyOn(activeFortnight, 'resolveFuncionarioActiveFortnightForDate').mockResolvedValue({
      numero: 2,
      data_inicio: '2026-06-16',
      data_fim: '2026-06-30',
    });

    await expect(calcularDiaDoCiclo(db, 10, '2026-06-18')).resolves.toEqual({ dia: 3, total: 15 });
  });
});
