import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsDashboard from '../FrmsDashboard';

const navigateMock = vi.fn();
const useApiMock = vi.fn();
const useFrmsFrotaMock = vi.fn();
const useFrmsAlertasMock = vi.fn();
const useFrmsAlertasCountMock = vi.fn();
const useFrmsConfiguracoesMock = vi.fn();
const useFrmsJornadasEffectivenessMock = vi.fn();
const useFrmsOperationalSnapshotMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock('@/react-app/hooks/useFrms', () => ({
  useFrmsFrota: (...args: unknown[]) => useFrmsFrotaMock(...args),
  useFrmsAlertas: (...args: unknown[]) => useFrmsAlertasMock(...args),
  useFrmsAlertasCount: (...args: unknown[]) => useFrmsAlertasCountMock(...args),
  useFrmsConfiguracoes: (...args: unknown[]) => useFrmsConfiguracoesMock(...args),
  useFrmsJornadasEffectiveness: (...args: unknown[]) => useFrmsJornadasEffectivenessMock(...args),
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: (...args: unknown[]) => useFrmsOperationalSnapshotMock(...args),
}));

vi.mock('../components/FrmsFilterContext', () => ({
  FrmsFilterProvider: ({ children }: { children: any }) => <>{children}</>,
  useFrmsFilters: () => ({
    filters: {
      modoPainel: 'OPERACIONAL',
      periodo: 14,
      mesReferencia: '2026-06',
      base: '',
      quinzena: '',
      modeloAeronave: '',
      status: ['OK', 'ATENCAO', 'CRITICO', 'VIOLACAO'],
      busca: '',
    },
    periodoNumDias: 14,
    isMonthMode: false,
  }),
}));

vi.mock('../components/FrmsFilters', () => ({
  default: () => <div>filtros-frms</div>,
}));

vi.mock('../components/FrmsFilterChips', () => ({
  default: () => <div>chips-frms</div>,
}));

vi.mock('../components/FrmsMetricCards', () => ({
  default: () => <div>metric-cards-frms</div>,
}));

vi.mock('../components/FrmsHeatmap', () => ({
  default: () => <div>heatmap-frms</div>,
}));

vi.mock('../components/FrmsTripulantesTable', () => ({
  default: () => <div>tripulantes-table-frms</div>,
}));

vi.mock('../components/FrmsJornadaEffectivenessCard', () => ({
  default: () => <div>jornada-effectiveness-card</div>,
}));

vi.mock('../components/FrmsDayExplanationPanel', () => ({
  default: () => <div>day-explanation-panel</div>,
}));

vi.mock('../FrmsFormJornada', () => ({
  default: () => <div>frms-form-jornada</div>,
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <FrmsDashboard />
    </MemoryRouter>,
  );
}

function baseSnapshotItem(overrides: Record<string, unknown> = {}) {
  return {
    empresa_id: 1,
    data_operacional: '2026-06-23',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Max Monteiro',
    nome_guerra: 'Max',
    funcao: 'PIC',
    base: 'SBSP',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'EVD',
    hora_apresentacao: '08:00',
    hora_termino: '16:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 480,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:30',
    kss_score: 3,
    horas_sono: 7,
    qualidade_sono: 4,
    hora_acordar: '05:10',
    fadiga_score: 18,
    status_operacional_checkin: 'OK',
    effectiveness_pct: 91,
    nivel_fadiga_calculado: 'VERDE',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'OK',
    fortnight_indicator: {
      periodo_inicio: '2026-06-16',
      periodo_fim: '2026-06-30',
      dia_periodo: 8,
      total_dias_periodo: 15,
      dias_consecutivos_com_jornada: 3,
      dias_com_checkin_pendente: 0,
      dias_com_dado_estimado: 0,
      duty_time_periodo_min: 1800,
      duty_time_168h_min: 900,
      horas_voo_periodo_min: 600,
      horas_voo_168h_min: 260,
      jornadas_periodo: 3,
      apresentacoes_antes_0600: 0,
      apresentacoes_antes_0700: 1,
      menor_descanso_entre_jornadas_min: 720,
      setores_periodo: null,
      sit_periods_estimados: null,
      fonte_periodo: 'REAL',
      freshness_dado: 'COMPLETO',
      status_quinzena: 'OK',
      score_acumulado: 42,
      tendencia: 'ESTAVEL',
      atenuadores_aplicados: [],
      agravantes_aplicados: [],
      natureza_dado: 'PROJECAO',
      explicacao_operacional: null,
      mitigacao_recomendada: 'SEM_ACAO',
      decisao: 'INFORMA',
      limite_referencia: null,
      alertas_quinzena: [],
      limitation_notes: [],
    },
    alertas: [],
    ...overrides,
  };
}

describe('FrmsDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
    navigateMock.mockReset();
    useApiMock.mockReset();
    useFrmsFrotaMock.mockReset();
    useFrmsAlertasMock.mockReset();
    useFrmsAlertasCountMock.mockReset();
    useFrmsConfiguracoesMock.mockReset();
    useFrmsJornadasEffectivenessMock.mockReset();
    useFrmsOperationalSnapshotMock.mockReset();

    useApiMock.mockReturnValue({ data: [], loading: false, error: null });
    useFrmsFrotaMock.mockReturnValue({
      data: [
        {
          tripulante_id: '10',
          nome: 'Max Monteiro',
          nome_guerra: 'Max',
          aeronave_modelo: 'AW139',
          hv_mes_min: 420,
          pct_mes: 50,
          hv_7d_min: 180,
          pct_7d: 40,
          hv_365d_min: 1800,
          pct_365d: 10,
          hv_dia_min: 60,
          pct_dia: 20,
          nivel_max: 'OK',
        },
        {
          tripulante_id: '20',
          nome: 'Ana Paula Souza',
          nome_guerra: 'Ana',
          aeronave_modelo: 'SK76',
          hv_mes_min: 390,
          pct_mes: 45,
          hv_7d_min: 160,
          pct_7d: 38,
          hv_365d_min: 1700,
          pct_365d: 9,
          hv_dia_min: 45,
          pct_dia: 15,
          nivel_max: 'ATENCAO',
        },
      ],
      loading: false,
      refetch: vi.fn(),
    });
    useFrmsAlertasMock.mockReturnValue({ data: [], refetch: vi.fn() });
    useFrmsAlertasCountMock.mockReturnValue({ data: { count: 0 }, refetch: vi.fn() });
    useFrmsConfiguracoesMock.mockReturnValue({ data: { limites: {} } });
    useFrmsJornadasEffectivenessMock.mockReturnValue({ data: [], loading: false });
    useFrmsOperationalSnapshotMock.mockReturnValue({
      data: [
        baseSnapshotItem(),
        baseSnapshotItem({
          funcionario_id: 20,
          tripulante_id: 20,
          nome: 'Ana Paula Souza',
          nome_guerra: 'Ana',
          funcao: 'SIC',
          aeronave: 'SK76',
          checkin_status: 'PENDENTE',
          sleep_data_source: 'ESTIMADO',
          wake_data_source: 'ESTIMADO',
          jornada_data_source: 'AUSENTE',
          snapshot_status: 'ATENCAO',
          effectiveness_pct: 74.5,
          alertas: ['CHECKIN_PENDENTE'],
          fortnight_indicator: {
            ...baseSnapshotItem().fortnight_indicator,
            duty_time_periodo_min: 2100,
            horas_voo_periodo_min: 690,
            status_quinzena: 'ATENCAO',
            tendencia: 'CRESCENTE',
            mitigacao_recomendada: 'REVISAR_CHECKIN',
          },
        }),
      ],
      summary: {},
      meta: null,
      loading: false,
      error: null,
      unauthorized: false,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderiza o resumo executivo da quinzena e direciona ao controle operacional', () => {
    renderDashboard();

    expect(screen.getByText('Resumo executivo FRMS')).toBeInTheDocument();
    expect(screen.getByText('Quem exige atenção agora')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText(/Central de Alertas/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Controle operacional completo' }));
    expect(navigateMock).toHaveBeenCalledWith('/frms/controle-operacional?data=2026-06-23');
  });
});
