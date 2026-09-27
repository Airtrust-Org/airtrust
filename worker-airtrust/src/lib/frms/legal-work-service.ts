import { loadFrmsActivityRows, type FrmsActivitySnapshotRow } from './activity-context';
import { buildCanonicalOperationalSourceSql } from './frms-source-policy';
import {
  sumLegalWorkCalendarMonth,
  sumLegalWorkRollingDays,
  summarizeCostaDoSolLegalWork,
  type LegalDutyRow,
} from './legal-work-time';

export interface LegalWorkMonthlyCrewSummary {
  tripulante_id: number;
  nome: string;
  guerra: string | null;
  funcao: string | null;
  trabalho_status: 'COMPLETE' | 'UNKNOWN';
  trabalho_mes_min: number | null;
  trabalho_mes_conhecido_min: number;
  trabalho_7d_max_min: number | null;
  trabalho_14d_max_min: number | null;
  voo_mes_min: number;
  jornada_registrada_mes_min: number;
  dias_com_jornada: number;
  incomplete_reasons: string[];
  incomplete_reasons_by_date: Record<string, string[]>;
  trabalho_por_data_min: Record<string, number>;
  /** Inclui até 20 dias anteriores ao mês para rolling 7d/14d e missão ACT 21d. */
  trabalho_contexto_por_data_min: Record<string, number>;
}

type LegalJourneyRow = LegalDutyRow & {
  tripulante_id: number;
  horas_voo_minutos: number | null;
};
function parseDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function ymd(day: number): string {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

function monthBounds(month: string): { start: string; end: string; contextStart: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('INVALID_MONTH');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error('INVALID_MONTH');
  const start = `${month}-01`;
  const nextMonthMs = Date.UTC(year, monthNumber, 1);
  const end = new Date(nextMonthMs - 86400000).toISOString().slice(0, 10);
  return { start, end, contextStart: ymd(parseDay(start) - 20) };
}

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let day = parseDay(start), last = parseDay(end); day <= last; day += 1) out.push(ymd(day));
  return out;
}
function maxRolling(
  byDate: Readonly<Record<string, number>>,
  start: string,
  end: string,
  days: number,
): number {
  return eachDay(start, end).reduce(
    (max, date) => Math.max(max, sumLegalWorkRollingDays(byDate, date, days)),
    0,
  );
}

function groupActivities(rows: readonly FrmsActivitySnapshotRow[]) {
  const map = new Map<number, FrmsActivitySnapshotRow[]>();
  for (const row of rows) {
    const id = Number(row.funcionario_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const current = map.get(id) ?? [];
    current.push(row);
    map.set(id, current);
  }
  return map;
}

function groupJourneys(rows: readonly LegalJourneyRow[]) {
  const map = new Map<number, LegalJourneyRow[]>();
  for (const row of rows) {
    const id = Number(row.tripulante_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const current = map.get(id) ?? [];
    current.push(row);
    map.set(id, current);
  }
  return map;
}
export async function loadLegalWorkMonth(
  db: D1Database,
  empresaId: number,
  month: string,
): Promise<LegalWorkMonthlyCrewSummary[]> {
  if (!Number.isInteger(empresaId) || empresaId <= 0) throw new Error('INVALID_TENANT');
  const { start, end, contextStart } = monthBounds(month);
  const canonical = buildCanonicalOperationalSourceSql('j.origem');

  const [journeyResult, activities] = await Promise.all([
    db.prepare(
      `SELECT CAST(j.tripulante_id AS INTEGER) AS tripulante_id,
              j.data,
              j.hora_apresentacao,
              COALESCE(j.hora_termino, j.hora_corte_motor, j.hora_ultimo_pouso) AS hora_termino,
              COALESCE(j.duracao_jornada_minutos, 0) AS duracao_jornada_minutos,
              COALESCE(j.horas_voo_minutos, 0) AS horas_voo_minutos
         FROM frms_jornada j
         JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
        WHERE f.empresa_id = ? AND f.deleted_at IS NULL
          AND j.deleted_at IS NULL
          AND j.data BETWEEN ? AND ?
          AND ${canonical}
        ORDER BY j.data, j.tripulante_id`,
    ).bind(empresaId, contextStart, end).all<LegalJourneyRow>(),
    loadFrmsActivityRows(db, empresaId, contextStart, end),
  ]);

  const journeys = journeyResult.results ?? [];
  const journeyMap = groupJourneys(journeys);
  const activityMap = groupActivities(activities);
  const candidateIds = [...new Set([...journeyMap.keys(), ...activityMap.keys()])].sort((a, b) => a - b);
  if (candidateIds.length === 0) return [];
  const placeholders = candidateIds.map(() => '?').join(',');
  const peopleResult = await db.prepare(
    `SELECT id, nome, guerra, funcao
       FROM funcionarios
      WHERE empresa_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
  ).bind(empresaId, ...candidateIds).all<{
    id: number;
    nome: string;
    guerra: string | null;
    funcao: string | null;
  }>();
  const people = new Map((peopleResult.results ?? []).map((person) => [Number(person.id), person]));

  return candidateIds.flatMap((id) => {
    const person = people.get(id);
    if (!person) return [];
    const crewJourneys = journeyMap.get(id) ?? [];
    const crewActivities = activityMap.get(id) ?? [];
    // Somente atividade com evidência de realização entra como trabalho consumido.
    // Planejamento futuro permanece disponível ao snapshot/projeção, mas nunca vira
    // hora trabalhada por inferência. Atividade passada sem evidência torna o dado UNKNOWN.
    const realizedActivities = crewActivities.filter((row) => row.legal_work_factor != null);
    const today = new Date().toISOString().slice(0, 10);
    const realizedCutoff = today < end ? today : end;
    const unresolvedPastActivities = crewActivities.filter(
      (row) => row.legal_work_factor == null && row.data_operacional <= realizedCutoff,
    );
    const legal = summarizeCostaDoSolLegalWork({ duties: crewJourneys, activities: realizedActivities });
    const unresolvedDates = [...new Set(unresolvedPastActivities.map((row) => row.data_operacional))];
    const incompleteReasons = [...legal.incompleteReasons];
    const incompleteReasonsByDate = { ...legal.incompleteReasonsByDate };
    if (unresolvedDates.length > 0) {
      incompleteReasons.push('ACTIVITY_REALIZATION_UNCONFIRMED');
      for (const date of unresolvedDates) {
        incompleteReasonsByDate[date] = [
          ...(incompleteReasonsByDate[date] ?? []),
          'ACTIVITY_REALIZATION_UNCONFIRMED',
        ];
      }
    }
    const workMonthKnown = sumLegalWorkCalendarMonth(legal.byCalendarDateMin, month);
    const monthJourneys = crewJourneys.filter((row) => row.data >= start && row.data <= end);
    const complete = incompleteReasons.length === 0;

    return [{
      tripulante_id: id,
      nome: person.nome,
      guerra: person.guerra,
      funcao: person.funcao,
      trabalho_status: complete ? 'COMPLETE' : 'UNKNOWN',
      trabalho_mes_min: complete ? workMonthKnown : null,
      trabalho_mes_conhecido_min: workMonthKnown,
      trabalho_7d_max_min: complete ? maxRolling(legal.byCalendarDateMin, start, end, 7) : null,
      trabalho_14d_max_min: complete ? maxRolling(legal.byCalendarDateMin, start, end, 14) : null,
      voo_mes_min: monthJourneys.reduce((sum, row) => sum + Math.max(0, Number(row.horas_voo_minutos ?? 0)), 0),
      jornada_registrada_mes_min: monthJourneys.reduce(
        (sum, row) => sum + Math.max(0, Number(row.duracao_jornada_minutos ?? 0)),
        0,
      ),
      dias_com_jornada: monthJourneys.filter((row) => Number(row.duracao_jornada_minutos ?? 0) > 0).length,
      incomplete_reasons: incompleteReasons,
      incomplete_reasons_by_date: incompleteReasonsByDate,
      trabalho_por_data_min: Object.fromEntries(
        Object.entries(legal.byCalendarDateMin).filter(([date]) => date >= start && date <= end),
      ),
      trabalho_contexto_por_data_min: { ...legal.byCalendarDateMin },
    }];
  });
}

export async function loadLegalWorkMonthForCrew(
  db: D1Database,
  empresaId: number,
  month: string,
  tripulanteId: number,
): Promise<LegalWorkMonthlyCrewSummary | null> {
  const rows = await loadLegalWorkMonth(db, empresaId, month);
  return rows.find((row) => row.tripulante_id === tripulanteId) ?? null;
}
