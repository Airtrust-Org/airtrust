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
