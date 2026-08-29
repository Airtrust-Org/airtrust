import { describe, expect, it } from 'vitest';
import {
  extractFuncionarioRoleOptions,
  resolveFuncionarioRoleLabel,
} from '../ListaFuncionarios';
import { DEFAULT_COLUNAS, FUNCIONARIOS_COLUNAS_STORAGE_KEY } from '../ConfigurarColunas';

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

describe('ListaFuncionarios privacy defaults', () => {
  it('mantém dados pessoais e identificadores ocultos por padrão', () => {
    const byId = new Map(DEFAULT_COLUNAS.map((coluna) => [coluna.id, coluna]));

    for (const id of ['cpf', 'nascimento', 'email', 'telefone', 'matricula', 'admissao', 'sispat', 'prestserv']) {
      expect(byId.get(id)?.visivel, id).toBe(false);
    }

    expect(byId.get('guerra')?.label).toBe('Nome de guerra');
    expect(byId.get('nome')?.visivel).toBe(true);
    expect(byId.get('funcao')?.visivel).toBe(true);
    expect(byId.get('status')?.visivel).toBe(true);
  });

  it('usa uma nova versão de preferência para não herdar o padrão antigo permissivo', () => {
    expect(FUNCIONARIOS_COLUNAS_STORAGE_KEY).toBe('funcionarios_colunas_config_v2');
  });
});
