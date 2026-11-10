/**
 * Aritmética canônica de validade em meses (#1492 / #2158).
 *
 * Fonte única compartilhada por Worker e frontend (o Worker já importa de
 * `src/shared`; este módulo é puro, sem imports, portanto sem dependência
 * circular).
 *
 * Regra aprovada pelo proprietário:
 *  - TODOS os vencimentos vencem NO DIA: soma meses de calendário preservando
 *    o dia e, quando o mês-alvo não tem esse dia, recua para o último dia
 *    válido do mês-alvo (29/02/2024 + 24m = 28/02/2026; 31/01/2025 + 1m =
 *    28/02/2025; 31/01/2024 + 1m = 29/02/2024; 30/04/2024 + 1m = 30/05/2024).
 *    Nunca "rola" para o mês seguinte (31/01 + 1m != 03/03).
 *  - O antigo modo "fim do mês" foi removido do cálculo; a coluna
 *    qualificacoes_tipos.vencimento_fim_mes é apenas legada e IGNORADA.
 *
 * Toda aritmética é UTC com componentes inteiros: independe do fuso do runtime.
 * Datas de entrada são dias civis `YYYY-MM-DD` (sufixo `T...`/` ...` é ignorado).
 *
 * Exceções regulatórias (ANAC data-base, CMA por idade, G1-SEM) decidem
 * *quantos* meses somar; a soma em si é sempre esta. ASO e CHT seguem a regra
 * do dia.
 */

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/;
const MAX_YEAR = 9999;

export interface CivilDay {
  year: number;
  /** 1..12 */
  month: number;
  day: number;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function format(year: number, month1: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Interpreta um dia civil ISO. Retorna null se malformado ou inexistente (ex.: 2024-02-30). */
export function parseCivilDay(value: unknown): CivilDay | null {
  if (typeof value !== 'string') return null;
  const m = ISO_DAY_RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function resolveTarget(dateValue: unknown, months: number): { base: CivilDay; year: number; month1: number } {
  const base = parseCivilDay(dateValue);
  if (!base) throw new Error(`Data inválida: ${String(dateValue)}`);
  if (!Number.isInteger(months) || months <= 0) {
    throw new Error(`Validade em meses deve ser inteiro maior que 0: ${String(months)}`);
  }
  const index = base.year * 12 + (base.month - 1) + months;
  const year = Math.floor(index / 12);
  if (year > MAX_YEAR) {
    throw new Error(`Data de vencimento fora do intervalo: ${String(dateValue)} + ${months}m`);
  }
  return { base, year, month1: (index % 12) + 1 };
}

/**
 * Soma `months` meses preservando o dia; limita ao último dia do mês-alvo.
 * Lança Error para data inválida ou meses não inteiros/<= 0.
 */
export function addCalendarMonthsClamped(dateValue: string, months: number): string {
  const { base, year, month1 } = resolveTarget(dateValue, months);
  return format(year, month1, Math.min(base.day, daysInMonth(year, month1)));
}

/** Variante que não lança: retorna null para entrada inválida. */
export function tryAddCalendarMonthsClamped(dateValue: unknown, months: unknown): string | null {
  try {
    return addCalendarMonthsClamped(dateValue as string, months as number);
  } catch {
    return null;
  }
}
