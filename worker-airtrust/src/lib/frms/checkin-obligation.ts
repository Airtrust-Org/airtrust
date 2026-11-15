import type { D1Database } from '@cloudflare/workers-types';
import { addDaysIso } from './iso-date';

/**
 * Regra canônica da obrigação diária de check-in de fadiga.
 *
 * A obrigação nasce de uma atividade aplicável, real ou programada, e nunca da
 * simples presença do tripulante em uma quinzena-base (`funcionarios.quinzena`).
 * Todos os consumidores (snapshot operacional, status individual, roster da
 * equipe e lembretes) devem decidir "pendente" por aqui.
 *
 * Precedência por tripulante × dia:
 *   1. Check-in registrado            → RECEBIDO (evidência preservada).
 *   2. Atividade registrada no dia    → PENDENTE (mesmo fora da escala; gera divergência).
 *   3. Voo programado na EVD          → PENDENTE (voo cancelado não conta).
 *   4. Escala conflitante no dia      → INDETERMINADO (reconciliar, sem presumir).
 *   5. Ausência programada            → DISPENSADO (folga, férias, afastamento).
 *   6. Alocação operacional no dia    → PENDENTE (datas reais da alocação).
 *   7. Atividade programada não-voo   → NAO_APLICAVEL (curso/simulador sem registro).
 *   8. Só quinzena-base, sem escala   → INDETERMINADO (presunção não exige check-in).
 *   9. Nada                           → NAO_APLICAVEL.
 */

export type CheckinObligationStatus =
  | 'RECEBIDO'
  | 'PENDENTE'
  | 'DISPENSADO'
  | 'INDETERMINADO'
  | 'NAO_APLICAVEL';

export type CheckinObligationBasis =
  | 'ATIVIDADE_REGISTRADA'
  | 'VOO_PROGRAMADO'
  | 'ALOCACAO_OPERACIONAL'
  | 'AUSENCIA_PROGRAMADA'
  | 'ESCALA_CONFLITANTE'
  | 'ATIVIDADE_NAO_VOO'
  | 'QUINZENA_BASE_SEM_ESCALA'
  | 'SEM_PROGRAMACAO';

export type CheckinObligationDivergence =
  | 'ATIVIDADE_EM_AUSENCIA'
  | 'ATIVIDADE_FORA_DA_ESCALA'
  | 'VOO_PROGRAMADO_EM_AUSENCIA'
  | 'ESCALA_CONFLITANTE';

export interface CheckinObligation {
  status: CheckinObligationStatus;
  /** A atividade do dia exige check-in (independente de já ter sido recebido). */
  exigivel: boolean;
  base: CheckinObligationBasis;
  rotulo: string;
  divergencias: CheckinObligationDivergence[];
}

export interface ScheduleDayEvidence {
  operationalAllocation: boolean;
  nonFlightAllocation: boolean;
  /** Código da ausência programada (FOLGA, FERIAS, MED, AFT, folga, ferias, licenca). */
  absence: string | null;
  /** Ausência e alocação operacional no mesmo nível (alocação × alocação). */
  allocationConflict: boolean;
  /** Presunção pela quinzena-base sem escala publicada para o tripulante no período. */
  baseFortnightPresumption: boolean;
}

export const EMPTY_SCHEDULE_DAY: ScheduleDayEvidence = {
  operationalAllocation: false,
  nonFlightAllocation: false,
  absence: null,
  allocationConflict: false,
  baseFortnightPresumption: false,
};

/** Situações de escala que retiram o tripulante da operação no dia. */
export const ABSENCE_SITUACOES = ['FOLGA', 'FERIAS', 'MED', 'AFT'] as const;
/** Situações programadas que não são serviço de voo por si só. */
export const NON_FLIGHT_SITUACOES = ['SIM', 'CURSO'] as const;
/** Eventos diários manuais de ausência (sobrepõem a alocação: quinzena quebrada). */
export const ABSENCE_EVENT_TYPES = ['folga', 'ferias', 'licenca'] as const;

const BASIS_LABEL: Record<CheckinObligationBasis, string> = {
  ATIVIDADE_REGISTRADA: 'Atividade operacional registrada no dia',
  VOO_PROGRAMADO: 'Voo programado na escala de voo diária',
  ALOCACAO_OPERACIONAL: 'Dia de serviço na escala publicada',
  AUSENCIA_PROGRAMADA: 'Folga, férias ou afastamento na escala',
  ESCALA_CONFLITANTE: 'Escala com ausência e serviço no mesmo dia',
  ATIVIDADE_NAO_VOO: 'Curso ou simulador programado, sem atividade registrada',
  QUINZENA_BASE_SEM_ESCALA: 'Quinzena-base sem escala publicada para o dia',
  SEM_PROGRAMACAO: 'Sem escala nem atividade no dia',
};

export function resolveCheckinObligation(input: {
  hasCheckin: boolean;
  registeredActivity: boolean;
  programmedFlight: boolean;
  schedule?: ScheduleDayEvidence | null;
}): CheckinObligation {
  const schedule = input.schedule ?? EMPTY_SCHEDULE_DAY;
  const divergencias: CheckinObligationDivergence[] = [];
  const absent = Boolean(schedule.absence);

  let base: CheckinObligationBasis;
  let status: Exclude<CheckinObligationStatus, 'RECEBIDO'>;

  if (input.registeredActivity) {
    base = 'ATIVIDADE_REGISTRADA';
    status = 'PENDENTE';
    if (absent) divergencias.push('ATIVIDADE_EM_AUSENCIA');
    else if (
      !input.programmedFlight &&
      !schedule.operationalAllocation &&
      !schedule.nonFlightAllocation &&
      !schedule.baseFortnightPresumption
    ) {
      divergencias.push('ATIVIDADE_FORA_DA_ESCALA');
    }
  } else if (input.programmedFlight) {
    base = 'VOO_PROGRAMADO';
    status = 'PENDENTE';
    if (absent) divergencias.push('VOO_PROGRAMADO_EM_AUSENCIA');
  } else if (schedule.allocationConflict) {
    base = 'ESCALA_CONFLITANTE';
    status = 'INDETERMINADO';
    divergencias.push('ESCALA_CONFLITANTE');
  } else if (absent) {
    base = 'AUSENCIA_PROGRAMADA';
    status = 'DISPENSADO';
  } else if (schedule.operationalAllocation) {
    base = 'ALOCACAO_OPERACIONAL';
    status = 'PENDENTE';
  } else if (schedule.nonFlightAllocation) {
    base = 'ATIVIDADE_NAO_VOO';
    status = 'NAO_APLICAVEL';
  } else if (schedule.baseFortnightPresumption) {
    base = 'QUINZENA_BASE_SEM_ESCALA';
    status = 'INDETERMINADO';
  } else {
    base = 'SEM_PROGRAMACAO';
    status = 'NAO_APLICAVEL';
  }

  const exigivel = status === 'PENDENTE';
  return {
    status: input.hasCheckin ? 'RECEBIDO' : status,
    exigivel,
    base,
    rotulo: BASIS_LABEL[base],
    divergencias,
  };
}

// ─── Evidência de escala ────────────────────────────────────────────────────

export interface ScheduleAllocationRow {
  funcionario_id: number;
  data_inicio: string;
  data_fim: string;
  situacao_tipo: string | null;
}

export interface ScheduleAbsenceEventRow {
  funcionario_id: number;
  data_inicio: string;
  data_fim: string;
  tipo_evento: string;
}

export interface BaseFortnightRow {
  funcionario_id: number;
  data_inicio: string;
  data_fim: string;
}

export interface CheckinScheduleEvidence {
  allocations: ScheduleAllocationRow[];
  absenceEvents: ScheduleAbsenceEventRow[];
  baseFortnights: BaseFortnightRow[];
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function covers(row: { data_inicio: string; data_fim: string }, date: string): boolean {
  return row.data_inicio <= date && row.data_fim >= date;
}

function overlaps(
  a: { data_inicio: string; data_fim: string },
  b: { data_inicio: string; data_fim: string },
): boolean {
  return a.data_inicio <= b.data_fim && a.data_fim >= b.data_inicio;
}

function classifySituacao(value: string | null): 'ABSENCE' | 'NON_FLIGHT' | 'OPERATIONAL' {
  const code = String(value ?? '').trim().toUpperCase();
  if ((ABSENCE_SITUACOES as readonly string[]).includes(code)) return 'ABSENCE';
  if ((NON_FLIGHT_SITUACOES as readonly string[]).includes(code)) return 'NON_FLIGHT';
  return 'OPERATIONAL';
}

/** Índice puro (sem D1) para resolver a escala de um tripulante em uma data. */
export function buildScheduleDayIndex(
  evidence: CheckinScheduleEvidence,
): (funcionarioId: number, date: string) => ScheduleDayEvidence {
  const group = <T extends { funcionario_id: number; data_inicio: string; data_fim: string }>(
    rows: readonly T[],
  ): Map<number, T[]> => {
    const map = new Map<number, T[]>();
    for (const row of rows) {
      const id = Number(row.funcionario_id);
      if (!Number.isInteger(id) || id <= 0) continue;
      if (!isIsoDate(row.data_inicio) || !isIsoDate(row.data_fim) || row.data_inicio > row.data_fim) continue;
      const list = map.get(id) ?? [];
      list.push(row);
      map.set(id, list);
    }
    return map;
  };
  const allocations = group(evidence.allocations);
  const events = group(evidence.absenceEvents);
  const bases = group(evidence.baseFortnights);

  return (funcionarioId: number, date: string): ScheduleDayEvidence => {
    const ownAllocations = allocations.get(funcionarioId) ?? [];
    const dayAllocations = ownAllocations.filter((row) => covers(row, date));
    const kinds = new Set(dayAllocations.map((row) => classifySituacao(row.situacao_tipo)));
    const absenceAllocation = dayAllocations.find((row) => classifySituacao(row.situacao_tipo) === 'ABSENCE');
    const absenceEvent = (events.get(funcionarioId) ?? []).find((row) => covers(row, date));

    // A quinzena-base é só presunção: qualquer alocação publicada do tripulante
    // que toque aquele período (inclusive ausência) torna a escala soberana.
    const basePresumption = (bases.get(funcionarioId) ?? []).some(
      (period) => covers(period, date) && !ownAllocations.some((row) => overlaps(row, period)),
    );

    return {
      operationalAllocation: kinds.has('OPERATIONAL'),
      nonFlightAllocation: kinds.has('NON_FLIGHT'),
      // Evento diário manual (quinzena quebrada) prevalece sobre a alocação.
      absence: absenceEvent
        ? String(absenceEvent.tipo_evento)
        : absenceAllocation
          ? String(absenceAllocation.situacao_tipo).toUpperCase()
          : null,
      allocationConflict: !absenceEvent && kinds.has('ABSENCE') && kinds.has('OPERATIONAL'),
      baseFortnightPresumption: basePresumption,
    };
  };
}

const QUINZENA_NUMERO_SQL = `CASE LOWER(TRIM(COALESCE(f.quinzena, '')))
  WHEN 'primeira' THEN 1 WHEN '1' THEN 1 WHEN '1q' THEN 1 WHEN 'q1' THEN 1
  WHEN '1ª' THEN 1 WHEN '1a' THEN 1 WHEN 'primeira quinzena' THEN 1
  WHEN 'segunda' THEN 2 WHEN '2' THEN 2 WHEN '2q' THEN 2 WHEN 'q2' THEN 2
  WHEN '2ª' THEN 2 WHEN '2a' THEN 2 WHEN 'segunda quinzena' THEN 2 ELSE 0 END`;

/** Uma quinzena tem no máximo 16 dias; a margem permite avaliar a soberania da escala. */
const ALLOCATION_CONTEXT_MARGIN_DAYS = 16;

/**
 * Carrega a evidência de escala do tenant para [inicio, fim]. Todas as consultas
 * são ancoradas em `empresa_id`. Respostas D1 malformadas falham fechado.
 */
export async function loadCheckinScheduleEvidence(
  db: D1Database,
  empresaId: number,
  inicio: string,
  fim: string,
): Promise<CheckinScheduleEvidence> {
  const contextStart = addDaysIso(inicio, -ALLOCATION_CONTEXT_MARGIN_DAYS);
  const contextEnd = addDaysIso(fim, ALLOCATION_CONTEXT_MARGIN_DAYS);
  const [allocations, absenceEvents, baseFortnights] = await Promise.all([
    db
      .prepare(
        `SELECT CAST(ea.funcionario_id AS INTEGER) AS funcionario_id,
                ea.data_inicio, ea.data_fim, ea.situacao_tipo
           FROM escala_alocacoes ea
           JOIN funcionarios f
             ON f.id = ea.funcionario_id
            AND f.empresa_id = ?
            AND f.deleted_at IS NULL
          WHERE ea.deleted_at IS NULL
            AND LOWER(COALESCE(ea.status, '')) <> 'cancelado'
            AND ea.data_inicio <= ?
            AND ea.data_fim >= ?`,
      )
      .bind(empresaId, contextEnd, contextStart)
      .all<ScheduleAllocationRow>(),
    db
      .prepare(
        `SELECT CAST(ee.funcionario_id AS INTEGER) AS funcionario_id,
                ee.data_inicio, ee.data_fim, LOWER(ee.tipo_evento) AS tipo_evento
           FROM escala_eventos ee
           JOIN escalas_mensais em
             ON em.id = ee.escala_id
            AND em.empresa_id = ?
            AND em.deleted_at IS NULL
          WHERE ee.deleted_at IS NULL
            AND LOWER(COALESCE(ee.status, 'confirmado')) <> 'cancelado'
            AND COALESCE(ee.gerado_automaticamente, 0) = 0
            AND LOWER(ee.tipo_evento) IN ('folga', 'ferias', 'licenca')
            AND ee.data_inicio <= ?
            AND ee.data_fim >= ?`,
      )
      .bind(empresaId, fim, inicio)
      .all<ScheduleAbsenceEventRow>(),
    db
      .prepare(
        `SELECT CAST(f.id AS INTEGER) AS funcionario_id, eq.data_inicio, eq.data_fim
           FROM funcionarios f
           JOIN escalas_quinzenas eq
             ON eq.empresa_id = f.empresa_id
            AND eq.deleted_at IS NULL
            AND eq.numero = ${QUINZENA_NUMERO_SQL}
          WHERE f.empresa_id = ?
            AND f.deleted_at IS NULL
            AND COALESCE(f.ativo, 1) = 1
            AND eq.data_inicio <= ?
            AND eq.data_fim >= ?`,
      )
      .bind(empresaId, fim, inicio)
      .all<BaseFortnightRow>(),
  ]);
  for (const result of [allocations, absenceEvents, baseFortnights]) {
    if (!result || !Array.isArray(result.results)) {
      throw new Error('FRMS_CHECKIN_SCHEDULE_QUERY_INCOMPLETE');
    }
  }
  return {
    allocations: allocations.results,
    absenceEvents: absenceEvents.results,
    baseFortnights: baseFortnights.results,
  };
}

/**
 * Obrigação de check-in de todos os tripulantes operacionais do tenant em uma
 * data. Usado por consumidores que não montam o snapshot completo (status
 * individual, roster da equipe, lembretes). A atividade registrada vem de
 * `frms_jornada` (status de serviço) e o voo programado da EVD não cancelada.
 */
export async function loadDailyCheckinObligations(
  db: D1Database,
  empresaId: number,
  date: string,
  options: { funcionarioId?: number } = {},
): Promise<Map<number, CheckinObligation>> {
  const funcionarioFilter = options.funcionarioId != null ? 'AND f.id = ?' : '';
  const funcionarioBind = options.funcionarioId != null ? [options.funcionarioId] : [];
  const [schedule, crew] = await Promise.all([
    loadCheckinScheduleEvidence(db, empresaId, date, date),
    db
      .prepare(
        `SELECT CAST(f.id AS INTEGER) AS funcionario_id,
                EXISTS (
                  SELECT 1 FROM frms_fadiga_checkin ch
                   WHERE ch.empresa_id = f.empresa_id AND ch.funcionario_id = f.id
                     AND ch.data_checkin = ? AND ch.deleted_at IS NULL
                ) AS has_checkin,
                EXISTS (
                  SELECT 1 FROM frms_jornada fj
                   WHERE fj.empresa_id = f.empresa_id AND fj.tripulante_id = f.id
                     AND fj.data = ? AND fj.deleted_at IS NULL
                     AND fj.status IN ('ES','TS','TV','EX','RE','SA')
                ) AS has_activity,
                EXISTS (
                  SELECT 1 FROM escala_voo_diaria e
                   WHERE e.empresa_id = f.empresa_id AND e.data = ?
                     AND e.deleted_at IS NULL
                     AND UPPER(COALESCE(e.status, '')) <> 'CANCELADA'
                     AND (CAST(e.pic_id AS INTEGER) = f.id OR CAST(e.sic_id AS INTEGER) = f.id)
                ) AS has_programmed_flight
           FROM funcionarios f
          WHERE f.empresa_id = ?
            AND f.deleted_at IS NULL
            AND COALESCE(f.ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
            ${funcionarioFilter}`,
      )
      .bind(date, date, date, empresaId, ...funcionarioBind)
      .all<{
        funcionario_id: number;
        has_checkin: number;
        has_activity: number;
        has_programmed_flight: number;
      }>(),
  ]);
  if (!crew || !Array.isArray(crew.results)) {
    throw new Error('FRMS_CHECKIN_OBLIGATION_QUERY_INCOMPLETE');
  }
  const scheduleFor = buildScheduleDayIndex(schedule);
  const result = new Map<number, CheckinObligation>();
  for (const row of crew.results) {
    const funcionarioId = Number(row.funcionario_id);
    result.set(
      funcionarioId,
      resolveCheckinObligation({
        hasCheckin: Number(row.has_checkin) === 1,
        registeredActivity: Number(row.has_activity) === 1,
        programmedFlight: Number(row.has_programmed_flight) === 1,
        schedule: scheduleFor(funcionarioId, date),
      }),
    );
  }
  return result;
}

/** Mensagem ao tripulante quando não há check-in no dia (nunca afirma aptidão). */
export function describeMissingCheckin(obrigacao: CheckinObligation | null): string {
  if (obrigacao?.status === 'PENDENTE') {
    return 'Fadiga diária não preenchida pelo tripulante. O cálculo permanece indisponível até o envio do check-in.';
  }
  if (obrigacao?.status === 'INDETERMINADO') {
    return `Check-in não exigido automaticamente: ${obrigacao.rotulo.toLowerCase()}. Confirme a escala; se houver atividade, realize o check-in.`;
  }
  const motivo = (obrigacao?.rotulo ?? BASIS_LABEL.SEM_PROGRAMACAO).toLowerCase();
  return `Check-in não exigido nesta data (${motivo}). Relatos espontâneos continuam disponíveis.`;
}

/** Rótulo curto para linhas sem check-in e sem pendência no roster da equipe. */
export function noDutyLabel(obrigacao: CheckinObligation | null): string {
  if (obrigacao?.status === 'DISPENSADO') return 'Dispensado (escala)';
  if (obrigacao?.status === 'INDETERMINADO') return 'Escala a confirmar';
  return 'Sem jornada';
}
