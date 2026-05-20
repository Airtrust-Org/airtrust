import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { server } from '@/test/mocks/server';
import { http, HttpResponse } from 'msw';
import { useEscalaMutations } from '../useEscalasMutations';
import { makeTripulante } from '@/test/mocks/factories/escala.factory';
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

// ─── TripulanteOperacional CMA status shapes ──────────────────────────────

describe('CMA tripulante data shapes', () => {
  it('APTO tripulante has cma_valido=true and pode_ser_alocado=true', () => {
    const t = makeTripulante();
    expect(t.cma_valido).toBe(true);
    expect(t.pode_ser_alocado).toBe(true);
    expect(t.status_operacional).toBe('APTO');
  });

  it('ATENCAO_CMA tripulante has cma_valido=true but low dias_restantes', () => {
    const t = makeTripulante({
      cma_valido: true,
      cma_dias_restantes: 20,
      cma_validade_fim: '2026-03-30',
      status_operacional: 'ATENCAO_CMA',
      pode_ser_alocado: true,
    });
    expect(t.cma_valido).toBe(true);
    expect(t.pode_ser_alocado).toBe(true);
    expect(t.cma_dias_restantes).toBeLessThanOrEqual(30);
  });

  it('BLOQUEADO_CMA tripulante has cma_valido=false and pode_ser_alocado=false', () => {
    const t = makeTripulante({
      cma_valido: false,
      cma_dias_restantes: -10,
      cma_validade_fim: '2026-01-01',
      status_operacional: 'BLOQUEADO_CMA',
      pode_ser_alocado: false,
      motivo_bloqueio: 'CMA expirado',
    });
    expect(t.cma_valido).toBe(false);
    expect(t.pode_ser_alocado).toBe(false);
    expect(t.status_operacional).toBe('BLOQUEADO_CMA');
  });

  it('sem_cma tripulante has cma_valido=false and no validade_fim', () => {
    const t = makeTripulante({
      cma_valido: false,
      cma_dias_restantes: null,
      cma_validade_fim: null,
      status_operacional: 'BLOQUEADO_CMA',
      pode_ser_alocado: false,
    });
    expect(t.cma_valido).toBe(false);
    expect(t.cma_validade_fim).toBeNull();
  });

  it('BLOQUEADO_FRMS tripulante has pode_ser_alocado=false and frms_status=critico', () => {
    const t = makeTripulante({
      frms_status: 'critico',
      frms_score: 85,
      status_operacional: 'BLOQUEADO_FRMS',
      pode_ser_alocado: false,
    });
    expect(t.frms_status).toBe('critico');
    expect(t.pode_ser_alocado).toBe(false);
    expect(t.status_operacional).toBe('BLOQUEADO_FRMS');
  });
});

// ─── SOFT_BLOCK: cma_override mutation behaviour ──────────────────────────

// Fake JWT with future exp — satisfies isValidToken() without a real backend
const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjo5OTk5OTk5OTk5OTl9.fakesig';

describe('adicionarAlocacaoOperacional CMA SOFT_BLOCK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'airtrust_token') return FAKE_JWT;
      return null;
    });
  });

  it('CMA_EXPIRADO without override returns 409 error', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    await act(async () => {
      try {
        await result.current.adicionarAlocacaoOperacional('escala-1', {
          funcionario_id: '10',
          funcao: 'CMA_EXPIRADO' as 'PIC', // triggers CMA_EXPIRADO mock when no override
          data_inicio: '2026-05-01',
          data_fim: '2026-05-16',
        });
      } catch {
        // expected throw
      }
    });

    expect(result.current.error).toBeTruthy();
  });

  it('CMA_EXPIRADO with cma_override=1 succeeds', async () => {
    // Override handler: accept CMA_EXPIRADO + cma_override
    server.use(
      http.post(`${BASE}/escalas/:id/alocacoes`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        if (body?.funcao === 'CMA_EXPIRADO' && body?.cma_override === 1) {
          return HttpResponse.json({
            success: true,
            data: {
              alocacao: { id: 'aloc-cma-override' },
              alertas: [{ tipo: 'CMA_OVERRIDE', detalhe: 'Override confirmado' }],
            },
          });
        }
        return HttpResponse.json(
          { success: false, error: 'CMA expirado', code: 'CMA_EXPIRADO' },
          { status: 409 },
        );
      }),
    );

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    let response: unknown;
    await act(async () => {
      response = await result.current.adicionarAlocacaoOperacional('escala-1', {
        funcionario_id: '10',
        funcao: 'CMA_EXPIRADO' as 'PIC',
        data_inicio: '2026-05-01',
        data_fim: '2026-05-16',
        cma_override: 1,
      });
    });

    expect(result.current.error).toBeNull();
    expect(response).toBeDefined();
  });

  it('cma_override field is correctly typed as 0 | 1', async () => {
    // Type-level test: passing cma_override: 0 is valid
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    let response: unknown;
    await act(async () => {
      response = await result.current.adicionarAlocacaoOperacional('escala-1', {
        funcionario_id: '10',
        funcao: 'PIC',
        data_inicio: '2026-05-01',
        data_fim: '2026-05-16',
        cma_override: 0,
      });
    });

    expect(result.current.error).toBeNull();
    expect(response).toBeDefined();
  });

  it('CMA_EXPIRADO with override=0 (falsy) still returns error', async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useEscalaMutations(), { wrapper });

    await act(async () => {
      try {
        await result.current.adicionarAlocacaoOperacional('escala-1', {
          funcionario_id: '10',
          funcao: 'CMA_EXPIRADO' as 'PIC',
          data_inicio: '2026-05-01',
          data_fim: '2026-05-16',
          cma_override: 0,
        });
      } catch {
        // expected throw
      }
    });

    expect(result.current.error).toBeTruthy();
  });
});
