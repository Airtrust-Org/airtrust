import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { server } from '@/test/mocks/server';
import { http, HttpResponse } from 'msw';
import { useEscalaMutations } from '../useEscalasMutations';
import { API_BASE_URL } from '@/react-app/config/api';

const BASE = API_BASE_URL;

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

// Fake JWT with future exp — satisfies isValidToken() without a real backend
const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjo5OTk5OTk5OTk5OTl9.fakesig';

describe('useEscalaMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'airtrust_token') return FAKE_JWT;
      return null;
    });
  });

  it('starts with loading=false and error=null', () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('adicionarAlocacaoOperacional succeeds and returns alocacao', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    let response: unknown;
    await act(async () => {
      response = await result.current.adicionarAlocacaoOperacional('escala-1', {
        funcionario_id: '10',
        aeronave_id: 24,
        funcao: 'PIC',
        data_inicio: '2026-05-01',
        data_fim: '2026-05-16',
      });
    });

    expect(result.current.error).toBeNull();
    expect(response).toBeDefined();
  });

  it('adicionarAlocacaoOperacional sets error on overlap 409 (SOBREPOSICAO)', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    await act(async () => {
      try {
        await result.current.adicionarAlocacaoOperacional('escala-1', {
          funcionario_id: '10',
          funcao: 'SOBREPOSICAO' as 'PIC', // triggers mock 409
          data_inicio: '2026-05-01',
          data_fim: '2026-05-16',
        });
      } catch {
        // expected throw
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it('adicionarAlocacaoOperacional sets error on CMA blocked 409', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    await act(async () => {
      try {
        await result.current.adicionarAlocacaoOperacional('escala-1', {
          funcionario_id: '10',
          funcao: 'CMA_BLOQUEADA' as 'PIC', // triggers mock 409
          data_inicio: '2026-05-01',
          data_fim: '2026-05-16',
        });
      } catch {
        // expected throw
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it('adicionarEvento fails with 422 when tipo_evento_id is missing', async () => {
    // Override handler to return 422
    server.use(
      http.post(`${BASE}/escalas/:id/eventos`, () => {
        return HttpResponse.json(
          { success: false, error: 'tipo_evento_id obrigatório' },
          { status: 422 },
        );
      }),
    );

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    await act(async () => {
      try {
        await result.current.adicionarEvento('escala-1', {
          funcionario_id: '10',
          tipo_evento_id: '' as string,
          data_inicio: '2026-05-05',
          data_fim: '2026-05-05',
        });
      } catch {
        // expected throw
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it('removerEvento returns success via MSW handler', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    let threw = false;
    await act(async () => {
      try {
        await result.current.removerEvento('escala-1', 'ev-1');
      } catch {
        threw = true;
      }
    });

    expect(threw).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
