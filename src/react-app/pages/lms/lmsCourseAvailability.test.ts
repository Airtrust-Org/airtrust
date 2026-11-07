import { describe, expect, it } from 'vitest';
import { getCourseAvailability } from './lmsCourseAvailability';
const base = {
  tipo_conteudo: 'scorm' as const,
  scorm_mastery_score: 70,
  scorm_assessment_policy: 'SCORED' as const,
};
describe('course details — truthful SCORM availability and formative criteria', () => {
  it('does not promise a 70% assessment before a runnable package exists', () => {
    const info = getCourseAvailability(base, false);
    expect(info.criterion).not.toContain('70%');
    expect(info.objective).toContain('pacote SCORM válido');
  });
  it('uses active formative version over stale scored course metadata', () => {
    const info = getCourseAvailability(base, true, {
      assessmentPolicy: 'FORMATIVE', certificationProfile: 'FORMATIVE_NO_EXAM_V1',
    });
    expect(info.criterion).toBe('Formativo — sem prova final');
    expect(info.objective).not.toMatch(/avaliação|70%/);
  });
  it('respects formative course policy even if numeric score is stale', () => {
    expect(getCourseAvailability({ ...base, scorm_assessment_policy: 'FORMATIVE' }, true).criterion)
      .toBe('Formativo — sem prova final');
  });
  it('keeps mastery for scored executable course', () => {
    expect(getCourseAvailability(base, true).criterion).toBe('Meta mínima 70%');
  });
  it('handles unscored legacy courses', () => {
    expect(getCourseAvailability({ ...base, scorm_mastery_score: null }, true).criterion)
      .toBe('Sem nota mínima definida');
  });
});
