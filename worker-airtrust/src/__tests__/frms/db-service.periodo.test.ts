import { describe, expect, it } from 'vitest';

import { calcularPeriodoEmbarcadoPorFaixa } from '../../lib/frms/db-service';

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
});
