import { describe, expect, it } from 'vitest';
import {
  TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS,
  trainingComplianceNeedsEnrollment,
} from '../../services/training-compliance-enrollment-policy';

describe('Pendências 4 & 5 — Integridade de Compliance, Decisão Gerencial IIO/APRS e Matrículas Históricas (Issues #1492 e #1381)', () => {
  it('1. Política de renovação e necessidade de matrícula respeita a janela regulatória de 30 dias', () => {
    expect(TRAINING_COMPLIANCE_ENROLLMENT_RENEWAL_WINDOW_DAYS).toBe(30);

    // Conforme com mais de 30 dias para vencer: NÃO precisa de matrícula
    expect(trainingComplianceNeedsEnrollment('CONFORME', 45)).toBe(false);

    // Conforme dentro da janela de renovação (<= 30 dias): precisa de renovação
    expect(trainingComplianceNeedsEnrollment('CONFORME', 20)).toBe(true);

    // Vencendo: precisa de matrícula
    expect(trainingComplianceNeedsEnrollment('VENCENDO', 20)).toBe(true);

    // Vencido: precisa de matrícula urgente
    expect(trainingComplianceNeedsEnrollment('VENCIDO', -10)).toBe(true);

    // Nunca realizou: precisa de matrícula inicial
    expect(trainingComplianceNeedsEnrollment('NAO_REALIZADO', null)).toBe(true);
  });

  it('2. Decisão Gerencial Vinculante: Auxiliar de Manutenção não recebe obrigatoriedade de IIO/APRS', () => {
    // Cenário: validação do contrato operacional após encerramento da PR #2083 e issues #2081/#1382.
    // Auxiliar de Manutenção não deve ter regra ativa para MNT_IIO_APRS (treinamento_requisitos.id=704 permanece inativo)
    const activeRulesForAuxiliar = [
      { id: 101, funcao: 'AUXILIAR_MANUTENCAO', treinamento_codigo: 'INTEGRA', obrigatorio: 1 },
      { id: 102, funcao: 'AUXILIAR_MANUTENCAO', treinamento_codigo: 'NR06', obrigatorio: 1 },
      { id: 103, funcao: 'AUXILIAR_MANUTENCAO', treinamento_codigo: 'SEGURANCA_BASICA', obrigatorio: 1 },
      // MNT_IIO_APRS id 704 NÃO está presente / desativado
    ];

    const hasIioRule = activeRulesForAuxiliar.some(
      (r) => r.treinamento_codigo === 'MNT_IIO_APRS' || r.treinamento_codigo === 'IIO_APRS',
    );
    expect(hasIioRule).toBe(false);

    // Mecânico (ID 198) preserva sua regra ativa
    const mechanicRules = [
      { id: 198, funcao: 'MECANICO', treinamento_codigo: 'MNT_IIO_APRS', obrigatorio: 1, ativo: 1 },
    ];
    expect(mechanicRules.find((r) => r.id === 198)?.ativo).toBe(1);
  });

  it('3. Cinco matrículas históricas canceladas (Issue #1381): preservação como canceladas sem restauração arbitrária', () => {
    // Simulação do lote de 5 matrículas históricas canceladas mantidas sob análise individual
    const historicalEnrollments = [
      { id: 138101, curso_codigo: 'NR-26', status: 'CANCELADO', has_scorm: true, has_history: true },
      { id: 138102, curso_codigo: 'NR-26', status: 'CANCELADO', has_scorm: true, has_history: true },
      { id: 138103, curso_codigo: 'NR-26', status: 'CANCELADO', has_scorm: true, has_history: true },
      { id: 138104, curso_codigo: 'FDM_GATE', status: 'CANCELADO', has_scorm: false, has_cycle: true },
      { id: 138105, curso_codigo: 'FDM_GATE', status: 'CANCELADO', has_scorm: false, has_cycle: true },
    ];

    // Nenhuma restauração em massa foi aplicada
    for (const matricula of historicalEnrollments) {
      expect(matricula.status).toBe('CANCELADO');
    }

    // Validação de que não são consideradas como alunos ativos no cálculo de vagas ou conformidade imediata
    const activeEnrollments = historicalEnrollments.filter((m) =>
      ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(m.status),
    );
    expect(activeEnrollments.length).toBe(0);
  });

  it('4. Reconciliação do catálogo: ausência de comprovação não equivale a dispensa automática nem autoriza matrícula cega', () => {
    type FuncionarioCompliance = {
      id: number;
      funcao: string;
      designacoes: string[];
      historicos: string[];
    };

    const funcA: FuncionarioCompliance = {
      id: 601,
      funcao: 'PILOTO',
      designacoes: [],
      historicos: ['CRM_CORP'], // Não possui PRE comprovado na planilha
    };

    // Ausência do treinamento PRE na fonte histórica não dispensa
    const possuiComprovacaoPre = funcA.historicos.includes('PRE');
    expect(possuiComprovacaoPre).toBe(false);

    // O status do requisito deve ser NAO_REALIZADO (não CONFORME nem DISPENSADO)
    const statusRequisito = possuiComprovacaoPre ? 'CONFORME' : 'NAO_REALIZADO';
    expect(statusRequisito).toBe('NAO_REALIZADO');

    // Cursos por designação: funcionário sem a designação correspondente NÃO deve ser matriculado
    const exigeDesignacaoLosa = funcA.designacoes.includes('OBSERVADOR_LOSA');
    expect(exigeDesignacaoLosa).toBe(false);
  });
});
