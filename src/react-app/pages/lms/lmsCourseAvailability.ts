import type { LmsCurso, ScormPackageVersionRow } from '@/react-app/hooks/useLms';

/** Presentation only: never modify publishing, scores, certificates or enrollments. */
export function getCourseAvailability(
  curso: Pick<LmsCurso, 'tipo_conteudo' | 'scorm_assessment_policy' | 'scorm_mastery_score'>,
  hasExecutableContent: boolean,
  activePackage?: Pick<ScormPackageVersionRow, 'assessmentPolicy' | 'certificationProfile'> | null,
) {
  if (curso.tipo_conteudo === 'scorm' && !hasExecutableContent) {
    return {
      criterion: 'Critério disponível após envio do conteúdo',
      objective: 'Disponibilizar um pacote SCORM válido para iniciar o treinamento.',
    };
  }
  const activePolicy = activePackage?.certificationProfile === 'FORMATIVE_NO_EXAM_V1'
    ? 'FORMATIVE'
    : activePackage?.assessmentPolicy;
  const policy = activePolicy ?? curso.scorm_assessment_policy;
  if (curso.tipo_conteudo === 'scorm' && policy === 'FORMATIVE') {
    return {
      criterion: 'Formativo — sem prova final',
      objective: 'Concluir as unidades e atividades formativas obrigatórias do treinamento.',
    };
  }
  if (curso.scorm_mastery_score != null && curso.scorm_mastery_score > 0) {
    return {
      criterion: 'Meta mínima ' + curso.scorm_mastery_score + '%',
      objective: 'Alcançar pelo menos ' + curso.scorm_mastery_score + '% na avaliação para concluir o treinamento.',
    };
  }
  return {
    criterion: 'Sem nota mínima definida',
    objective: 'Concluir todos os passos definidos no conteúdo para avançar.',
  };
}
