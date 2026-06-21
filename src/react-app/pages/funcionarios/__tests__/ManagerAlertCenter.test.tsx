import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ManagerAlertCenter from '../ManagerAlertCenter';

const useAuthMock = vi.fn();
const usePermissionsMock = vi.fn();
const useMetricsQueryMock = vi.fn();
const useAlertasQueryMock = vi.fn();
const useFrmsAlertasQueryMock = vi.fn();
const useSgsoChecklistQueryMock = vi.fn();
const useSimuladoresAlertasQueryMock = vi.fn();
const useFrmsOperationalSnapshotMock = vi.fn();

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock('@/react-app/pages/dashboard/queries', () => ({
  useMetricsQuery: () => useMetricsQueryMock(),
  useAlertasQuery: () => useAlertasQueryMock(),
  useFrmsAlertasQuery: () => useFrmsAlertasQueryMock(),
  useSgsoChecklistQuery: () => useSgsoChecklistQueryMock(),
  useSimuladoresAlertasQuery: () => useSimuladoresAlertasQueryMock(),
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: (filters: unknown) => useFrmsOperationalSnapshotMock(filters),
}));

function renderCenter() {
  return render(
    <MemoryRouter>
      <ManagerAlertCenter />
    </MemoryRouter>,
  );
}

function baseMetricsQuery() {
  return {
    data: {
      qualificacoesVencidas: 0,
      qualificacoesAVencer: 0,
    },
    isLoading: false,
    isError: false,
  };
}

function baseAlertasQuery() {
  return {
    data: [],
    isLoading: false,
    isError: false,
  };
}

function baseFrmsAlertasQuery() {
  return {
    data: [],
    isLoading: false,
    isError: false,
  };
}

function baseSgsoChecklistQuery() {
  return {
    data: {
      checklist: [],
      resumo: {
        ok: 0,
        atencao: 0,
        nao_conforme: 0,
      },
    },
    isLoading: false,
    isError: false,
  };
}

function baseSimuladoresAlertasQuery() {
  return {
    data: {
      fichas_pendentes_avaliacao: 0,
      fichas_aguardando_assinatura_aluno: 0,
      fichas_aguardando_assinatura_instrutor: 0,
      fichas_aguardando_assinatura: 0,
      sessoes_proximas_sem_ficha_completa: 0,
      edicoes_pendentes: 0,
      janela_sessoes_proximas_horas: 24,
    },
    isLoading: false,
    isError: false,
  };
}

function baseSnapshotHook() {
  return {
    data: [],
    summary: {
      total_tripulantes: 0,
      total_escalados: 0,
      checkins_recebidos: 0,
      checkins_pendentes: 0,
      alertas_criticos: 0,
      alertas_atencao: 0,
      dados_estimados: 0,
      inconsistencias: 0,
      sem_fatorizacao: 0,
      quinzena_incompleta: 0,
      quinzena_atencao: 0,
      quinzena_critica: 0,
    },
    meta: { scope: 'team' },
    loading: false,
    error: null,
    unauthorized: false,
    refetch: vi.fn(),
  };
}

function setManagerContext(modulosAtivos = ['frms', 'sgso', 'simuladores', 'qualificacoes', 'lms']) {
  useAuthMock.mockReturnValue({
    empresaAtualId: 7,
    empresas: [{ id: 7, modulos_ativos: modulosAtivos }],
  });
  usePermissionsMock.mockReturnValue({
    isAdmin: false,
    isGestor: true,
  });
}

describe('ManagerAlertCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setManagerContext();
    useMetricsQueryMock.mockReturnValue(baseMetricsQuery());
    useAlertasQueryMock.mockReturnValue(baseAlertasQuery());
    useFrmsAlertasQueryMock.mockReturnValue(baseFrmsAlertasQuery());
    useSgsoChecklistQueryMock.mockReturnValue(baseSgsoChecklistQuery());
    useSimuladoresAlertasQueryMock.mockReturnValue(baseSimuladoresAlertasQuery());
    useFrmsOperationalSnapshotMock.mockReturnValue(baseSnapshotHook());
  });

  it('renderiza estado vazio quando não há alertas prioritários', () => {
    renderCenter();

    expect(screen.getByText('Sem alertas críticos')).toBeInTheDocument();
  });

  it('não renderiza nem consulta dados para perfis sem acesso', () => {
    usePermissionsMock.mockReturnValue({
      isAdmin: false,
      isGestor: false,
    });

    renderCenter();

    expect(screen.queryByText('Central de Alertas do Gestor')).not.toBeInTheDocument();
    expect(useMetricsQueryMock).not.toHaveBeenCalled();
    expect(useAlertasQueryMock).not.toHaveBeenCalled();
    expect(useFrmsAlertasQueryMock).not.toHaveBeenCalled();
    expect(useSgsoChecklistQueryMock).not.toHaveBeenCalled();
    expect(useSimuladoresAlertasQueryMock).not.toHaveBeenCalled();
    expect(useFrmsOperationalSnapshotMock).not.toHaveBeenCalled();
  });

  it('renderiza alerta SGSO crítico antes de atenção de simuladores', () => {
    useSgsoChecklistQueryMock.mockReturnValue({
      ...baseSgsoChecklistQuery(),
      data: {
        checklist: [
          {
            codigo: 'RBAC121_MITIGACOES',
            referencia: 'RBAC 121 / CAPA em prazo',
            status: 'NAO_CONFORME',
            valor: 2,
            detalhe: 'Ações corretivas/preventivas vencidas',
          },
        ],
        resumo: {
          ok: 0,
          atencao: 0,
          nao_conforme: 1,
        },
      },
    });
    useSimuladoresAlertasQueryMock.mockReturnValue({
      ...baseSimuladoresAlertasQuery(),
      data: {
        ...baseSimuladoresAlertasQuery().data,
        fichas_pendentes_avaliacao: 3,
      },
    });

    const { container } = renderCenter();
    const headings = Array.from(container.querySelectorAll('article h3')).map((node) => node.textContent);

    expect(headings[0]).toContain('ações corretivas');
    expect(screen.getByText(/ações corretivas vencidas/i)).toBeInTheDocument();
    expect(screen.getByText(/fichas? de simulador pendente/i)).toBeInTheDocument();
  });

  it('renderiza alerta crítico FRMS antes dos alertas de atenção', () => {
    useFrmsAlertasQueryMock.mockReturnValue({
      ...baseFrmsAlertasQuery(),
      data: [{ id: 'fr-1', nivel: 'CRITICO', descricao: 'Fadiga crítica' }],
    });
    useAlertasQueryMock.mockReturnValue({
      ...baseAlertasQuery(),
      data: [
        {
          id: 'q-1',
          tipo: 'qualificacao_vencendo',
          criticidade: 'MEDIA',
          mensagem: 'Qualificação vence em 4 dias',
          diasRestantes: 4,
        },
      ],
    });
    useMetricsQueryMock.mockReturnValue({
      ...baseMetricsQuery(),
      data: {
        qualificacoesVencidas: 0,
        qualificacoesAVencer: 1,
      },
    });

    const { container } = renderCenter();
    const headings = Array.from(container.querySelectorAll('article h3')).map((node) => node.textContent);
    expect(headings[0]).toContain('FRMS');
    expect(screen.getByText(/alerta FRMS crítico/i)).toBeInTheDocument();
  });

  it('renderiza alerta de check-in pendente', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue({
      ...baseSnapshotHook(),
      data: [
        {
          alertas: ['CHECKIN_PENDENTE'],
          checkin_status: 'PENDENTE',
        },
      ],
      summary: {
        ...baseSnapshotHook().summary,
        checkins_pendentes: 1,
      },
    });

    renderCenter();

    expect(screen.getByText(/check-in de fadiga pendente/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Solicitar check-in/i })).toHaveAttribute(
      'href',
      '/frms/controle-operacional',
    );
  });

  it('eleva pendência LMS crítica para severidade crítica', () => {
    useAlertasQueryMock.mockReturnValue({
      ...baseAlertasQuery(),
      data: [
        {
          id: 'lms-1',
          tipo: 'lms_curso_pendente',
          criticidade: 'CRITICA',
          mensagem: 'Curso obrigatório pendente',
          urlAcao: '/lms/cursos/1',
        },
      ],
    });

    const { container } = renderCenter();
    const article = container.querySelector('article[data-severity="CRITICO"]');

    expect(article).not.toBeNull();
    expect(screen.getByText(/pendência de LMS obrigatória/i)).toBeInTheDocument();
  });

  it('não quebra sem dados em uma fonte parcial', () => {
    useFrmsAlertasQueryMock.mockReturnValue({
      ...baseFrmsAlertasQuery(),
      data: undefined,
      isError: true,
    });

    renderCenter();

    expect(screen.getByText(/Fontes parciais/i)).toBeInTheDocument();
    expect(screen.getByText('Sem alertas críticos')).toBeInTheDocument();
  });

  it('renderiza alerta de simuladores sem elevar ficha futura bloqueada para crítico', () => {
    useSimuladoresAlertasQueryMock.mockReturnValue({
      ...baseSimuladoresAlertasQuery(),
      data: {
        ...baseSimuladoresAlertasQuery().data,
        sessoes_proximas_sem_ficha_completa: 2,
      },
    });

    renderCenter();

    expect(screen.getByText(/sess(ão|ões) próxima(s)? com ficha incompleta/i)).toBeInTheDocument();
    expect(screen.getByText('0 críticos')).toBeInTheDocument();
  });

  it('mantém a central operacional quando apenas uma subfonte FRMS falha', () => {
    useFrmsAlertasQueryMock.mockReturnValue({
      ...baseFrmsAlertasQuery(),
      data: undefined,
      isError: true,
    });
    useFrmsOperationalSnapshotMock.mockReturnValue({
      ...baseSnapshotHook(),
      data: [
        {
          alertas: ['CHECKIN_PENDENTE'],
          checkin_status: 'PENDENTE',
        },
      ],
      summary: {
        ...baseSnapshotHook().summary,
        checkins_pendentes: 1,
      },
    });

    renderCenter();

    expect(screen.queryByText(/Não foi possível montar a central/i)).not.toBeInTheDocument();
    expect(screen.getByText(/check-in de fadiga pendente/i)).toBeInTheDocument();
    expect(screen.getByText(/Fontes parciais: FRMS/i)).toBeInTheDocument();
  });

  it('sinaliza degradação quando métricas falham mas o fallback por alertas mantém a central', () => {
    useMetricsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    useAlertasQueryMock.mockReturnValue({
      ...baseAlertasQuery(),
      data: [
        {
          id: 'q-1',
          tipo: 'qualificacao_vencida',
          criticidade: 'ALTA',
          mensagem: 'Qualificação vencida',
          diasRestantes: -1,
        },
      ],
    });

    renderCenter();

    expect(screen.getByText(/Métricas de qualificações/i)).toBeInTheDocument();
    expect(screen.getByText(/qualificação vencida/i)).toBeInTheDocument();
  });

  it('não mostra alerta de módulo desabilitado', () => {
    setManagerContext(['qualificacoes']);
    useFrmsAlertasQueryMock.mockReturnValue({
      ...baseFrmsAlertasQuery(),
      data: [{ id: 'fr-1', nivel: 'CRITICO', descricao: 'Fadiga crítica' }],
    });

    renderCenter();

    expect(screen.queryByRole('link', { name: /Ver fadiga/i })).not.toBeInTheDocument();
  });

  it('não quebra com SGSO e simuladores desabilitados', () => {
    setManagerContext(['qualificacoes']);

    renderCenter();

    expect(screen.queryByRole('link', { name: /Ver Bowtie/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ver simuladores/i })).not.toBeInTheDocument();
    expect(screen.getByText('Sem alertas críticos')).toBeInTheDocument();
  });

  it('mantém links seguros quando a origem devolve URL externa', () => {
    useAlertasQueryMock.mockReturnValue({
      ...baseAlertasQuery(),
      data: [
        {
          id: 'lms-1',
          tipo: 'lms_curso_pendente',
          criticidade: 'ALTA',
          mensagem: 'Curso obrigatório pendente',
          urlAcao: 'https://malicioso.exemplo',
        },
      ],
    });

    renderCenter();

    expect(screen.getByRole('link', { name: /Ver detalhe/i })).toHaveAttribute(
      'href',
      '/lms/dashboard',
    );
  });

  it('mostra contagem de informativos quando só há alertas informativos', () => {
    useAlertasQueryMock.mockReturnValue({
      ...baseAlertasQuery(),
      data: [
        {
          id: 'lms-1',
          tipo: 'lms_curso_pendente',
          criticidade: 'BAIXA',
          mensagem: 'Curso obrigatório pendente',
          urlAcao: '/lms/dashboard',
        },
      ],
    });

    renderCenter();

    expect(screen.getByText('0 críticos')).toBeInTheDocument();
    expect(screen.getByText('0 atenção')).toBeInTheDocument();
    expect(screen.getByText('1 informativo')).toBeInTheDocument();
  });
});
