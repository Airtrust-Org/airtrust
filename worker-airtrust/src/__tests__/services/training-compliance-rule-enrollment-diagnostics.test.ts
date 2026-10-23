import { describe, expect, it, vi } from 'vitest';
import { classifyComplianceEnrollmentFailure, reconcileTrainingComplianceRuleEnrollment, sanitizeComplianceEnrollmentResponse } from '../../services/training-compliance-rule-enrollment';

describe('Compliance enrollment diagnostic classification', () => {
  it.each([
    ['COMPLIANCE_ATOMIC_SCHEMA_MISSING', 'SCHEMA_REQUIRED_TABLE_MISSING'],
    ['COMPLIANCE_ATOMIC_POSTCHECK_FAILED', 'ATOMIC_POSTCHECK_FAILED'],
    ['D1_ERROR: no such table: lms_matricula_ciclos', 'DB_SCHEMA_TABLE_MISSING'],
    ['D1_ERROR: no such column: perfil_competencia', 'DB_SCHEMA_COLUMN_MISSING'],
    ['UNIQUE constraint failed: lms_matriculas.id', 'DB_UNIQUE_CONSTRAINT'],
    ['FOREIGN KEY constraint failed', 'DB_FOREIGN_KEY_CONSTRAINT'],
    ['NOT NULL constraint failed: audit_logs.entity_id', 'DB_NOT_NULL_CONSTRAINT'],
    ['CHECK constraint failed: ciclo_atual IN (0,1)', 'DB_CHECK_CONSTRAINT'],
    ['database is locked', 'DB_BUSY'],
    ['unexpected failure with synthetic-value@example.invalid', 'UNCLASSIFIED'],
  ])('classifies %s without returning raw error text', (message, expected) => {
    const code = classifyComplianceEnrollmentFailure(new Error(message));
    expect(code).toBe(expected);
    expect(code).not.toContain(message);
    expect(code).not.toContain('@example.invalid');
  });

  it('does not inspect or stringify non-Error values', () => {
    expect(classifyComplianceEnrollmentFailure({ message: 'no such table: private_table' }))
      .toBe('UNCLASSIFIED');
    expect(classifyComplianceEnrollmentFailure('no such table: private_table'))
      .toBe('UNCLASSIFIED');
  });
});


// This is a policy preflight, not a privilege bypass: only the canonical
// snapshot + atomic writer can authorize an actual enrollment.
describe('Compliance no-op save enrollment preflight', () => {
  const empty = {
    created: 0, reactivated: 0, preserved: 0,
    skipped_valid_evidence: 0, unavailable_course: 0,
  };
  it.each([
    ['no matching active rule', null],
    ['opt-out is disabled', { obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 0, modalidade_requerida: 'EAD' }],
    ['NULL modality', { obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 1, modalidade_requerida: null }],
    ['presencial modality', { obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 1, modalidade_requerida: 'PRESENCIAL' }],
    ['non-mandatory', { obrigatoriedade: 'RECOMENDADA', auto_matricular_ead: 1, modalidade_requerida: 'EAD' }],
  ])('skips %s without computing snapshots or claiming deferred sync', async (_label, persisted) => {
    const first = vi.fn().mockResolvedValue(persisted);
    const bind = vi.fn().mockReturnValue({ first });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;
    const snapshot = vi.fn().mockRejectedValue(new Error('snapshot should not run'));
    const result = await reconcileTrainingComplianceRuleEnrollment(
      db, 999006, 91, {}, {} as never, snapshot,
    );
    expect(result).toEqual({ auto_enrollment: empty, auto_enrollment_warning: null });
    expect(snapshot).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0][0]).toContain('empresa_id=?');
    expect(bind).toHaveBeenCalledWith(91, 999006);
  });

  it('keeps the effective snapshot and its fail-closed guards for real EAD opt-in', async () => {
    const first = vi.fn().mockResolvedValue({
      obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 1, modalidade_requerida: 'EAD',
    });
    const db = {
      prepare: () => ({ bind: () => ({ first }) }),
    } as unknown as D1Database;
    const snapshot = vi.fn().mockResolvedValue({
      rules: [{ id: 91, obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 1,
        modalidade_requerida: 'EAD', qualificacao_tipo_id: 400 }],
      people: [],
    });
    const result = await reconcileTrainingComplianceRuleEnrollment(
      db, 999006, 91, {}, {} as never, snapshot,
    );
    expect(snapshot).toHaveBeenCalledOnce();
    expect(result).toEqual({ auto_enrollment: empty, auto_enrollment_warning: null });
  });
});


describe('staging-only sanitized Compliance diagnostics', () => {
  const deferred = {
    auto_enrollment: null,
    auto_enrollment_warning: 'AUTO_ENROLLMENT_DEFERRED',
    auto_enrollment_diagnostic_code: 'ATOMIC_POSTCHECK_FAILED',
  };
  it('returns only allowlisted stable codes in staging', () => {
    expect(sanitizeComplianceEnrollmentResponse(deferred, 'staging')).toEqual(deferred);
  });
  it.each(['production', 'development', '', 'STAGING', 'staging '])(
    'keeps the stable production response in %s', environment => {
      expect(sanitizeComplianceEnrollmentResponse(deferred, environment)).toEqual({
        auto_enrollment: null,
        auto_enrollment_warning: 'AUTO_ENROLLMENT_DEFERRED',
      });
    },
  );
  it('rejects unrecognized and potentially sensitive codes even in staging', () => {
    expect(sanitizeComplianceEnrollmentResponse(
      { ...deferred, auto_enrollment_diagnostic_code: 'PRIVATE_EMAIL_example.invalid' },
      'staging',
    )).toEqual({ auto_enrollment: null, auto_enrollment_warning: 'AUTO_ENROLLMENT_DEFERRED' });
  });
  it('turns an authorized EAD snapshot error into an allowlisted internal code', async () => {
    const first = vi.fn().mockResolvedValue({
      obrigatoriedade: 'OBRIGATORIA', auto_matricular_ead: 1, modalidade_requerida: 'EAD',
    });
    const db = { prepare: () => ({ bind: () => ({ first }) }) } as unknown as D1Database;
    const snapshot = vi.fn().mockRejectedValue(new Error('COMPLIANCE_ATOMIC_POSTCHECK_FAILED'));
    const result = await reconcileTrainingComplianceRuleEnrollment(
      db, 999006, 91, {}, {} as never, snapshot,
    );
    expect(result.auto_enrollment_warning).toBe('AUTO_ENROLLMENT_DEFERRED');
    expect(sanitizeComplianceEnrollmentResponse(result, 'staging')).toMatchObject({
      auto_enrollment_diagnostic_code: 'ATOMIC_POSTCHECK_FAILED',
    });
    expect(sanitizeComplianceEnrollmentResponse(result, 'production')).not.toHaveProperty(
      'auto_enrollment_diagnostic_code',
    );
  });
});
