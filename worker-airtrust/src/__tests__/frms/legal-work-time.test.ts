import { describe, expect, it } from 'vitest';
import {
  summarizeCostaDoSolLegalWork,
  sumLegalWorkCalendarMonth,
  sumLegalWorkRollingDays,
  weightedLegalWorkUnion,
} from '../../lib/frms/legal-work-time';

describe('Costa do Sol ACT legal work-time aggregation', () => {
  it('deduplicates overlapping full-work intervals', () => {
    const result = weightedLegalWorkUnion([
      { startAbsMin: 100, endAbsMin: 220, factor: 1, source: 'DUTY' },
      { startAbsMin: 160, endAbsMin: 280, factor: 1, source: 'TRAINING' },
    ]);
    expect(result.totalMin).toBe(180);
  });

  it('uses work factor 1 over overlapping standby factor 1/3', () => {
    const result = weightedLegalWorkUnion([
      { startAbsMin: 100, endAbsMin: 280, factor: 1 / 3, source: 'STANDBY' },
      { startAbsMin: 160, endAbsMin: 220, factor: 1, source: 'TRAINING' },
    ]);
    expect(result.totalMin).toBe(100);
  });

  it('splits cross-midnight work into calendar dates', () => {
    const summary = summarizeCostaDoSolLegalWork({
      duties: [{
        data: '2026-09-30',
        hora_apresentacao: '23:00',
        hora_termino: '02:00',
        duracao_jornada_minutos: 180,
      }],
      activities: [],
    });
    expect(summary.status).toBe('COMPLETE');
    expect(summary.totalMin).toBe(180);
    expect(summary.byCalendarDateMin).toEqual({
      '2026-09-30': 60,
      '2026-10-01': 120,
    });
  });

  it('applies 1/3 to hotel/home standby and avoids double count with duty', () => {
    const summary = summarizeCostaDoSolLegalWork({
      duties: [{
        data: '2026-09-25',
        hora_apresentacao: '10:00',
        hora_termino: '12:00',
        duracao_jornada_minutos: 120,
      }],
      activities: [{
        data_operacional: '2026-09-25',
        funcionario_id: 20,
        activity_type: 'ATIVIDADE',
        hora_inicio: '08:00',
        hora_fim: '14:00',
        titulo: 'Standby hotel',
        source_id: 1,
        source_activity_type: 'STANDBY_HOME_HOTEL',
        legal_work_factor: 1 / 3,
      }],
    });
    expect(summary.status).toBe('COMPLETE');
    expect(summary.totalMin).toBe(200);
  });

  it('fails closed if a positive duty lacks an interval', () => {
    const summary = summarizeCostaDoSolLegalWork({
      duties: [{ data: '2026-09-25', duracao_jornada_minutos: 120 }],
      activities: [],
    });
    expect(summary.status).toBe('UNKNOWN');
    expect(summary.totalMin).toBeNull();
    expect(summary.incompleteReasons).toContain('DUTY_INTERVAL_MISSING');
  });

  it('calculates calendar-month and rolling work windows independently', () => {
    const byDate = {
      '2026-08-31': 60,
      '2026-09-01': 120,
      '2026-09-06': 180,
      '2026-09-07': 240,
    };
    expect(sumLegalWorkCalendarMonth(byDate, '2026-09')).toBe(540);
    expect(sumLegalWorkRollingDays(byDate, '2026-09-07', 7)).toBe(540);
    expect(sumLegalWorkRollingDays(byDate, '2026-09-07', 14)).toBe(600);
  });
});
