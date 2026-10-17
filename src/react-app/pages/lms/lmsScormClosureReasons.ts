/** Actionable, sanitized descriptions for the server's canonical closure checklist.
 * The player never grants completion from these descriptions.
 */
const REASONS: Readonly<Record<string, string>> = {
  user_confirmation: 'a confirmação final do treinamento ainda não foi registrada',
  terminal_location: 'a última tela do treinamento ainda não foi comprovada',
  distinct_slide_coverage: 'faltam registros individuais de telas obrigatórias',
  terminal_scorm_status: 'o conteúdo ainda não informou conclusão ou aprovação válida',
  course_mastery_policy: 'a nota mínima do curso precisa ser configurada pela administração',
  assessment_score: 'a nota da avaliação ainda não foi registrada',
  assessment_pass: 'a nota registrada não atingiu o mínimo exigido',
};

export function describeScormClosureMissing(missing: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(missing)) return [];
  return [...new Set(missing.filter((item): item is string => typeof item === 'string'))]
    .map((code) => REASONS[code] ?? 'existe uma evidência obrigatória ainda pendente');
}
