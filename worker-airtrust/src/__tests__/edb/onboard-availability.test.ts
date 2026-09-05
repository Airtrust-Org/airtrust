import { describe, expect, it } from 'vitest';
import {
  assessEdbOnboardAvailability,
  onboardOperationWindowStart,
  requiredEdbOnboardVolumeIds,
} from '../../services/edb/onboard-availability';

const references = [
  { volumeId: 'volume-old', revisionId: 'rev-day-31', revision: 1, flightDate: '2026-07-29' },
  { volumeId: 'volume-start', revisionId: 'rev-day-1', revision: 1, flightDate: '2026-07-30' },
  { volumeId: 'volume-recent', revisionId: 'rev-recent', revision: 2, flightDate: '2026-08-20' },
  { volumeId: 'volume-today', revisionId: 'rev-day-30', revision: 1, flightDate: '2026-08-28' },
  { volumeId: 'volume-future', revisionId: 'rev-future', revision: 1, flightDate: '2026-08-29' },
];

describe('eDB onboard availability', () => {
  it('defines the 30-day window as inclusive of the as-of date and the preceding 29 calendar days', () => {
    expect(onboardOperationWindowStart('2026-08-28')).toBe('2026-07-30');
    expect(onboardOperationWindowStart('2024-03-01')).toBe('2024-02-01');
    expect(onboardOperationWindowStart('2026-03-01')).toBe('2026-01-31');
  });

  it('includes both exact boundaries and excludes day 31 and future records', () => {
    expect(requiredEdbOnboardVolumeIds(references, '2026-08-28')).toEqual([
      'volume-recent',
      'volume-start',
      'volume-today',
    ]);
  });

  it('selects a whole volume when any immutable revision in that volume is inside the window', () => {
    const mixedVolume = [
      { volumeId: 'volume-001', revisionId: 'rev-old', revision: 1, flightDate: '2026-06-01' },
      { volumeId: 'volume-001', revisionId: 'rev-window', revision: 2, flightDate: '2026-08-10' },
    ];

    expect(requiredEdbOnboardVolumeIds(mixedVolume, '2026-08-28')).toEqual(['volume-001']);
  });

  it('reports missing required volumes without counting old or future-only volumes', () => {
    const result = assessEdbOnboardAvailability({
      references,
      availableVolumeIds: ['volume-recent', 'volume-today', 'volume-future'],
      asOfOperationDate: '2026-08-28',
    });

    expect(result.windowStart).toBe('2026-07-30');
    expect(result.requiredVolumeIds).toEqual(['volume-recent', 'volume-start', 'volume-today']);
    expect(result.missingVolumeIds).toEqual(['volume-start']);
    expect(result.compliant).toBe(false);
  });

  it('is compliant when every required volume is available', () => {
    const result = assessEdbOnboardAvailability({
      references,
      availableVolumeIds: ['volume-start', 'volume-recent', 'volume-today'],
      asOfOperationDate: '2026-08-28',
    });

    expect(result.compliant).toBe(true);
    expect(result.missingVolumeIds).toEqual([]);
  });

  it('fails closed on malformed dates, blank ids and invalid revision numbers', () => {
    expect(() => onboardOperationWindowStart('2026-02-30')).toThrow('valid calendar date');
    expect(() =>
      requiredEdbOnboardVolumeIds(
        [{ volumeId: ' ', revisionId: 'rev', revision: 1, flightDate: '2026-08-01' }],
        '2026-08-28',
      ),
    ).toThrow('volumeId is required');
    expect(() =>
      requiredEdbOnboardVolumeIds(
        [{ volumeId: 'volume', revisionId: 'rev', revision: 0, flightDate: '2026-08-01' }],
        '2026-08-28',
      ),
    ).toThrow('revision must be a positive integer');
  });
});
