import { describe, expect, it } from 'vitest';
import {
  assessEdbOnboardAvailability,
  requiredEdbOnboardVolumeIds,
} from '../../services/edb/onboard-availability';

const references = [
  { volumeId: 'volume-001', revisionId: 'rev-old', revision: 1, flightDate: '2026-07-20' },
  { volumeId: 'volume-001', revisionId: 'rev-window-start', revision: 1, flightDate: '2026-07-29' },
  { volumeId: 'volume-002', revisionId: 'rev-recent', revision: 1, flightDate: '2026-08-20' },
  { volumeId: 'volume-003', revisionId: 'rev-future', revision: 1, flightDate: '2026-08-29' },
];

describe('eDB onboard availability', () => {
  it('selects whole volumes containing revisions inside the 30-day operation window', () => {
    expect(requiredEdbOnboardVolumeIds(references, '2026-08-28')).toEqual([
      'volume-001',
      'volume-002',
    ]);
  });

  it('reports missing required volumes without treating future or older revisions as required', () => {
    const result = assessEdbOnboardAvailability({
      references,
      availableVolumeIds: ['volume-002', 'volume-003'],
      asOfOperationDate: '2026-08-28',
    });

    expect(result.windowStart).toBe('2026-07-29');
    expect(result.requiredVolumeIds).toEqual(['volume-001', 'volume-002']);
    expect(result.missingVolumeIds).toEqual(['volume-001']);
    expect(result.compliant).toBe(false);
  });

  it('is compliant when every required volume is available', () => {
    const result = assessEdbOnboardAvailability({
      references,
      availableVolumeIds: ['volume-001', 'volume-002'],
      asOfOperationDate: '2026-08-28',
    });
    expect(result.compliant).toBe(true);
    expect(result.missingVolumeIds).toEqual([]);
  });
});
