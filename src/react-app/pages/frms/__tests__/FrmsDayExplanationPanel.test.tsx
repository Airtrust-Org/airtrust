import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ConfigLimites } from '../frmsUtils';
import FrmsDayExplanationPanel from '../components/FrmsDayExplanationPanel';

vi.mock('@/react-app/hooks/useFrms', () => ({
  useFrmsDayExplanation: () => ({
    loading: false,
    error: null,
    data: {
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
        explicacao_tecnica: 'Texto técnico legado',
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
        recomendacoes: [
          {
            codigo: 'REVISAR',
            prioridade: 'alta',
            titulo: 'Revisar jornada',
            descricao: 'Confirmar mitigação antes da próxima decisão operacional.',
          },
        ],
      },
      copiloto: { texto: 'conteúdo legado', provider: 'x', model: 'y' },
      explanation_trace: {
        version: 'frms-day-trace-v1',
        dataQuality: {
          data_source: 'crew_reported',
          confidence: 'reported',
          sourceSummary: 'informed',
          limitations: [],
        },
        sleep: {
          durationMinutes: 480,
          source: 'crew_reported',
          wakeTime: '05:50',
          wakeTimeSource: 'crew_reported',
          sleepStartEstimated: null,
          wakeTimeEstimated: null,
        },
        duty: {
          date: '2026-05-30',
          reportTime: '07:20',
          minutesAwakeBeforeReport: 90,
          missingReportTime: false,
        },
        calculation: {
          effectivenessPct: 54,
          readinessPct: null,
          level: 'Degradada',
          timeBelowThresholdMinutes: 35,
          mainFactor: 'hv',
          mainFactorImpact: '-10',
          components: {
            basica: -2.2,
            processo_s: null,
            processo_c: null,
            repouso: null,
            hv: -10,
            duracao: null,
          },
        },
        sourceFlags: {
          informedData: true,
          estimatedData: false,
          legacyPreC2: false,
          c2Corrected: true,
          recalculationPending: false,
        },
        windows: {
          daily: { available: true, date: '2026-05-30', effectivenessPct: 54, explanation: '' },
          sevenDays: { available: true, worstDay: '2026-05-30', worstEffectivenessPct: 54, explanation: '' },
          twentyEightDays: { available: true, worstDay: '2026-05-30', worstEffectivenessPct: 54, explanation: '' },
        },
      },
    },
  }),
}));

const config = {} as ConfigLimites;

describe('FrmsDayExplanationPanel simplificado', () => {
  it('mostra somente leitura operacional, fatores, ação e rastreabilidade', () => {
    render(
      <FrmsDayExplanationPanel tripulanteId="1" date="2026-05-30" config={config} source="ficha" />,
    );

    expect(screen.getByText(/Magioli · 30\/05\/2026/)).toBeInTheDocument();
    expect(screen.getByText('54,0%')).toBeInTheDocument();
    expect(screen.getByText('O que explica o resultado')).toBeInTheDocument();
    expect(screen.getByText('Acúmulo de horas de voo')).toBeInTheDocument();
    expect(screen.getByText('Revisar jornada')).toBeInTheDocument();
    expect(screen.getByText(/Confiança alta/i)).toBeInTheDocument();
    expect(screen.getByText(/dados informados/i)).toBeInTheDocument();
    expect(screen.getByText(/não diagnostica fadiga/i)).toBeInTheDocument();
  });

  it('não expõe a antiga simulação nem o copiloto na explicação', () => {
    render(
      <FrmsDayExplanationPanel tripulanteId="1" date="2026-05-30" config={config} source="ficha" />,
    );

    expect(screen.queryByText(/simular/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/copiloto/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fator_basica_pct/i)).not.toBeInTheDocument();
  });
});
