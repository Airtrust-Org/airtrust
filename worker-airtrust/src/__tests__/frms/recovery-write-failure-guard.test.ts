import { describe, expect, it } from 'vitest';
import { isMissingRecoverySchemaError } from '../../routes/frms-recovery';

describe('FRMS recovery write failure handling', () => {
  it('keeps explicit backward compatibility for absent recovery tables', () => {
    expect(isMissingRecoverySchemaError(new Error('D1_ERROR: no such table: frms_recovery_activity_day'))).toBe(true);
    expect(isMissingRecoverySchemaError(new Error('no such table: main.frms_recovery_assessment'))).toBe(true);
  });

  it('does not swallow actual write/constraint failures', () => {
    for (const message of [
      'D1_ERROR: UNIQUE constraint failed: frms_recovery_assessment.empresa_id',
      'D1_ERROR: database is locked',
      'D1_ERROR: constraint violation during batch',
      'D1_ERROR: no such column: recovery_credit_points',
      'D1_ERROR: no such table: frms_fadiga_evento',
      'D1_ERROR: no such table: frms_recovery_assessment_bogus',
    ]) {
      expect(isMissingRecoverySchemaError(new Error(message))).toBe(false);
    }
  });

  it('fails closed when no recognizable error exists', () => {
    expect(isMissingRecoverySchemaError(null)).toBe(false);
    expect(isMissingRecoverySchemaError({ message: 'no such table: frms_recovery_assessment' })).toBe(false);
  });
});
