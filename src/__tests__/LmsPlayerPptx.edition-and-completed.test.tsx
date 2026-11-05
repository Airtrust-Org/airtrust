// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fetchLmsCourseAsset } from '@/react-app/pages/lms/lmsProtectedCourseAsset';
import { pptxToHtml } from '@jvmr/pptx-to-html';
import LmsPlayerPptx from '@/react-app/pages/lms/LmsPlayerPptx';

const mocks = vi.hoisted(() => ({
  status: 'CONCLUIDO',
  assetEtag: 'old-asset',
  serverEtag: 'new-asset',
  save: { mutate: vi.fn() },
  finalize: { mutate: vi.fn(), isPending: false },
  fetchWithAuth: vi.fn(),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({ useAuth: () => ({ token: 'valid-token' }) }));
vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => ({
    data: { id: 101, curso_id: 22, tipo_conteudo: 'pptx',
      titulo: 'Regras de Ouro — Petrobras', status: mocks.status,
      gerar_qualificacao_ao_concluir: 1, ultimo_slide: 0 },
    isLoading: false,
  }),
  useFinalizarMatricula: () => mocks.finalize,
  useSalvarProgresso: () => mocks.save,
}));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  getAccessToken: () => 'valid-token',
  fetchWithAuth: (...args: unknown[]) => mocks.fetchWithAuth(...args),
}));
vi.mock('@/react-app/pages/lms/pptxViewer', () => ({
  fetchPptxViewerSession: vi.fn(async () => { throw new Error('unavailable'); }),
}));
vi.mock('@/react-app/pages/lms/pptxViewport', () => ({
  observePptxSlideLayout: () => () => {},
}));
vi.mock('@/react-app/pages/lms/lmsProtectedCourseAsset', () => ({
  fetchLmsCourseAsset: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
    status: 200, headers: { ETag: '"' + mocks.assetEtag + '"' },
  })),
}));
vi.mock('@jvmr/pptx-to-html', () => ({
  pptxToHtml: vi.fn(async () => Array.from({ length: 3 },
    (_, index) => '<div>Slide content ' + (index + 1) + '</div>')),
}));

function player() {
  return (
    <MemoryRouter initialEntries={['/lms/player/pptx/101']}>
      <Routes>
        <Route path="/lms/player/pptx/:matriculaId" element={<LmsPlayerPptx />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PPTX learner edition and completed navigation', () => {
  beforeEach(() => {
    mocks.status = 'CONCLUIDO';
    mocks.assetEtag = 'old-asset';
    mocks.serverEtag = 'new-asset';
    mocks.finalize.mutate.mockReset();
    mocks.save.mutate.mockReset();
    vi.mocked(fetchLmsCourseAsset).mockClear();
    vi.mocked(pptxToHtml).mockClear();
    mocks.fetchWithAuth.mockReset().mockImplementation(async () => new Response(JSON.stringify({
      success: true,
      data: { total_slides: 3, visited_indexes: [], next_slide: 0,
        ready_to_finalize: false, asset_etag: mocks.serverEtag },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reopens a completed PPTX for read-only navigation without creating evidence', async () => {
    render(player());
    await waitFor(() => expect(pptxToHtml).toHaveBeenCalledTimes(1));
    const next = screen.getByRole('button', { name: 'Próximo' });
    expect((next as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByText('Slide 2 de 3')).toBeTruthy());
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled();
    expect(mocks.save.mutate).not.toHaveBeenCalled();
    expect(mocks.finalize.mutate).not.toHaveBeenCalled();
  });

  it('rejects stale slides and reloads the same-count newer asset before allowing evidence', async () => {
    mocks.status = 'EM_ANDAMENTO';
    const view = render(player());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/atualizada/i));
    expect((screen.getByRole('button', { name: 'Próximo' }) as HTMLButtonElement).disabled).toBe(true);
    mocks.assetEtag = 'new-asset';
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(fetchLmsCourseAsset).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(pptxToHtml).toHaveBeenCalledTimes(2));
    expect(mocks.finalize.mutate).not.toHaveBeenCalled();
    view.unmount();
  });
});
