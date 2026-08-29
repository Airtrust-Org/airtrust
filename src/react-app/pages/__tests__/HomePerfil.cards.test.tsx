import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('../../components/dashboard/CardMeusEAD', () => ({
  CardMeusEAD: () => null,
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
  }),
}));

vi.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => false,
    role: 'ALUNO',
  }),
}));

import { buildHomeAccessCards } from '../HomePerfil';

describe('HomePerfil quick access cards', () => {
  const canAll = () => true;

  it('limita o aluno da manutenção a fadiga, Pasta 360 e troca de senha', () => {
    const cards = buildHomeAccessCards({
      role: 'ALUNO',
      can: canAll,
      homeProfile: 'STUDENT_MANUTENCAO',
      funcionarioId: 42,
    });

    expect(cards.map((card) => card.title)).toEqual([
      'Fadiga Diária',
      'Minha Pasta 360',
      'Trocar Senha',
    ]);
    expect(cards.map((card) => card.title)).not.toContain('Minha Escala');
    expect(cards.map((card) => card.title)).not.toContain('Minhas Sessões de Simulador');
    expect(cards.map((card) => card.title)).not.toContain('Minhas Fichas de Treinamento de Voo');
  });

  it('mantem rotina operacional para contexto de tripulacao', () => {
    const cards = buildHomeAccessCards({
      role: 'ALUNO',
      can: canAll,
      homeProfile: 'STUDENT_TRIPULACAO',
      funcionarioId: 7,
    });

    expect(cards.map((card) => card.title)).toContain('Fadiga Diária');
    expect(cards.map((card) => card.title)).toContain('Minha Escala');
    expect(cards.map((card) => card.title)).not.toContain('Minha Pasta 360');
  });

  it('mantem fichas próprias somente no perfil ALUNO, mesmo com permissions amplas', () => {
    const cards = buildHomeAccessCards({
      role: 'ALUNO',
      can: canAll,
      funcionarioId: 10,
    });

    const minhas = cards.find((card) => card.title === 'Minhas Fichas de Treinamento de Voo');
    const paraAvaliar = cards.find(
      (card) => card.title === 'Fichas de Treinamento de Voo para Avaliar',
    );

    expect(minhas).toBeDefined();
    expect(minhas?.route).toBe('/simuladores/fichas/minhas');
    expect(minhas?.description).toBe('Consulte e assine suas próprias fichas como participante.');
    expect(paraAvaliar).toBeUndefined();
  });

  it('mantem avaliação de fichas somente no perfil INSTRUTOR, sem misturar fichas próprias', () => {
    const cards = buildHomeAccessCards({
      role: 'INSTRUTOR',
      can: canAll,
      funcionarioId: 20,
    });

    const minhas = cards.find((card) => card.title === 'Minhas Fichas de Treinamento de Voo');
    const paraAvaliar = cards.find(
      (card) => card.title === 'Fichas de Treinamento de Voo para Avaliar',
    );

    expect(minhas).toBeUndefined();
    expect(paraAvaliar).toBeDefined();
    expect(paraAvaliar?.route).toBe('/simuladores/fichas/para-avaliar');
    expect(paraAvaliar?.description).toBe(
      'Avalie e assine as fichas dos participantes sob sua instrução.',
    );

    // Terminologia legada não deve mais aparecer
    expect(cards.map((card) => card.title)).not.toContain('Minhas Fichas de Simulador');
    expect(cards.map((card) => card.title)).not.toContain('Avaliar / Assinar Fichas');
  });

  it('mantem compatibilidade do perfil legado USUARIO como aluno para fichas próprias', () => {
    const cards = buildHomeAccessCards({
      role: 'USUARIO',
      can: canAll,
      funcionarioId: 10,
    });

    expect(cards.map((card) => card.title)).toContain('Minhas Fichas de Treinamento de Voo');
    expect(cards.map((card) => card.title)).not.toContain(
      'Fichas de Treinamento de Voo para Avaliar',
    );
  });

  it('mostra "Guias do Instrutor" apenas para role INSTRUTOR', () => {
    const paraInstrutor = buildHomeAccessCards({
      role: 'INSTRUTOR',
      can: canAll,
      funcionarioId: 20,
    });
    const guia = paraInstrutor.find((card) => card.title === 'Guias do Instrutor');
    expect(guia).toBeDefined();
    expect(guia?.route).toBe('/instrutor/guias');
  });

  it('não mostra "Guias do Instrutor" para ALUNO nem USUARIO', () => {
    const paraAluno = buildHomeAccessCards({ role: 'ALUNO', can: canAll, funcionarioId: 10 });
    const paraUsuario = buildHomeAccessCards({ role: 'USUARIO', can: canAll, funcionarioId: 10 });

    expect(paraAluno.map((card) => card.title)).not.toContain('Guias do Instrutor');
    expect(paraUsuario.map((card) => card.title)).not.toContain('Guias do Instrutor');
  });
});
