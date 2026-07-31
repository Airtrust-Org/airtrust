/**
 * Canonical, versioned catalog of shared-session programs.
 *
 * The PTO Rev10 examiner program has four canonical one-hour sessions. The
 * two physical reservations remain grouped as event 1 (sessions 1/4 and 2/4)
 * and event 2 (sessions 3/4 and 4/4). Legacy EXA-E*/EXA-V* codes remain
 * recognized only to hydrate historical records.
 */

export type SharedSessionProgramId = 'GENERICO' | 'TREINAMENTO_PRATICO_EXAMINADOR';

export interface SharedSessionProgramDefinition {
  id: SharedSessionProgramId;
  label: string;
  evento1Codigos: readonly string[];
  evento2Codigos: readonly string[];
}

export const SHARED_SESSION_PROGRAM_GENERICO: SharedSessionProgramId = 'GENERICO';

export const EXAMINER_PRACTICAL_TRAINING_PROGRAM: SharedSessionProgramDefinition = {
  id: 'TREINAMENTO_PRATICO_EXAMINADOR',
  label: 'Treinamento Prático de Examinador',
  evento1Codigos: ['EXA-01/04', 'EXA-02/04', 'EXA-E01', 'EXA-V01', 'EXA-V02'],
  evento2Codigos: ['EXA-03/04', 'EXA-04/04', 'EXA-E02', 'EXA-V03', 'EXA-V04'],
};

export const SHARED_SESSION_PROGRAMS: readonly SharedSessionProgramDefinition[] = [
  EXAMINER_PRACTICAL_TRAINING_PROGRAM,
];

function normalizeCodigo(codigo: string | null | undefined): string {
  return String(codigo || '').trim().toUpperCase();
}

export function programCodigos(program: SharedSessionProgramDefinition): string[] {
  return [...program.evento1Codigos, ...program.evento2Codigos];
}

export function findProgramByCodigo(
  codigo: string | null | undefined,
): SharedSessionProgramDefinition | null {
  const normalized = normalizeCodigo(codigo);
  if (!normalized) return null;
  return (
    SHARED_SESSION_PROGRAMS.find((program) => programCodigos(program).includes(normalized)) || null
  );
}
