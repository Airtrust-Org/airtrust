import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import TabGestaoWrapper from '../TabGestaoWrapper';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'https://api.airtrust.online/api',
  getAccessToken: () => 'token',
}));

vi.mock('@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions', () => ({
  useGuiasInstrutorPermissions: () => ({ podeGerenciar: false, podeVisualizar: false, isPlatformAdmin: false, isLoading: false }),
}));

vi.mock('../../cadastros/simuladores/index', () => ({ default: () => <div>SimuladoresPage</div> }));
vi.mock('../../cadastros/manobras/index', () => ({ default: () => <div>ManobrasPage</div> }));
vi.mock('../../cadastros/categorias/index', () => ({ default: () => <div>CategoriasPage</div> }));
vi.mock('../../cadastros/tipos-sessao/index', () => ({ default: () => <div>TiposSessaoPage</div> }));
vi.mock('../../cadastros/modelos-sessao/index', () => ({ default: () => <div>ModelosSessaoPage</div> }));
vi.mock('../../cadastros/curriculos-voo/index', () => ({ default: () => <div>CurriculosVooPage</div> }));

describe('TabGestaoWrapper', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      return window.setTimeout(() => cb(performance.now()), 0);
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      window.clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra alerta de parcialidade e erro explícito quando uma fonte falha', async () => {
    const responses = [
      new Response(JSON.stringify({ success: false, error: 'boom' }), { status: 500 }),
      new Response(JSON.stringify({ success: true, data: [{ id: 1 }] }), { status: 200 }),
      new Response(JSON.stringify({ success: true, data: [{ id: 1 }, { id: 2 }] }), { status: 200 }),
      new Response(JSON.stringify({ success: true, data: [{ id: 1 }] }), { status: 200 }),
      new Response(JSON.stringify({ success: true, data: [{ id: 1 }] }), { status: 200 }),
      new Response(JSON.stringify({ success: true, data: [{ id: 1 }] }), { status: 200 }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()));
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter><TabGestaoWrapper /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('nao como zero real');
    expect(screen.getAllByText('Erro').length).toBeGreaterThan(0);
  });

  it('renderiza contagens quando todas as fontes respondem com sucesso', async () => {
    const payload = (count: number) =>
      new Response(
        JSON.stringify({ success: true, data: Array.from({ length: count }, (_, index) => ({ id: index + 1 })) }),
        { status: 200 },
      );
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores?')) return Promise.resolve(payload(2));
      if (url.includes('/manobras?')) return Promise.resolve(payload(3));
      if (url.includes('/categorias?')) return Promise.resolve(payload(4));
      if (url.includes('/tipos-sessao?')) return Promise.resolve(payload(5));
      if (url.includes('/curriculos-voo?')) return Promise.resolve(payload(7));
      return Promise.resolve(payload(6));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<MemoryRouter><TabGestaoWrapper /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });
  });
});
