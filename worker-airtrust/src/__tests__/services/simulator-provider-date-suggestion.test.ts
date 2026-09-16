import { describe, expect, it } from 'vitest';
import {
  buildSimulatorTrainingClasses,
  pairSimulatorTrainingSessions,
  type SimulatorTrainingSessionNeed,
} from '../../services/cae-planning-session-proposal';
import {
  normalizeSimulatorProviderAvailability,
  suggestSimulatorTrainingDates,
} from '../../services/simulator-provider-date-suggestion';

function need(
  id: string,
  employeeId: number,
  equipment: string,
  expiry = '2026-10-20',
): SimulatorTrainingSessionNeed {
  return {
    need_id: id,
    employee_id: employeeId,
    employee_name: `Piloto ${employeeId}`,
    employee_role: employeeId % 2 ? 'Comandante' : 'Copiloto',
    qualification_type_id: 1,
    qualification_code: 'PER',
    qualification_name: 'Periódico',
    expiry_date: expiry,
    equipment,
    session_model_id: 100,
    session_code: 'S1',
    session_name: 'Sessão 1',
    session_order: 1,
    duration_minutes: 120,
    training_session_count: 1,
  };
}

describe('simulator provider date suggestion', () => {
  it('defaults AW139 to all days but requires an explicit S76 window', () => {
    const normalized = normalizeSimulatorProviderAvailability({});
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.data.AW139?.mode).toBe('ALL_DAYS');
    expect(normalized.data.SK76).toBeUndefined();
  });

  it('merges multiple S76 windows and suggests the latest eligible provider/roster date', async () => {
    const availability = normalizeSimulatorProviderAvailability({
      SK76: {
        mode: 'WINDOWS',
        windows: [
          { start_date: '2026-10-01', end_date: '2026-10-05' },
          { start_date: '2026-10-06', end_date: '2026-10-10' },
          { start_date: '2026-10-15', end_date: '2026-10-18' },
        ],
      },
    });
    expect(availability.ok).toBe(true);
    if (!availability.ok) return;
    expect(availability.data.SK76?.windows).toEqual([
      { start_date: '2026-10-01', end_date: '2026-10-10' },
      { start_date: '2026-10-15', end_date: '2026-10-18' },
    ]);
    const classes = buildSimulatorTrainingClasses(
      pairSimulatorTrainingSessions([{ ...need('a', 1, 'SK76') }, { ...need('b', 2, 'SK76') }], 60),
    );
    const result = await suggestSimulatorTrainingDates({
      classes,
      availability: availability.data,
      referenceDate: '2026-09-20',
      horizonDays: 60,
      preferredSessionsPerDay: 2,
      checkRoster: async (_id, _name, date) => ({
        eligible: date !== '2026-10-18',
        state: 'OK',
        reason: 'teste',
      }),
    });
    expect(result.classes[0].blocks[0].suggested_date).toBe('2026-10-17');
    expect(result.suggested_blocks).toBe(1);
  });

  it('reports no provider window for S76 when none was configured', async () => {
    const availability = normalizeSimulatorProviderAvailability({});
    if (!availability.ok) throw new Error('normalization failed');
    const classes = buildSimulatorTrainingClasses(
      pairSimulatorTrainingSessions([{ ...need('a', 1, 'SK76') }, { ...need('b', 2, 'SK76') }], 60),
    );
    const result = await suggestSimulatorTrainingDates({
      classes,
      availability: availability.data,
      referenceDate: '2026-09-20',
      horizonDays: 60,
      preferredSessionsPerDay: 2,
      checkRoster: async () => ({ eligible: true, state: 'OK', reason: 'ok' }),
    });
    expect(result.classes[0].blocks[0].suggestion_status).toBe('NO_PROVIDER_WINDOW');
  });
});
