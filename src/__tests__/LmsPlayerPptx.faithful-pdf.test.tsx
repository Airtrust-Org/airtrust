// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LmsPlayerPptx from '@/react-app/pages/lms/LmsPlayerPptx';
import { pptxToHtml } from '@jvmr/pptx-to-html';
import { fetchLmsCourseAsset } from '@/react-app/pages/lms/lmsProtectedCourseAsset';

vi.mock('@/react-app/hooks/useAuth', () => ({ useAuth: () => ({ token: 'valid-token' }) }));
vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => ({ data: { id: 1454, curso_id: 22, tipo_conteudo: 'pptx',
    status: 'EM_ANDAMENTO', gerar_qualificacao_ao_concluir: 1, titulo: 'Regras de Ouro' }, isLoading: false }),
  useFinalizarMatricula: () => ({ mutate: vi.fn(), isPending: false }),
  useSalvarProgresso: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api', getAccessToken: () => 'valid-token',
  fetchWithAuth: vi.fn(async () => new Response(JSON.stringify({ success: true, data: {
    total_slides: 111, visited_indexes: [], next_slide: 0,
    ready_to_finalize: false, asset_etag: 'source-pptx-etag',
  } }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
}));
vi.mock('@/react-app/pages/lms/pptxViewer', () => ({
  fetchPptxViewerSession: vi.fn(async () => { throw new Error('unavailable'); }),
}));
vi.mock('@/react-app/pages/lms/pptxViewport', () => ({ observePptxSlideLayout: () => () => {} }));
vi.mock('@/react-app/pages/lms/lmsProtectedCourseAsset', () => ({
  fetchLmsCourseAsset: vi.fn(async (kind: string) => {
    if (kind !== 'pptx-rendered') throw new Error('UNEXPECTED_UNFAITHFUL_FALLBACK');
    return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200,
      headers: { ETag: '"source-pptx-etag"', 'X-Pptx-Slide-Count': '111' } });
  }),
}));
vi.mock('@jvmr/pptx-to-html', () => ({ pptxToHtml: vi.fn() }));
vi.mock('@/react-app/pages/lms/PptxPdfCanvas', () => ({
  openPptxPdf: vi.fn(async () => ({ numPages: 111, destroy: vi.fn(async () => undefined) })),
  PptxPdfCanvas: ({index}: {index:number}) => <div data-testid="faithful-slide">PDF page {index+1}</div>,
}));

describe('PPTX faithful derivative is preferred over lossy HTML', () => {
  it('loads PDF for 111-slide Petrobras course with original source ETag, without certifying it', async () => {
    render(<MemoryRouter initialEntries={['/lms/player/pptx/1454']}><Routes>
      <Route path="/lms/player/pptx/:matriculaId" element={<LmsPlayerPptx />} />
    </Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('faithful-slide').textContent).toContain('PDF page 1'));
    expect(screen.getByText('Slide 1 de 111')).toBeTruthy();
    expect(fetchLmsCourseAsset).toHaveBeenCalledWith('pptx-rendered', 22);
    expect(fetchLmsCourseAsset).toHaveBeenCalledTimes(1);
    expect(pptxToHtml).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Concluir curso' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
