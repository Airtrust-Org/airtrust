/** New SCORM uploads default to no final exam. Existing scored rows never silently flip. */
export type CourseFinalAssessmentPolicy='FORMATIVE'|'SCORED';
export const defaultNewScormAssessmentPolicy=():CourseFinalAssessmentPolicy=>'FORMATIVE';
export const existingCourseAssessmentPolicy=(raw:CourseFinalAssessmentPolicy|null|undefined):CourseFinalAssessmentPolicy=>raw??'SCORED';
export function initialAssessmentPolicyForEditor(
  stored:CourseFinalAssessmentPolicy|null|undefined,editing:boolean,canConfigure:boolean,
):CourseFinalAssessmentPolicy{
  return editing?existingCourseAssessmentPolicy(stored):
    canConfigure?defaultNewScormAssessmentPolicy():'SCORED';
}
export function describeCourseFinalAssessment(policy:CourseFinalAssessmentPolicy):string{
  if(policy==='FORMATIVE')return 'Conclusão depois da evidência obrigatória de slides, interações e fixação, com sessão SCORM válida. Sem nota eliminatória; a qualificação é uma configuração separada.';
  return 'A conclusão exige resultado avaliativo real igual ou superior ao mínimo configurado. Prova externa separada será integrada posteriormente; questões de fixação não são prova final.';
}
