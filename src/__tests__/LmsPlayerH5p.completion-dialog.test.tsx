import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LmsPlayerH5p from '@/react-app/pages/lms/LmsPlayerH5p';

const { submit, dispatcher } = vi.hoisted(() => ({
  submit: vi.fn(),
  dispatcher: { on: vi.fn() },
}));

vi.mock('h5p-standalone', () => ({
  H5PStandalone: class {
    constructor() {}
  },
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'token' }),
}));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787',
  AUTH_TOKEN_CHANGED_EVENT: 'airtrust-auth-token-changed',
  ensureValidAccessToken: vi.fn(async () => 'token'),
  fetchWithAuth: vi.fn(async () => ({ ok: true })),
  getAccessToken: () => 'token',
}));
vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => ({
    data: {
      id: 42, curso_id: 7, titulo: 'H5P Teste', h5p_conteudo_id: 10,
      status: 'EM_ANDAMENTO',
    },
    isLoading: false,
  }),
  usePostXapiStatement: () => ({ mutateAsync: submit }),
}));

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/lms/player/h5p/42']}>
        <Routes>
          <Route path="/lms/player/h5p/:matriculaId" element={<LmsPlayerH5p />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('H5P explicit completion dialog', () => {
  beforeEach(() => {
    submit.mockReset();
    dispatcher.on.mockReset();
    (window as Window & { H5P?: unknown }).H5P = { externalDispatcher: dispatcher };
  });

  it('defers the terminal statement until Confirmar conclusão is clicked', async () => {
    submit.mockResolvedValue({ novo_status: 'CONCLUIDO', qualificacao_gerada: null });
    mount();
    const button = await screen.findByRole('button', { name: 'Concluir curso' });
    expect(button).toBeDisabled();
    await waitFor(() => expect(dispatcher.on).toHaveBeenCalledWith('xAPI', expect.any(Function)));

    const callback = dispatcher.on.mock.calls.find((c) => c[0] === 'xAPI')?.[1];
    expect(callback).toBeDefined();
    await act(async () => {
      callback({ statement: {
        verb: { id: 'http://adlnet.gov/expapi/verbs/completed' },
        object: { id: 'h5p:10' },
        result: { completion: true, success: true },
      } });
    });
    expect(submit).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'Concluir curso' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar conclusão' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });
});
