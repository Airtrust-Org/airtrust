import { describe, expect, it } from 'vitest';
import { matchCaeAvailabilityToNeed } from '../../services/cae-planning-matcher';
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

describe('CAE deterministic planning matcher', () => {
  it('packs three 2h curriculum sessions into a 2h + 4h CAE offer', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'SK76-periodico',
        equipment: 'SK76',
        expiry_date: '2026-09-30',
        planning_start_date: '2026-08-01',
        preferred_window_start: '2026-09-01',
        preferred_window_end: '2026-09-15',
        session_durations_minutes: [120, 120, 120],
      },
      [
        slot('SK76', '2026-09-01', '03:50', '05:50', 120),
        slot('SK76', '2026-09-02', '03:50', '07:50', 240),
      ],
    );

    expect(result.status).toBe('MATCHED');
    expect(result.selected_slots).toHaveLength(2);
    expect(result.assignments).toHaveLength(3);
    expect(result.total_required_minutes).toBe(360);
    expect(result.unused_reserved_minutes).toBe(0);
    expect(result.outside_preferred_window).toBe(false);
  });

  it('does not split a 2h curriculum session across two 1h slots', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-session',
        equipment: 'AW139',
        expiry_date: '2026-09-30',
        session_durations_minutes: [120],
      },
      [
        slot('AW139', '2026-09-01', '06:00', '07:00', 60),
        slot('AW139', '2026-09-01', '07:00', '08:00', 60),
      ],
    );

    expect(result.status).toBe('INSUFFICIENT_AVAILABILITY');
  });


  it('fails closed when the AirTrust planning candidate has ambiguous equipment', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'ambiguous-equipment',
        equipment: 'A_DEFINIR',
        expiry_date: '2026-09-30',
        session_durations_minutes: [120],
      },
      [slot('AW139', '2026-09-01', '06:00', '08:00', 120)],
    );

    expect(result.status).toBe('INVALID_NEED');
  });

  it('rejects availability after the qualification expiry', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-expired',
        equipment: 'AW139',
        expiry_date: '2026-09-05',
        session_durations_minutes: [120],
      },
      [slot('AW139', '2026-09-06', '06:00', '08:00', 120)],
    );

    expect(result.status).toBe('INSUFFICIENT_AVAILABILITY');
  });


  it('rejects an overnight slot that starts on expiry but ends after expiry', () => {
    const overnight: CaeAvailabilitySlotV1 = {
      equipment: 'AW139',
      date: '2026-09-05',
      start_time: '23:00',
      end_date: '2026-09-06',
      end_time: '01:00',
      duration_minutes: 120,
      state: 'OFFERED',
      confidence: 1,
    };
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-overnight-expiry',
        equipment: 'AW139',
        expiry_date: '2026-09-05',
        session_durations_minutes: [120],
      },
      [overnight],
    );

    expect(result.status).toBe('INSUFFICIENT_AVAILABILITY');
  });

  it('uses a before-expiry fallback only when the preferred window is insufficient', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-fallback',
        equipment: 'AW139',
        expiry_date: '2026-09-30',
        preferred_window_start: '2026-08-15',
        preferred_window_end: '2026-08-31',
        session_durations_minutes: [120, 120],
      },
      [
        slot('AW139', '2026-08-20', '06:00', '08:00', 120),
        slot('AW139', '2026-09-02', '00:00', '02:00', 120),
      ],
    );

    expect(result.status).toBe('MATCHED');
    expect(result.outside_preferred_window).toBe(true);
    expect(result.days_before_expiry).toBe(28);
  });
});
