/**
 * ORÁCULO INDEPENDENTE — modelo de referência FRMS.
 *
 * Este arquivo é escrito a partir das **equações documentadas** e das fontes
 * primárias citadas em `docs/frms/frms-scientific-audit.md`. Ele existe para
 * conferir os resultados da implementação produtiva sem herdar seus defeitos.
 *
 * Regras que este arquivo respeita, por construção:
 *
 * 1. **Não importa nada de `src/lib/frms`.** Nenhum símbolo da aplicação.
 * 2. **Nomes e estrutura diferentes** dos produtivos (`dutySpan` vs
 *    `resolveJornadaInterval`, `restFloorMinutes` vs `repousoMinimoRequeridoMin`).
 * 3. **Algoritmos diferentes** onde havia escolha. A conversão de data civil
 *    usa o algoritmo `days_from_civil` de Howard Hinnant (aritmética inteira
 *    pura), e não `Date.UTC`, de modo que um erro em `Date.UTC` ou no parsing
 *    de strings da implementação não se replicaria aqui.
 * 4. **Nenhuma API de horário local.** Nada de `getHours`, `getFullYear`,
 *    `toLocaleString`. O oráculo é, por construção, independente de `TZ`.
 *
 * Unidades — declaradas explicitamente e nunca inferidas:
 *
 * | Grandeza                | Unidade                  | Domínio          |
 * | ----------------------- | ------------------------ | ---------------- |
 * | `AbsoluteMinute`        | minuto desde 1970-01-01  | ℤ                |
 * | `MinuteOfDay`           | minuto desde 00:00 local | [0, 1440)        |
 * | duração                 | minuto                   | ℤ≥0              |
 * | penalidade              | fração adimensional      | [-1, 0]          |
 * | effectiveness           | ponto percentual         | [0, 100]         |
 */

/** Minutos absolutos desde a época, em tempo civil da base contratual. */
export type AbsoluteMinute = number;
/** Minuto do dia, [0, 1440). */
export type MinuteOfDay = number;

export const MINUTES_PER_DAY = 1440;

/**
 * Dias desde 1970-01-01 — algoritmo `days_from_civil` (Howard Hinnant, "chrono
 * -Compatible Low-Level Date Algorithms", seção "days_from_civil"). Aritmética
 * inteira pura: independente de `Date`, de fuso e de locale.
 */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/** Inverso de `daysFromCivil` — algoritmo `civil_from_days` (Hinnant). */
export function civilFromDays(days: number): { y: number; m: number; d: number } {
  const z = days + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

/** Desloca uma data ISO por um número inteiro de dias. */
export function shiftIsoDate(iso: string, days: number): string {
  const date = parseCivilDate(iso);
  if (!date) throw new Error(`data inválida: ${iso}`);
  const { y, m, d } = civilFromDays(daysFromCivil(date.y, date.m, date.d) + days);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Valida e converte `YYYY-MM-DD`. Rejeita datas inexistentes (ex.: 2026-02-30). */
export function parseCivilDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1) return null;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (d > lengths[m - 1]) return null;
  return { y, m, d };
}

/** Converte `HH:MM` em minuto do dia. Rejeita fora de [00:00, 23:59]. */
export function parseClock(hhmm: string | null | undefined): MinuteOfDay | null {
  if (typeof hhmm !== 'string') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Instante civil absoluto a partir de data + relógio. */
export function civilInstant(dateIso: string, hhmm: string | null): AbsoluteMinute | null {
  const date = parseCivilDate(dateIso);
  const clock = parseClock(hhmm);
  if (!date || clock == null) return null;
  return daysFromCivil(date.y, date.m, date.d) * MINUTES_PER_DAY + clock;
}

export interface Span {
  from: AbsoluteMinute;
  to: AbsoluteMinute;
}

/**
 * Reconstrói o intervalo físico de uma jornada.
 *
 * Convenção (RBAC 117 117.3(n) — jornada é a duração do trabalho do tripulante,
 * da apresentação ao encerramento): a data rotula a **apresentação**. Um término
 * cujo relógio não é posterior ao da apresentação indica cruzamento de
 * meia-noite, e só então soma-se um dia.
 */
export function dutySpan(
  dateIso: string,
  reportClock: string | null,
  releaseClock: string | null,
  plannedMinutes?: number | null,
): Span | null {
  const from = civilInstant(dateIso, reportClock);
  if (from == null) return null;
  const release = parseClock(releaseClock);
  if (release != null) {
    const date = parseCivilDate(dateIso);
    if (!date) return null;
    const sameDay = daysFromCivil(date.y, date.m, date.d) * MINUTES_PER_DAY + release;
    return { from, to: sameDay <= from ? sameDay + MINUTES_PER_DAY : sameDay };
  }
  if (plannedMinutes != null && plannedMinutes > 0) return { from, to: from + plannedMinutes };
  return null;
}

/** Minutos de interseção de dois intervalos semiabertos [from, to). */
export function overlapMinutes(a: Span, b: Span): number {
  const start = Math.max(a.from, b.from);
  const end = Math.min(a.to, b.to);
  return end > start ? end - start : 0;
}

/**
 * Tempo de voo atribuído a uma janela móvel, rateado pela fração da jornada
 * contida na janela.
 *
 * ATENÇÃO — premissa empresarial, não regulatória: RBAC 117 117.3(aa) define
 * tempo de voo calço-a-calço, e o schema não guarda o instante de cada etapa.
 * O rateio uniforme ao longo da jornada é a aproximação adotada. Ver L-02.
 */
export function proratedFlightMinutes(duty: Span, flightMinutes: number, window: Span): number {
  const duration = duty.to - duty.from;
  if (duration <= 0 || flightMinutes <= 0) return 0;
  return flightMinutes * (overlapMinutes(duty, window) / duration);
}

/**
 * Piso de repouso regulamentar, em minutos.
 *
 * Fonte: RBAC nº 117 EMD 01, Apêndice A, **A117.23(b)** — "O tempo mínimo de
 * repouso tem duração relacionada ao tempo da jornada anterior":
 *   (1) 12 h de repouso após jornada de até 12 h;
 *   (2) 16 h após jornada de mais de 12 h e até 15 h;
 *   (3) 24 h após jornada de mais de 15 h.
 */
export function restFloorMinutes(previousDutyMinutes: number | null): number {
  if (previousDutyMinutes == null) return 12 * 60;
  if (previousDutyMinutes > 15 * 60) return 24 * 60;
  if (previousDutyMinutes > 12 * 60) return 16 * 60;
  return 12 * 60;
}

/**
 * WOCL — janela de baixa do alerta no ritmo circadiano.
 *
 * Fonte: RBAC nº 117 EMD 01, 117.3(m)-III(1): "o período transcorrido, total ou
 * parcialmente, entre 02h00 e 06h00, hora local da base contratual do
 * tripulante" (viagens que cruzam menos de 3 fusos).
 */
export function insideWocl(minuteOfDay: number): boolean {
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return m >= 2 * 60 && m < 6 * 60;
}

/**
 * Penalidade de despertar dentro da WOCL. Triangular, máxima no centro (04:00)
 * e mínima nas bordas. **Modelo empresarial** — a janela vem da norma, a função
 * numérica não. Ver M-01.
 */
export function woclArousalPenalty(minuteOfDay: number): number {
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (!insideWocl(m)) return 0;
  const normalizedDistance = Math.min(1, Math.abs(m - 4 * 60) / 120);
  return -(0.3 - normalizedDistance * 0.15);
}

/**
 * Penalidade por débito de sono. Linear de 0 (≥ 8 h) a −0,5 (0 h).
 * **Modelo empresarial.** Ver M-02.
 */
export function sleepDebtPenalty(sleepMinutes: number): number {
  if (!Number.isFinite(sleepMinutes) || sleepMinutes <= 0) return -0.5;
  if (sleepMinutes >= 480) return 0;
  return -((480 - sleepMinutes) / 480) * 0.5;
}

/**
 * Effectiveness = 100 + 100·Σ(penalidades), saturado em [0, 100].
 * Todas as parcelas devem ser frações adimensionais não positivas.
 */
export function effectivenessFromPenalties(penalties: number[]): number {
  const total = penalties.reduce((acc, p) => acc + Math.min(0, p), 0);
  return Math.max(0, Math.min(100, 100 + total * 100));
}

/** Interpolação linear do fator de ciclo embarcado entre dois patamares. */
export function embarkedCyclePenalty(
  cycleDay: number | null,
  firstDay: number,
  lastDay: number,
  penaltyAtFirst: number,
  penaltyAtLast: number,
): number {
  if (cycleDay == null || cycleDay < firstDay) return 0;
  if (cycleDay >= lastDay || lastDay <= firstDay) return penaltyAtLast;
  const progress = (cycleDay - firstDay) / (lastDay - firstDay);
  return penaltyAtFirst + progress * (penaltyAtLast - penaltyAtFirst);
}
