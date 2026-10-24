import { describe, expect, it } from 'vitest';
import { normalizeFitForDutyPayload, normalizeOptionalBinary } from '../../routes/frms-fadiga-checkin-normalization';

describe('daily fatigue payload normalization', () => {
  it('preserves unknown binary inputs rather than inferring a negative answer', () => {
    expect(normalizeOptionalBinary(null)).toBeNull();
    expect(normalizeOptionalBinary(undefined)).toBeNull();
    expect(normalizeOptionalBinary(true)).toBe(1);
    expect(normalizeOptionalBinary(1)).toBe(1);
    expect(normalizeOptionalBinary(false)).toBe(0);
    expect(normalizeOptionalBinary(0)).toBe(0);
  });

  it('keeps fit_for_duty canonical while detecting contradictions', () => {
    expect(normalizeFitForDutyPayload({ fit_for_duty: true, apto: 1 })).toEqual({ apto: 1 });
    expect(normalizeFitForDutyPayload({ fit_for_duty: false, apto: 0 })).toEqual({ apto: 0 });
    expect(normalizeFitForDutyPayload({ fit_for_duty: true, apto: 0 })).toEqual({ conflict: true });
    expect(normalizeFitForDutyPayload({ fit_for_duty: false, apto: 1 })).toEqual({ conflict: true });
    expect(normalizeFitForDutyPayload({ fit_for_duty: false })).toEqual({ apto: 0 });
    expect(normalizeFitForDutyPayload({ apto: 1 })).toEqual({ apto: 1 });
    expect(normalizeFitForDutyPayload({})).toEqual({ missing: true });
  });
});
