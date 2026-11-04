import { describe, expect, it } from 'vitest';
import { evaluateCrewCheckinDate } from '../../lib/frms/checkin-date-guard';

describe('Crew check-in date policy (operational IANA-local dates)', () => {
  it('accepts the current operational day without retroactive justification', () => {
    expect(evaluateCrewCheckinDate('2026-11-03', '2026-11-03')).toEqual({
      valid: true, retrospective: false, reason: null,
    });
  });

  it('requires a categorical reason for an eligible D-1 declaration', () => {
    expect(evaluateCrewCheckinDate('2026-11-02', '2026-11-03')).toEqual({
      valid: false, error: 'late_submission_reason_required',
    });
    expect(evaluateCrewCheckinDate('2026-11-02', '2026-11-03', 'SYSTEM_UNAVAILABLE')).toEqual({
      valid: true, retrospective: true, reason: 'SYSTEM_UNAVAILABLE',
    });
  });

  it('rejects arbitrary historic dates despite submitted justification', () => {
    expect(evaluateCrewCheckinDate('2026-10-30', '2026-11-03', 'OTHER')).toEqual({
      valid: false, error: 'historical_checkin_out_of_window',
    });
  });

  it('respects leap-day and year-change boundaries for D-1', () => {
    expect(evaluateCrewCheckinDate('2028-02-29', '2028-03-01', 'OPERATIONAL_DELAY')).toEqual({
      valid: true, retrospective: true, reason: 'OPERATIONAL_DELAY',
    });
    expect(evaluateCrewCheckinDate('2026-12-31', '2027-01-01', 'OTHER')).toEqual({
      valid: true, retrospective: true, reason: 'OTHER',
    });
  });

  it('rejects impossible days, future dates, or invalid operational-today input', () => {
    expect(evaluateCrewCheckinDate('2026-02-30', '2026-03-01')).toEqual({
      valid: false, error: 'invalid_reference_date',
    });
    expect(evaluateCrewCheckinDate('2026-11-04', '2026-11-03')).toEqual({
      valid: false, error: 'invalid_reference_date',
    });
    expect(evaluateCrewCheckinDate('2026-11-03', '2026-02-30')).toEqual({
      valid: false, error: 'invalid_reference_date',
    });
  });
});
