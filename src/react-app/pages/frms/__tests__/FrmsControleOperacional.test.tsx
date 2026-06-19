import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import FrmsControleOperacional from '../FrmsControleOperacional';

function renderControle(initialEntries: string[] = ['/frms/controle-operacional']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <FrmsControleOperacional />
    </MemoryRouter>,
  );
}

const useFrmsOperationalSnapshotMock = vi.fn();
const useFrmsReadAckEventsMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: (filters: unknown) => useFrmsOperationalSnapshotMock(filters),
}));

vi.mock('@/react-app/hooks/useFrmsReadAckEvents', () => ({
  useFrmsReadAckEvents: (filters: unknown, options: unknown) => useFrmsReadAckEventsMock(filters, options),
}));

type SnapshotItem = ReturnType<typeof buildSnapshotItem>;

function baseHookState() {
  return {
    data: [] as SnapshotItem[],
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
    meta: null,
    loading: false,
    error: null as string | null,
    unauthorized: false,
    refetch: vi.fn(),
  };
}

function buildHookState(overrides?: Partial<ReturnType<typeof baseHookState>>) {
  return {
    ...baseHookState(),
    ...overrides,
  };
}

function baseReadAckHookState() {
  return {
    events: [],
    summary: {
      total: 0,
      pending: 0,
      acked: 0,
      stale: 0,
    },
    loading: false,
    mutating: false,
    error: null as string | null,
    refetch: vi.fn(),
    generateEvents: vi.fn(),
    acknowledgeEvent: vi.fn(),
  };
}

function buildReadAckHookState(overrides?: Partial<ReturnType<typeof baseReadAckHookState>>) {
  return {
    ...baseReadAckHookState(),
    ...overrides,
  };
}

function buildSnapshotItem(overrides: Record<string, unknown> = {}) {
  return {
    empresa_id: 1,
    data_operacional: '2026-05-29',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Max Monteiro Magioli',
    nome_guerra: 'Max',
    funcao: 'PIC',
    base: 'SBSP',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'EVD',
    hora_apresentacao: '08:00',
    hora_termino: '18:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 600,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:45',
    kss_score: 3,
    horas_sono: 7.2,
    qualidade_sono: 4,
    hora_acordar: '05:40',
    fadiga_score: 18,
    status_operacional_checkin: 'OK',
    effectiveness_pct: 95.3,
    nivel_fadiga_calculado: 'BAIXO',
    fatorizacao_status: 'REAL',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'EVD',
    snapshot_status: 'OK',
    fortnight_indicator: {
      periodo_inicio: '2026-05-16',
      periodo_fim: '2026-05-31',
      dia_periodo: 14,
      total_dias_periodo: 16,
      dias_consecutivos_com_jornada: 3,
      dias_com_checkin_pendente: 0,
      dias_com_dado_estimado: 0,
      duty_time_periodo_min: 1800,
      duty_time_168h_min: 900,
      horas_voo_periodo_min: 600,
      horas_voo_168h_min: 260,
      jornadas_periodo: 3,
      apresentacoes_antes_0600: 1,
      apresentacoes_antes_0700: 2,
      menor_descanso_entre_jornadas_min: 720,
      setores_periodo: null,
      sit_periods_estimados: null,
      fonte_periodo: 'REAL',
      status_quinzena: 'OK',
      alertas_quinzena: [],
      limitation_notes: [],
    },
    alertas: [],
    ...overrides,
  };
}

function buildOperationalData() {
  return [
    buildSnapshotItem(),
    buildSnapshotItem({
      funcionario_id: 20,
      tripulante_id: 20,
      nome: 'Ana Paula Souza',
      nome_guerra: 'Ana',
      funcao: 'SIC',
      base: 'SBJR',
      aeronave: 'SK76',
      checkin_status: 'PENDENTE',
      checkin_horario: null,
      kss_score: null,
      horas_sono: null,
      qualidade_sono: null,
      hora_acordar: null,
      fadiga_score: null,
      status_operacional_checkin: null,
      effectiveness_pct: null,
      nivel_fadiga_calculado: null,
      fatorizacao_status: 'AUSENTE',
      sleep_data_source: 'ESTIMADO',
      wake_data_source: 'ESTIMADO',
      jornada_data_source: 'AUSENTE',
      snapshot_status: 'ATENCAO',
      alertas: ['CHECKIN_PENDENTE', 'SONO_ESTIMADO', 'ESCALADO_SEM_JORNADA_FRMS'],
    }),
    buildSnapshotItem({
      funcionario_id: 30,
      tripulante_id: 30,
      nome: 'Bruno Lima',
      nome_guerra: 'Bruno',
      funcao: 'PIC',
      base: 'SBCB',
      aeronave: 'AW139',
      escalado: false,
      escala_source: 'NONE',
      checkin_status: 'RECEBIDO',
      sleep_data_source: 'REAL',
      wake_data_source: 'REAL',
      jornada_data_source: 'AUSENTE',
      snapshot_status: 'INCOMPLETO',
      alertas: ['JORNADA_FRMS_SEM_ESCALA', 'DADO_INCONSISTENTE'],
    }),
    buildSnapshotItem({
      funcionario_id: 40,
      tripulante_id: 40,
      nome: 'Carla Nunes',
      nome_guerra: 'Carla',
      funcao: 'SIC',
      base: 'SBSP',
      aeronave: 'PT-HVA',
      escalado: false,
      escala_source: 'NONE',
      checkin_status: 'AUSENTE',
      teve_jornada: true,
      effectiveness_pct: null,
      fatorizacao_status: 'AUSENTE',
      sleep_data_source: 'AUSENTE',
      wake_data_source: 'AUSENTE',
      jornada_data_source: 'INCONSISTENTE',
      snapshot_status: 'CRITICO',
      alertas: ['JORNADA_SEM_FATORIZACAO', 'DADO_INCONSISTENTE'],
    }),
  ];
}

function mockSnapshotData(data = buildOperationalData()) {
  useFrmsOperationalSnapshotMock.mockReturnValue(
    buildHookState({
      data,
      summary: {
        total_tripulantes: data.length,
        total_escalados: data.filter((item) => item.escalado).length,
        checkins_recebidos: data.filter((item) => item.checkin_status === 'RECEBIDO').length,
        checkins_pendentes: data.filter((item) => item.checkin_status !== 'RECEBIDO').length,
        alertas_criticos: data.filter((item) => item.snapshot_status === 'CRITICO').length,
        alertas_atencao: data.filter((item) => item.snapshot_status === 'ATENCAO').length,
        dados_estimados: data.filter((item) => item.sleep_data_source === 'ESTIMADO').length,
        inconsistencias: data.filter((item) => item.snapshot_status === 'INCOMPLETO').length,
        sem_fatorizacao: data.filter((item) => item.fatorizacao_status === 'AUSENTE').length,
        quinzena_incompleta: 0,
        quinzena_atencao: 0,
        quinzena_critica: 0,
      },
    }),
  );
}

describe('FrmsControleOperacional', () => {
  beforeEach(() => {
    useFrmsOperationalSnapshotMock.mockReset();
    useFrmsReadAckEventsMock.mockReset();
    useFrmsReadAckEventsMock.mockReturnValue(buildReadAckHookState());
  });

  it('renderiza os seis KPIs operacionais e remove cards redundantes de quinzena', () => {
    mockSnapshotData();

    renderControle();

    expect(screen.getByText('Controle operacional de fadiga')).toBeInTheDocument();
    expect(screen.getByText('Tripulantes monitorados')).toBeInTheDocument();
    expect(screen.getByText('Check-ins pendentes')).toBeInTheDocument();
    expect(screen.getAllByText('Alertas').length).toBeGreaterThan(0);
    expect(screen.getByText('Dados estimados/ausentes')).toBeInTheDocument();
    expect(screen.getByText('Inconsistencias')).toBeInTheDocument();
    expect(screen.getByText('Ciencia pendente')).toBeInTheDocument();
    expect(screen.queryByText('Quinzena atencao')).not.toBeInTheDocument();
    expect(screen.queryByText('Quinzena critica')).not.toBeInTheDocument();
  });

  it('mostra tabela hierarquizada com escala, excecoes, fontes e labels descritivos', () => {
    mockSnapshotData();

    renderControle();

    expect(screen.getByText('Escala, fadiga e fontes')).toBeInTheDocument();
    expect(screen.getByText('2 escalados')).toBeInTheDocument();
    expect(screen.getByText('2 excecoes')).toBeInTheDocument();
    expect(screen.getAllByText('Escala diaria')).toHaveLength(2);
    expect(screen.getByText('Check-in sem escala')).toBeInTheDocument();
    expect(screen.getByText('Jornada sem escala')).toBeInTheDocument();
    expect(screen.getAllByText('Jornada sem fatorizacao').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Real').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Estimado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ausente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inconsistente').length).toBeGreaterThan(0);
    expect(screen.getByText('Requer avaliacao da coordenacao')).toBeInTheDocument();
  });

  it('filtra por nome, base, aeronave/modelo e status no frontend', async () => {
    mockSnapshotData();

    renderControle();

    fireEvent.change(screen.getByLabelText('Tripulante'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Base'), { target: { value: 'SBJR' } });
    fireEvent.change(screen.getByLabelText('Aeronave/modelo'), { target: { value: 'SK76' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ATENCAO' } });
    fireEvent.click(screen.getByText('Aplicar filtros'));

    await waitFor(() => {
      expect(screen.getByText('Ana')).toBeInTheDocument();
      expect(screen.queryByText('Max')).not.toBeInTheDocument();
      expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
      expect(screen.queryByText('Carla')).not.toBeInTheDocument();
    });
  });

  it('popula dropdowns com bases e aeronaves reais do snapshot', () => {
    mockSnapshotData();

    renderControle();

    const baseSelect = screen.getByLabelText('Base');
    const aeronaveSelect = screen.getByLabelText('Aeronave/modelo');

    expect(within(baseSelect).getByRole('option', { name: 'SBSP' })).toBeInTheDocument();
    expect(within(baseSelect).getByRole('option', { name: 'SBJR' })).toBeInTheDocument();
    expect(within(aeronaveSelect).getByRole('option', { name: 'AW139' })).toBeInTheDocument();
    expect(within(aeronaveSelect).getByRole('option', { name: 'SK76' })).toBeInTheDocument();
    expect(within(aeronaveSelect).getByRole('option', { name: 'PT-HVA' })).toBeInTheDocument();
  });

  it('mantem funcionario_id como filtro tecnico escondido e enviado ao hook', async () => {
    mockSnapshotData();

    renderControle();

    fireEvent.click(screen.getByText('Filtro tecnico'));
    fireEvent.change(screen.getByLabelText('Funcionario ID'), { target: { value: '20abc' } });
    fireEvent.click(screen.getByText('Aplicar filtros'));

    await waitFor(() => {
      const calls = useFrmsOperationalSnapshotMock.mock.calls;
      const lastFilters = calls[calls.length - 1]?.[0] as Record<string, unknown>;
      expect(lastFilters.funcionario_id).toBe('20');
      expect(lastFilters.base).toBeUndefined();
      expect(lastFilters.aeronave).toBeUndefined();
      expect(lastFilters.status).toBeUndefined();
    });
  });

  it('sem funcionario_id na URL e tripulante vazio nao envia filtro tecnico', () => {
    mockSnapshotData([]);

    renderControle(['/frms/controle-operacional?data_inicio=2026-06-01&data_fim=2026-06-05']);

    const firstFilters = useFrmsOperationalSnapshotMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstFilters).toMatchObject({
      data_inicio: '2026-06-01',
      data_fim: '2026-06-05',
      include_inconsistencies: true,
    });
    expect(firstFilters.funcionario_id).toBe('');
    expect(screen.getByLabelText('Tripulante')).toHaveValue('');
    expect(screen.queryByText('Filtro técnico ativo: exibindo apenas um tripulante.')).not.toBeInTheDocument();
  });

  it('mostra aviso quando funcionario_id esta ativo via query string', () => {
    mockSnapshotData([]);

    renderControle(['/frms/controle-operacional?data=2026-05-27&funcionario_id=41']);

    expect(screen.getByText('Filtro técnico ativo: exibindo apenas um tripulante.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar filtro técnico' })).toBeInTheDocument();
    expect(screen.getByText(/query string \(funcionario_id=41\)/i)).toBeInTheDocument();
    expect(screen.getByText('Filtro tecnico ativo')).toBeInTheDocument();
  });

  it('limpa o filtro tecnico e chama o hook sem funcionario_id', async () => {
    mockSnapshotData([]);

    renderControle(['/frms/controle-operacional?data=2026-05-27&funcionario_id=41']);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro técnico' }));

    await waitFor(() => {
      const calls = useFrmsOperationalSnapshotMock.mock.calls;
      const lastFilters = calls[calls.length - 1]?.[0] as Record<string, unknown>;
      expect(lastFilters.funcionario_id).toBe('');
    });

    expect(screen.queryByText('Filtro técnico ativo: exibindo apenas um tripulante.')).not.toBeInTheDocument();
  });

  it('mostra aviso quando backend aplica escopo individual pelo perfil da sessao', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      buildHookState({
        data: [],
        meta: { scope: 'self', forced_funcionario_id: 41 },
      }),
    );

    renderControle(['/frms/controle-operacional?data_inicio=2026-06-01&data_fim=2026-06-05']);

    expect(screen.getByText('Filtro técnico ativo: exibindo apenas um tripulante.')).toBeInTheDocument();
    expect(screen.getByText(/perfil da sessão \(funcionario_id=41\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpar filtro técnico' })).not.toBeInTheDocument();
    expect(screen.getByText('Filtro tecnico ativo')).toBeInTheDocument();
  });

  it('reflete incluir inconsistencias no filtro enviado ao snapshot', async () => {
    mockSnapshotData([]);

    renderControle(['/frms/controle-operacional?data_inicio=2026-06-01&data_fim=2026-06-05']);

    const inconsistencias = screen.getByLabelText('Incluir inconsistencias');
    expect(inconsistencias).toBeChecked();

    fireEvent.click(inconsistencias);
    fireEvent.click(screen.getByText('Aplicar filtros'));

    await waitFor(() => {
      const calls = useFrmsOperationalSnapshotMock.mock.calls;
      const lastFilters = calls[calls.length - 1]?.[0] as Record<string, unknown>;
      expect(lastFilters.include_inconsistencies).toBe(false);
    });

    expect(
      screen.getByText(
        /Visao filtrada: inconsistencias foram ocultadas\. Os KPIs e a tabela refletem apenas o recorte sem excecoes\./i,
      ),
    ).toBeInTheDocument();
  });

  it('renderiza ciencia operacional vinculada aos tripulantes visiveis', () => {
    const acknowledgeEvent = vi.fn();
    mockSnapshotData();
    useFrmsReadAckEventsMock.mockReturnValue(
      buildReadAckHookState({
        events: [
          {
            id: 'frms_read_ack_1_2026-05-29_20_CHECKIN_PENDENTE',
            empresa_id: 1,
            data_operacional: '2026-05-29',
            funcionario_id: 20,
            funcionario_nome: 'Ana',
            event_type: 'CHECKIN_PENDENTE',
            severity: 'ATENCAO',
            status: 'PENDING',
            lifecycle_status: 'PENDING',
            source: 'OPERATIONAL_SNAPSHOT',
            snapshot_status: 'ATENCAO',
            snapshot_alertas: ['CHECKIN_PENDENTE'],
            checkin_status: 'PENDENTE',
            sleep_data_source: 'ESTIMADO',
            wake_data_source: 'ESTIMADO',
            jornada_data_source: 'AUSENTE',
            fortnight_status: null,
            created_at: '2026-05-29T11:00:00Z',
            acknowledged_at: null,
            acknowledged_by: null,
            acknowledged_by_name: null,
            ack_note: null,
            limitations: ['Evento operacional de leitura e ciencia; nao representa mitigacao.'],
          },
          {
            id: 'frms_read_ack_1_2026-05-29_10_DADO_ESTIMADO',
            empresa_id: 1,
            data_operacional: '2026-05-29',
            funcionario_id: 10,
            funcionario_nome: 'Max',
            event_type: 'DADO_ESTIMADO',
            severity: 'INFO',
            status: 'ACKED',
            lifecycle_status: 'ACKED',
            source: 'OPERATIONAL_SNAPSHOT',
            snapshot_status: 'OK',
            snapshot_alertas: [],
            checkin_status: 'RECEBIDO',
            sleep_data_source: 'REAL',
            wake_data_source: 'REAL',
            jornada_data_source: 'REAL',
            fortnight_status: null,
            created_at: '2026-05-29T10:00:00Z',
            acknowledged_at: '2026-05-29T10:30:00Z',
            acknowledged_by: 'coord',
            acknowledged_by_name: 'Coord',
            ack_note: null,
            limitations: [],
          },
        ],
        summary: { total: 2, pending: 1, acked: 1, stale: 0 },
        acknowledgeEvent,
      }),
    );

    renderControle();

    expect(screen.getByText('Ciencia operacional FRMS')).toBeInTheDocument();
    expect(screen.getByText('Pendentes 1')).toBeInTheDocument();
    expect(screen.getByText('Cientes 1')).toBeInTheDocument();
    expect(screen.getAllByText('Check-in pendente').length).toBeGreaterThan(0);
    expect(screen.getByText('Ciente')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Registrar ciencia'));
    expect(acknowledgeEvent).toHaveBeenCalledWith('frms_read_ack_1_2026-05-29_20_CHECKIN_PENDENTE');
  });

  it('exibe estado vazio e erro de carregamento', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(buildHookState({ error: 'Erro de API' }));

    renderControle();

    expect(screen.getByText('Erro de API')).toBeInTheDocument();
  });

  describe('inicialização via query string (deep link do EVD)', () => {
    it('inicializa data_inicio e data_fim a partir de ?data_inicio=...&data_fim=...', () => {
      mockSnapshotData([]);

      renderControle([
        '/frms/controle-operacional?data_inicio=2026-05-27&data_fim=2026-05-27',
      ]);

      // verificar que o snapshot hook recebeu os filtros corretos da QS
      expect(useFrmsOperationalSnapshotMock).toHaveBeenCalledWith(
        expect.objectContaining({ data_inicio: '2026-05-27', data_fim: '2026-05-27' }),
      );
    });

    it('inicializa data a partir do atalho ?data=...', () => {
      mockSnapshotData([]);

      renderControle(['/frms/controle-operacional?data=2026-05-20']);

      expect(useFrmsOperationalSnapshotMock).toHaveBeenCalledWith(
        expect.objectContaining({ data_inicio: '2026-05-20', data_fim: '2026-05-20' }),
      );
    });

    it('inicializa funcionario_id a partir de ?funcionario_id=35', () => {
      mockSnapshotData([]);

      renderControle(['/frms/controle-operacional?data=2026-05-27&funcionario_id=35']);

      expect(useFrmsOperationalSnapshotMock).toHaveBeenCalledWith(
        expect.objectContaining({ funcionario_id: '35' }),
      );
      expect(screen.getByText('Filtro técnico ativo: exibindo apenas um tripulante.')).toBeInTheDocument();
    });

    it('usa hoje como fallback quando data inválida na QS', () => {
      mockSnapshotData([]);

      renderControle(['/frms/controle-operacional?data=nao-e-data']);

      // deve ter recebido um filtro com data no formato ISO, não 'nao-e-data'
      expect(useFrmsOperationalSnapshotMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data_inicio: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
      // e não deve ter usado a string inválida
      const call = useFrmsOperationalSnapshotMock.mock.calls[0]?.[0] as { data_inicio: string };
      expect(call.data_inicio).not.toBe('nao-e-data');
    });
  });

  describe('Datas no formato DD/MM/YYYY', () => {
    it('exibe data_operacional no formato brasileiro em vez de ISO', () => {
      mockSnapshotData([buildSnapshotItem({ data_operacional: '2026-06-05' })]);
      renderControle();
      expect(screen.getByText('05/06/2026')).toBeInTheDocument();
      expect(screen.queryByText('2026-06-05')).not.toBeInTheDocument();
    });

    it('exibe data valida mesmo para datas historicas', () => {
      mockSnapshotData([buildSnapshotItem({ data_operacional: '2026-01-15' })]);
      renderControle();
      expect(screen.getByText('15/01/2026')).toBeInTheDocument();
    });
  });

  describe('Quinzena — texto amigavel sem duty tecnico', () => {
    it('nao exibe "duty -" quando duty_time_periodo_min e null', () => {
      mockSnapshotData([
        buildSnapshotItem({
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            status_quinzena: 'INCOMPLETO',
            duty_time_periodo_min: null,
          },
        }),
      ]);
      renderControle();
      expect(screen.getByText(/Quinzena incompleta/)).toBeInTheDocument();
      expect(screen.queryByText(/duty/)).not.toBeInTheDocument();
      expect(screen.queryByText(/duty -/)).not.toBeInTheDocument();
    });

    it('exibe "Quinzena completa · jornada 30.0h" quando duty preenchido', () => {
      mockSnapshotData([
        buildSnapshotItem({
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            status_quinzena: 'OK',
            duty_time_periodo_min: 1800,
          },
        }),
      ]);
      renderControle();
      expect(screen.getByText(/Quinzena completa · jornada 30\.0h/)).toBeInTheDocument();
      expect(screen.getByText(/jornada 30\.0h/)).toBeInTheDocument();
    });

    it('renderiza mensagem de periodo ausente quando a fonte da quinzena esta ausente', () => {
      mockSnapshotData([
        buildSnapshotItem({
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'AUSENTE',
            status_quinzena: 'INCOMPLETO',
            alertas_quinzena: ['PERIODO_QUINZENA_AUSENTE'],
          },
        }),
      ]);

      renderControle();
      fireEvent.click(screen.getByText('Detalhes da quinzena'));

      expect(
        screen.getByText('Período de embarque não localizado nesta data. Verifique se a escala quinzenal foi cadastrada.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Indicador operacional descritivo — não é compliance regulatório.')).toBeInTheDocument();
    });

    it('renderiza mensagem de periodo parcial quando a janela cobre apenas parte da quinzena', () => {
      mockSnapshotData([
        buildSnapshotItem({
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'INCOMPLETO',
            status_quinzena: 'INCOMPLETO',
            alertas_quinzena: ['PERIODO_PARCIAL_NA_CONSULTA'],
          },
        }),
      ]);

      renderControle();
      fireEvent.click(screen.getByText('Detalhes da quinzena'));

      expect(
        screen.getByText(
          'Período identificado, mas a janela de consulta cobre apenas parte dele. Os acumulados refletem somente os dias visíveis.',
        ),
      ).toBeInTheDocument();
    });

    it('renderiza mensagem de quinzena base localizada sem jornada frms quando nao ha jornada no dia', () => {
      mockSnapshotData([
        buildSnapshotItem({
          teve_jornada: false,
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'DERIVADO',
            status_quinzena: 'ATENCAO',
            alertas_quinzena: [],
          },
        }),
      ]);

      renderControle();
      fireEvent.click(screen.getByText('Detalhes da quinzena'));

      expect(
        screen.getByText('Quinzena base identificada. Não há jornada FRMS vinculada neste dia.'),
      ).toBeInTheDocument();
    });

    it('renderiza mensagem quando nao ha indicador de quinzena para a data', () => {
      mockSnapshotData([
        buildSnapshotItem({
          fortnight_indicator: null,
        }),
      ]);

      renderControle();
      fireEvent.click(screen.getByText('Detalhes da quinzena'));

      expect(screen.getByText('Sem jornada FRMS registrada nesta data.')).toBeInTheDocument();
    });

    it('mantem grid completo e badge de fonte quando o periodo esta derivado', () => {
      mockSnapshotData([
        buildSnapshotItem({
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'DERIVADO',
            status_quinzena: 'ATENCAO',
            alertas_quinzena: ['DESCANSO_MINIMO'],
          },
        }),
      ]);

      renderControle();
      fireEvent.click(screen.getByText('Detalhes da quinzena'));

      expect(screen.getByText('Status da quinzena:')).toBeInTheDocument();
      expect(screen.getByText('Fonte do periodo:')).toBeInTheDocument();
      expect(screen.getByText('Derivado')).toBeInTheDocument();
      expect(screen.getByText('Alertas da quinzena:')).toBeInTheDocument();
    });

    it('nao exibe linguagem regulatoria indevida no painel quinzenal', () => {
      mockSnapshotData([
        buildSnapshotItem({
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'REAL',
            status_quinzena: 'OK',
          },
        }),
      ]);

      renderControle();
      fireEvent.click(screen.getByText('Detalhes da quinzena'));

      expect(screen.queryByText(/homologado|aprovado|ANAC/i)).not.toBeInTheDocument();
      expect(screen.getByText('Indicador operacional descritivo — não é compliance regulatório.')).toBeInTheDocument();
    });
  });

  describe('Escala indisponivel — banner e ajustes de classificacao', () => {
    it('mostra banner quando nenhum tripulante tem escala nem quinzena localizada', () => {
      mockSnapshotData([
        buildSnapshotItem({
          escalado: false,
          escala_source: 'AUSENTE' as any,
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'AUSENTE',
            status_quinzena: 'INCOMPLETO',
            alertas_quinzena: ['PERIODO_QUINZENA_AUSENTE'],
          },
        }),
        buildSnapshotItem({
          funcionario_id: 20, tripulante_id: 20, nome: 'Ana', nome_guerra: 'Ana',
          escalado: false, escala_source: 'AUSENTE' as any,
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'AUSENTE',
            status_quinzena: 'INCOMPLETO',
            alertas_quinzena: ['PERIODO_QUINZENA_AUSENTE'],
          },
        }),
      ]);
      renderControle();
      expect(screen.getByText(/Dados de escala indisponiveis/)).toBeInTheDocument();
    });

    it('nao mostra banner quando ha pelo menos um tripulante escalado', () => {
      mockSnapshotData();
      renderControle();
      expect(screen.queryByText(/Dados de escala indisponiveis/)).not.toBeInTheDocument();
    });

    it('substitui "Check-in sem escala" por "Check-in (escala indisponivel)" quando nao ha fallback de quinzena', () => {
      mockSnapshotData([
        buildSnapshotItem({
          escalado: false,
          escala_source: 'AUSENTE' as any,
          teve_jornada: false,
          checkin_status: 'RECEBIDO',
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'AUSENTE',
            status_quinzena: 'INCOMPLETO',
            alertas_quinzena: ['PERIODO_QUINZENA_AUSENTE'],
          },
        }),
      ]);
      renderControle();
      expect(screen.getByText('Check-in (escala indisponivel)')).toBeInTheDocument();
      expect(screen.queryByText('Check-in sem escala')).not.toBeInTheDocument();
    });

    it('usa rotulo de quinzena base quando o fallback foi localizado sem escala diaria', () => {
      mockSnapshotData([
        buildSnapshotItem({
          escalado: false, escala_source: 'AUSENTE' as any,
          teve_jornada: false, checkin_status: 'RECEBIDO',
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'INCOMPLETO',
            status_quinzena: 'INCOMPLETO',
            alertas_quinzena: ['PERIODO_PARCIAL_NA_CONSULTA'],
          },
        }),
      ]);
      renderControle();
      expect(screen.getByText('Check-in com quinzena base')).toBeInTheDocument();
      expect(screen.queryByText('Check-in (escala indisponivel)')).not.toBeInTheDocument();
    });

    it('substitui o banner global por aviso de quinzena base localizada quando nao ha escala diaria', () => {
      mockSnapshotData([
        buildSnapshotItem({
          escalado: false, escala_source: 'AUSENTE' as any,
          teve_jornada: false, checkin_status: 'RECEBIDO',
          fortnight_indicator: {
            ...buildSnapshotItem().fortnight_indicator,
            fonte_periodo: 'INCOMPLETO',
            status_quinzena: 'INCOMPLETO',
            alertas_quinzena: ['PERIODO_PARCIAL_NA_CONSULTA'],
          },
        }),
      ]);
      renderControle();
      expect(screen.getByText(/Quinzena base localizada para os registros visiveis/)).toBeInTheDocument();
      expect(screen.queryByText(/Dados de escala indisponiveis/)).not.toBeInTheDocument();
    });

    it('oculta alertas JORNADA_FRMS_SEM_ESCALA e ESCALADO_SEM_JORNADA_FRMS quando sem escala', () => {
      mockSnapshotData([
        buildSnapshotItem({
          escalado: false, escala_source: 'AUSENTE' as any,
          alertas: ['JORNADA_FRMS_SEM_ESCALA', 'CHECKIN_PENDENTE'],
        }),
      ]);
      renderControle();
      expect(screen.queryByText('Jornada FRMS sem escala')).not.toBeInTheDocument();
      expect(screen.getAllByText('Check-in pendente').length).toBeGreaterThan(0);
    });

    it('mantem alertas de escala quando ha dados de escala disponiveis', () => {
      mockSnapshotData([
        buildSnapshotItem({
          escalado: true,
          alertas: ['ESCALADO_SEM_JORNADA_FRMS'],
        }),
      ]);
      renderControle();
      expect(screen.getByText('Escalado sem jornada FRMS')).toBeInTheDocument();
    });
  });

  describe('Fontes com rotulos individuais por coluna', () => {
    it('exibe rotulos Sono, Despertar e Jornada acima de cada badge', () => {
      mockSnapshotData([
        buildSnapshotItem({
          sleep_data_source: 'REAL',
          wake_data_source: 'ESTIMADO',
          jornada_data_source: 'MANUAL' as any,
        }),
      ]);
      renderControle();
      // Check that individual labels are shown instead of the old single caption
      const sonoLabels = screen.getAllByText('Sono');
      const despertarLabels = screen.getAllByText('Despertar');
      const jornadaLabels = screen.getAllByText('Jornada');
      expect(sonoLabels.length).toBeGreaterThan(0);
      expect(despertarLabels.length).toBeGreaterThan(0);
      expect(jornadaLabels.length).toBeGreaterThan(0);
    });
  });
});
