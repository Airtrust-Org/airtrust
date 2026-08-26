/**
 * Guard de período para a ficha individual FRMS.
 *
 * A ficha recebe um mês explícito. Nesse caso, a efetividade exibida deve vir
 * do mesmo mês; um valor histórico de outro período não pode aparecer como
 * "100 / verde" quando o mês selecionado não possui jornada canônica.
 */
import { buscarAcumuloTripulante as buscarAcumuloTripulanteBase } from './db-service-acumulo';
import { buildCanonicalOperationalSourceSql } from './frms-source-policy';

const CANONICAL_JORNADA_SOURCE_SQL = buildCanonicalOperationalSourceSql('j.origem');

export function shouldExposeEffectivenessForRequestedMonth(
  requestedMonth: string | undefined,
  hasCanonicalJourneyInMonth: boolean,
): boolean {
  return !requestedMonth || hasCanonicalJourneyInMonth;
}

async function hasCanonicalJourneyInRequestedMonth(
  db: D1Database,
  tripulanteId: string,
  empresaId: number,
  mes: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found
       FROM frms_jornada j
       JOIN funcionarios f
         ON f.id = CAST(j.tripulante_id AS INTEGER)
        AND f.deleted_at IS NULL
       WHERE j.tripulante_id = ?
         AND f.empresa_id = ?
         AND j.data LIKE ? || '%'
         AND j.deleted_at IS NULL
         AND ${CANONICAL_JORNADA_SOURCE_SQL}
       LIMIT 1`,
    )
    .bind(tripulanteId, empresaId, mes)
    .first<{ found: number }>();

  return row?.found === 1;
}

export async function buscarAcumuloTripulante(
  db: D1Database,
  tripulanteId: string,
  empresaId: number,
  mes?: string,
) {
  const result = await buscarAcumuloTripulanteBase(db, tripulanteId, empresaId, mes);

  if (!mes || !result.effectiveness) return result;

  const hasJourney = await hasCanonicalJourneyInRequestedMonth(
    db,
    tripulanteId,
    empresaId,
    mes,
  );

  if (shouldExposeEffectivenessForRequestedMonth(mes, hasJourney)) return result;

  return {
    ...result,
    effectiveness: null,
  };
}
