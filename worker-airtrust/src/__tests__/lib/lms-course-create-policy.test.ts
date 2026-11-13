import { describe, expect, it } from 'vitest';
import { withNewCourseAssessmentDefault } from '../../lib/lms/lms-course-create-policy';

describe('new LMS course assessment default', () => {
  it('defaults omitted SCORM assessment to formative', () => {
    expect(withNewCourseAssessmentDefault({ tipo_conteudo: 'scorm' }))
      .toMatchObject({ scorm_assessment_policy: 'FORMATIVE' });
    expect(withNewCourseAssessmentDefault({}))
      .toMatchObject({ scorm_assessment_policy: 'FORMATIVE' });
  });

  it('keeps non-SCORM formats scored unless separately configured', () => {
    for (const tipo_conteudo of ['pptx', 'pdf', 'video', 'h5p']) {
      expect(withNewCourseAssessmentDefault({ tipo_conteudo }))
        .toMatchObject({ scorm_assessment_policy: 'SCORED' });
    }
  });

  it('preserves explicit assessed edition intent', () => {
    const course = { tipo_conteudo: 'scorm', scorm_assessment_policy: 'SCORED' };
    expect(withNewCourseAssessmentDefault(course)).toBe(course);
  });

  it('does not normalize invalid explicit policy into formative', () => {
    const course = { tipo_conteudo: 'scorm', scorm_assessment_policy: 'invalid' };
    expect(withNewCourseAssessmentDefault(course)).toBe(course);
  });

  it('treats empty/missing selection as omitted while preserving other metadata', () => {
    expect(withNewCourseAssessmentDefault({
      tipo_conteudo: 'scorm', scorm_assessment_policy: '',
      titulo: 'Curso',
    })).toEqual({ tipo_conteudo: 'scorm', scorm_assessment_policy: 'FORMATIVE', titulo: 'Curso' });
  });

  it('leaves malformed non-object requests to schema validation', () => {
    expect(withNewCourseAssessmentDefault(null)).toBeNull();
    expect(withNewCourseAssessmentDefault([])).toEqual([]);
    expect(withNewCourseAssessmentDefault('course')).toBe('course');
  });
});
