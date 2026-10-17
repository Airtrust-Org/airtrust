import { describe, expect, it } from 'vitest';
import { needsFirefighterAviationProfile, resolveFrmsWorkforceProfile } from '../../lib/frms/workforce-profile';

describe('resolveFrmsWorkforceProfile', () => {
  it.each([
    ['Mecânico', 'maintenance'],
    ['MECANICO', 'maintenance'],
    ['Mecânico de Aeronaves', 'maintenance'],
    ['Inspetor', 'maintenance'],
    ['INSPETOR DE MANUTENÇÃO', 'maintenance'],
    ['Piloto', 'flight'],
    ['Copiloto', 'flight'],
    ['Comandante', 'flight'],
    ['Operador Aerotático', 'other'],
    ['Tripulante Operacional', 'other'],
    ['Tripulante Aerotático', 'other'],
    ['Operador de Guincho', 'other'],
    ['Médico de Bordo', 'other'],
    ['Resgatista', 'other'],
    ['Bombeiro Militar', 'other'],
    ['Analista', 'other'],
  ] as const)('classifica cargo %s como %s', (cargo, expected) => {
    expect(resolveFrmsWorkforceProfile(cargo)).toBe(expected);
  });

  it('consulta a atribuição regulatória somente para candidatos aeronáuticos de bombeiros', () => {
    expect(needsFirefighterAviationProfile('Piloto', 'PIC')).toBe(false);
    expect(needsFirefighterAviationProfile('Mecânico', 'Manutenção')).toBe(false);
    expect(needsFirefighterAviationProfile('Operador Aerotático')).toBe(true);
    expect(needsFirefighterAviationProfile('Bombeiro Militar', 'Piloto')).toBe(true);
    expect(needsFirefighterAviationProfile('Analista', 'Operador Aerotático')).toBe(false);
  });

  it('usa funcao somente quando cargo está vazio', () => {
    expect(resolveFrmsWorkforceProfile('', 'Mecânico')).toBe('maintenance');
    expect(resolveFrmsWorkforceProfile(null, 'Piloto')).toBe('flight');
  });

  it('isola funções bombeiros e mantém classificação offshore inalterada', () => {
    const firefighter = 'FIREFIGHTER_AVIATION';
    const offshore = 'HELICOPTER_OFFSHORE';
    for (const role of ['Operador Aerotático', 'Tripulante Operacional', 'Tripulante Aerotático',
      'Operador de Guincho', 'Médico de Bordo']) {
      expect(resolveFrmsWorkforceProfile(role)).toBe('other');
      expect(resolveFrmsWorkforceProfile(role, null, offshore)).toBe('other');
      expect(resolveFrmsWorkforceProfile(role, null, firefighter)).toBe('flight');
    }
    expect(resolveFrmsWorkforceProfile('Bombeiro Militar', 'Piloto')).toBe('other');
    expect(resolveFrmsWorkforceProfile('Bombeiro Militar', 'Piloto', offshore)).toBe('other');
    expect(resolveFrmsWorkforceProfile('Bombeiro Militar', 'Piloto', firefighter)).toBe('flight');
    expect(resolveFrmsWorkforceProfile('Oficial Bombeiro Militar', 'Operador Aerotático', firefighter)).toBe('flight');
    expect(resolveFrmsWorkforceProfile('Bombeiro Militar', 'Combate terrestre', firefighter)).toBe('other');
    expect(resolveFrmsWorkforceProfile('Analista', 'Operador Aerotático', firefighter)).toBe('other');
  });

  it('mantém cargo explícito como autoridade sobre funcao legada', () => {
    expect(resolveFrmsWorkforceProfile('Analista', 'Mecânico')).toBe('other');
    expect(resolveFrmsWorkforceProfile('Mecânico', 'Piloto')).toBe('maintenance');
  });
});
