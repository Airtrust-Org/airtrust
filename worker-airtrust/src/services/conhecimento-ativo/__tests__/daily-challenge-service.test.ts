import { describe, expect, it } from 'vitest';
import {
  dataDesafioDiario,
  indiceDeterministico,
  resolverModelosConhecimentoFuncionario,
} from '../daily-challenge-service';

describe('desafio diário do Conhecimento Ativo', () => {
  it('usa o dia operacional de São Paulo', () => {
    expect(dataDesafioDiario(new Date('2026-09-26T02:30:00.000Z'))).toBe('2026-09-25');
    expect(dataDesafioDiario(new Date('2026-09-26T03:30:00.000Z'))).toBe('2026-09-26');
  });

  it('mantém a seleção determinística para a mesma chave diária', () => {
    const seed = '6:42:2026-09-26:AW139:questao';
    expect(indiceDeterministico(seed, 97)).toBe(indiceDeterministico(seed, 97));
    expect(indiceDeterministico(seed, 1)).toBe(0);
    expect(indiceDeterministico(seed, 0)).toBe(0);
  });

  it('resolve AW139 e S76/SK76 a partir do cadastro do funcionário e do catálogo', () => {
    expect(
      resolverModelosConhecimentoFuncionario({
        modeloAeronaveId: '17, AW139',
        aeronave: null,
        catalogo: [{ id: 17, modelo: 'S-76', codigo: 'S76' }],
      }),
    ).toEqual(['AW139', 'SK76']);
  });

  it('ignora modelos que não fazem parte do banco atual de Conhecimento Ativo', () => {
    expect(
      resolverModelosConhecimentoFuncionario({
        modeloAeronaveId: '99',
        aeronave: 'Bell 412',
        catalogo: [{ id: 99, modelo: 'Bell 412', codigo: 'B412' }],
      }),
    ).toEqual([]);
  });
});
