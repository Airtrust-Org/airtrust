import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { CardMeusEAD } from '@/react-app/components/dashboard/CardMeusEAD';
import { fetchWithAuth } from '@/react-app/config/api';
import { baixarCertificadoCanonico } from '@/react-app/utils/certificadoDownload';
import { useMinhasEAD } from '@/react-app/hooks/useLms';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import type { LmsMatriculaEAD } from '@/react-app/hooks/useLms';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/react-app/config/api', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/config/api')>('@/react-app/config/api');
  return { ...actual, fetchWithAuth: vi.fn() };
});

vi.mock('@/react-app/utils/certificadoDownload', () => ({
  baixarCertificadoCanonico: vi.fn(),
  resolveCertificadoDocumentoId: (cert: { documento_id?: number | null; id?: number | null }) =>
    typeof cert.documento_id === 'number'
      ? cert.documento_id
      : typeof cert.id === 'number'
        ? cert.id
        : null,
}));

vi.mock('@/react-app/hooks/useLms', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useLms')>(
    '@/react-app/hooks/useLms',
  );
  return { ...actual, useMinhasEAD: vi.fn() };
});

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}));

const fetchWithAuthMock = vi.mocked(fetchWithAuth);
const baixarMock = vi.mocked(baixarCertificadoCanonico);
const useMinhasEADMock = vi.mocked(useMinhasEAD);
const usePermissionsMock = vi.mocked(usePermissions);

function matricula(overrides: Partial<LmsMatriculaEAD> = {}): LmsMatriculaEAD {
  return {
    id: 402,
    empresa_id: 6,
    curso_id: 10,
    funcionario_id: 1,
    status: 'CONCLUIDO',
    progresso_pct: 100,
    score_final: 100,
    tentativas: 1,
    data_matricula: '2026-01-01',
    data_inicio: '2026-01-01',
    data_conclusao: '2026-01-05',
    data_expiracao: null,
    qualificacao_historico_id: 900,
    observacoes: null,
    titulo: 'Conhecimentos Gerais de Aeronaves',
    data_vencimento_qualificacao: null,
    tem_certificado: 1,
    ...overrides,
  } as LmsMatriculaEAD;
}

function renderCard() {
  return render(
    <MemoryRouter>
      <CardMeusEAD />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePermissionsMock.mockReturnValue({
    isAluno: true,
    isInstrutor: false,
  } as unknown as ReturnType<typeof usePermissions>);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CardMeusEAD — download de certificado', () => {
  it('baixa via documento_id, nunca via r2_key ou /documentos/download', async () => {
    useMinhasEADMock.mockReturnValue({
      data: [matricula()],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    fetchWithAuthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ id: 501, documento_id: 501, nome_arquivo: 'CERT.pdf', r2_key: 'legacy/key.pdf' }],
        }),
        { status: 200 },
      ),
    );

    renderCard();

    fireEvent.click(screen.getByText('Baixar certificado'));

    await waitFor(() => expect(baixarMock).toHaveBeenCalledTimes(1));

    const calledWith = baixarMock.mock.calls[0][0];
    expect(calledWith.documento_id).toBe(501);

    const calledUrl = String(fetchWithAuthMock.mock.calls[0][0]);
    expect(calledUrl).toMatch(/\/certificados\/historico\/900\/certificados$/);
    expect(calledUrl).not.toMatch(/r2_key|documentos\/download/);
  });

  it('não chama o download e mostra erro sanitizado quando não há certificado', async () => {
    useMinhasEADMock.mockReturnValue({
      data: [matricula()],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    fetchWithAuthMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), { status: 200 }),
    );

    renderCard();
    fireEvent.click(screen.getByText('Baixar certificado'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Nenhum certificado disponível para download.'),
    );
    expect(baixarMock).not.toHaveBeenCalled();
  });

  it('propaga mensagem sanitizada de erro (403/404) do fluxo canônico', async () => {
    useMinhasEADMock.mockReturnValue({
      data: [matricula()],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    fetchWithAuthMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: [{ id: 501, documento_id: 501, nome_arquivo: 'CERT.pdf' }] }),
        { status: 200 },
      ),
    );
    baixarMock.mockRejectedValue(
      new Error('Certificado não encontrado ou arquivo ausente no armazenamento.'),
    );

    renderCard();
    fireEvent.click(screen.getByText('Baixar certificado'));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Certificado não encontrado ou arquivo ausente no armazenamento.',
      ),
    );
  });

  it('não exibe botão de certificado quando matrícula não possui tem_certificado', () => {
    useMinhasEADMock.mockReturnValue({
      data: [matricula({ tem_certificado: 0 })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();
    expect(screen.queryByText('Baixar certificado')).not.toBeInTheDocument();
  });

  it('regression: fluxo concluído sem erro "Token de autenticação não fornecido"', async () => {
    // - matrícula concluída; tem_certificado = 1;
    useMinhasEADMock.mockReturnValue({
      data: [matricula({ status: 'CONCLUIDO', tem_certificado: 1 })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    // - chamada autenticada de listagem;
    fetchWithAuthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ id: 501, documento_id: 501, nome_arquivo: 'CERT.pdf' }],
        }),
        { status: 200 },
      ),
    );

    // mock do stream não é chamado aqui pois baixarCertificadoCanonico é mockado nesta suíte
    baixarMock.mockResolvedValue(undefined);

    renderCard();

    // - clicar “Baixar certificado”;
    fireEvent.click(screen.getByText('Baixar certificado'));

    await waitFor(() => expect(baixarMock).toHaveBeenCalledTimes(1));

    // - fluxo concluído sem toast “Token de autenticação não fornecido”
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('Token de autenticação não fornecido'));
  });
});
