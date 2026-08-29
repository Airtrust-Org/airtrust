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
    ['Analista', 'other'],
  ] as const)('classifica cargo %s como %s', (cargo, expected) => {
    expect(resolveFrmsWorkforceProfile(cargo)).toBe(expected);
  });

  it('usa funcao somente quando cargo está vazio', () => {
    expect(resolveFrmsWorkforceProfile('', 'Mecânico')).toBe('maintenance');
    expect(resolveFrmsWorkforceProfile(null, 'Piloto')).toBe('flight');
  });

  it('mantém cargo explícito como autoridade sobre funcao legada', () => {
    expect(resolveFrmsWorkforceProfile('Analista', 'Mecânico')).toBe('other');
    expect(resolveFrmsWorkforceProfile('Mecânico', 'Piloto')).toBe('maintenance');
  });
});
