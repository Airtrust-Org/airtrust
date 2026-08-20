import { describe, expect, it } from 'vitest';
import { buildIogpComplianceEvaluations } from '../../lib/frms/frms-iogp-compliance-builder';
import { IOGP_690_2 } from '../../lib/frms/compliance-policy';

describe('buildIogpComplianceEvaluations — IOGP 17C.2 from canonical rolling accruals', () => {
  it('always returns exactly 4 evaluations [1D, 7D, 28D, 365D]', () => {
    const result = buildIogpComplianceEvaluations({
      hv_dia_min: 0,
      hv_7_dias_min: 0,
      hv_28_dias_min: 0,
      hv_365_dias_min: 0,
    });
    expect(result).toHaveLength(4);
  });

  describe('COMPLIANT path — all windows within limits', () => {
    it('marks all windows COMPLIANT when well within limits', () => {
      const result = buildIogpComplianceEvaluations({
        hv_dia_min: 5 * 60,   // 5h, limit = 10h
        hv_7_dias_min: 20 * 60, // 20h, limit = 45h
        hv_28_dias_min: 60 * 60, // 60h, limit = 120h
        hv_365_dias_min: 600 * 60, // 600h, limit = 1200h
      });
      for (const evaluation of result) {
        expect(evaluation.status).toBe('COMPLIANT');
      }
    });

    it('marks as COMPLIANT when exactly at the limit boundary (not >)', () => {
      const result = buildIogpComplianceEvaluations({
        hv_dia_min: IOGP_690_2.FLIGHT_DUTY_MAX_MIN,       // exactly 10h
        hv_7_dias_min: IOGP_690_2.FLIGHT_7D_MAX_MIN,      // exactly 45h
        hv_28_dias_min: IOGP_690_2.FLIGHT_28D_MAX_MIN,    // exactly 120h
        hv_365_dias_min: IOGP_690_2.FLIGHT_365D_MAX_MIN,  // exactly 1200h
      });
      for (const evaluation of result) {
        expect(evaluation.status).toBe('COMPLIANT');
      }
    });
  });

  describe('VIOLATION — 7D limit (§17C.2: >45h in 7 consecutive days)', () => {
    it('detects violation when 7D accrual exceeds 45h', () => {
      const result = buildIogpComplianceEvaluations({
        hv_dia_min: 5 * 60,
        hv_7_dias_min: 46 * 60, // 46h > 45h limit → VIOLATION
        hv_28_dias_min: 60 * 60,
        hv_365_dias_min: 600 * 60,
      });

      const [, sevenDayEval] = result;
      expect(sevenDayEval.status).toBe('VIOLATION');
      expect(sevenDayEval.actualMin).toBe(46 * 60);
    });

    it('violation in 7D alone means automaticApprovalAllowed = false in orchestrator', () => {
      // This test confirms the compliance evaluation alone is enough to block approval.
      const result = buildIogpComplianceEvaluations({
        hv_dia_min: 5 * 60,
        hv_7_dias_min: 46 * 60, // VIOLATION
        hv_28_dias_min: 60 * 60,
        hv_365_dias_min: 600 * 60,
      });
      const hasViolation = result.some((evaluation) => evaluation.status === 'VIOLATION');
      expect(hasViolation).toBe(true);
      // The orchestrator must receive this and set automaticApprovalAllowed = false.
      // We don't call the orchestrator here, but we verify the signal is present.
    });
  });

  describe('UNKNOWN handling — absent accruals', () => {
    it('maps null 7D accrual to UNKNOWN — not 0', () => {
      const result = buildIogpComplianceEvaluations({
        hv_dia_min: 5 * 60,
        hv_7_dias_min: null, // absent → UNKNOWN, never COMPLIANT by default
        hv_28_dias_min: 60 * 60,
        hv_365_dias_min: 600 * 60,
      });
      const [, sevenDayEval] = result;
      expect(sevenDayEval.status).toBe('UNKNOWN');
    });

    it('maps undefined accrual to UNKNOWN', () => {
      const result = buildIogpComplianceEvaluations({
        hv_dia_min: undefined,
        hv_7_dias_min: undefined,
        hv_28_dias_min: undefined,
        hv_365_dias_min: undefined,
      });
      for (const evaluation of result) {
        expect(evaluation.status).toBe('UNKNOWN');
      }
    });

    it('returns PARTIAL result when some windows are known and some are not', () => {
      const result = buildIogpComplianceEvaluations({
        hv_dia_min: 5 * 60,
        hv_7_dias_min: null,
        hv_28_dias_min: 60 * 60,
        hv_365_dias_min: null,
      });
      expect(result[0].status).toBe('COMPLIANT'); // 1D
      expect(result[1].status).toBe('UNKNOWN');   // 7D
      expect(result[2].status).toBe('COMPLIANT'); // 28D
      expect(result[3].status).toBe('UNKNOWN');   // 365D
    });
  });

  describe('IOGP limits — exact values from §17C.2 Table 17-1', () => {
    it('uses 10h (600 min) limit for 1D', () => {
      const justOver = buildIogpComplianceEvaluations({
        hv_dia_min: 10 * 60 + 1,
        hv_7_dias_min: 0,
        hv_28_dias_min: 0,
        hv_365_dias_min: 0,
      });
      expect(justOver[0].status).toBe('VIOLATION');
      expect(justOver[0].resolved?.limitMin).toBe(10 * 60);
    });

    it('uses 45h (2700 min) limit for 7D', () => {
      const justOver = buildIogpComplianceEvaluations({
        hv_dia_min: 0,
        hv_7_dias_min: 45 * 60 + 1,
        hv_28_dias_min: 0,
        hv_365_dias_min: 0,
      });
      expect(justOver[1].status).toBe('VIOLATION');
      expect(justOver[1].resolved?.limitMin).toBe(45 * 60);
    });

    it('uses 120h (7200 min) limit for 28D', () => {
      const justOver = buildIogpComplianceEvaluations({
        hv_dia_min: 0,
        hv_7_dias_min: 0,
        hv_28_dias_min: 120 * 60 + 1,
        hv_365_dias_min: 0,
      });
      expect(justOver[2].status).toBe('VIOLATION');
      expect(justOver[2].resolved?.limitMin).toBe(120 * 60);
    });

    it('uses 1200h (72000 min) limit for 365D', () => {
      const justOver = buildIogpComplianceEvaluations({
        hv_dia_min: 0,
        hv_7_dias_min: 0,
        hv_28_dias_min: 0,
        hv_365_dias_min: 1200 * 60 + 1,
      });
      expect(justOver[3].status).toBe('VIOLATION');
      expect(justOver[3].resolved?.limitMin).toBe(1200 * 60);
    });
  });

  describe('canonical decision invariant — pure function, no side effects', () => {
    it('is synchronous and produces no observable side effects', () => {
      const input = {
        hv_dia_min: 5 * 60,
        hv_7_dias_min: 20 * 60,
        hv_28_dias_min: 60 * 60,
        hv_365_dias_min: 600 * 60,
      };
      const r1 = buildIogpComplianceEvaluations(input);
      const r2 = buildIogpComplianceEvaluations(input);
      expect(r1).toEqual(r2);
      // Input object must not have been mutated
      expect(input.hv_7_dias_min).toBe(20 * 60);
    });
  });
});
