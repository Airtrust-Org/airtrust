import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: api.fetchWithAuth,
}));

import NativeStagingCoursePreview from '@/react-app/pages/lms/native/NativeStagingCoursePreview';

const course = {
  schema: 'AIRTRUST_NATIVE_COURSE_V1',
  courseId: 'nr6', packageVersion: 'n-v1', title: 'Treinamento NR-6',
  locale: 'pt-BR',
  policy: { mode: 'FORMATIVE' },
  assets: [{
    id: 'hero', path: 'media/hero.webp', sha256: 'a'.repeat(64), mime: 'image/webp',
  }],
  units: [{
    id: 'intro', title: 'Introdução', kind: 'lesson',
    blocks: [{ type: 'image', assetId: 'hero', alt: 'Equipamento de proteção' }],
    questionIds: [],
  }],
  questions: [],
};
const payload = (extra: Record<string, unknown>={}) => ({
  success: true,
  data: {
    matricula_id: 101, ciclo_id: 11, edition_sha256: 'b'.repeat(64),
    mode: 'LEARN', completion_supported: false, course, ...extra,
  },
});
const response = (data: unknown) => new Response(JSON.stringify(data), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
const media = () => new Response(new Uint8Array([1,2,3]), {
  status: 200, headers: { 'Content-Type': 'image/webp', 'Content-Length': '3' },
});

describe('Native pilot preview — authenticated read-only React', () => {
  beforeEach(() => {
    api.fetchWithAuth.mockReset();
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:http://localhost/verified-asset'), configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(), configurable: true,
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('requests one enrolled course and its media through the existing bearer-aware client', async () => {
    api.fetchWithAuth
      .mockResolvedValueOnce(response(payload()))
      .mockResolvedValueOnce(media());
    const { unmount } = render(<NativeStagingCoursePreview matriculaId={101} />);
    expect(await screen.findByRole('heading', { name: 'Treinamento NR-6' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Equipamento de proteção' })).toHaveAttribute(
      'src', 'blob:http://localhost/verified-asset',
    );
    expect(api.fetchWithAuth).toHaveBeenCalledTimes(2);
    expect(api.fetchWithAuth.mock.calls.map(([url]) => url)).toEqual([
      '/api/lms/native/matriculas/101/curso',
      '/api/lms/native/matriculas/101/assets/hero',
    ]);
    expect(api.fetchWithAuth.mock.calls.every(([, opts]) =>
      opts.method === 'GET' && opts.cache === 'no-store'
    )).toBe(true);
    expect(screen.queryByRole('button', { name: /concluir|certificado/i })).toBeNull();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/verified-asset');
  });

  it('does not load media when server signals an unsupported completion contract', async () => {
    api.fetchWithAuth.mockResolvedValueOnce(response(payload({ completion_supported: true })));
    render(<NativeStagingCoursePreview matriculaId={101} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Prévia nativa indisponível');
    expect(api.fetchWithAuth).toHaveBeenCalledTimes(1);
  });

  it('rejects leaked server grading keys before rendering any authored content', async () => {
    api.fetchWithAuth.mockResolvedValueOnce(response(payload({
      course: { ...course, questions: [
        { id: 'q1', prompt: 'Pergunta', options: [], correctOptionId: 'secret' },
      ] },
    })));
    render(<NativeStagingCoursePreview matriculaId={101} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Prévia nativa indisponível');
    expect(screen.queryByText('Pergunta')).toBeNull();
  });

  it('does not request data for missing or invalid enrollment IDs', async () => {
    render(<NativeStagingCoursePreview matriculaId={0} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(api.fetchWithAuth).not.toHaveBeenCalled();
  });

  it('does not turn unauthorized binary responses into Blob URLs', async () => {
    api.fetchWithAuth
      .mockResolvedValueOnce(response(payload()))
      .mockResolvedValueOnce(new Response('Denied', { status: 403 }));
    render(<NativeStagingCoursePreview matriculaId={101} />);
    expect(await screen.findByRole('heading', { name: 'Treinamento NR-6' })).toBeInTheDocument();
    expect(await screen.findByText(/Mídia indisponível/)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
