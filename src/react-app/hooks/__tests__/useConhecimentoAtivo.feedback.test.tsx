import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conhecimentoAtivoKeys,
  useResponderConhecimento,
} from '@/react-app/hooks/useConhecimentoAtivo';

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: fetchWithAuthMock,
}));

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useResponderConhecimento feedback lifecycle', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
  });

  it('keeps the current challenge stable until the pilot advances', async () => {
    fetchWithAuthMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          idempotente: false,
          correta: true,
          alternativaId: 10,
          alternativaCorretaId: 10,
          confianca: 'SABIA',
          explicacao: 'Explicação técnica.',
          oQueGuardar: 'Ponto essencial.',
          fontes: [],
          conclusao: { concluido: false, xpConcedido: 0 },
        },
      }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useResponderConhecimento(77), {
      wrapper: wrapperFor(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        desafioQuestaoId: 501,
        alternativaId: 10,
        confianca: 'SABIA',
        tempoRespostaMs: 2200,
      });
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conhecimentoAtivoKeys.resumo() });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: conhecimentoAtivoKeys.mapa() });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: conhecimentoAtivoKeys.desafio(77) });
  });
});
