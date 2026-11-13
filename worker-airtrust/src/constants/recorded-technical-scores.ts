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
  // No rows / all NR does not prove practical coverage. Caller must not infer otherwise.
  return { eligible: invalid.length === 0 && belowMinimum.length === 0,
    scored, nonPerformed, belowMinimum, invalid };
}
