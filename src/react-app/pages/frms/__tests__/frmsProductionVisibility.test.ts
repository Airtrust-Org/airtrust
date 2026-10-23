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

  it('permite fixtures somente nos hosts oficiais de staging, inclusive em build de produção', () => {
    const fixture = { nome: 'QA Governada', funcao: 'PILOTO' };
    expect(shouldExposeFrmsPerson(fixture, true, 'staging.airtrust.pages.dev')).toBe(true);
    expect(shouldExposeFrmsPerson(fixture, true, 'airtrust-staging.pages.dev')).toBe(true);
    expect(shouldExposeFrmsPerson(fixture, true, 'staging.airtrust.pages.dev.evil.example')).toBe(false);
  });

  it('mantém fixtures ocultas em produção mesmo se o bundle não estiver em modo produção', () => {
    const fixture = { nome: 'QA Governada', funcao: 'PILOTO' };
    expect(shouldExposeFrmsPerson(fixture, false, 'airtrust.online')).toBe(false);
    expect(shouldExposeFrmsPerson(fixture, false, 'production.airtrust.pages.dev')).toBe(false);
    expect(shouldExposeFrmsPerson({ nome: 'João da Silva', funcao: 'COMANDANTE' }, true, 'airtrust.online')).toBe(true);
  });
});
