import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useMatriculaDetalhe: vi.fn(),
  fetchWithAuth: vi.fn(),
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
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  fetchWithAuth: mocks.fetchWithAuth,
}));
vi.mock('@/react-app/pages/lms/player3/Player3AuthenticatedStagingEntry', () => ({
  default: ({matriculaId,active}: {matriculaId:number;active:boolean}) =>
    <span data-testid="native-entry">Matrícula {matriculaId}; {active?'active':'unstarted'}</span>,
}));
import LmsNativePlayer from '@/react-app/pages/lms/LmsNativePlayer';

const enrollment = {
  id: 101, empresa_id: 6, curso_id: 31,
  status: 'EM_ANDAMENTO', tipo_conteudo: 'native', titulo: 'Treinamento',
};
const response = (body:unknown,status=200) =>
  new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const accepted = {
  success: true,
  data: {matricula_id:101,curso_id:31,mode:'LEARN',native_package:'NOT_YET_ENABLED'},
};

describe('Native route admission for a governed SCORM-backed Player3 marker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params.matriculaId = '101';
    mocks.useMatriculaDetalhe.mockReturnValue({isLoading:false,data:{...enrollment}});
  });

  it('keeps physical Native enrollment working without a redundant marker lookup', () => {
    render(<LmsNativePlayer />);
    expect(screen.getByTestId('native-entry')).toHaveTextContent('Matrícula 101');
    expect(screen.queryByRole('button',{name:/concluir|certificado/i})).toBeNull();
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled();
  });

  it('requires the Worker to authenticate the exact activated SCORM course', async () => {
    mocks.useMatriculaDetalhe.mockReturnValue({
      isLoading:false,data:{...enrollment,tipo_conteudo:'scorm'},
    });
    mocks.fetchWithAuth.mockResolvedValueOnce(response(accepted));
    render(<LmsNativePlayer />);
    expect(screen.queryByTestId('native-entry')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/verificando ativação/i);
    expect(await screen.findByTestId('native-entry')).toHaveTextContent('Matrícula 101');
    expect(mocks.fetchWithAuth).toHaveBeenCalledWith(
      '/api/lms/native/matriculas/101/admissao',
      expect.objectContaining({method:'GET',cache:'no-store',signal:expect.any(AbortSignal)}),
    );
    expect(mocks.fetchWithAuth).toHaveBeenCalledTimes(1);
  });

  it('rejects marker off, HTTP failure, forged course or wrong mode without mounting the learner', async () => {
    for (const [payload,status] of [
      [{success:false},404],
      [accepted,403],
      [{...accepted,data:{...accepted.data,curso_id:32}},200],
      [{...accepted,data:{...accepted.data,mode:'REVIEW'}},200],
      [{...accepted,data:{...accepted.data,matricula_id:102}},200],
      [{...accepted,data:{...accepted.data,native_package:'REVIEW_ONLY'}},200],
    ] as const) {
      mocks.useMatriculaDetalhe.mockReturnValue({
        isLoading:false,data:{...enrollment,tipo_conteudo:'scorm'},
      });
      mocks.fetchWithAuth.mockResolvedValueOnce(response(payload,status));
      const page=render(<LmsNativePlayer />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Curso Native indisponível');
      expect(screen.queryByTestId('native-entry')).toBeNull();
      page.unmount();
    }
  });

  it('accepts read-only completed status only when the Worker returns REVIEW', async () => {
    mocks.useMatriculaDetalhe.mockReturnValue({
      isLoading:false,data:{...enrollment,tipo_conteudo:'scorm',status:'CONCLUIDO'},
    });
    mocks.fetchWithAuth.mockResolvedValueOnce(response({
      ...accepted,data:{...accepted.data,mode:'REVIEW'},
    }));
    render(<LmsNativePlayer />);
    expect(await screen.findByTestId('native-entry')).toHaveTextContent('unstarted');
    expect(mocks.fetchWithAuth).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed IDs, non-Native courses, wrong enrollment and missing enrollment', () => {
    for (const data of [
      {...enrollment,tipo_conteudo:'h5p'},
      {...enrollment,id:102},
      {...enrollment,empresa_id:0},
      null,
    ]) {
      mocks.useMatriculaDetalhe.mockReturnValue({isLoading:false,data});
      const page=render(<LmsNativePlayer />);
      expect(screen.getByRole('alert')).toHaveTextContent('Curso Native indisponível');
      expect(screen.queryByTestId('native-entry')).toBeNull();
      page.unmount();
    }
    mocks.params.matriculaId='0';
    const page=render(<LmsNativePlayer />);
    expect(screen.getByRole('alert')).toHaveTextContent('Identificador de matrícula inválido');
    page.unmount();
    expect(mocks.fetchWithAuth).not.toHaveBeenCalled();
  });

  it('never mounts an activated SCORM entry after admission transport failure', async () => {
    mocks.useMatriculaDetalhe.mockReturnValue({
      isLoading:false,data:{...enrollment,tipo_conteudo:'scorm'},
    });
    mocks.fetchWithAuth.mockRejectedValueOnce(new Error('OFFLINE'));
    render(<LmsNativePlayer />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByTestId('native-entry')).toBeNull();
  });
});
