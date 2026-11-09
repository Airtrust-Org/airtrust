/**
 * AirTrust FRMS — Teste Integrado Ponta a Ponta do Ciclo Operacional
 *
 * Exercita explicitamente as 5 fases consecutivas do ciclo:
 * 1. Check-in (KSS + sono declarado)
 * 2. Prontidão objetiva (PVT-B / tempo de reação)
 * 3. Cálculo do Snapshot Operacional Canônico
 * 4. Derivação dos Alertas Canônicos
 * 5. Derivação da Decisão Operacional Consolidada
 *
 * Comprova o encadeamento sem alterar dados reais e sem atalhos.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFrmsOperationalSnapshot,
  type BuildOperationalSnapshotInput,
} from '../../lib/frms/operational-snapshot';
import {
  deriveFrmsOperationalDecision,
  type FrmsDecisaoOperacionalInput,
} from '../../lib/frms/frms-operational-decision';

describe('FRMS Pipeline Integrado Ponta a Ponta (P02)', () => {
  const EMPRESA_ID = 6;
  const DATA_HOJE = '2026-11-08';
  const FUNCIONARIO_ID = 101;

  it('Cenário 1: Check-in crítico + PVT adverso -> Snapshot Crítico -> Alerta Canônico -> Mitigação Necessária', () => {
    // 1 & 2: Submissão de check-in com fadiga aguda (KSS 8, 4h sono) e PVT com lentidão/lapso
    const input: BuildOperationalSnapshotInput = {
      empresaId: EMPRESA_ID,
      hoje: DATA_HOJE,
      rows: {
        funcionarios: [{
          id: FUNCIONARIO_ID,
          nome: 'Piloto Sintético QA',
          nome_guerra: 'QA Pilot',
          funcao: 'PILOTO',
          cargo: 'Comandante',
          base: 'SBME',
          aeronave: 'S76',
        }],
        escalas: [{
          funcionario_id: FUNCIONARIO_ID,
          data_operacional: DATA_HOJE,
          hora_apresentacao: '07:00',
          hora_termino: '15:00',
          aeronave_prefixo: 'PR-XYZ',
          aeronave_modelo: 'S76',
        }],
        jornadas: [],
        checkins: [{
          funcionario_id: FUNCIONARIO_ID,
          data_operacional: DATA_HOJE,
          hora_checkin: '06:45',
          hora_apresentacao: '07:00',
          kss_score: 8,
          kss_provenance: 'CREW_REPORTED',
          horas_sono: 4,
          qualidade_sono: 1,
          wake_time: '05:30',
          score_fadiga: 82,
          nivel_fadiga: 'VERMELHO',
          status_operacional: 'INAPTO',
          computed_risk_level: 'critical',
        }],
        readiness: [{
          funcionario_id: FUNCIONARIO_ID,
          data_operacional: DATA_HOJE,
          classification: 'operational_review',
          protocol_version: 'airtrust-brief-v1',
        }],
        effectiveness: [],
      },
    };

    // 3 & 4: Construção do Snapshot e Alertas
    const snapshot = buildFrmsOperationalSnapshot(input);
    expect(snapshot.items).toHaveLength(1);
    const item = snapshot.items[0];

    expect(item.checkin_status).toBe('RECEBIDO');
    expect(item.kss_score).toBe(8);
    expect(item.horas_sono).toBe(4);
    expect(item.readiness_classification).toBe('operational_review');

    // Snapshot deve refletir os alertas canônicos consolidados
    expect(item.alertas).toContain('CHECKIN_CRITICO');
    expect(item.alertas).toContain('READINESS_REVISAO');
    expect(item.snapshot_status).toBe('CRITICO');

    // 5: Decisão Operacional Canônica
    const decisaoInput: FrmsDecisaoOperacionalInput = {
      operacao_requer_decisao: item.operacao_requer_decisao,
      snapshot_status: item.snapshot_status,
      alertas: item.alertas,
      tem_violacao_normativa: false,
      perfil_regulatorio_configurado: true,
      compliance_avaliavel: true,
    };

    const decisao = deriveFrmsOperationalDecision(decisaoInput);

    // O encadeamento deve resultar estritamente em MITIGACAO_NECESSARIA sem declarar APTO
    expect(decisao.estado_operacional).toBe('MITIGACAO_NECESSARIA');
    expect(decisao.acao_recomendada).toBe('AVALIAR_REPOUSO_DEMANDA_SUBSTITUICAO');
    expect(decisao.motivos_principais.length).toBeGreaterThan(0);
    expect(decisao.motivos_principais.some(m => m.toLowerCase().includes('crítico') || m.toLowerCase().includes('readiness') || m.toLowerCase().includes('check-in'))).toBe(true);
  });

  it('Cenário 2: Check-in seguro + PVT preservado -> Snapshot OK -> Decisão NORMAL', () => {
    const input: BuildOperationalSnapshotInput = {
      empresaId: EMPRESA_ID,
      hoje: DATA_HOJE,
      rows: {
        funcionarios: [{
          id: FUNCIONARIO_ID,
          nome: 'Piloto Sintético QA',
          nome_guerra: 'QA Pilot',
          funcao: 'PILOTO',
          cargo: 'Comandante',
          base: 'SBME',
          aeronave: 'S76',
        }],
        escalas: [{
          funcionario_id: FUNCIONARIO_ID,
          data_operacional: DATA_HOJE,
          hora_apresentacao: '08:00',
          hora_termino: '16:00',
          aeronave_prefixo: 'PR-XYZ',
          aeronave_modelo: 'S76',
        }],
        jornadas: [{
          funcionario_id: FUNCIONARIO_ID,
          data_operacional: DATA_HOJE,
          hora_apresentacao: '08:00',
          hora_termino: '16:00',
          horas_voo_minutos: 180,
          duracao_jornada_minutos: 480,
          origem: 'SBME',
          has_operational_data: 1,
          is_manual_empty: 0,
        }],
        checkins: [{
          funcionario_id: FUNCIONARIO_ID,
          data_operacional: DATA_HOJE,
          hora_checkin: '07:30',
          hora_apresentacao: '08:00',
          kss_score: 2,
          kss_provenance: 'CREW_REPORTED',
          horas_sono: 8.5,
          qualidade_sono: 5,
          wake_time: '06:30',
          score_fadiga: 10,
          nivel_fadiga: 'VERDE',
          status_operacional: 'APTO',
          computed_risk_level: 'normal',
        }],
        readiness: [{
          funcionario_id: FUNCIONARIO_ID,
          data_operacional: DATA_HOJE,
          classification: 'preserved',
          protocol_version: 'airtrust-brief-v1',
        }],
        effectiveness: [{
          funcionario_id: FUNCIONARIO_ID,
          data_operacional: DATA_HOJE,
          effectiveness_pct: 88.5,
          effectiveness_nivel: 'VERDE',
          source: 'REAL',
        }],
      },
    };

    const snapshot = buildFrmsOperationalSnapshot(input);
    const item = snapshot.items[0];

    expect(item.checkin_status).toBe('RECEBIDO');
    expect(item.alertas).not.toContain('CHECKIN_CRITICO');
    expect(item.alertas).not.toContain('READINESS_REVISAO');
    expect(item.snapshot_status).toBe('OK');

    const decisao = deriveFrmsOperationalDecision({
      operacao_requer_decisao: item.operacao_requer_decisao,
      snapshot_status: item.snapshot_status,
      alertas: item.alertas,
      tem_violacao_normativa: false,
      perfil_regulatorio_configurado: true,
      compliance_avaliavel: true,
    });

    expect(decisao.estado_operacional).toBe('NORMAL');
    expect(decisao.acao_recomendada).toBe('MANTER_ESCALA');
  });

  it('Cenário 3: Violação normativa soberana sobrepõe qualquer condição biológica favorável', () => {
    const decisao = deriveFrmsOperationalDecision({
      operacao_requer_decisao: true,
      snapshot_status: 'OK',
      alertas: [],
      tem_violacao_normativa: true, // Excesso de limite de voo da Lei 13.475
      violacoes_normativas: ['Excesso de horas de voo diárias (Lei 13.475 art. 32)'],
      perfil_regulatorio_configurado: true,
      compliance_avaliavel: true,
    });

    expect(decisao.estado_operacional).toBe('CRITICO_VIOLACAO');
    expect(decisao.acao_recomendada).toBe('NAO_RECOMENDAR_OPERACAO_ESCALAR_GESTAO');
    expect(decisao.motivos_principais).toContain('Excesso de horas de voo diárias (Lei 13.475 art. 32)');
  });
});
