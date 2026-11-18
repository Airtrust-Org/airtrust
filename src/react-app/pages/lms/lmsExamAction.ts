/**
 * A learning progress percentage never authorizes an exam.
 * Only the authenticated Worker readiness response can display the CTA.
 */
export type ExamActionState = 'READY' | 'PASSED' | 'STUDY_PENDING' | 'NOT_AVAILABLE' | 'COMPLETED';

export function getLmsExamAction(state: unknown): 'Fazer avaliação' | 'Confirmar conclusão' | null {
  if (state === 'READY') return 'Fazer avaliação';
  if (state === 'PASSED') return 'Confirmar conclusão';
  return null;
}

/** Navigation only, never exam eligibility. The Worker must confirm the
 * external assessment is the sole remaining completion requirement. */
export function shouldAutoOpenExternalExam(input:{
  savedStudyEvent:boolean;isScorm:boolean;reviewMode:boolean;newEditionRequired:boolean;
  completed:boolean;code:string|null|undefined;missing:readonly string[]|null|undefined;
}):boolean{
  return input.savedStudyEvent&&input.isScorm&&!input.reviewMode&&
    !input.newEditionRequired&&!input.completed&&
    input.code==='EXTERNAL_ASSESSMENT_PENDING'&&
    input.missing?.length===1&&input.missing[0]==='verified_external_assessment';
}
