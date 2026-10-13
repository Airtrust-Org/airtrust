import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsAlertasPainel from '../FrmsAlertasPainel';
import type { FrmsAlertaRow } from '@/react-app/hooks/useFrms';

const useFrmsAlertasMock = vi.fn();
const mutateMock = vi.fn();
const refetchMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/FrmsWorkspaceNav', () => ({
  default: () => <nav aria-label="Áreas FRMS" />,
}));

vi.mock('@/react-app/hooks/useFrms', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useFrms')>('@/react-app/hooks/useFrms');
  return {
    ...actual,
    useFrmsAlertas: (...args: unknown[]) => useFrmsAlertasMock(...args),
    useFrmsMutation: () => ({ mutate: mutateMock }),
  };
});

function caseRow(overrides: Partial<FrmsAlertaRow> = {}): FrmsAlertaRow {
  return {
    id: 'case-1',
    tripulante_id: '30',
    jornada_id: 'journey-1',
    data_jornada: '2026-08-27',
    data_fato: '2026-08-27',
    tipo_limite: 'JORNADA',
    nivel: 'CRITICO',
    percentual_atingido: 95,
    valor_atual_min: 570,
    valor_limite_min: 600,
    mensagem: 'Revisar jornada antes da decisão operacional.',
    nome_tripulante: 'Pessoa Crítica',
    visualizado: 1,
    visualizado_em: '2026-08-27 12:00:00',
    visualizado_por: 'coord@example.com',
    resolvido: 0,
    resolvido_em: null,
    resolvido_por: null,
    notas_resolucao: null,
    created_at: '2026-08-27 11:00:00',
    ...overrides,
  };
}

function mockCases(data: FrmsAlertaRow[]) {
  useFrmsAlertasMock.mockReturnValue({
    data,
    loading: false,
    error: null,
    refetch: refetchMock,
  });
}

function renderPage(path = '/frms/alertas') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FrmsAlertasPainel />
    </MemoryRouter>,
  );
}

describe('FrmsAlertasPainel', () => {
  beforeEach(() => {
    useFrmsAlertasMock.mockReset();
    mutateMock.mockReset();
    refetchMock.mockReset();
    mutateMock.mockResolvedValue({});
    refetchMock.mockResolvedValue(undefined);
    mockCases([caseRow()]);
  });

  it('agrupa os casos apenas na página atual sem inferir recorrência global', () => {
    mockCases([
      caseRow({ id: 'a', tripulante_id: '30', nome_tripulante: 'Ana', data_fato: '2026-08-26' }),
      caseRow({ id: 'b', tripulante_id: '30', nome_tripulante: 'Ana', data_fato: '2026-08-27' }),
      caseRow({ id: 'c', tripulante_id: '31', nome_tripulante: 'Bia', data_fato: '2026-08-25' }),
    ]);
    renderPage();
    expect(screen.getAllByText(/2 casos desta pessoa nesta página/i)).toHaveLength(2);
    expect(screen.getByText(/não informa o total geral/i)).toBeInTheDocument();
    const groupButton = screen.getByRole('button', { name: 'Agrupar por pessoa nesta página' });
    fireEvent.click(groupButton);
    expect(screen.getByRole('button', { name: 'Agrupado por pessoa nesta página' })).toHaveAttribute('aria-pressed', 'true');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('usa a mesma linguagem operacional da fila sem alterar os níveis persistidos', () => {
    renderPage();

    expect(screen.getAllByText('Avaliar').length).toBeGreaterThan(0);
    expect(screen.getByText(/backlog acumulado/i)).toBeInTheDocument();
    expect(screen.queryByText('CRÍTICO')).not.toBeInTheDocument();
  });

  it('registra medida e mantém caso aberto até avaliação de eficácia', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar tratamento' }));
    const confirm = screen.getByRole('button', { name: 'Registrar sem encerrar' });
    expect(confirm).toBeDisabled();
    expect(screen.queryByLabelText('Avaliação de eficácia')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Responsável pelo tratamento'), {
      target: { value: 'Coordenação de Operações' },
    });
    fireEvent.change(screen.getByLabelText('Prazo'), {
      target: { value: '2026-09-30' },
    });
    fireEvent.change(screen.getByLabelText('Medida de mitigação'), {
      target: { value: 'Reprogramar tripulante e confirmar intervalo de repouso.' },
    });
    fireEvent.change(screen.getByLabelText('Justificativa da decisão'), {
      target: { value: 'A operação ainda depende da mitigação e revisão da escala.' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith('/api/frms/alertas/case-1/tratamento', {
        method: 'PUT',
        body: JSON.stringify({
          responsavel: 'Coordenação de Operações', prazo: '2026-09-30',
          acao_mitigacao: 'Reprogramar tripulante e confirmar intervalo de repouso.',
          justificativa: 'A operação ainda depende da mitigação e revisão da escala.',
          evidencia_referencia: null,
        }),
      });
    });
    expect(refetchMock).toHaveBeenCalled();
  });

  it('exige registro prévio de tratamento e eficácia para encerrar', async () => {
    mockCases([caseRow({
      notas_resolucao: JSON.stringify({
        schema: 'FRMS_CASE_TREATMENT_V1',
        responsavel: 'Coordenação de Operações',
        prazo: '2099-09-30',
        acao_mitigacao: 'Reprogramar tripulante e confirmar intervalo de repouso.',
        justificativa: 'A operação depende de nova avaliação do risco.',
        evidencia_referencia: 'FRAT-2026-091',
      }),
    })]);
    renderPage();
    expect(screen.getByText(/Tratamento em andamento — caso ainda aberto/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verificar eficácia e encerrar' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar e resolver' });
    expect(confirm).toBeDisabled();
    expect(screen.getByLabelText('Responsável pelo tratamento')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Avaliação de eficácia'), {
      target: { value: 'Escala revisada e risco recalculado, sem pendências remanescentes.' },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith('/api/frms/alertas/case-1/resolver', {
        method: 'PUT',
        body: JSON.stringify({
          avaliacao_eficacia: 'Escala revisada e risco recalculado, sem pendências remanescentes.',
        }),
      });
    });
  });

  it('mostra a trilha de auditoria de casos já resolvidos', () => {
    mockCases([
      caseRow({
        resolvido: 1,
        resolvido_por: 'coordenacao@airtrust.online',
        resolvido_em: '2026-08-27 13:15:00',
        notas_resolucao: 'Jornada corrigida após validação com a escala.',
      }),
    ]);

    renderPage();

    expect(screen.getByText(/Resolvido por coordenacao@airtrust.online/i)).toBeInTheDocument();
    expect(screen.getByText(/Registro: Jornada corrigida após validação com a escala/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar tratamento' })).not.toBeInTheDocument();
  });
  it('destaca prazo vencido e separa casos sem medida dos tratamentos em andamento', () => {
    mockCases([
      caseRow({ id: 'sem-plano', tripulante_id: '11', nome_tripulante: 'Sem plano', nivel: 'VIOLACAO', notas_resolucao: null }),
      caseRow({
        id: 'vencido', tripulante_id: '12', nome_tripulante: 'Prazo expirado', nivel: 'ATENCAO',
        notas_resolucao: JSON.stringify({
          schema: 'FRMS_CASE_TREATMENT_V1', responsavel: 'Coordenação', prazo: '2000-01-01',
          acao_mitigacao: 'Reprogramar a atividade', justificativa: 'Aguardar recuperação',
        }),
      }),
      caseRow({
        id: 'andamento', tripulante_id: '13', nome_tripulante: 'Dentro do prazo', nivel: 'CRITICO',
        notas_resolucao: JSON.stringify({
          schema: 'FRMS_CASE_TREATMENT_V1', responsavel: 'Coordenação', prazo: '2099-01-01',
          acao_mitigacao: 'Ajustar a escala operacional', justificativa: 'Reavaliar repouso',
        }),
      }),
    ]);
    renderPage();
    const artigos = screen.getAllByRole('article');
    expect(artigos[0]).toHaveTextContent('Prazo expirado');
    expect(artigos[0]).toHaveTextContent('Prazo vencido — caso ainda aberto');
    expect(artigos[1]).toHaveTextContent('Sem plano');
    expect(artigos[1]).toHaveTextContent('Próxima ação: registrar responsável');
    expect(artigos[2]).toHaveTextContent('Dentro do prazo');
    expect(screen.getByRole('button', { name: /Prazo vencido.*1/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('filtra casos pela etapa e alterna o filtro por cartão', () => {
    mockCases([
      caseRow({ id: 'pendente', nome_tripulante: 'Sem plano' }),
      caseRow({
        id: 'tratado', nome_tripulante: 'Com plano',
        notas_resolucao: JSON.stringify({
          schema: 'FRMS_CASE_TREATMENT_V1', responsavel: 'Coordenação', prazo: '2000-01-01',
          acao_mitigacao: 'Ajustar a escala operacional', justificativa: 'Reavaliar repouso',
        }),
      }),
    ]);
    renderPage();
    const card = screen.getByRole('button', { name: /Prazo vencido.*1/i });
    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Com plano')).toBeInTheDocument();
    fireEvent.click(card);
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });

  it('mostra total restrito à página e permite navegar além dos primeiros 100 casos', () => {
    mockCases(Array.from({ length: 100 }, (_, index) => caseRow({ id: `caso-${index}` })));
    renderPage();
    expect(screen.getByText(/até 100 casos por página/i)).toBeInTheDocument();
    expect(screen.getByText(/Pode haver mais registros/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByText(/Página 2/i)).toBeInTheDocument();
    expect(useFrmsAlertasMock).toHaveBeenCalledWith(expect.objectContaining({ page: '2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(useFrmsAlertasMock).toHaveBeenCalledWith(expect.objectContaining({ page: '1' }));
  });

  it('não confunde um registro desconhecido com tratamento ou conclusão', () => {
    mockCases([caseRow({ notas_resolucao: '{"schema":"OUTRO_CONTRATO"}' })]);
    renderPage();
    expect(screen.getAllByText('Sem medida registrada').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tratamento em andamento — caso ainda aberto')).not.toBeInTheDocument();
  });

});
