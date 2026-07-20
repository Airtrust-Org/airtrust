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

  it('separa atalhos de manutencao da rotina de tripulacao', () => {
    const cards = buildHomeAccessCards({
      role: 'USUARIO',
      can: canAll,
      homeProfile: 'STUDENT_MANUTENCAO',
      funcionarioId: 42,
    });

    expect(cards.map((card) => card.title)).toContain('Minha Pasta 360');
    expect(cards.map((card) => card.title)).not.toContain('Fadiga Diária');
    expect(cards.map((card) => card.title)).not.toContain('Minha Escala');
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

  it('mostra "Minhas Fichas de Treinamento de Voo" e "Fichas de Treinamento de Voo para Avaliar" como duas entradas distintas', () => {
    const cards = buildHomeAccessCards({
      role: 'INSTRUTOR',
      can: canAll,
      funcionarioId: 20,
    });

    const minhas = cards.find((card) => card.title === 'Minhas Fichas de Treinamento de Voo');
    const paraAvaliar = cards.find(
      (card) => card.title === 'Fichas de Treinamento de Voo para Avaliar',
    );

    expect(minhas).toBeDefined();
    expect(paraAvaliar).toBeDefined();
    expect(minhas?.route).toBe('/simuladores/fichas/minhas');
    expect(paraAvaliar?.route).toBe('/simuladores/fichas/para-avaliar');

    // Copy exata exigida pela especificação
    expect(minhas?.description).toBe('Consulte e assine suas próprias fichas como participante.');
    expect(paraAvaliar?.description).toBe(
      'Avalie e assine as fichas dos participantes sob sua instrução.',
    );

    // Terminologia legada não deve mais aparecer
    expect(cards.map((card) => card.title)).not.toContain('Minhas Fichas de Simulador');
    expect(cards.map((card) => card.title)).not.toContain('Avaliar / Assinar Fichas');
  });

  it('esconde "Fichas de Treinamento de Voo para Avaliar" para um aluno puro (sem simuladores.evaluate)', () => {
    const cards = buildHomeAccessCards({
      role: 'ALUNO',
      can: (permission) => permission === 'self.ficha',
      funcionarioId: 10,
    });

    expect(cards.map((card) => card.title)).toContain('Minhas Fichas de Treinamento de Voo');
    expect(cards.map((card) => card.title)).not.toContain(
      'Fichas de Treinamento de Voo para Avaliar',
    );
  });
});
