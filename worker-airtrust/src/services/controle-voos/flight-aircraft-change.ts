import { ApiError } from '../../middleware/error-handler';
import { listEligibleFlightCrew } from './crew-eligibility';

export async function assertCrewEligibleForAircraftChange(
  db: D1Database,
  empresaId: number,
  vooId: number,
  currentAircraftId: number | null,
  nextAircraftId: number | null | undefined,
): Promise<void> {
  if (nextAircraftId == null || nextAircraftId === currentAircraftId) return;

  const crewRows = await db
    .prepare(
      `SELECT funcionario_id, funcao
         FROM cv_voo_tripulantes
        WHERE empresa_id = ? AND voo_id = ? AND deleted_at IS NULL
          AND funcao IN ('PIC', 'SIC')
        ORDER BY id ASC`,
    )
    .bind(empresaId, vooId)
    .all<{ funcionario_id: number; funcao: 'PIC' | 'SIC' }>();

  const activeCrew = crewRows.results || [];
  if (activeCrew.length === 0) return;

  const eligible = await listEligibleFlightCrew(db, empresaId, nextAircraftId);
  for (const assignment of activeCrew) {
    const member = eligible.find((item) => item.id === Number(assignment.funcionario_id));
    const valid =
      assignment.funcao === 'PIC'
        ? member?.funcao_codigo === 'PIC'
        : member != null && ['PIC', 'SIC'].includes(member.funcao_codigo);
    if (!valid) {
      throw new ApiError(
        `${assignment.funcao} atual não está habilitado na nova aeronave`,
        409,
        'CONTROLE_VOOS_CREW_AIRCRAFT_CHANGE_INELIGIBLE',
      );
    }
  }
}
