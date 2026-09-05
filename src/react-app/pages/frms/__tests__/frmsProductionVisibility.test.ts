import { describe, expect, it } from 'vitest';
import { isSyntheticFrmsFixture, shouldExposeFrmsPerson } from '../frmsProductionVisibility';

describe('frmsProductionVisibility', () => {
  it('identifica fixtures QA e fictícias sem depender de acentos', () => {
    expect(isSyntheticFrmsFixture({ nome: 'QA Governada — QA Fictício' })).toBe(true);
    expect(isSyntheticFrmsFixture({ nome: 'Tripulante FICTICIO' })).toBe(true);
    expect(isSyntheticFrmsFixture({ nome: 'Synthetic Pilot' })).toBe(true);
  });

  it('não classifica tripulante operacional real nem substring QA como fixture', () => {
    expect(
      isSyntheticFrmsFixture({ nome: 'João da Silva', funcao: 'COMANDANTE', cargo: 'Comandante' }),
    ).toBe(false);
    expect(isSyntheticFrmsFixture({ nome: 'Aqua Serviços Aéreos', funcao: 'PILOTO' })).toBe(false);
  });

  it('oculta fixture somente em produção', () => {
    const fixture = { nome: 'QA Governada', funcao: 'PILOTO' };
    expect(shouldExposeFrmsPerson(fixture, true)).toBe(false);
    expect(shouldExposeFrmsPerson(fixture, false)).toBe(true);
  });

  it('reconhece o nome canônico retornado pela equipe FRMS de manutenção', () => {
    const fixture = {
      funcionario_nome: 'QA Governada — Mecânico Fictício',
      cargo: 'Mecânico',
      funcao: 'MECANICO',
    };
    const real = {
      funcionario_nome: 'João da Silva',
      cargo: 'Mecânico',
      funcao: 'MECANICO',
    };

    expect(shouldExposeFrmsPerson(fixture, true)).toBe(false);
    expect(shouldExposeFrmsPerson(real, true)).toBe(true);
    expect(shouldExposeFrmsPerson(fixture, false)).toBe(true);
  });
});
