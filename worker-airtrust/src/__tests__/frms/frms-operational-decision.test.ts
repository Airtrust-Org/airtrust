import { describe, it, expect } from 'vitest';
import {
  deriveFrmsOperationalDecision,
  type FrmsDecisaoOperacionalInput,
} from '../../lib/frms/frms-operational-decision';

describe('frms-operational-decision', () => {
  const DEFAULT_INPUT: FrmsDecisaoOperacionalInput = {
    snapshot_status: 'OK',
    alertas: [],
    tem_violacao_normativa: false,
    perfil_regulatorio_configurado: true,
  };

  describe('1. Cenários Consolidados de Decisão', () => {
    it('NORMAL + NORMAL => NORMAL', () => {
      const result = deriveFrmsOperationalDecision(DEFAULT_INPUT);
      expect(result.estado_operacional).toBe('NORMAL');
      expect(result.motivos_principais).toHaveLength(0);
      expect(result.acao_recomendada).toBe('MANTER_ESCALA');
    });

    it('compliance normal + biológico atenção => ATENCAO', () => {
      const result = deriveFrmsOperationalDecision({
        ...DEFAULT_INPUT,
        snapshot_status: 'ATENCAO',
        alertas: ['SONO_ESTIMADO'],
      });
      expect(result.estado_operacional).toBe('ATENCAO');
      expect(result.acao_recomendada).toBe('REVISAR_CONDICAO_PRE_MISSAO');
      expect(result.motivos_principais).toContain('Dado de sono estimado — check-in real ausente');
    });

    it('compliance normal + biológico crítico (CHECKIN_CRITICO) => MITIGACAO_NECESSARIA', () => {
      const result = deriveFrmsOperationalDecision({
        ...DEFAULT_INPUT,
        snapshot_status: 'CRITICO', // biológico crítico
        alertas: ['CHECKIN_CRITICO'],
      });
      expect(result.estado_operacional).toBe('MITIGACAO_NECESSARIA');
      expect(result.acao_recomendada).toBe('AVALIAR_REPOUSO_DEMANDA_SUBSTITUICAO');
      expect(result.motivos_principais).toContain('Check-in indica fadiga crítica');
    });

    it('compliance normal + efetividade reduzida => MITIGACAO_NECESSARIA', () => {
      const result = deriveFrmsOperationalDecision({
        ...DEFAULT_INPUT,
        snapshot_status: 'CRITICO', // biológico crítico
        alertas: ['EFETIVIDADE_BAIXA'],
      });
      expect(result.estado_operacional).toBe('MITIGACAO_NECESSARIA');
      expect(result.motivos_principais).toContain('Efetividade cognitiva reduzida');
    });

    it('qualquer VIOLACAO => CRITICO_VIOLACAO (não compensável)', () => {
      const result = deriveFrmsOperationalDecision({
        ...DEFAULT_INPUT,
        tem_violacao_normativa: true,
        // Mesmo que o snapshot biológico esteja OK
        snapshot_status: 'OK',
        alertas: [],
      });
      expect(result.estado_operacional).toBe('CRITICO_VIOLACAO');
      expect(result.acao_recomendada).toBe('NAO_RECOMENDAR_OPERACAO_ESCALAR_GESTAO');
      expect(result.motivos_principais).toContain('Limite legal/regulatório/contratual ultrapassado');
    });

    it('perfil regulatório obrigatório ausente => NAO_AVALIADO', () => {
      const result = deriveFrmsOperationalDecision({
        ...DEFAULT_INPUT,
        perfil_regulatorio_configurado: false,
      });
      expect(result.estado_operacional).toBe('NAO_AVALIADO');
      expect(result.acao_recomendada).toBe('COMPLETAR_INFORMACAO_NECESSARIA');
      expect(result.motivos_principais).toContain('Perfil regulatório do tenant não configurado');
    });

    it('dados complementares ausentes NÃO geram NAO_AVALIADO global', () => {
      const result = deriveFrmsOperationalDecision({
        ...DEFAULT_INPUT,
        dados_complementares_ausentes: ['Sem dados REDEMET'],
      });
      // Permanece NORMAL, mas a nota fica registrada
      expect(result.estado_operacional).toBe('NORMAL');
      expect(result.dados_complementares_ausentes).toContain('Sem dados REDEMET');
    });
  });

  describe('2. Invariantes de Dados e Motivos', () => {
    it('DADO_INCONSISTENTE leva a NAO_AVALIADO', () => {
      const result = deriveFrmsOperationalDecision({
        ...DEFAULT_INPUT,
        snapshot_status: 'INCOMPLETO',
        alertas: ['DADO_INCONSISTENTE'],
      });
      expect(result.estado_operacional).toBe('NAO_AVALIADO');
      expect(result.motivos_principais).toContain('Dados inconsistentes — decisão indisponível');
    });

    it('Retorna no máximo 3 motivos e prioriza', () => {
      const result = deriveFrmsOperationalDecision({
        ...DEFAULT_INPUT,
        snapshot_status: 'CRITICO',
        alertas: [
          'SONO_ESTIMADO', // baixa prioridade
          'CHECKIN_CRITICO', // alta
          'EFETIVIDADE_BAIXA', // alta
          'SONO_INSUFICIENTE', // média
        ],
      });
      expect(result.estado_operacional).toBe('MITIGACAO_NECESSARIA');
      expect(result.motivos_principais).toHaveLength(3);
      // Os de alta prioridade devem estar incluídos
      expect(result.motivos_principais).toContain('Check-in indica fadiga crítica');
      expect(result.motivos_principais).toContain('Efetividade cognitiva reduzida');
      expect(result.motivos_principais).toContain('Sono insuficiente (< 6h)');
      // Baixa prioridade descartado do top 3
      expect(result.motivos_principais).not.toContain('Dado de sono estimado — check-in real ausente');
    });
  });
});
