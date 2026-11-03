/**
 * Versioned evidence captured in the append-only FRMS fatigue event at the
 * same atomic commit as the daily check-in. This is the first declaration's
 * safety-critical subset, not a complete copy of medical notes or symptoms.
 *
 * Updates produce a separate CHECKIN_ATUALIZADO event; consumers must not
 * reinterpret the latest mutable check-in row as the first crew statement.
 */
export type CheckinDeclarationFields = {
  dataCheckin: string;
  horaAcordou: string;
  horasSono24h: number;
  horasSono48h: number | null;
  qualidadeSono: number | null;
  kssScore: number;
  kssProvenance: 'CREW_REPORTED' | 'DERIVED' | 'DEFAULTED';
  apto: 0 | 1;
  jornadaInicioPrevista: string | null;
  oportunidadeSonoHoras24h: number | null;
};

export function buildDailyCheckinDeclarationEvidence(
  input: CheckinDeclarationFields,
  submittedAt: string,
) {
  return {
    contract: 'FRMS_CREW_DECLARATION_V1' as const,
    submitted_at: submittedAt,
    reference_date: input.dataCheckin,
    wake_time: input.horaAcordou,
    horas_sono_24h: input.horasSono24h,
    horas_sono_48h: input.horasSono48h,
    qualidade_sono: input.qualidadeSono,
    kss_score: input.kssScore,
    kss_provenance: input.kssProvenance,
    fit_for_duty: input.apto,
    hora_apresentacao: input.jornadaInicioPrevista,
    oportunidade_sono_horas_24h: input.oportunidadeSonoHoras24h,
    // The immutable audit event intentionally excludes free-text observations,
    // medication details and symptom descriptions to limit sensitive duplication.
  };
}
