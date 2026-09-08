import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '@/react-app/config/api';
import {
  lmsKeys,
  useSalvarProgresso,
  type LmsCursoDetalhe,
  type LmsMatricula,
  type LmsMatriculaEAD,
} from '@/react-app/hooks/useLms';
import { server } from '@/test/mocks/server';

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjo5OTk5OTk5OTk5OTl9.fakesig';

describe('useSalvarProgresso optimistic rollback', () => {
  beforeEach(() => {
    localStorage.setItem('airtrust_token', FAKE_JWT);
  });

  it('restores every affected LMS cache when the PATCH fails', async () => {
    let releaseRequest!: () => void;
    const requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });

    server.use(
      http.patch(`${API_BASE_URL}/lms/matriculas/:id/progresso`, async () => {
        await requestGate;
        return HttpResponse.json({ success: false, error: 'persistencia indisponivel' }, { status: 503 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });

    const matriculaId = 42;
    const detalhe = {
      id: matriculaId,
      status: 'NAO_INICIADO',
      progresso_pct: 10,
      ultimo_slide: 1,
      ultima_pagina: 2,
    } as unknown as LmsCursoDetalhe;
    const matricula = {
      id: matriculaId,
      status: 'NAO_INICIADO',
      progresso_pct: 10,
      ultimo_slide: 1,
      ultima_pagina: 2,
    } as unknown as LmsMatricula;
    const ead = { ...matricula } as unknown as LmsMatriculaEAD;

    queryClient.setQueryData(lmsKeys.matriculaDetalhe(matriculaId), detalhe);
    queryClient.setQueryData(lmsKeys.minhasMatriculas(), [matricula]);
    queryClient.setQueryData(lmsKeys.minhasEAD(), [ead]);

    const { result } = renderHook(() => useSalvarProgresso(), {
      wrapper: wrapperFor(queryClient),
    });

    let mutationPromise!: Promise<unknown>;
    act(() => {
      mutationPromise = result.current.mutateAsync({
        matriculaId,
        progresso_pct: 70,
        ultimo_slide: 5,
        ultima_pagina: 8,
      });
    });

    await waitFor(() => {
      expect(
        queryClient.getQueryData<LmsCursoDetalhe>(lmsKeys.matriculaDetalhe(matriculaId))
          ?.progresso_pct,
      ).toBe(70);
    });

    await act(async () => {
      releaseRequest();
      await expect(mutationPromise).rejects.toThrow();
    });

    expect(queryClient.getQueryData(lmsKeys.matriculaDetalhe(matriculaId))).toEqual(detalhe);
    expect(queryClient.getQueryData(lmsKeys.minhasMatriculas())).toEqual([matricula]);
    expect(queryClient.getQueryData(lmsKeys.minhasEAD())).toEqual([ead]);
  });
});
