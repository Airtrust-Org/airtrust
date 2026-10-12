import { describe, expect, it } from 'vitest';
import { resolveFrmsWorkforceProfile } from '../../lib/frms/workforce-profile';

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
    ['Operador Aerotático', 'flight'],
    ['Tripulante Operacional', 'flight'],
    ['Tripulante Aerotático', 'flight'],
    ['Operador de Guincho', 'flight'],
    ['Médico de Bordo', 'flight'],
    ['Resgatista', 'other'],
    ['Bombeiro Militar', 'other'],
    ['Analista', 'other'],
  ] as const)('classifica cargo %s como %s', (cargo, expected) => {
    expect(resolveFrmsWorkforceProfile(cargo)).toBe(expected);
  });

  it('usa funcao somente quando cargo está vazio', () => {
    expect(resolveFrmsWorkforceProfile('', 'Mecânico')).toBe('maintenance');
    expect(resolveFrmsWorkforceProfile(null, 'Piloto')).toBe('flight');
  });

  it('permite função aérea explícita quando o cargo militar é genérico', () => {
    expect(resolveFrmsWorkforceProfile('Bombeiro Militar', 'Piloto')).toBe('flight');
    expect(resolveFrmsWorkforceProfile('Oficial Bombeiro Militar', 'Operador Aerotático')).toBe('flight');
    expect(resolveFrmsWorkforceProfile('Bombeiro Militar', 'Combate terrestre')).toBe('other');
    expect(resolveFrmsWorkforceProfile('Analista', 'Operador Aerotático')).toBe('other');
  });

  it('mantém cargo explícito como autoridade sobre funcao legada', () => {
    expect(resolveFrmsWorkforceProfile('Analista', 'Mecânico')).toBe('other');
    expect(resolveFrmsWorkforceProfile('Mecânico', 'Piloto')).toBe('maintenance');
  });
});
