import { afterEach, describe, expect, it, vi } from 'vitest';
import { useQualificacoesHistorico } from '../hooks/useQualificacoesExt';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';
import { API_BASE_URL } from '@/react-app/config/api';

// Mock useAuth so the hook doesn't require AuthProvider
vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', logout: vi.fn() }),
}));

// Mock sonner (toast library used by the hook)
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const API = API_BASE_URL;

describe('useQualificacoesHistorico - renovarQualificacao', () => {
  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
  });

  it('renova uma qualificacao com sucesso e recarrega historico', async () => {
    server.use(
      // useApi initial list fetch uses the full production URL (via buildFullUrl)
      http.get(`${API}/qualificacoes/historico`, () =>
        HttpResponse.json({ success: true, data: [], total: 0 }),
      ),
      // renovarQualificacao uses a relative URL directly
      http.post(/qualificacoes\/historico\/10\/renovar/, () =>
        HttpResponse.json({ success: true, data: { novo: { id: 123 } } }),
      ),
    );

    const { result } = renderHook(() => useQualificacoesHistorico());

    let novo: unknown;
    await act(async () => {
      novo = await result.current.renovarQualificacao(10, '2030-12-31');
    });

    expect(novo).toMatchObject({ id: 123 });
  });

  it('retorna null em erro de renovacao', async () => {
    server.use(
      http.get(`${API}/qualificacoes/historico`, () =>
        HttpResponse.json({ success: true, data: [], total: 0 }),
      ),
      http.post(/qualificacoes\/historico\/99\/renovar/, () =>
        HttpResponse.json({ success: false, error: 'Falha' }, { status: 400 }),
      ),
    );

    const { result } = renderHook(() => useQualificacoesHistorico());

    let retorno: unknown;
    await act(async () => {
      retorno = await result.current.renovarQualificacao(99, '2031-01-01');
    });

    expect(retorno).toBeNull();
  });

  it('mantem referencias derivadas estaveis quando o payload nao muda', async () => {
    server.use(
      http.get(`${API}/qualificacoes/historico`, () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 1,
              funcionario_id: 10,
              qualificacao_id: 20,
              funcionario_nome: 'Tripulante Teste',
              qualificacao_desc: 'G1',
              data_registro: '2026-06-01',
              data_vencimento: '2026-12-01',
              status: 'VALIDA',
            },
          ],
        }),
      ),
    );

    const { result, rerender } = renderHook(() => useQualificacoesHistorico());

    await waitFor(() => expect(result.current.historico).toHaveLength(1));

    const historicoRef = result.current.historico;
    const statsRef = result.current.stats;

    rerender();

    expect(result.current.historico).toBe(historicoRef);
    expect(result.current.stats).toBe(statsRef);
  });
});
