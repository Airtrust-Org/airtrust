import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useMatriculaDetalhe: vi.fn(),
  navigate: vi.fn(),
  params: { matriculaId: '101' },
}));
vi.mock('react-router-dom', () => ({
  useParams: () => mocks.params,
  useNavigate: () => mocks.navigate,
}));
vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: mocks.useMatriculaDetalhe,
}));
vi.mock('@/react-app/pages/lms/native/NativeStagingCoursePreview', () => ({
  default: ({ matriculaId }: { matriculaId: number }) =>
    <span data-testid="native-preview">Matrícula {matriculaId}</span>,
}));
import LmsNativePlayer from '@/react-app/pages/lms/LmsNativePlayer';

describe('Native route uses enrollment-bound preview only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params.matriculaId = '101';
    mocks.useMatriculaDetalhe.mockReturnValue({
      isLoading: false,
      data: { id: 101, tipo_conteudo: 'native' },
    });
  });
  it('routes the exact Native enrollment into the gated preview without SCORM completion controls', () => {
    render(<LmsNativePlayer />);
    expect(screen.getByTestId('native-preview')).toHaveTextContent('Matrícula 101');
    expect(screen.queryByRole('button', { name: /concluir|certificado/i })).toBeNull();
  });
  it('fails closed for a SCORM enrollment, wrong enrollment or missing enrollment', () => {
    for (const data of [
      { id: 101, tipo_conteudo: 'scorm' },
      { id: 102, tipo_conteudo: 'native' },
      null,
    ]) {
      mocks.useMatriculaDetalhe.mockReturnValue({ isLoading: false, data });
      const page = render(<LmsNativePlayer />);
      expect(screen.getByRole('alert')).toHaveTextContent('Curso Native indisponível');
      expect(screen.queryByTestId('native-preview')).toBeNull();
      page.unmount();
    }
  });
  it('rejects malformed route IDs before rendering content', () => {
    mocks.params.matriculaId = '0';
    render(<LmsNativePlayer />);
    expect(screen.getByRole('alert')).toHaveTextContent('Identificador de matrícula inválido');
    expect(screen.queryByTestId('native-preview')).toBeNull();
  });
});
