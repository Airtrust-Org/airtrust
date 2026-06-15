import { describe, expect, it } from 'vitest';
import {
  extractFuncionarioRoleOptions,
  resolveFuncionarioRoleLabel,
} from '../ListaFuncionarios';

describe('ListaFuncionarios role helpers', () => {
  it('usa cargo como fallback quando funcao estiver vazia', () => {
    expect(resolveFuncionarioRoleLabel({ funcao: '', cargo: 'Mecânico' })).toBe('Mecânico');
    expect(resolveFuncionarioRoleLabel({ funcao: 'Instrutor', cargo: 'Mecânico' })).toBe(
      'Instrutor',
    );
  });

  it('gera opções únicas combinando função e cargo sem vazios', () => {
    expect(
      extractFuncionarioRoleOptions([
        { funcao: 'Instrutor', cargo: 'Mecânico' },
        { funcao: '', cargo: 'Mecânico' },
        { funcao: 'Analista', cargo: 'Analista' },
        { funcao: null, cargo: ' ' },
      ]),
    ).toEqual(['Analista', 'Instrutor', 'Mecânico']);
  });
});
