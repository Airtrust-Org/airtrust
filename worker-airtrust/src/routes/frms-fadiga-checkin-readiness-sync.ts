import { sincronizarCheckinComFrms, type SyncResult } from '../lib/frms/fadiga-frms-sync';
import { persistReadinessAssessment } from '../lib/frms/readiness-persistence';
import { refreshRecoveryAssessmentForActivityDate } from './frms-recovery';

type EmbeddedReadiness = {
  duration_ms: number;
  trials: Array<{
    sequence: number;
    scheduledAtMs: number;
    stimulusAtMs: number;
    responseAtMs: number | null;
    reactionTimeMs: number | null;
    outcome: 'response' | 'lapse' | 'false_start' | 'missed';
  }>;
  protocol_version?: string;
};

export class EmbeddedReadinessValidationError extends Error {
  constructor(public readonly code: 'invalid_trial_sequence' | 'invalid_trial_timing') {
    super(code);
    this.name = 'EmbeddedReadinessValidationError';
  }
}

export async function persistReadinessAndSyncFrms(input: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  userId: number | null;
  checkinId: string;
  dataCheckin: string;
  kssScore: number;
  sleepHours: number;
  wakeTime: string | null;
  presentationTime: string | null;
  readiness?: EmbeddedReadiness;
  isNewCheckin: boolean;
  now: string;
}): Promise<{ sync: SyncResult }> {
  if (input.readiness) {
    try {
      await persistReadinessAssessment(input.db, {
        empresaId: input.empresaId,
        funcionarioId: input.funcionarioId,
        userId: input.userId,
        checkinId: input.checkinId,
        referenceDate: input.dataCheckin,
        kssScore: input.kssScore,
        sleepHours: input.sleepHours,
        durationMs: input.readiness.duration_ms,
        trials: input.readiness.trials,
        protocolVersion: input.readiness.protocol_version,
      });
    } catch (error) {
      if (input.isNewCheckin) {
        await input.db
          .prepare(
            `UPDATE frms_fadiga_checkin
                SET deleted_at = ?, updated_at = ?
              WHERE id = ? AND empresa_id = ? AND funcionario_id = ? AND deleted_at IS NULL`,
          )
          .bind(input.now, input.now, input.checkinId, input.empresaId, input.funcionarioId)
          .run();
      }
      const code = error instanceof Error ? error.message : 'readiness_persistence_failed';
      if (code === 'invalid_trial_sequence' || code === 'invalid_trial_timing') {
        throw new EmbeddedReadinessValidationError(code);
      }
      throw error;
    }

    const previous = new Date(`${input.dataCheckin}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    await refreshRecoveryAssessmentForActivityDate({
      db: input.db,
      empresaId: input.empresaId,
      funcionarioId: input.funcionarioId,
      referenceDate: previous.toISOString().slice(0, 10),
    });
  }

  const sync = await sincronizarCheckinComFrms(
    input.db,
    input.checkinId,
    input.funcionarioId,
    input.dataCheckin,
    input.sleepHours,
    input.empresaId,
    input.wakeTime,
    input.presentationTime,
  );
  return { sync };
}
