/**
 * CardMeusEAD — três estados de certificado para matrícula CONCLUIDO:
 *   AVAILABLE     → [Rever] [Baixar certificado]
 *   PENDING       → [Rever] [Certificado em processamento]
 *   NOT_REQUIRED  → [Rever]
 *
 * "Rever" deve estar sempre presente como botão explícito quando concluído,
 * independentemente do estado do certificado.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardMeusEAD } from '@/react-app/components/dashboard/CardMeusEAD';
import { useMinhasEAD } from '@/react-app/hooks/useLms';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import type { LmsMatriculaEAD } from '@/react-app/hooks/useLms';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/react-app/config/api', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/config/api')>('@/react-app/config/api');
  return { ...actual, fetchWithAuth: vi.fn() };
});

vi.mock('@/react-app/utils/certificadoDownload', () => ({
  baixarCertificadoCanonico: vi.fn(),
  resolveCertificadoDocumentoId: () => 501,
}));

vi.mock('@/react-app/hooks/useLms', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useLms')>(
    '@/react-app/hooks/useLms',
  );
  return { ...actual, useMinhasEAD: vi.fn() };
});

vi.mock('@/react-app/hooks/usePermissions', () => ({ usePermissions: vi.fn() }));

const useMinhasEADMock = vi.mocked(useMinhasEAD);
const usePermissionsMock = vi.mocked(usePermissions);

function matricula(overrides: Partial<LmsMatriculaEAD> = {}): LmsMatriculaEAD {
  return {
    id: 1,
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
    titulo: 'Curso concluído',
    data_vencimento_qualificacao: null,
    tem_certificado: 0,
    certificate_state: 'NOT_REQUIRED',
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
  vi.useRealTimers();
});

describe('CardMeusEAD — três estados de certificado', () => {
  it('AVAILABLE: mostra Rever e Baixar certificado', () => {
    useMinhasEADMock.mockReturnValue({
      data: [matricula({ certificate_state: 'AVAILABLE', tem_certificado: 1 })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.getByText('Rever')).toBeInTheDocument();
    expect(screen.getByText('Baixar certificado')).toBeInTheDocument();
    expect(screen.queryByText('Certificado em processamento')).not.toBeInTheDocument();
  });

  it('PENDING: mostra Rever e "Certificado em processamento" (sem botão de download)', () => {
    useMinhasEADMock.mockReturnValue({
      data: [matricula({ certificate_state: 'PENDING', tem_certificado: 0 })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.getByText('Rever')).toBeInTheDocument();
    expect(screen.getByText('Certificado em processamento')).toBeInTheDocument();
    expect(screen.queryByText('Baixar certificado')).not.toBeInTheDocument();
  });

  it('NOT_REQUIRED: mostra apenas Rever', () => {
    useMinhasEADMock.mockReturnValue({
      data: [matricula({ certificate_state: 'NOT_REQUIRED', tem_certificado: 0 })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.getByText('Rever')).toBeInTheDocument();
    expect(screen.queryByText('Certificado em processamento')).not.toBeInTheDocument();
    expect(screen.queryByText('Baixar certificado')).not.toBeInTheDocument();
  });

  it('matrícula EM_ANDAMENTO continua mostrando apenas "Continuar" (sem afetar lógica de certificado)', () => {
    useMinhasEADMock.mockReturnValue({
      data: [
        matricula({
          status: 'EM_ANDAMENTO',
          progresso_pct: 40,
          certificate_state: 'NOT_REQUIRED',
        }),
      ],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.getByText('Continuar')).toBeInTheDocument();
    expect(screen.queryByText('Rever')).not.toBeInTheDocument();
    expect(screen.queryByText('Certificado em processamento')).not.toBeInTheDocument();
  });
});
