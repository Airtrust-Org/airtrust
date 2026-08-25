import { describe, expect, it } from 'vitest';
import type { FrmsFrotaRow } from '@/react-app/hooks/useFrms';
import type { FrmsFiltersState } from '../components/FrmsFilterContext';
import { applyFrmsFrotaFilters } from '../frmsFilterUtils';

function row(overrides: Partial<FrmsFrotaRow> = {}): FrmsFrotaRow {
  return {
    tripulante_id: '1',
    nome: 'Max Monteiro',
    nome_guerra: 'Max',
    funcao: 'PIC',
    aeronave_modelo: 'AW139',
    base: 'SBSP',
    quinzena_numero: 1,
    quinzena_tipo: 'Q1',
    hv_mes_min: 100,
    pct_mes: 20,
    hv_7d_min: 40,
    pct_7d: 10,
    hv_365d_min: 1000,
    pct_365d: 10,
    hv_dia_min: 20,
    pct_dia: 5,
    ...overrides,
  };
}

const baseFilters: FrmsFiltersState = {
  modoPainel: 'OPERACIONAL',
  periodo: 30,
  mesReferencia: '2026-08',
  base: '',
  quinzena: '',
  modeloAeronave: '',
  status: ['OK', 'ATENCAO', 'CRITICO', 'VIOLACAO'],
  busca: '',
};

describe('applyFrmsFrotaFilters', () => {
  const frota = [
    row(),
    row({
      tripulante_id: '2',
      nome: 'Ana Souza',
      nome_guerra: 'Ana',
      aeronave_modelo: 'SK76',
      base: 'SBRJ',
      quinzena_numero: 2,
      quinzena_tipo: 'Q2',
    }),
  ];

  it('filtra por base da escala', () => {
    const result = applyFrmsFrotaFilters(frota, { ...baseFilters, base: 'SBRJ' });
    expect(result).toHaveLength(1);
    expect(result[0].tripulante_id).toBe('2');
  });

  it('filtra por aeronave da escala', () => {
    const result = applyFrmsFrotaFilters(frota, { ...baseFilters, modeloAeronave: 'AW139' });
    expect(result).toHaveLength(1);
    expect(result[0].tripulante_id).toBe('1');
  });

  it('filtra por quinzena 1ª/2ª/ambas', () => {
    expect(applyFrmsFrotaFilters(frota, { ...baseFilters, quinzena: 'Q1' })).toHaveLength(1);
    expect(applyFrmsFrotaFilters(frota, { ...baseFilters, quinzena: 'Q2' })).toHaveLength(1);
    expect(applyFrmsFrotaFilters(frota, { ...baseFilters, quinzena: '' })).toHaveLength(2);
  });

  it('filtra por busca de tripulante', () => {
    const result = applyFrmsFrotaFilters(frota, { ...baseFilters, busca: 'ana' });
    expect(result).toHaveLength(1);
    expect(result[0].nome_guerra).toBe('Ana');
  });

  it('combina base + aeronave + quinzena + busca', () => {
    const result = applyFrmsFrotaFilters(frota, {
      ...baseFilters,
      base: 'SBSP',
      modeloAeronave: 'AW139',
      quinzena: 'Q1',
      busca: 'Max',
    });
    expect(result).toHaveLength(1);
    expect(result[0].tripulante_id).toBe('1');
  });
});
