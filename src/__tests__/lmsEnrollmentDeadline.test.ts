import { describe, expect, it } from 'vitest';
import { shouldShowLmsEnrollmentDeadline } from '@/react-app/pages/lms/lmsEnrollmentDeadline';

describe('LMS enrollment deadline continuity across SCORM and Native', () => {
  it.each(['NAO_INICIADO', 'EM_ANDAMENTO'])('shows an actual deadline while %s', (status) => {
    expect(shouldShowLmsEnrollmentDeadline(status, '2026-11-14')).toBe(true);
  });
  it.each(['CONCLUIDO', 'REPROVADO', 'CANCELADO'])('does not mislabel historic %s enrollments as expired', (status) => {
    expect(shouldShowLmsEnrollmentDeadline(status, '2026-01-01')).toBe(false);
  });
  it('does not invent a missing enrollment deadline', () => {
    expect(shouldShowLmsEnrollmentDeadline('EM_ANDAMENTO', null)).toBe(false);
    expect(shouldShowLmsEnrollmentDeadline(undefined, undefined)).toBe(false);
  });
});
