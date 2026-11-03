/**
 * Lei 13.475/2017 art. 42 — madrugadas de trabalho.
 *
 * - caput: no máximo 2 madrugadas consecutivas de trabalho e 4 madrugadas
 *   totais em 168 h consecutivas, contadas a partir da apresentação;
 * - §2º: 48 h livres de qualquer atividade reiniciam a contagem de 168 h;
 * - §4º: madrugada é o período transcorrido, total ou parcialmente, entre 0 h
 *   e 6 h do fuso oficial da base contratual.
 *
 * Não modelado: §1º (3ª madrugada consecutiva apenas como extra no retorno) e
 * a exceção do ACT Costa do Sol cl. 8ª §2º (aeromédico/manutenção), porque o
 * snapshot não informa a função a bordo nem o tipo de operação por jornada.
 *
 * Os horários são relógios da base (HH:MM). Uma madrugada é identificada pela
 * data civil em que começa às 00:00.
 */

const MIN_PER_DAY = 24 * 60;
const MADRUGADA_END_MIN = 6 * 60;
const WINDOW_168H_MIN = 168 * 60;
const RESET_FREE_MIN = 48 * 60;
export const LAW_ART42_MAX_CONSECUTIVE = 2;
export const LAW_ART42_MAX_IN_168H = 4;

export interface Art42DutyInput {
  /** Data da apresentação (YYYY-MM-DD). */
  data: string;
  hora_apresentacao: string | null | undefined;
  hora_termino: string | null | undefined;
}

export interface Art42Evaluation {
  /** A jornada da data de referência toca alguma madrugada. */
  touchesMadrugada: boolean;
  /** Sequência de madrugadas consecutivas trabalhadas que termina na jornada de referência. */
  consecutiveMadrugadas: number;
  /** Maior contagem de madrugadas numa janela de 168 h que inclui a jornada de referência. */
  madrugadasIn168h: number;
  violations: Array<'LAW_ART42_CONSECUTIVE' | 'LAW_ART42_168H'>;
  /** Jornadas no histórico sem horários utilizáveis: a contagem é um piso, não um total. */
  incompleteDuties: number;
}

interface Interval { start: number; end: number; refDate: string }

function dayIndex(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    return null;
  }
  return Math.floor(ms / 86400000);
}

function clock(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function toInterval(duty: Art42DutyInput): Interval | null {
  const day = dayIndex(duty.data);
  const start = clock(duty.hora_apresentacao);
  const end = clock(duty.hora_termino);
  if (day == null || start == null || end == null) return null;
  const absStart = day * MIN_PER_DAY + start;
  let absEnd = day * MIN_PER_DAY + end;
  if (absEnd <= absStart) absEnd += MIN_PER_DAY;
  return { start: absStart, end: absEnd, refDate: duty.data };
}

/** Índices de dia das madrugadas tocadas por [start, end). */
function madrugadasOf(interval: Pick<Interval, 'start' | 'end'>): number[] {
  const out: number[] = [];
  const firstDay = Math.floor(interval.start / MIN_PER_DAY);
  const lastDay = Math.floor((interval.end - 1) / MIN_PER_DAY);
  for (let day = firstDay; day <= lastDay; day += 1) {
    const madStart = day * MIN_PER_DAY;
    const madEnd = madStart + MADRUGADA_END_MIN;
    if (interval.start < madEnd && interval.end > madStart) out.push(day);
  }
  return out;
}

export function evaluateLawArt42Madrugadas(
  referenceDate: string,
  duties: readonly Art42DutyInput[],
): Art42Evaluation {
  const empty: Art42Evaluation = {
    touchesMadrugada: false, consecutiveMadrugadas: 0, madrugadasIn168h: 0, violations: [], incompleteDuties: 0,
  };
  const refDay = dayIndex(referenceDate);
  if (refDay == null) return empty;

  let incompleteDuties = 0;
  const intervals: Interval[] = [];
  for (const duty of duties) {
    const day = dayIndex(duty.data);
    // Só o passado (até 8 dias) e a própria data influenciam a jornada de referência.
    if (day == null || day > refDay || day < refDay - 8) continue;
    const interval = toInterval(duty);
    if (interval) intervals.push(interval);
    else incompleteDuties += 1;
  }
  intervals.sort((a, b) => a.start - b.start);

  const reference = intervals.filter((i) => i.refDate === referenceDate);
  const refMadrugadas = new Set(reference.flatMap(madrugadasOf));
  if (refMadrugadas.size === 0) return { ...empty, incompleteDuties };

  const worked = new Set(intervals.flatMap(madrugadasOf));
  const lastRef = Math.max(...refMadrugadas);
  let consecutive = 0;
  for (let day = lastRef; worked.has(day); day -= 1) consecutive += 1;

  // Janela de 168 h a partir de cada apresentação anterior ou igual à de referência.
  const refStart = Math.min(...reference.map((i) => i.start));
  const refEnd = Math.max(...reference.map((i) => i.end));
  let in168h = 0;
  for (let s = 0; s < intervals.length; s += 1) {
    const windowStart = intervals[s].start;
    if (windowStart > refStart || windowStart + WINDOW_168H_MIN <= refStart) continue;
    // §2º: 48 h livres entre a apresentação-âncora e a referência reiniciam a contagem.
    let reset = false;
    let lastEnd = intervals[s].end;
    for (let k = s + 1; k < intervals.length && intervals[k].start <= refStart; k += 1) {
      if (intervals[k].start - lastEnd >= RESET_FREE_MIN) { reset = true; break; }
      lastEnd = Math.max(lastEnd, intervals[k].end);
    }
    if (reset) continue;
    const windowEnd = Math.min(windowStart + WINDOW_168H_MIN, refEnd);
    const days = new Set<number>();
    for (const interval of intervals) {
      if (interval.start < windowStart || interval.start >= windowEnd) continue;
      const clipped = { start: interval.start, end: Math.min(interval.end, windowStart + WINDOW_168H_MIN) };
      for (const day of madrugadasOf(clipped)) days.add(day);
    }
    in168h = Math.max(in168h, days.size);
  }

  const violations: Art42Evaluation['violations'] = [];
  if (consecutive > LAW_ART42_MAX_CONSECUTIVE) violations.push('LAW_ART42_CONSECUTIVE');
  if (in168h > LAW_ART42_MAX_IN_168H) violations.push('LAW_ART42_168H');
  return { touchesMadrugada: true, consecutiveMadrugadas: consecutive, madrugadasIn168h: in168h, violations, incompleteDuties };
}
