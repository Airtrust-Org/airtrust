import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingFrmsRecoveryActivity,
  getPendingFrmsRecoveryActivity,
  stagePendingFrmsRecoveryActivity,
  submitPendingFrmsRecoveryActivity,
  type RecoveryContextData,
} from '../useFrmsRecovery';

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock('@/react-app/services/http-client', () => ({
  httpClient: { get: getMock, post: postMock },
}));

const YESTERDAY = '2026-10-12';
const TODAY = '2026-10-13';
function serverContext(overrides: Partial<RecoveryContextData> = {}): RecoveryContextData {
  return {
    reference_date: YESTERDAY,
    schema_ready: true,
    flight: {
      detected: false,
      source: 'NONE_FOUND',
      sectorCount: 0,
      landingCount: 0,
      canonicalFlightMinutes: 0,
    },
    activity: null,
    assessment: null,
    requires_activity_classification: true,
    ...overrides,
  };
}
function loaded(data: RecoveryContextData) {
  return { success: true, data: { success: true, data } };
}

describe('FRMS final check-in guards on yesterday flight or activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingFrmsRecoveryActivity(YESTERDAY);
  });

  it('rejects check-in when the server confirms no flight and the user skipped the activity', async () => {
    getMock.mockResolvedValue(loaded(serverContext()));
    await expect(submitPendingFrmsRecoveryActivity(TODAY)).rejects.toThrow(/informe como foi/i);
    expect(getMock).toHaveBeenCalledWith(
      '/frms/readiness/recovery/context?date=2026-10-12',
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it('sends the actual work window and category before allowing current-day check-in', async () => {
    getMock.mockResolvedValue(loaded(serverContext()));
    postMock.mockResolvedValue({
      success: true,
      data: { success: true, data: { activity: {}, assessment: {}, flight: serverContext().flight, source_discrepancy: false } },
    });
    stagePendingFrmsRecoveryActivity(YESTERDAY, {
      reference_date: YESTERDAY,
      activity_type: 'ADMIN_TRAINING',
      notes: 'Treinamento',
      duty_start_time: '08:00',
      duty_end_time: '17:00',
    }, true);
    await expect(submitPendingFrmsRecoveryActivity(TODAY)).resolves.toBeTruthy();
    expect(postMock).toHaveBeenCalledWith('/frms/readiness/recovery/activity',
      expect.objectContaining({
        activity_type: 'ADMIN_TRAINING',
        notes: 'Treinamento',
        duty_start_time: '08:00',
        duty_end_time: '17:00',
      }),
    );
    expect(getPendingFrmsRecoveryActivity(YESTERDAY)).toBeUndefined();
  });

  it('preserves the flight source as authority even when a stale form was staged', async () => {
    getMock.mockResolvedValue(loaded(serverContext({
      flight: { ...serverContext().flight, detected: true, source: 'SIGVOOS' },
    })));
    stagePendingFrmsRecoveryActivity(YESTERDAY, {
      reference_date: YESTERDAY,
      activity_type: 'STANDBY_ONSITE',
      immediate_callout_required: false,
      duty_start_time: '08:00', duty_end_time: '17:00',
    }, true);
    await expect(submitPendingFrmsRecoveryActivity(TODAY)).resolves.toBeNull();
    expect(postMock).not.toHaveBeenCalled();
    expect(getPendingFrmsRecoveryActivity(YESTERDAY)).toBeUndefined();
  });

  it('accepts an already recorded previous-day activity without requesting it again', async () => {
    getMock.mockResolvedValue(loaded(serverContext({
      activity: { id: 'existing', activity_type: 'OFF_DUTY' },
    })));
    await expect(submitPendingFrmsRecoveryActivity(TODAY)).resolves.toBeNull();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('fails closed if the previous-day schema or source is unavailable', async () => {
    getMock.mockResolvedValueOnce(loaded(serverContext({ schema_ready: false })));
    await expect(submitPendingFrmsRecoveryActivity(TODAY)).rejects.toThrow(/não foi possível validar/i);
    getMock.mockRejectedValueOnce(new Error('network'));
    await expect(submitPendingFrmsRecoveryActivity(TODAY)).rejects.toThrow(/não foi possível carregar/i);
    expect(postMock).not.toHaveBeenCalled();
  });
});
