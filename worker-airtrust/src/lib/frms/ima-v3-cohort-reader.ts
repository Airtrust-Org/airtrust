/**
 * Staging-only research reader of bounded FRMS check-in / journey presence.
 *
 * SELECT-only and strictly tenant-scoped. Does NOT call the heavyweight
 * operational-snapshot, which recalculates a fortnight and legal context.
 * Sample frame: days with check-ins or journeys, NOT entire scheduled roster.
 */
import type { D1Database } from '@cloudflare/workers-types';
import type { ImaCohortSourceRow } from './ima-v3-cohort-evidence';

type CheckinRow = {
  funcionario_id: number;
  data_operacional: string;
  horas_sono: number | null;
  wake_time: string | null;
  kss_score: number | null;
};
type JourneyRow = { funcionario_id: number; data_operacional: string };
const MAX_SOURCE_ROWS = 15_000;

// SQL is static and parameters are bound. No mutation, client SQL or R2 write.
export const IMA_COHORT_CHECKIN_SQL = [
  'SELECT CAST(ch.funcionario_id AS INTEGER) AS funcionario_id,',
  'ch.data_checkin AS data_operacional, ch.horas_sono, ch.wake_time, ch.kss_score',
  'FROM frms_fadiga_checkin ch',
  'JOIN funcionarios f ON f.id = CAST(ch.funcionario_id AS INTEGER)',
  'AND f.empresa_id = ch.empresa_id',
  'WHERE ch.empresa_id = ? AND ch.deleted_at IS NULL',
  'AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1',
  'AND ch.data_checkin BETWEEN ? AND ? LIMIT 15001',
].join(' ');

export const IMA_COHORT_JOURNEY_SQL = [
  'SELECT CAST(j.tripulante_id AS INTEGER) AS funcionario_id,',
  'j.data AS data_operacional FROM frms_jornada j',
  'JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)',
  'AND f.empresa_id = j.empresa_id',
  'WHERE j.empresa_id = ? AND j.deleted_at IS NULL',
  'AND f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1',
  'AND j.data BETWEEN ? AND ? LIMIT 15001',
].join(' ');

/** A completed UTC calendar month avoids flexible-day small-cohort differencing. */
export function lastClosedMonthWindow(now: Date, days: 30 | 60 | 90) {
  if (![30, 60, 90].includes(days) || !Number.isFinite(now.getTime())) {
    throw new Error('IMA_COHORT_WINDOW_NOT_APPROVED');
  }
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0);
  const start = end - (days - 1) * 86_400_000;
  return {
    startDate: new Date(start).toISOString().slice(0, 10),
    endDate: new Date(end).toISOString().slice(0, 10),
    windowDays: days,
  };
}

function wakePresent(value: string | null): boolean {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
}

function sourceRow(empresaId: number, funcionarioId: number, day: string): ImaCohortSourceRow {
  return {
    empresa_id: empresaId,
    funcionario_id: funcionarioId,
    data_operacional: day,
    checkin_status: 'AUSENTE',
    horas_sono: null,
    sleep_data_source: 'AUSENTE',
    wake_data_source: 'AUSENTE',
    kss_score: null,
    teve_jornada: false,
    jornada_data_source: 'AUSENTE',
    operational_data_source: 'AUSENTE',
  };
}

/**
 * Internal read-only fetch. Identity never leaves the Worker: the route
 * immediately passes rows to the privacy-gated cohort aggregator.
 * Duplicate check-ins are rejected rather than cherry-picked.
 */
export async function loadImaCohortEvidenceRows(
  db: D1Database,
  empresaId: number,
  startDate: string,
  endDate: string,
): Promise<ImaCohortSourceRow[]> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) {
    throw new Error('IMA_COHORT_TENANT_REQUIRED');
  }
  const [checkins, jornadas] = await Promise.all([
    db.prepare(IMA_COHORT_CHECKIN_SQL).bind(empresaId, startDate, endDate).all<CheckinRow>(),
    db.prepare(IMA_COHORT_JOURNEY_SQL).bind(empresaId, startDate, endDate).all<JourneyRow>(),
  ]);
  const checkinRows = checkins.results ?? [];
  const journeyRows = jornadas.results ?? [];
  if (checkinRows.length > MAX_SOURCE_ROWS || journeyRows.length > MAX_SOURCE_ROWS) {
    throw new Error('IMA_COHORT_ROW_LIMIT_EXCEEDED');
  }

  const byCrewDay = new Map<string, ImaCohortSourceRow>();
  const seenCheckins = new Set<string>();
  const keyFor = (id: number, day: string) => id + ':' + day;

  for (const row of checkinRows) {
    const key = keyFor(row.funcionario_id, row.data_operacional);
    if (seenCheckins.has(key)) throw new Error('IMA_COHORT_DUPLICATE_CHECKIN');
    seenCheckins.add(key);
    const data = sourceRow(empresaId, row.funcionario_id, row.data_operacional);
    data.checkin_status = 'RECEBIDO';
    data.horas_sono = row.horas_sono == null ? null : Number(row.horas_sono);
    data.sleep_data_source = data.horas_sono != null && Number.isFinite(data.horas_sono) &&
      data.horas_sono > 0 && data.horas_sono <= 24 ? 'REAL' : 'AUSENTE';
    data.wake_data_source = wakePresent(row.wake_time) ? 'REAL' : 'AUSENTE';
    data.kss_score = row.kss_score == null ? null : Number(row.kss_score);
    byCrewDay.set(key, data);
  }

  for (const row of journeyRows) {
    const key = keyFor(row.funcionario_id, row.data_operacional);
    const data = byCrewDay.get(key) ??
      sourceRow(empresaId, row.funcionario_id, row.data_operacional);
    data.teve_jornada = true;
    // Presence of jornada is known; verified start/end or CV lineage is not.
    data.jornada_data_source = 'MANUAL';
    byCrewDay.set(key, data);
  }
  if (byCrewDay.size > MAX_SOURCE_ROWS) throw new Error('IMA_COHORT_ROW_LIMIT_EXCEEDED');
  return [...byCrewDay.values()];
}
