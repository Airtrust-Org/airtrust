export type FichaComplianceStatus = 'conforme' | 'em_risco' | 'nao_conforme' | 'indisponivel';

type Requirement = { status: string; dias_para_vencer?: number | null };

/**
 * No successful Compliance readback means status is unknown, not compliant.
 * The employee profile may still render other modules while clearly showing
 * that its matrix cannot be used to attest training eligibility.
 */
export function resolveFichaComplianceStatus(
  requisitos: ReadonlyArray<Requirement>,
  readbackFailed: boolean,
): FichaComplianceStatus {
  if (readbackFailed) return 'indisponivel';
  if (requisitos.some((item) => item.status === 'VENCIDO' || item.status === 'EM_FALTA')) {
    return 'nao_conforme';
  }
  if (requisitos.some((item) => item.status === 'EM_DIA' &&
    Number(item.dias_para_vencer ?? 9999) <= 30)) {
    return 'em_risco';
  }
  return 'conforme';
}
