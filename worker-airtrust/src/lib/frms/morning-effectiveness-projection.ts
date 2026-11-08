import type { FrmsJornada, LimitesMap, EffectivenessResult } from './types';
import { calcEffectiveness, calcFatorizacao, type FrmsV2DailyAdjustments } from './calculos';
import { clockToMinutes, minutesToClock, projectSleepStart } from './operational-clock';

export interface EffectivenessSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  effectiveness_pct: number | null;
  effectiveness_nivel: string | null;
  effectiveness_componentes_json?: string | null;
  effectiveness_componentes?: EffectivenessResult['componentes'] | null;
  source?: 'REAL' | 'PROJETADA_APRESENTACAO' | 'PROJETADA_ATIVIDADE';
  dia_periodo_embarcado?: number | null;
  total_dias_periodo?: number | null;
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function calculateMorningEffectivenessProjection(input: {
  dataOperacional: string;
  funcionarioId: number;
  presentationTime: string | null | undefined;
  wakeTime: string | null | undefined;
  sleepHours: number | null | undefined;
  limites: LimitesMap;
  diaPeriodo?: number | null;
  totalDiasPeriodo?: number | null;
  plannedEndTime?: string | null;
  plannedActivityMinutes?: number | null;
  frmsFlightEquivalentMinutes?: number | null;
  v2Adjustments?: FrmsV2DailyAdjustments | null;
}): EffectivenessSnapshotRow | null {
  const presentation = normalizeText(input.presentationTime);
  const wakeTime = normalizeText(input.wakeTime);
  const sleepHours = Number(input.sleepHours ?? 0);
  if (!presentation || !wakeTime || !Number.isFinite(sleepHours) || sleepHours <= 0 || sleepHours > 24) return null;
  if (clockToMinutes(presentation) == null || clockToMinutes(wakeTime) == null) return null;

  const sleepStart = projectSleepStart(wakeTime, sleepHours);
  if (!sleepStart) return null;
  const [year, month] = input.dataOperacional.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const presentationMinutes = clockToMinutes(presentation)!;
  const plannedEnd = normalizeText(input.plannedEndTime);
  const plannedEndMinutes = clockToMinutes(plannedEnd);
  let plannedDutyMinutes = Math.max(0, Number(input.plannedActivityMinutes ?? 0));
  let endTime = presentation;
  if (plannedEndMinutes != null) {
    let boundaryMinutes = plannedEndMinutes - presentationMinutes;
    if (boundaryMinutes < 0) boundaryMinutes += 24 * 60;
    // Para dias mistos (ex.: treinamento diurno + simulador noturno), a soma
    // das durações conhecidas é a carga de atividade; a janela início→fim é
    // mantida apenas como limite temporal/circadiano e não substitui a carga.
    if (plannedDutyMinutes <= 0) plannedDutyMinutes = boundaryMinutes;
    endTime = plannedEnd!;
  } else if (plannedDutyMinutes > 0) {
    endTime = minutesToClock(presentationMinutes + plannedDutyMinutes);
  }
  const frmsFlightEquivalentMinutes = Math.max(0, Number(input.frmsFlightEquivalentMinutes ?? 0));

  const jornada = {
    id: `projection-${input.dataOperacional}::${input.funcionarioId}`,
    empresa_id: 0,
    tripulante_id: input.funcionarioId,
    data: input.dataOperacional,
    status: 'ES',
    hora_apresentacao: presentation,
    hora_termino: endTime,
    duracao_jornada_minutos: plannedDutyMinutes,
    horas_voo_minutos: frmsFlightEquivalentMinutes,
    hora_dormiu: sleepStart,
    hora_acordou: wakeTime,
    origem: 'MANUAL',
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    aclimatado: 1,
  } as FrmsJornada;

  const fatorizacao = calcFatorizacao({
    jornada,
    repousoAnteriorMin: null,
    limites: input.limites,
    diasDoMes: daysInMonth,
    diaDoCiclo: input.diaPeriodo ?? null,
  });
  const effectiveness = calcEffectiveness(
    fatorizacao,
    input.limites,
    {
      hora_apresentacao: presentation,
      hora_termino: endTime,
      hora_dormiu: sleepStart,
      hora_acordou: wakeTime,
      dia_periodo_embarcado: input.diaPeriodo ?? null,
      total_dias_periodo: input.totalDiasPeriodo ?? null,
    },
    null,
    input.v2Adjustments ?? null,
  );

  return {
    data_operacional: input.dataOperacional,
    funcionario_id: input.funcionarioId,
    effectiveness_pct: effectiveness.effectiveness_pct,
    effectiveness_nivel: effectiveness.nivel,
    effectiveness_componentes: effectiveness.componentes,
    source: plannedDutyMinutes > 0 || frmsFlightEquivalentMinutes > 0 ? 'PROJETADA_ATIVIDADE' : 'PROJETADA_APRESENTACAO',
    dia_periodo_embarcado: input.diaPeriodo ?? null,
    total_dias_periodo: input.totalDiasPeriodo ?? null,
  };
}

