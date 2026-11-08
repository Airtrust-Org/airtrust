import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTiposQualificacao } from './useTiposQualificacao';

const serviceMocks = vi.hoisted(() => ({
  buscarTipoQualificacaoPorId: vi.fn(),
  listarTiposQualificacao: vi.fn(),
}));

vi.mock('@/react-app/services/qualificacoesService', () => ({
  buscarTipoQualificacaoPorId: (...args: unknown[]) =>
    serviceMocks.buscarTipoQualificacaoPorId(...args),
  listarTiposQualificacao: (...args: unknown[]) =>
    serviceMocks.listarTiposQualificacao(...args),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const modeloVinculado = {
  id: 'modelo-900',
  codigo: 'EAD_COORDENADOR_VOO',
  nome: 'Coordenador de Voo',
  categoria: 'EAD',
  categoria_id: 3,
  validade: 24,
};

describe('useTiposQualificacao para edição de histórico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.buscarTipoQualificacaoPorId.mockResolvedValue({
      success: true,
      data: modeloVinculado,
    });
  });

  it('consulta diretamente o modelo vinculado quando a categoria ainda não foi carregada', async () => {
    const { result } = renderHook(
      () => useTiposQualificacao(undefined, true, modeloVinculado.id),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.data).toEqual([modeloVinculado]));
    expect(serviceMocks.buscarTipoQualificacaoPorId).toHaveBeenCalledWith('modelo-900');
    expect(serviceMocks.listarTiposQualificacao).not.toHaveBeenCalled();
  });

  it('inclui o modelo associado quando ele está além do limite de 500 itens na categoria', async () => {
    serviceMocks.listarTiposQualificacao.mockResolvedValue({
      success: true,
      data: Array.from({ length: 500 }, (_, index) => ({
        id: index + 1,
        codigo: `OUTRO_${index + 1}`,
        nome: `Outro modelo ${index + 1}`,
        categoria_id: 3,
        validade: null,
      })),
    });

    const { result } = renderHook(
      () => useTiposQualificacao(3, true, modeloVinculado.id),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.data).toHaveLength(501));
    expect(result.current.data?.[0]).toEqual(modeloVinculado);
    expect(serviceMocks.listarTiposQualificacao).toHaveBeenCalledWith(500, 3);
  });

  it('não mistura modelos de categorias distintas após mudança da seleção', async () => {
    serviceMocks.listarTiposQualificacao.mockResolvedValue({ success: true, data: [] });
    const { result } = renderHook(
      () => useTiposQualificacao(5, true, modeloVinculado.id),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
