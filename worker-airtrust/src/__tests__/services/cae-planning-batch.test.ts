import { describe, expect, it } from 'vitest';
import { matchCaeAvailabilityBatch } from '../../services/cae-planning-batch';
import type { CaeAvailabilitySlotV1 } from '../../services/cae-availability';

function slot(
  equipment: 'AW139' | 'SK76',
  date: string,
  start: string,
  end: string,
  minutes: number,
): CaeAvailabilitySlotV1 {
  return {
    equipment,
    date,
    start_time: start,
    end_date: date,
    end_time: end,
    duration_minutes: minutes,
    state: 'OFFERED',
    confidence: 1,
  };
}

describe('CAE global batch allocator', () => {
  it('does not reuse the same CAE capacity for two different crews', () => {
    const result = matchCaeAvailabilityBatch(
      [
        {
          id: 'crew-a',
          equipment: 'AW139',
          expiry_date: '2026-09-20',
          session_durations_minutes: [120],
        },
        {
          id: 'crew-b',
          equipment: 'AW139',
          expiry_date: '2026-09-25',
          session_durations_minutes: [120],
        },
      ],
      [slot('AW139', '2026-09-01', '06:00', '08:00', 120)],
    );

    expect(result.matches[0].status).toBe('MATCHED');
    expect(result.matches[1].status).toBe('INSUFFICIENT_AVAILABILITY');
  });

  it('keeps the unused tail of a larger CAE block available for the next crew', () => {
    const result = matchCaeAvailabilityBatch(
      [
        {
          id: 'crew-a',
          equipment: 'SK76',
          expiry_date: '2026-09-20',
          session_durations_minutes: [120],
        },
        {
          id: 'crew-b',
          equipment: 'SK76',
          expiry_date: '2026-09-25',
          session_durations_minutes: [120],
        },
      ],
      [slot('SK76', '2026-09-02', '03:50', '07:50', 240)],
    );

    expect(result.matches.map((match: any) => match.status)).toEqual(['MATCHED', 'MATCHED']);
    expect(result.matches[1].selected_slots[0]).toMatchObject({
      start_time: '05:50',
      end_time: '07:50',
      duration_minutes: 120,
    });
    expect(result.remaining_slots).toHaveLength(0);
  });

  it('prioritizes the earliest expiry when capacity is scarce', () => {
    const result = matchCaeAvailabilityBatch(
      [
        {
          id: 'later',
          equipment: 'AW139',
          expiry_date: '2026-10-30',
          session_durations_minutes: [120],
        },
        {
          id: 'urgent',
          equipment: 'AW139',
          expiry_date: '2026-09-10',
          session_durations_minutes: [120],
        },
      ],
      [slot('AW139', '2026-09-01', '06:00', '08:00', 120)],
    );

    expect(result.matches[0].need_id).toBe('urgent');
    expect(result.matches[0].status).toBe('MATCHED');
    expect(result.matches[1].need_id).toBe('later');
    expect(result.matches[1].status).toBe('INSUFFICIENT_AVAILABILITY');
  });
});
