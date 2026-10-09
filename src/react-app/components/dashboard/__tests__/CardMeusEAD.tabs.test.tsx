import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardMeusEAD } from '@/react-app/components/dashboard/CardMeusEAD';
import { useMinhasEAD, type LmsMatriculaEAD } from '@/react-app/hooks/useLms';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/react-app/hooks/useLms', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useLms')>(
    '@/react-app/hooks/useLms',
  );
  return { ...actual, useMinhasEAD: vi.fn() };
});
vi.mock('@/react-app/utils/certificadoDownload', () => ({
  baixarCertificadoCanonico: vi.fn(),
  resolveCertificadoDocumentoId: () => null,
}));

const useMinhasEADMock = vi.mocked(useMinhasEAD);

function matricula(id: number, status: LmsMatriculaEAD['status']): LmsMatriculaEAD {
  return {
    id,
    empresa_id: 6,
    curso_id: id + 100,
    funcionario_id: 1,
    status,
    progresso_pct: status === 'CONCLUIDO' ? 100 : status === 'EM_ANDAMENTO' ? 40 : 0,
    progresso_efetivo: status === 'CONCLUIDO' ? 100 : status === 'EM_ANDAMENTO' ? 40 : 0,
    score_final: null,
    tentativas: 0,
    data_matricula: '2026-10-01',
    data_inicio: null,
    data_conclusao: null,
    data_expiracao: null,
    qualificacao_historico_id: null,
    observacoes: null,
    titulo: `Treinamento ${id}`,
    data_vencimento_qualificacao: null,
    tem_certificado: 0,
  } as LmsMatriculaEAD;
}

function setMatriculas(items: LmsMatriculaEAD[]) {
  useMinhasEADMock.mockReturnValue({
    data: items,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useMinhasEAD>);
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/inicio']}>
      <Routes>
        <Route path="/inicio" element={<CardMeusEAD />} />
        <Route path="/lms" element={<div>Área de treinamentos</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CardMeusEAD — organização por situação', () => {
  it('separa matrículas, mantém reprovados acionáveis e não esconde cursos após o décimo', () => {
    const items = Array.from({ length: 13 }, (_, index) => matricula(index + 1, 'EM_ANDAMENTO'));
    items.push(matricula(14, 'REPROVADO'));
    items.push(matricula(15, 'NAO_INICIADO'));
    items.push(matricula(16, 'CONCLUIDO'));
    items.push(matricula(17, 'CANCELADO'));
    setMatriculas(items);
    renderCard();

    const filters = screen.getByRole('group', { name: 'Filtrar treinamentos EAD por situação' });
    const andamento = within(filters).getByRole('button', { name: /Em andamento/ });
    const naoIniciado = within(filters).getByRole('button', { name: /Não iniciado/ });
    const finalizados = within(filters).getByRole('button', { name: /Finalizados/ });

    expect(andamento).toHaveAttribute('aria-pressed', 'true');
    expect(within(andamento).getByText('14')).toBeInTheDocument();
    expect(within(naoIniciado).getByText('1')).toBeInTheDocument();
    expect(within(finalizados).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Treinamento 13')).toBeInTheDocument();
    expect(screen.getByText('Treinamento 14')).toBeInTheDocument();
    expect(screen.getByText('Reprovado')).toBeInTheDocument();
    expect(screen.queryByText('Treinamento 15')).not.toBeInTheDocument();
    expect(screen.queryByText('Treinamento 17')).not.toBeInTheDocument();

    fireEvent.click(naoIniciado);
    expect(naoIniciado).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Treinamento 15')).toBeInTheDocument();
    expect(screen.queryByText('Treinamento 1')).not.toBeInTheDocument();

    fireEvent.click(finalizados);
    expect(screen.getByText('Treinamento 16')).toBeInTheDocument();
    expect(screen.getByText('Rever')).toBeInTheDocument();
    expect(screen.queryByText('Treinamento 15')).not.toBeInTheDocument();
  });

  it('prioriza não iniciados quando não há nenhum curso em andamento', () => {
    setMatriculas([matricula(2, 'CONCLUIDO'), matricula(3, 'NAO_INICIADO')]);
    renderCard();
    expect(screen.getByText('Treinamento 3')).toBeInTheDocument();
    expect(screen.queryByText('Treinamento 2')).not.toBeInTheDocument();
  });

  it('respeita seleção manual mesmo quando a categoria está vazia', () => {
    setMatriculas([matricula(2, 'CONCLUIDO')]);
    renderCard();
    expect(screen.getByText('Treinamento 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Em andamento/ }));
    expect(screen.getByText('Nenhum treinamento nesta situação.')).toBeInTheDocument();
    expect(screen.queryByText('Treinamento 2')).not.toBeInTheDocument();
  });

  it('abre a área própria de treinamentos, não a lista de cursos', () => {
    setMatriculas([matricula(1, 'NAO_INICIADO')]);
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Abrir em página completa/ }));
    expect(screen.getByText('Área de treinamentos')).toBeInTheDocument();
  });
});
