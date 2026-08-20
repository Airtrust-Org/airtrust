/**
 * Bridge from the new non-compensatory FRMS evaluation to the existing AirTrust
 * decision vocabulary. This does not replace decision-policy.ts.
 */

import type { FrmsDecisaoCodigo, FrmsMitigacaoRecomendada, FrmsNaturezaDado } from './decision-policy';
import type { FrmsRiskOrchestrationResult } from './frms-risk-orchestrator';

export interface FrmsIogpDecisionResult {
  decisao: FrmsDecisaoCodigo;
  mitigacoes: FrmsMitigacaoRecomendada[];
  causa: string;
  automaticApprovalAllowed: boolean;
  nonOverridableComplianceViolation: boolean;
}

export function resolveIogpDecision(
  orchestration: FrmsRiskOrchestrationResult,
  naturezaDado: FrmsNaturezaDado,
): FrmsIogpDecisionResult {
  const mitigacoes: FrmsMitigacaoRecomendada[] = [];
  const complianceViolation = orchestration.overallLevel === 'VIOLATION';

  if (complianceViolation) {
    // Planned/projection compliance is deterministic when based on documented
    // legal/contractual limits. It is intentionally not downgraded to ALERTA.
    // Realized historical violations are also classified as BLOQUEIA for any
    // prospective automatic approval, while remaining historical evidence.
    mitigacoes.push('REDUZIR_JORNADA', 'TROCAR_TRIPULANTE');
    return {
      decisao: 'BLOQUEIA',
      mitigacoes,
      causa: orchestration.reasons[0] ?? 'Violação de limite obrigatório ANAC/IOGP/operador.',
      automaticApprovalAllowed: false,
      nonOverridableComplianceViolation: true,
    };
  }

  if (orchestration.overallLevel === 'CRITICAL') {
    mitigacoes.push('REDUZIR_JORNADA', 'INSERIR_REPOUSO');
    return {
      decisao: 'EXIGE_OVERRIDE',
      mitigacoes,
      causa: orchestration.reasons[0] ?? 'Risco FRMS crítico requer decisão operacional formal.',
      automaticApprovalAllowed: false,
      nonOverridableComplianceViolation: false,
    };
  }

  if (!orchestration.automaticApprovalAllowed || orchestration.overallLevel === 'UNKNOWN') {
    if (naturezaDado === 'CHECKIN_SUBJETIVO') mitigacoes.push('REVISAR_CHECKIN');
    else mitigacoes.push('AGUARDAR_SIGVOOS');
    return {
      decisao: 'ALERTA',
      mitigacoes,
      causa: orchestration.reasons[0] ?? 'Dados insuficientes para aprovação automática.',
      automaticApprovalAllowed: false,
      nonOverridableComplianceViolation: false,
    };
  }

  if (orchestration.overallLevel === 'HIGH' || orchestration.overallLevel === 'ELEVATED') {
    mitigacoes.push('ACEITAR_COM_RESSALVA');
    return {
      decisao: 'ALERTA',
      mitigacoes,
      causa: orchestration.reasons[0] ?? 'Risco FRMS elevado requer mitigação/monitoramento.',
      automaticApprovalAllowed: orchestration.automaticApprovalAllowed,
      nonOverridableComplianceViolation: false,
    };
  }

  return {
    decisao: 'INFORMA',
    mitigacoes: ['SEM_ACAO'],
    causa: 'Nenhuma ocorrência adicional IOGP/ANAC identificada.',
    automaticApprovalAllowed: orchestration.automaticApprovalAllowed,
    nonOverridableComplianceViolation: false,
  };
}
