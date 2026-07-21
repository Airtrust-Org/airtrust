import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { usePersistedEtapas } from '../hooks/usePersistedEtapas';
import { clearEtapaPendingRecovery } from '../data/rdvPilotFlow';

const mutateCriar = vi.fn();
const mutateAtualizar = vi.fn();
const mutateRemover = vi.fn();
const mutateDuplicar = vi.fn();
const mutateReordenar = vi.fn();
const refetch = vi.fn();

const serverEtapa = {
  id: 101,
  numero_etapa: 1,
  origem_icao: 'SBRJ',
  destino_icao: 'SBSP',
  horario_decolagem: '2026-06-14T10:00:00Z',
  horario_pouso: '2026-06-14T10:40:00Z',
  combustivel_inicio: 1000,
  combustivel_fim: 800,
  pousos_diurnos: 1,
  pousos_noturnos: 0,
  pax: 4,
  payload: null,
};

const etapasQueryData = {
  etapas: [serverEtapa],
  versao: 2,
  programado: null,
};

vi.mock('@/react-app/hooks/useControleVoos', () => ({
  useEtapas: () => ({
    data: etapasQueryData,
    isLoading: false,
    error: null,
    refetch,
  }),
  useCriarEtapa: () => ({ mutateAsync: mutateCriar }),
  useAtualizarEtapa: () => ({ mutateAsync: mutateAtualizar }),
  useRemoverEtapa: () => ({ mutateAsync: mutateRemover }),
  useDuplicarEtapa: () => ({ mutateAsync: mutateDuplicar }),
  useReordenarEtapas: () => ({ mutateAsync: mutateReordenar }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
  clearEtapaPendingRecovery(601);
  sessionStorage.clear();
});

describe('usePersistedEtapas', () => {
  it('hidrata drafts a partir das etapas do servidor', async () => {
    const { result } = renderHook(
      () =>
        usePersistedEtapas({
          vooId: 601,
          rdv: { id: 1, versao: 2 } as never,
          editable: true,
          origemIcao: 'SBRJ',
          destinoIcao: 'SBSP',
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.drafts).toHaveLength(1);
    });
    expect(result.current.drafts[0].id).toBe(101);
    expect(result.current.drafts[0].origem).toBe('SBRJ');
    expect(result.current.serverCount).toBe(1);
  });

  it('cria etapa no servidor e substitui o draft temporário', async () => {
    mutateCriar.mockResolvedValue({
      data: {
        id: 202,
        numero_etapa: 2,
        origem_icao: 'SBSP',
        destino_icao: null,
        horario_decolagem: null,
        horario_pouso: null,
        combustivel_inicio: null,
        combustivel_fim: null,
        pousos_diurnos: null,
        pousos_noturnos: null,
        pax: null,
        payload: null,
      },
      meta: { versao: 3 },
    });

    const { result } = renderHook(
      () =>
        usePersistedEtapas({
          vooId: 601,
          rdv: { id: 1, versao: 2 } as never,
          editable: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.drafts[0]?.id).toBe(101));

    await act(async () => {
      await result.current.addEtapa();
    });

    expect(mutateCriar).toHaveBeenCalled();
    expect(result.current.drafts.some((d) => d.id === 202)).toBe(true);
    expect(result.current.knownVersao).toBe(3);
  });

  it('duplica e remove via API', async () => {
    mutateDuplicar.mockResolvedValue({
      data: {
        id: 303,
        numero_etapa: 2,
        origem_icao: 'SBRJ',
        destino_icao: 'SBSP',
        horario_decolagem: '2026-06-14T10:00:00Z',
        horario_pouso: '2026-06-14T10:40:00Z',
        combustivel_inicio: 1000,
        combustivel_fim: 800,
        pousos_diurnos: 1,
        pousos_noturnos: 0,
        pax: 4,
        payload: null,
      },
      meta: { versao: 3 },
    });
    mutateRemover.mockResolvedValue({ meta: { versao: 4 } });

    const { result } = renderHook(
      () =>
        usePersistedEtapas({
          vooId: 601,
          rdv: { id: 1, versao: 2 } as never,
          editable: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.drafts[0]?.id).toBe(101));
    const localId = result.current.drafts[0].localId;

    await act(async () => {
      await result.current.duplicateEtapa(localId);
    });
    expect(mutateDuplicar).toHaveBeenCalledWith(
      expect.objectContaining({ vooId: 601, etapaId: 101, versao: 2 }),
    );
    expect(result.current.drafts).toHaveLength(2);

    const copyLocalId = result.current.drafts.find((d) => d.id === 303)!.localId;
    await act(async () => {
      await result.current.removeEtapa(copyLocalId);
    });
    expect(mutateRemover).toHaveBeenCalled();
    expect(result.current.drafts.every((d) => d.id !== 303)).toBe(true);
  });

  it('marca conflito de versão e recarrega do servidor', async () => {
    mutateCriar.mockRejectedValue(new Error('VERSION_CONFLICT: Versao do RDV desatualizada'));
    refetch.mockResolvedValue({
      data: {
        etapas: [
          {
            id: 101,
            numero_etapa: 1,
            origem_icao: 'SBRJ',
            destino_icao: 'SBSP',
            horario_decolagem: '2026-06-14T10:00:00Z',
            horario_pouso: '2026-06-14T10:40:00Z',
            combustivel_inicio: 1000,
            combustivel_fim: 800,
            pousos_diurnos: 1,
            pousos_noturnos: 0,
            pax: 4,
            payload: null,
          },
        ],
        versao: 9,
      },
    });

    const { result } = renderHook(
      () =>
        usePersistedEtapas({
          vooId: 601,
          rdv: { id: 1, versao: 2 } as never,
          editable: true,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.drafts[0]?.id).toBe(101));

    await act(async () => {
      await result.current.addEtapa();
    });

    expect(result.current.versionConflict).toBe(true);
    expect(refetch).toHaveBeenCalled();
  });
});
