import { describe, expect, it } from 'vitest';

import {
  getDefaultQuinzenaRange,
  normalizeLegacyQuinzena,
} from '../react-app/pages/escalas/utils/quinzenas';

describe('quinzenas normalization', () => {
  it('gera janeiro de 2026 no calendario operacional informado', () => {
    expect(getDefaultQuinzenaRange(2026, 1, 1)).toEqual({
      inicio: '2025-12-30',
      fim: '2026-01-14',
    });
    expect(getDefaultQuinzenaRange(2026, 1, 2)).toEqual({
      inicio: '2026-01-15',
      fim: '2026-01-30',
    });
  });

  it('normaliza datas mensais antigas para o calendario operacional de 2026', () => {
    expect(
      normalizeLegacyQuinzena({
        id: 5,
        empresa_id: 1,
        ano: 2026,
        mes: 1,
        numero: 1,
        data_inicio: '2026-01-01',
        data_fim: '2026-01-16',
        observacoes: null,
      }),
    ).toMatchObject({
      data_inicio: '2025-12-30',
      data_fim: '2026-01-14',
    });
  });
});
