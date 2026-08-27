import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import FrmsDashboard from '../FrmsDashboard';

const useFrmsOperationalSnapshotMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/react-app/hooks/useFrmsOperationalSnapshot', () => ({
  useFrmsOperationalSnapshot: (...args: unknown[]) => useFrmsOperationalSnapshotMock(...args),
}));

function item(overrides: Partial<FrmsOperationalSnapshotItem> = {}): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-08-27',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Max Monteiro',
    nome_guerra: 'Max',
    funcao: 'PIC',
    base: 'SBJR',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'SIGVOOS',
    hora_apresentacao: '08:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 540,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:30',
    kss_score: 3,
    horas_sono: 7.5,
    qualidade_sono: 4,
    hora_acordar: '05:30',
    fadiga_score: 20,
    status_operacional_checkin: 'APTO',
    effectiveness_pct: 92,
    nivel_fadiga_calculado: 'BAIXO',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'OK',
    fortnight_indicator: null,
    alertas: [],
    estado_operacional: 'NORMAL',
    motivos_principais: [],
    acao_recomendada_texto: 'Nenhuma ação imediata.',
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    data: [item()],
    summary: {
      total_tripulantes: 1,
      total_escalados: 1,
      checkins_recebidos: 1,
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
    lastUpdatedAt: '2026-08-27T03:00:00.000Z',
    refetch: vi.fn(),
    ...overrides,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/frms']}>
      <FrmsDashboard />
    </MemoryRouter>,
  );
}

describe('FrmsDashboard simplificado', () => {
  beforeEach(() => {
    useFrmsOperationalSnapshotMock.mockReset();
    useFrmsOperationalSnapshotMock.mockReturnValue(state());
  });

  it('expõe apenas as três áreas primárias e remove a navegação antiga', () => {
    renderDashboard();

    expect(screen.getByRole('link', { name: 'Operação' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Casos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Administração' })).toBeInTheDocument();
    expect(screen.queryByText('Monitoramento')).not.toBeInTheDocument();
    expect(screen.queryByText('Análise & Evidências')).not.toBeInTheDocument();
    expect(screen.queryByText('Operação agora')).not.toBeInTheDocument();
  });

  it('não mostra zero operacional durante a primeira carga', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [],
        loading: true,
        lastUpdatedAt: null,
      }),
    );

    renderDashboard();

    expect(screen.getByLabelText('Carregando situação operacional')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('trata dado incompleto como confirmação e esconde efetividade não confiável', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [
          item({
            snapshot_status: 'INCOMPLETO',
            estado_operacional: 'NAO_AVALIADO',
            fatorizacao_status: 'AUSENTE',
            jornada_data_source: 'AUSENTE',
            effectiveness_pct: 0,
            alertas: ['JORNADA_SEM_FATORIZACAO'],
            motivos_principais: ['Jornada ainda não consolidada.'],
            acao_recomendada_texto: 'Confirmar a jornada antes do despacho.',
          }),
        ],
      }),
    );

    renderDashboard();

    expect(screen.getAllByText('Confirmar').length).toBeGreaterThan(0);
    expect(screen.getByText('Jornada ainda não consolidada.')).toBeInTheDocument();
    expect(screen.getByText('Efetividade não calculada')).toBeInTheDocument();
  });

  it('prioriza bloqueio e abre o detalhe no mesmo contexto', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({
        data: [
          item({ funcionario_id: 20, tripulante_id: 20, nome: 'Pessoa Normal', nome_guerra: null }),
          item({
            funcionario_id: 30,
            tripulante_id: 30,
            nome: 'Pessoa Crítica',
            nome_guerra: null,
            hora_apresentacao: '07:00',
            snapshot_status: 'CRITICO',
            estado_operacional: 'CRITICO_VIOLACAO',
            motivos_principais: ['Limite operacional excedido.'],
            acao_recomendada_texto: 'Não despachar até mitigação.',
          }),
        ],
      }),
    );

    renderDashboard();

    const criticalButton = screen.getByRole('button', { name: /Pessoa Crítica/i });
    fireEvent.click(criticalButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Por que exige atenção')).toBeInTheDocument();
    expect(screen.getAllByText('Limite operacional excedido.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Não despachar até mitigação.').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Abrir FRAT' })).toHaveAttribute(
      'href',
      '/frms/frat?tripulante_id=30&data=2026-08-27',
    );
  });

  it('mantém o último estado válido visível quando a atualização falha', () => {
    useFrmsOperationalSnapshotMock.mockReturnValue(
      state({ error: 'falha de rede', loading: false }),
    );

    renderDashboard();

    expect(screen.getByText(/mantendo o último estado válido/i)).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });
});
