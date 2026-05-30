import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import FrmsFadigaHistorico from '../FrmsFadigaHistorico';
import FrmsJornadaEffectivenessCard from '../components/FrmsJornadaEffectivenessCard';
import type { FrmsEffectivenessJornadaRow } from '@/react-app/hooks/useFrms';

const navigateMock = vi.fn();
const useFrmsFadigaHistoricoMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/react-app/components/PageHeader', () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

vi.mock('@/react-app/components/Button', () => ({
  default: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/react-app/hooks/useFrms', () => ({
  useFrmsFadigaHistorico: (...args: unknown[]) => useFrmsFadigaHistoricoMock(...args),
}));

describe('FRMS Data Transparency - historico', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useFrmsFadigaHistoricoMock.mockReset();
  });

  it('renderiza badges de fonte do dado informado e estimado', () => {
    useFrmsFadigaHistoricoMock.mockReturnValue({
      data: [
        {
          id: '1',
          funcionario_id: 41,
          funcionario_nome: 'Trip 1',
          data_checkin: '2026-05-28',
          kss_score: 3,
          horas_sono: 7,
          qualidade_sono: 4,
          score_fadiga: 24,
          nivel_fadiga: 'BAIXO',
          status_operacional: 'MONITORADO',
          associado_frat_avaliacao_id: null,
          data_source: 'crew_reported',
        },
        {
          id: '2',
          funcionario_id: 42,
          funcionario_nome: 'Trip 2',
          data_checkin: '2026-05-28',
          kss_score: 6,
          horas_sono: 5,
          qualidade_sono: 2,
          score_fadiga: 68,
          nivel_fadiga: 'ALTO',
          status_operacional: 'RESTRITO',
          associado_frat_avaliacao_id: null,
          data_source: 'default_estimate',
        },
      ],
      loading: false,
      refetch: vi.fn(),
    });

    render(
      <MemoryRouter>
        <FrmsFadigaHistorico />
      </MemoryRouter>,
    );

    expect(screen.getByText('Dado informado')).toBeInTheDocument();
    expect(screen.getByText('Dado estimado')).toBeInTheDocument();
    expect(screen.queryByText(/SAFTE-FAST validado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^inapto$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^apto$/i)).not.toBeInTheDocument();
  });
});

function makeJornada(partial?: Partial<FrmsEffectivenessJornadaRow>): FrmsEffectivenessJornadaRow {
  return {
    id: 'fj-1',
    jornada_id: 'j-1',
    processado_com_bug: 0,
    data_apresentacao: '2026-05-28',
    data_liberacao: '2026-05-28',
    effectiveness_pct: 82,
    effectiveness_nivel: 'ATENCAO',
    effectiveness_componentes_json: JSON.stringify({
      processo_s: -0.02,
      processo_c: -0.03,
      repouso: -0.04,
      hv: -0.01,
      duracao: -0.06,
    }),
    total_fatorizado_jornada: -0.16,
    fator_basica_pct: -0.02,
    fator_repouso_pct: -0.04,
    fator_noturno_dep_pct: -0.01,
    fator_noturno_arr_pct: 0,
    fator_hv_quantidade_pct: -0.01,
    fator_apresentacao_pct: -0.03,
    fator_ciclo_embarcado_pct: -0.02,
    duracao_sono_efetiva_min: 420,
    hora_despertar_estimada: '06:00',
    hora_inicio_sono_estimado: '23:00',
    tempo_abaixo_limiar_min: 15,
    dia_periodo_embarcado: 3,
    total_dias_periodo: 14,
    ...partial,
  };
}

describe('FRMS Data Transparency - jornada card', () => {
  it('mostra badge legado pre-C2 quando processado_com_bug=1', () => {
    render(
      <FrmsJornadaEffectivenessCard
        jornada={makeJornada({ processado_com_bug: 1 })}
        config={null}
      />,
    );

    expect(screen.getByText('Dado legado pré-C2')).toBeInTheDocument();
  });

  it('mostra C2 corrigido e recálculo pendente quando faltar base de despertar', () => {
    render(
      <FrmsJornadaEffectivenessCard
        jornada={makeJornada({
          processado_com_bug: 0,
          hora_despertar_estimada: null,
          duracao_sono_efetiva_min: null,
        })}
        config={null}
      />,
    );

    expect(screen.getByText('Cálculo C2 corrigido')).toBeInTheDocument();
    expect(screen.getByText('Sem horário de apresentação: recálculo pendente')).toBeInTheDocument();
  });
});
