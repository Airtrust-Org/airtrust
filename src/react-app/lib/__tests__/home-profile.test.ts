import { describe, expect, it } from 'vitest';
import {
  isAdministrativeContext,
  isFlightCrewContext,
  isMaintenanceContext,
  normalizeSetor,
  resolveHomePath,
  resolveHomeProfile,
} from '../home-profile';

describe('home-profile', () => {
  it('normaliza setor removendo acentos e separadores', () => {
    expect(normalizeSetor(' Manutenção / Linha ')).toBe('MANUTENCAO LINHA');
  });

  it('detecta contexto de manutencao', () => {
    expect(
      isMaintenanceContext({
        setor: 'Manutenção de Aeronaves',
        funcao: 'Mecânico',
      }),
    ).toBe(true);
  });

  it('detecta contexto de tripulacao', () => {
    expect(
      isFlightCrewContext({
        setor: 'Tripulação',
        cargo: 'Piloto',
      }),
    ).toBe(true);
  });

  it('detecta contexto administrativo', () => {
    expect(
      isAdministrativeContext({
        setor: 'Administrativo',
        cargo: 'Analista Financeiro',
      }),
    ).toBe(true);
  });

  it('mantem dashboard apenas para o admin principal allowlisted', () => {
    expect(
      resolveHomeProfile(
        {
          email: 'filipe.daumas@icloud.com',
          role: 'ADMINISTRADOR',
        },
        null,
      ),
    ).toBe('PRIMARY_ADMIN_DASHBOARD');
    expect(resolveHomePath('PRIMARY_ADMIN_DASHBOARD')).toBe('/');
  });

  it('envia gestores e admins comuns para funcionarios sem criar novos papeis', () => {
    expect(
      resolveHomeProfile(
        {
          email: 'gestor@empresa.com',
          role: 'GESTOR',
        },
        {
          setor: 'Manutenção',
        },
      ),
    ).toBe('MANAGER_FUNCIONARIOS');
  });

  it('resolve perfis de aluno por contexto funcional existente', () => {
    expect(
      resolveHomeProfile(
        {
          role: 'ALUNO',
          funcionario_id: 10,
        },
        {
          setor: 'Manutenção',
        },
      ),
    ).toBe('STUDENT_MANUTENCAO');

    expect(
      resolveHomeProfile(
        {
          role: 'USUARIO',
          funcionario_id: 11,
        },
        {
          setor: 'Tripulação',
        },
      ),
    ).toBe('STUDENT_TRIPULACAO');

    expect(
      resolveHomeProfile(
        {
          role: 'INSTRUTOR',
          funcionario_id: 12,
        },
        {
          setor: 'Administrativo',
        },
      ),
    ).toBe('STUDENT_ADMINISTRATIVO');

    expect(
      resolveHomeProfile(
        {
          role: 'ALUNO',
          funcionario_id: 13,
        },
        null,
      ),
    ).toBe('STUDENT_DEFAULT');
  });
});
