import { describe, expect, it, vi } from 'vitest';
import { runDesignationEnrollmentWithDiagnostics } from '../../services/training-compliance-assignment-diagnostics';

describe('designation enrollment and diagnostics after commit', () => {
  it('preserves a successful LMS enrollment when read-only inspection fails afterward', async () => {
    let committed = 0;
    const failures: string[] = [];
    const output = await runDesignationEnrollmentWithDiagnostics(
      async () => { committed += 1; return { created: 1, unavailable_course: 0 }; },
      async () => { throw new Error('SQLite expression tree too large'); },
      (phase) => { failures.push(phase); },
    );
    expect(committed).toBe(1);
    expect(output.autoEnrollment).toEqual({ created: 1, unavailable_course: 0 });
    expect(output.autoEnrollmentWarning).toBe('ENROLLMENT_DIAGNOSTIC_UNAVAILABLE');
    expect(failures).toEqual(['diagnostic']);
  });
  it('does not inspect when the enrollment itself failed', async () => {
    const inspect = vi.fn();
    const output = await runDesignationEnrollmentWithDiagnostics(
      async () => { throw new Error('DB overloaded'); },
      inspect,
      () => {},
    );
    expect(output.autoEnrollment).toBeNull();
    expect(output.autoEnrollmentWarning).toBe('AUTO_ENROLLMENT_DEFERRED');
    expect(inspect).not.toHaveBeenCalled();
  });
  it('reports actionable missing LMS contract even when no one was enrolled', async () => {
    const output = await runDesignationEnrollmentWithDiagnostics(
      async () => ({ created: 0, unavailable_course: 0 }),
      async () => 'NO_EAD_POLICY' as const,
      () => {},
    );
    expect(output.autoEnrollmentWarning).toBe('NO_EAD_POLICY');
  });
  it('reports success without warning when enrollment and diagnostics both pass', async () => {
    const output = await runDesignationEnrollmentWithDiagnostics(
      async () => ({ created: 1, unavailable_course: 0 }),
      async () => null,
      () => {},
    );
    expect(output.autoEnrollmentWarning).toBeNull();
    expect(output.autoEnrollment?.created).toBe(1);
  });
});
