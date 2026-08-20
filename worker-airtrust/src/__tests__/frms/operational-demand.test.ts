import { describe, expect, it } from 'vitest';
import { assessOperationalDemand } from '../../lib/frms/operational-demand';

describe('FRMS operational demand IOGP 17C.1', () => {
  it('does not infer offshore from unknown locations', () => {
    const result = assessOperationalDemand([
      {
        id: '1', dataOperational: '2026-04-02', takeoffLocal: '07:00', landingLocal: '07:20',
        airborneMinutes: 20, landingCount: 1, departureClass: 'UNKNOWN', arrivalClass: 'UNKNOWN',
      },
    ]);
    expect(result.offshoreSectorCount).toBe(0);
    expect(result.dataQuality).toBe('PARTIAL');
  });

  it('identifies dense repetitive short offshore shuttle load', () => {
    const legs = Array.from({ length: 10 }, (_, i) => {
      const takeoffMinute = i * 5;
      const landingMinute = takeoffMinute + 4;
      const fmt = (m: number) => `${String(7 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return {
        id: String(i), dataOperational: '2026-04-02', takeoffLocal: fmt(takeoffMinute), landingLocal: fmt(landingMinute),
        airborneMinutes: 4, landingCount: 1, departureClass: 'PLATFORM' as const, arrivalClass: 'HELIDECK' as const,
      };
    });
    const result = assessOperationalDemand(legs);
    expect(result.shortOffshoreShuttleSectorCount).toBe(10);
    expect(result.maxLandingsRolling60Min).toBe(10);
    expect(result.cap371PolicyTriggered).toBe(true);
    expect(result.level).toBe('CRITICAL');
  });

  it('recognizes a verified 30 minute break away from the aircraft', () => {
    const legs = Array.from({ length: 20 }, (_, i) => {
      const base = i < 10 ? i * 5 : 120 + (i - 10) * 5;
      const fmt = (m: number) => `${String(7 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      return {
        id: String(i), dataOperational: '2026-04-02', takeoffLocal: fmt(base), landingLocal: fmt(base + 4),
        airborneMinutes: 4, landingCount: 1, departureClass: 'PLATFORM' as const, arrivalClass: 'PLATFORM' as const,
      };
    });
    const result = assessOperationalDemand(legs, [
      { startLocalDateTime: '2026-04-02T07:50', endLocalDateTime: '2026-04-02T08:30', awayFromAircraftVerified: true },
    ]);
    expect(result.verifiedBreakAwayMaxMin).toBe(40);
    expect(result.alerts).toContain('SHUTTLE_REPETITIVO');
  });
});
