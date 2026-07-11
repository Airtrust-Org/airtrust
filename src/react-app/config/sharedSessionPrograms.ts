/**
 * Canonical, versioned catalog of shared-session "programs" that unlock a
 * dedicated segment template.
 *
 * Why this file exists: the underlying curricular models (e.g. EXA-V01..V04)
 * are tenant catalog data — after migration 0424 they exist permanently for
 * Costa do Sol. Their mere existence must never be what triggers a
 * program-specific UI; the user must explicitly select the program for the
 * session. This catalog is the single place that maps a stable program id to
 * the modelo_sessao.codigo values it uses, so "is this session an examiner
 * practical training?" has exactly one answer instead of being re-derived
 * ad hoc from titles, substrings, aircraft models, or numeric ids.
 *
 * Detection is by `codigo` only — never by nome/title, substring match,
 * modelo_aeronave, or the presence/absence of rows in modelos_sessao. A
 * tenant without EXA-V01..V04 in its catalog can still *select* this
 * program (the UI then explains the models aren't available); a tenant
 * with the full catalog does not get the program pre-selected just because
 * the rows exist.
 */

export type SharedSessionProgramId = 'GENERICO' | 'TREINAMENTO_PRATICO_EXAMINADOR';

export interface SharedSessionProgramDefinition {
  id: SharedSessionProgramId;
  label: string;
  /** modelo_sessao.codigo values used by "Evento 1 de 2" (first physical reservation). */
  evento1Codigos: readonly string[];
  /** modelo_sessao.codigo values used by "Evento 2 de 2" (second physical reservation). */
  evento2Codigos: readonly string[];
}

export const SHARED_SESSION_PROGRAM_GENERICO: SharedSessionProgramId = 'GENERICO';

export const EXAMINER_PRACTICAL_TRAINING_PROGRAM: SharedSessionProgramDefinition = {
  id: 'TREINAMENTO_PRATICO_EXAMINADOR',
  label: 'Treinamento Prático de Examinador',
  evento1Codigos: ['EXA-V01', 'EXA-V02'],
  evento2Codigos: ['EXA-V03', 'EXA-V04'],
};

/** Every non-generic program a shared session can explicitly declare. */
export const SHARED_SESSION_PROGRAMS: readonly SharedSessionProgramDefinition[] = [
  EXAMINER_PRACTICAL_TRAINING_PROGRAM,
];

function normalizeCodigo(codigo: string | null | undefined): string {
  return String(codigo || '').trim().toUpperCase();
}

/** All codigos (evento1 + evento2) belonging to a given program, for membership checks. */
export function programCodigos(program: SharedSessionProgramDefinition): string[] {
  return [...program.evento1Codigos, ...program.evento2Codigos];
}

/**
 * Finds the program a modelo_sessao.codigo belongs to, if any. Used only to
 * reflect already-persisted or already-seeded state (e.g. hydrating an
 * existing examiner session, or converting a simple session whose original
 * model was itself an EXA-V0x code) — never to auto-detect a program from
 * catalog existence alone.
 */
export function findProgramByCodigo(codigo: string | null | undefined): SharedSessionProgramDefinition | null {
  const normalized = normalizeCodigo(codigo);
  if (!normalized) return null;
  return (
    SHARED_SESSION_PROGRAMS.find((program) => programCodigos(program).includes(normalized)) || null
  );
}
