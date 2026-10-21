import {describe,expect,it} from 'vitest';
import {defaultNewScormAssessmentPolicy,existingCourseAssessmentPolicy,describeCourseFinalAssessment} from '../lmsAssessmentModes';
describe('Modo de avaliação do curso SCORM',()=>{
  it('curso novo começa sem avaliação eliminatória',()=>expect(defaultNewScormAssessmentPolicy()).toBe('FORMATIVE'));
  it('edição mantém política legada e nunca muda silenciosamente',()=>{
    expect(existingCourseAssessmentPolicy('SCORED')).toBe('SCORED');
    expect(existingCourseAssessmentPolicy('FORMATIVE')).toBe('FORMATIVE');
    expect(existingCourseAssessmentPolicy(null)).toBe('SCORED');
  });
  it('fixação não substitui prova final',()=>{
    expect(describeCourseFinalAssessment('FORMATIVE')).toMatch(/Sem nota eliminatória/);
    expect(describeCourseFinalAssessment('SCORED')).toMatch(/Prova externa separada/);
  });
});
