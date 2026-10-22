import { describe, expect, it } from 'vitest';
import { classifyComplianceEnrollmentFailure } from '../../services/training-compliance-rule-enrollment';

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
