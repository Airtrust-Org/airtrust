import { describe, expect, it } from 'vitest';
import { resolveIogpDecision } from '../../lib/frms/iogp-decision-adapter';

const base = {
  overallLevel: 'NORMAL' as const,
  complianceLevel: 'NORMAL' as const,
  biologicalLevel: 'NORMAL' as const,
  operationalLevel: 'NORMAL' as const,
  environmentalLevel: 'NORMAL' as const,
  automaticApprovalAllowed: true,
  alerts: [], reasons: [],
};

describe('IOGP decision adapter', () => {
  it('makes compliance violation non-overridable and blocking', () => {
    const result = resolveIogpDecision({ ...base, overallLevel: 'VIOLATION', complianceLevel: 'VIOLATION', automaticApprovalAllowed: false, reasons: ['ANAC limit exceeded'] }, 'PROJECAO');
    expect(result.decisao).toBe('BLOQUEIA');
    expect(result.nonOverridableComplianceViolation).toBe(true);
    expect(result.automaticApprovalAllowed).toBe(false);
  });

  it('requires formal override for critical non-compliance risk', () => {
    const result = resolveIogpDecision({ ...base, overallLevel: 'CRITICAL', automaticApprovalAllowed: false }, 'JORNADA_PLANEJADA');
    expect(result.decisao).toBe('EXIGE_OVERRIDE');
  });
});
