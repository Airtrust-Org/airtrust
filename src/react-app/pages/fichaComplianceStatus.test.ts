import { describe, expect, it } from 'vitest';
import { resolveFichaComplianceStatus } from './fichaComplianceStatus';

describe('Ficha 360: evidence-readback failure cannot create false Compliance', () => {
  it('shows unavailable rather than compliant after failed individual API', () => {
    expect(resolveFichaComplianceStatus([], true)).toBe('indisponivel');
    expect(resolveFichaComplianceStatus([{ status: 'EM_DIA' }], true)).toBe('indisponivel');
  });

  it('distinguishes an actual empty matrix response from a failed request', () => {
    expect(resolveFichaComplianceStatus([], false)).toBe('conforme');
  });

  it('preserves expired precedence over at-risk and valid requirements', () => {
    expect(resolveFichaComplianceStatus([
      { status: 'EM_DIA', dias_para_vencer: 5 },
      { status: 'VENCIDO' },
    ], false)).toBe('nao_conforme');
    expect(resolveFichaComplianceStatus([{ status: 'EM_FALTA' }], false))
      .toBe('nao_conforme');
  });

  it('retains the current 30-day risk threshold', () => {
    expect(resolveFichaComplianceStatus([{ status: 'EM_DIA', dias_para_vencer: 30 }], false))
      .toBe('em_risco');
    expect(resolveFichaComplianceStatus([{ status: 'EM_DIA', dias_para_vencer: 31 }], false))
      .toBe('conforme');
  });
});
