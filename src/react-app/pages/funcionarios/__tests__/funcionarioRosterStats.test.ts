import { describe, expect, it } from 'vitest';
import { buildFuncionarioRosterStats } from '../funcionarioRosterStats';

describe('buildFuncionarioRosterStats', () => {
  it('conta um tripulante habilitado em AW139 e SK76 nos dois equipamentos', () => {
    expect(
      buildFuncionarioRosterStats([
        { status: 'ATIVO', funcao: 'Comandante', aeronave: 'AW139 / SK76' },
        { status: 'ATIVO', funcao: 'Copiloto', aeronave: 'SK76' },
        { status: 'ATIVO', funcao: 'Comandante', aeronave: 'AW139' },
      ]),
    ).toEqual({
      ativos: 3,
      inativos: 0,
      byModelo: {
        AW139: { cmd: 2, cop: 0 },
        SK76: { cmd: 1, cop: 1 },
      },
    });
  });

  it('não inclui pessoal inativo nem funções fora de comando e copiloto', () => {
    expect(
      buildFuncionarioRosterStats([
        { status: 'INATIVO', funcao: 'Comandante', aeronave: 'SK76' },
        { status: 'ATIVO', funcao: 'Mecânico', aeronave: 'AW139' },
      ]),
    ).toEqual({
      ativos: 1,
      inativos: 1,
      byModelo: {},
    });
  });
});
