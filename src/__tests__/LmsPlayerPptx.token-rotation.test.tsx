// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { pptxToHtml } from '@jvmr/pptx-to-html';
import { fetchLmsCourseAsset } from '@/react-app/pages/lms/lmsProtectedCourseAsset';
import LmsPlayerPptx from '@/react-app/pages/lms/LmsPlayerPptx';

const mocks = vi.hoisted(() => {
  const save = { mutate: vi.fn() };
  const finalize = { mutate: vi.fn(), isPending: false };
  return { save, finalize, auth: { token: 'access-a' } };
});

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: mocks.auth.token }),
}));

vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => ({
    data: {
      id: 101, curso_id: 22, tipo_conteudo: 'pptx', titulo: 'Regras de Ouro — Petrobras',
      status: 'EM_ANDAMENTO', ultimo_slide: 0,
    },
    isLoading: false,
  }),
  useFinalizarMatricula: () => mocks.finalize,
  useSalvarProgresso: () => mocks.save,
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  getAccessToken: () => mocks.auth.token,
}));

vi.mock('@/react-app/pages/lms/pptxViewer', () => ({
  fetchPptxViewerSession: vi.fn(async () => { throw new Error('Office viewer unavailable'); }),
}));

vi.mock('@/react-app/pages/lms/lmsProtectedCourseAsset', () => ({
  fetchLmsCourseAsset: vi.fn(async (kind: string) => kind === 'pptx-rendered'
    ? new Response(null, { status: 404 }) : new Response(new Uint8Array([1, 2, 3]))),
}));

vi.mock('@jvmr/pptx-to-html', () => ({
  pptxToHtml: vi.fn(async () => ['<div style="width:1280px;height:720px">Slide 1</div>']),
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

describe('PPTX learner content is stable across access-token rotation', () => {
  beforeEach(() => {
    mocks.auth.token = 'access-a';
    mocks.save.mutate.mockReset();
    mocks.finalize.mutate.mockReset();
    vi.mocked(fetchLmsCourseAsset).mockClear();
    vi.mocked(pptxToHtml).mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 0));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('does not refetch or reparse 111-slide course after refreshed login token', async () => {
    const view = render(player());
    await waitFor(() => expect(pptxToHtml).toHaveBeenCalledTimes(1));
    expect(fetchLmsCourseAsset).toHaveBeenCalledWith('pptx-rendered', 22);
    expect(fetchLmsCourseAsset).toHaveBeenCalledWith('pptx', 22);

    mocks.auth.token = 'access-b';
    view.rerender(player());

    // Token refresh should not trigger an expensive whole-presentation load.
    await waitFor(() => expect(pptxToHtml).toHaveBeenCalledTimes(1));
    expect(fetchLmsCourseAsset).toHaveBeenCalledTimes(2);
    expect(mocks.finalize.mutate).not.toHaveBeenCalled();
  });
});
