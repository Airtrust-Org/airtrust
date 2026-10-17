import { describe, expect, it } from 'vitest';
import { kssProvenanceEventFields, resolveCheckinKssProvenance } from '../../lib/frms/kss-checkin-provenance';

describe('FRMS prospective KSS provenance', () => {
  it('identifies explicit KSS 1, 5, 9 without treating five as always defaulted', () => {
    for (const kss_score of [1, 5, 9]) {
      expect(resolveCheckinKssProvenance({ kss_score })).toBe('CREW_REPORTED');
    }
  });
  it('prioritizes directly provided KSS over compatible sleepiness input', () => {
    expect(resolveCheckinKssProvenance({ kss_score: 7, sleepiness_level: 1 })).toBe('CREW_REPORTED');
  });
  it('marks only a supplied sleepiness input as derived', () => {
    expect(resolveCheckinKssProvenance({ sleepiness_level: 0 })).toBe('DERIVED');
    expect(resolveCheckinKssProvenance({ sleepiness_level: 10 })).toBe('DERIVED');
  });
  it('marks no input, null inputs or invalid values as defaulted', () => {
    expect(resolveCheckinKssProvenance({})).toBe('DEFAULTED');
    expect(resolveCheckinKssProvenance({ kss_score: null, sleepiness_level: null })).toBe('DEFAULTED');
    expect(resolveCheckinKssProvenance({ kss_score: 5.5 })).toBe('DEFAULTED');
    expect(resolveCheckinKssProvenance({ kss_score: 0, sleepiness_level: 8 })).toBe('DERIVED');
  });
  it('persists a versioned field origin, not additional fatigue values', () => {
    for (const source of ['CREW_REPORTED', 'DERIVED', 'DEFAULTED'] as const) {
      expect(kssProvenanceEventFields(source)).toEqual({
        kss_field_provenance: source,
        kss_field_provenance_version: 'CHECKIN_SERVER_V1',
      });
    }
  });
});
