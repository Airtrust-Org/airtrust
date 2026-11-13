/** PTO Rev.10 V18 §4.2 — no compensated average for a technical item with a recorded grade.
 *
 * This is a negative safety gate, NOT a curricular approval certification:
 * numeric grades are explicit assessments, NR means not performed, while
 * unidentified/absent evidence cannot prove that a required item was executed.
 * The complete executed-item set must still be established by curriculum/version.
 */
export type RecordedTechnicalRow = { codigo?: string | null; categoria?: string | null; resultado?: string | number | null };
export type RecordedTechnicalAssessment = {
  eligible: boolean;
  scored: number;
  nonPerformed: number;
  belowMinimum: Array<{ codigo: string; nota: number }>;
  invalid: string[];
};

export function assessRecordedTechnicalScores(rows: readonly RecordedTechnicalRow[]): RecordedTechnicalAssessment {
  const belowMinimum: Array<{ codigo: string; nota: number }> = [];
  const invalid: string[] = [];
  let scored = 0;
  let nonPerformed = 0;
  for (const row of rows) {
    if (String(row.categoria || '').trim().toUpperCase() === 'NOTECHS') continue;
    const codigo = String(row.codigo || '').trim();
    const raw = String(row.resultado ?? '').trim();
    if (raw.toUpperCase() === 'NR' || raw.toUpperCase() === 'NAO_REALIZADA') {
      nonPerformed++;
      continue;
    }
    if (!codigo || !/^(?:10|[1-9])(?:\.0+)?$/.test(raw)) {
      invalid.push(codigo || '(sem código)');
      continue;
    }
    const nota = Number(raw);
    scored++;
    if (nota < 6) belowMinimum.push({ codigo, nota });
  }
  // A PTO simulator session without any scored technical maneuver has no
  // affirmative execution evidence. This also covers NOTECHS-only / empty
  // datasets; the session-specific 18-item curriculum still requires separate
  // versioned validation and is not inferred by this negative safety gate.
  return { eligible: scored > 0 && invalid.length === 0 && belowMinimum.length === 0,
    scored, nonPerformed, belowMinimum, invalid };
}
