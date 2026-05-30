import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FrmsDayExplanationPanel from '../components/FrmsDayExplanationPanel';

vi.mock('@/react-app/hooks/useFrms', () => {
  const data = {
    tripulante: { id: '1', nome: 'Magioli', cargo: 'Piloto' },
    jornada: {
      data: '2026-05-30',
      hora_apresentacao: '07:20',
      hora_acordou: '05:50',
      effectiveness_pct: 54,
      effectiveness_nivel: 'Degradada',
      tempo_abaixo_limiar_min: 35,
      dias_criticos_consecutivos: 2,
      duracao_sono_efetiva_min: 480,
      hora_despertar_estimada: '05:50',
      hora_inicio_sono_estimado: '21:50',
      dia_periodo_embarcado: 14,
      total_dias_periodo: 15,
    },
    diagnostico: {
      faixa: 'vermelho',
      resumo_executivo: '7d pior dia 2026-05-30 (54). 28d pior dia 2026-05-30 (54).',
      explicacao_tecnica:
        'Triagem operacional; revisão humana; não diagnóstico; não decisão automática; não valida SAFTE-FAST.',
      explicacao_didatica: '',
      fator_principal: 'Acúmulo de voo',
      fatores: [
        {
          codigo: 'hv',
          titulo: 'Acúmulo',
          impacto_pct: -10,
          impacto_abs_pct: 10,
          direcao: 'penaliza',
          resumo: 'Componente de acúmulo recente de voo',
        },
        {
          codigo: 'basica',
          titulo: 'fator_basica_pct',
          impacto_pct: -2.2,
          impacto_abs_pct: 2.2,
          direcao: 'penaliza',
          resumo: 'fator_basica_pct: 0.6000',
        },
      ],
      recomendacoes: [],
    },
    copiloto: { texto: 'fator_basica_pct: 0.6000', provider: 'x', model: 'y' },
  };
  return {
    useFrmsDayExplanation: () => ({ data, loading: false, error: null }),
    useFrmsCompararDias: () => ({ data: null, loading: false, error: null }),
    useFrmsJustificativas: () => ({ data: [], refetch: vi.fn() }),
    useFrmsMutation: () => ({ mutate: vi.fn(), loading: false }),
  };
});

describe('FrmsDayExplanationPanel', () => {
  it('formata data, remove termos técnicos e mostra explicação operacional curta', () => {
    render(
      <FrmsDayExplanationPanel tripulanteId="1" date="2026-05-30" config={null} source="ficha" />,
    );

    expect(screen.getByText(/Magioli · 30\/05\/2026/)).toBeDefined();
    expect(screen.queryByText('2026-05-30')).toBeNull();
    expect(screen.queryByText(/fator_basica_pct/i)).toBeNull();
    expect(screen.queryByText(/7d pior dia/i)).toBeNull();
    expect(screen.queryByText(/28d pior dia/i)).toBeNull();
    expect(screen.getByText('Explicação operacional')).toBeDefined();
    expect(screen.queryByText('Explicação pela IA')).toBeNull();
    expect(screen.getByText(/Como interpretar esta leitura/i)).toBeDefined();
    expect(screen.getByText(/Acúmulo de horas de voo:/i)).toBeDefined();
    expect(screen.getByText(/Pior ponto nas janelas de 7 e 28 dias: 30\/05\/2026/i)).toBeDefined();
    expect(screen.getByText(/triagem operacional/i)).toBeDefined();
    expect(screen.getByText(/revisão humana/i)).toBeDefined();
    expect(screen.getByText(/não diagnostica fadiga/i)).toBeDefined();
    expect(screen.getByText(/não determina aptidão ou restrição automática/i)).toBeDefined();
    expect(screen.getByText(/não valida SAFTE-FAST/i)).toBeDefined();
    expect(screen.getAllByText(/Ferramenta de triagem operacional/i)).toHaveLength(1);
    expect(screen.getByText(/soma dos fatores já presentes no início do dia/i)).toBeDefined();
    expect(screen.getByText(/Maior impacto: -10,0 pp/)).toBeDefined();
  });
});
