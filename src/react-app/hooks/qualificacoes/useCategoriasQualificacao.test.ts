import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: { empresaAtualId: 10 as number | null },
  useQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ empresaAtualId: mocks.state.empresaAtualId }),
}));
vi.mock('@/react-app/services/http-client', () => ({
  httpClient: { get: vi.fn() },
}));

import { useCategoriasQualificacao } from './useCategoriasQualificacao';

describe('useCategoriasQualificacao', () => {
  it('namespaces the canonical catalogue cache by active tenant and waits for its resolution', () => {
    mocks.state.empresaAtualId = null;
    useCategoriasQualificacao();
    expect(mocks.useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: ['qualificacoes-categorias-canonicas', null],
      enabled: false,
    }));

    mocks.state.empresaAtualId = 20;
    useCategoriasQualificacao();
    expect(mocks.useQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      queryKey: ['qualificacoes-categorias-canonicas', 20],
      enabled: true,
    }));
  });
});
