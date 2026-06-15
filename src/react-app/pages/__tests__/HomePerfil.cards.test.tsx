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
});
