export interface FrmsDutyBoundaryConfig {
  postFlightCutoffMinutes: number;
  noFlightDutyEndTime: string;
}

export interface FrmsDutyBoundaryInput {
  presentationTime: string | null;
  hasFlight: boolean;
  lastCutoffTime: string | null;
  config: FrmsDutyBoundaryConfig;
}

export interface FrmsDutyBoundaryResult {
  presentationTime: string | null;
  dutyEndTime: string | null;
  durationMinutes: number | null;
  complete: boolean;
  reason: 'OK' | 'MISSING_PRESENTATION' | 'MISSING_LAST_CUTOFF' | 'INVALID_CONFIG';
}

function parseClock(value: string | null | undefined): number | null {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

export function addMinutesToClock(value: string, deltaMinutes: number): string | null {
  const base = parseClock(value);
  if (base == null || !Number.isFinite(deltaMinutes)) return null;
  const normalized = ((base + Math.round(deltaMinutes)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function durationBetweenClocks(start: string, end: string): number | null {
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);
  if (startMinutes == null || endMinutes == null) return null;
  return endMinutes >= startMinutes ? endMinutes - startMinutes : 1440 - startMinutes + endMinutes;
}

export function resolveFrmsDutyBoundary(input: FrmsDutyBoundaryInput): FrmsDutyBoundaryResult {
  const presentation = parseClock(input.presentationTime);
  if (presentation == null) {
    return {
      presentationTime: null,
      dutyEndTime: null,
      durationMinutes: null,
      complete: false,
      reason: 'MISSING_PRESENTATION',
    };
  }

  if (
    !Number.isFinite(input.config.postFlightCutoffMinutes) ||
    input.config.postFlightCutoffMinutes < 0 ||
    parseClock(input.config.noFlightDutyEndTime) == null
  ) {
    return {
      presentationTime: input.presentationTime,
      dutyEndTime: null,
      durationMinutes: null,
      complete: false,
      reason: 'INVALID_CONFIG',
    };
  }

  let dutyEndTime: string | null;
  if (input.hasFlight) {
    if (parseClock(input.lastCutoffTime) == null) {
      return {
        presentationTime: input.presentationTime,
        dutyEndTime: null,
        durationMinutes: null,
        complete: false,
        reason: 'MISSING_LAST_CUTOFF',
      };
    }
    dutyEndTime = addMinutesToClock(input.lastCutoffTime!, input.config.postFlightCutoffMinutes);
  } else {
    dutyEndTime = input.config.noFlightDutyEndTime;
  }

  const durationMinutes =
    dutyEndTime == null ? null : durationBetweenClocks(input.presentationTime!, dutyEndTime);
  return {
    presentationTime: input.presentationTime,
    dutyEndTime,
    durationMinutes,
    complete: dutyEndTime != null && durationMinutes != null,
    reason: dutyEndTime != null && durationMinutes != null ? 'OK' : 'INVALID_CONFIG',
  };
}


export type FrmsDutyBoundarySource = 'REAL' | 'ESTIMADO' | 'AUSENTE';

export function canCalculateFrmsEffectivenessFromBoundary(source: FrmsDutyBoundarySource): boolean {
  return source === 'REAL';
}

export interface FrmsEstimatedDutyBoundaryInput {
  presentationTime?: string | null;
  firstEngineStart?: string | null;
  firstTakeoff?: string | null;
  endTime?: string | null;
  lastLanding?: string | null;
}

export interface FrmsEstimatedDutyBoundaryResult {
  presentationTime: string | null;
  dutyEndTime: string | null;
  durationMinutes: number | null;
  complete: boolean;
}

/**
 * Historical compatibility only. Before the daily fatigue check-in became the
 * authoritative presentation source, SIGVOOS/FIRA used the first operational
 * event and the operational end as the displayed duty window. The result must
 * always be labelled ESTIMADO by callers and never override complete check-in evidence.
 */
export function resolveFrmsEstimatedDutyBoundary(
  input: FrmsEstimatedDutyBoundaryInput,
): FrmsEstimatedDutyBoundaryResult {
  const presentationCandidates = [input.presentationTime, input.firstEngineStart, input.firstTakeoff];
  const endCandidates = [input.endTime, input.lastLanding];
  const presentationTime = presentationCandidates.find((value) => parseClock(value) != null) ?? null;
  const dutyEndTime = endCandidates.find((value) => parseClock(value) != null) ?? null;
  const durationMinutes =
    presentationTime && dutyEndTime ? durationBetweenClocks(presentationTime, dutyEndTime) : null;
  return {
    presentationTime,
    dutyEndTime,
    durationMinutes: durationMinutes != null && durationMinutes > 0 ? durationMinutes : null,
    complete: durationMinutes != null && durationMinutes > 0,
  };
}

export async function loadFrmsDutyBoundaryConfig(
  db: D1Database,
  empresaId: number,
): Promise<FrmsDutyBoundaryConfig> {
  const row = await db
    .prepare(
      `SELECT jornada_pos_corte_minutos, jornada_sem_voo_fim
         FROM frms_fadiga_config_empresa
        WHERE empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId)
    .first<{ jornada_pos_corte_minutos: number | null; jornada_sem_voo_fim: string | null }>();

  if (
    !row ||
    !Number.isFinite(Number(row.jornada_pos_corte_minutos)) ||
    Number(row.jornada_pos_corte_minutos) < 0 ||
    parseClock(row.jornada_sem_voo_fim) == null
  ) {
    throw new Error('FRMS_DUTY_BOUNDARY_CONFIG_UNAVAILABLE');
  }

  return Object.freeze({
    postFlightCutoffMinutes: Number(row.jornada_pos_corte_minutos),
    noFlightDutyEndTime: String(row.jornada_sem_voo_fim),
  });
}
