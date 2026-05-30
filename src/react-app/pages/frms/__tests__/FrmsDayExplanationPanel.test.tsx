import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsDayExplanationPanel from '../components/FrmsDayExplanationPanel';
import type {
  FrmsDayExplanationResponse,
  FrmsEffectivenessJornadaRow,
} from '@/react-app/hooks/useFrms';

const useFrmsDayExplanationMock = vi.fn();
const useFrmsJornadasEffectivenessMock = vi.fn();
const useFrmsCompararDiasMock = vi.fn();
const useFrmsMutationMock = vi.fn();
const useFrmsJustificativasMock = vi.fn();

vi.mock('@/react-app/hooks/useFrms', () => ({
  useFrmsDayExplanation: (...args: unknown[]) => useFrmsDayExplanationMock(...args),
  useFrmsJornadasEffectiveness: (...args: unknown[]) => useFrmsJornadasEffectivenessMock(...args),
  useFrmsCompararDias: (...args: unknown[]) => useFrmsCompararDiasMock(...args),
  useFrmsMutation: () => useFrmsMutationMock(),
  useFrmsJustificativas: (...args: unknown[]) => useFrmsJustificativasMock(...args),
}));

function makeExplanation(partial?: Partial<FrmsDayExplanationResponse>): FrmsDayExplanationResponse {
  return {
    tripulante: {
      id: '35',
      nome: 'Tripulante Teste',
      cargo: 'Piloto',
    },
    jornada: {
      data: '2026-05-28',
      hora_apresentacao: '07:30',
      hora_acordou: '06:00',
      effectiveness_pct: 82.4,
      effectiveness_nivel: 'atencao',
      tempo_abaixo_limiar_min: 45,
      dias_criticos_consecutivos: 0,
      duracao_sono_efetiva_min: 420,
      hora_despertar_estimada: '06:00',
      hora_inicio_sono_estimado: '23:00',
      dia_periodo_embarcado: 3,
      total_dias_periodo: 14,
    },
    diagnostico: {
      faixa: 'amarelo',
      resumo_executivo: 'Resumo executivo do dia.',
      explicacao_tecnica: 'Explicação técnica do dia.',
      explicacao_didatica: 'Explicação didática do dia.',
      fator_principal: 'Repouso',
      fatores: [
        {
          codigo: 'repouso',
          titulo: 'Repouso',
          impacto_pct: -8.2,
          impacto_abs_pct: 8.2,
          direcao: 'penaliza',
          resumo: 'Repouso insuficiente reduziu a margem.',
        },
        {
          codigo: 'duracao',
          titulo: 'Duração',
          impacto_pct: -1.6,
          impacto_abs_pct: 1.6,
          direcao: 'penaliza',
          resumo: 'Jornada longa consumiu margem adicional.',
        },
      ],
      recomendacoes: [],
    },
    copiloto: {
      texto: 'Texto de apoio',
      provider: 'rule-engine',
      model: 'frms-day-explainer-v1',
    },
    ...partial,
  };
}

function makeTimelineRow(partial?: Partial<FrmsEffectivenessJornadaRow>): FrmsEffectivenessJornadaRow {
  return {
    id: 'fj-1',
    jornada_id: 'j-1',
    processado_com_bug: 0,
    data_apresentacao: '2026-05-28',
    data_liberacao: '2026-05-28',
    effectiveness_pct: 82.4,
    effectiveness_nivel: 'ATENCAO',
    effectiveness_componentes_json: null,
    total_fatorizado_jornada: -0.15,
    fator_basica_pct: -0.03,
    fator_repouso_pct: -0.08,
    fator_noturno_dep_pct: -0.02,
    fator_noturno_arr_pct: 0,
    fator_hv_quantidade_pct: -0.01,
    fator_apresentacao_pct: -0.02,
    fator_ciclo_embarcado_pct: -0.01,
    duracao_sono_efetiva_min: 420,
    hora_despertar_estimada: '06:00',
    hora_inicio_sono_estimado: '23:00',
    tempo_abaixo_limiar_min: 45,
    dia_periodo_embarcado: 3,
    total_dias_periodo: 14,
    ...partial,
  };
}

describe('FrmsDayExplanationPanel', () => {
  beforeEach(() => {
    useFrmsDayExplanationMock.mockReset();
    useFrmsJornadasEffectivenessMock.mockReset();
    useFrmsCompararDiasMock.mockReset();
    useFrmsMutationMock.mockReset();
    useFrmsJustificativasMock.mockReset();

    useFrmsJornadasEffectivenessMock.mockReturnValue({
      data: [makeTimelineRow()],
      loading: false,
      error: null,
    });
    useFrmsCompararDiasMock.mockReturnValue({
      data: null,
      loading: false,
      error: null,
    });
    useFrmsMutationMock.mockReturnValue({
      mutate: vi.fn(),
      loading: false,
      error: null,
    });
    useFrmsJustificativasMock.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('não quebra ao trocar de loading para dados e renderiza os blocos principais', () => {
    let state: { data: FrmsDayExplanationResponse | null; loading: boolean; error: string | null } =
      {
        data: null,
        loading: true,
        error: null,
      };
    useFrmsDayExplanationMock.mockImplementation(() => state);

    const { rerender } = render(
      <FrmsDayExplanationPanel
        tripulanteId="35"
        tripulanteNome="Tripulante Teste"
        date="2026-05-28"
        config={null}
        source="ficha"
      />,
    );

    state = {
      data: makeExplanation(),
      loading: false,
      error: null,
    };
    rerender(
      <FrmsDayExplanationPanel
        tripulanteId="35"
        tripulanteNome="Tripulante Teste"
        date="2026-05-28"
        config={null}
        source="ficha"
      />,
    );

    expect(
      screen.getByText(/combinação de fatores do dia reduziu a margem operacional estimada/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Como chegamos ao índice')).toBeInTheDocument();
    expect(screen.getByText('O que mais pesou')).toBeInTheDocument();
    expect(screen.getByText('O que verificar antes de agir')).toBeInTheDocument();
    expect(screen.getByText('Trace técnico (secundário)')).toBeInTheDocument();
  });

  it('mostra recálculo pendente quando não há hora de apresentação', () => {
    useFrmsDayExplanationMock.mockReturnValue({
      data: makeExplanation({
        jornada: {
          ...makeExplanation().jornada,
          hora_apresentacao: null,
          hora_acordou: null,
          duracao_sono_efetiva_min: null,
        },
      }),
      loading: false,
      error: null,
    });

    render(
      <FrmsDayExplanationPanel
        tripulanteId="35"
        tripulanteNome="Tripulante Teste"
        date="2026-05-28"
        config={null}
        source="ficha"
      />,
    );

    expect(screen.getByText('Sem horário de apresentação: recálculo pendente')).toBeInTheDocument();
  });

  it('mantém disclaimer de triagem visível no painel', () => {
    useFrmsDayExplanationMock.mockReturnValue({
      data: makeExplanation(),
      loading: false,
      error: null,
    });

    render(
      <FrmsDayExplanationPanel
        tripulanteId="35"
        tripulanteNome="Tripulante Teste"
        date="2026-05-28"
        config={null}
        source="dashboard"
      />,
    );

    expect(screen.getByText(/ferramenta de triagem operacional/i)).toBeInTheDocument();
    expect(screen.getByText(/não determina aptidão ou restrição automática/i)).toBeInTheDocument();
    expect(screen.getByText(/exige revisão humana/i)).toBeInTheDocument();
    expect(screen.getByText(/não valida SAFTE-FAST/i)).toBeInTheDocument();
  });

  it('exibe fator basica como contexto, sem pontos percentuais de impacto', () => {
    useFrmsDayExplanationMock.mockReturnValue({
      data: makeExplanation({
        diagnostico: {
          ...makeExplanation().diagnostico,
          fatores: [
            {
              codigo: 'basica',
              titulo: 'Condição circadiana basal estimada',
              impacto_pct: 0,
              impacto_abs_pct: 0,
              direcao: 'neutro',
              resumo: 'Contexto basal observado em coeficiente 0.84 (escala 0 a 1).',
            },
          ],
        },
      }),
      loading: false,
      error: null,
    });

    render(
      <FrmsDayExplanationPanel
        tripulanteId="35"
        tripulanteNome="Tripulante Teste"
        date="2026-05-28"
        config={null}
        source="dashboard"
      />,
    );

    expect(screen.getByText('Condição circadiana basal estimada')).toBeInTheDocument();
    expect(
      screen.getByText('Contexto basal (sem leitura isolada em pp)'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\+84(\.0)?\s*pp/i)).not.toBeInTheDocument();
  });
});
