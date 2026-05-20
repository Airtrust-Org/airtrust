/**
 * ANAC RBAC 135 — Regra da "Data Base" + Janela de 90 Dias
 *
 * Este módulo implementa o cálculo correto do próximo vencimento (Next Due Date)
 * de qualificações de pilotos para operadores de helicóptero (AW139 / SK76),
 * conforme a regulamentação da ANAC para operadores RBAC 135.
 *
 * PROBLEMA QUE ESTA FUNÇÃO RESOLVE:
 * O erro mais comum em sistemas TMS é calcular o vencimento simplesmente somando
 * meses à data de realização do cheque. Isso "rouba" dias do piloto quando ele
 * faz o cheque adiantado. A ANAC protege a "Data Base" do tripulante: se ele faz
 * o cheque dentro da janela de 90 dias antes do vencimento, o ciclo começa a
 * contar a partir da Data Base original — não da data de realização.
 *
 * DEFINIÇÃO DA JANELA DE RENOVAÇÃO (ANAC RBAC 135):
 * O piloto NÃO perde a Data Base se realizar o cheque no mês de vencimento
 * ou nos 2 meses calendários imediatamente anteriores (janela total = 3 meses).
 *
 *   Exemplo: Data Base em JUNHO → janela = 1°/ABRIL até último dia de JUNHO.
 *   O windowStart é sempre o 1° dia do mês (base.mês − 2).
 *
 * QUALIFICAÇÕES SUPORTADAS (RBAC 135):
 *   - FAP 05.2 / 135.293  → Habilitação de Tipo          (ciclo: 12 meses)
 *   - FAP 06   / 135.297  → Habilitação Voo Instrumentos  (ciclo:  6 meses)
 *   - FAP 14   / 135.297  → Exame em Rota — IFR           (ciclo:  6 meses)
 *   - FAP 14   / 135.293  → Exame em Rota — Tipo Visual   (ciclo: 12 meses)
 *
 * SEPARAÇÃO FAP 14 POR PARÁGRAFO:
 * A FAP 14 deve ser gerenciada com dois registros distintos (135.297 e 135.293).
 * Isso evita que a reprovação no IFR (6m) bloqueie o voo visual se o Tipo (12m)
 * ainda estiver válido.
 *
 * @module utils/anac-data-base
 */

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ─────────────────────────────────────────────────────────────────────────────

/** Ciclo da qualificação em meses */
export type CycleMonths = 6 | 12;

/** Caso da janela de renovação aplicado */
export type WindowCase =
  | 'NO_BASE'       // Primeiro registro — sem Data Base anterior
  | 'WITHIN_WINDOW' // Realizado dentro da janela (mês do vencimento + 2 meses anteriores) — Data Base PROTEGIDA
  | 'BEFORE_WINDOW' // Realizado antes da janela (> 3 meses antes) — nova base criada
  | 'AFTER_BASE';   // Realizado com atraso (após vencimento) — base anterior perdida

export interface NextDueDateInput {
  /** Data de realização do cheque (ISO: YYYY-MM-DD) */
  completionDate: string;
  /**
   * Vencimento atual do piloto — "Data Base" — (ISO: YYYY-MM-DD).
   * Omitir apenas no primeiro registro do piloto para esta qualificação.
   *
   * ⚠️ NORMALIZAÇÃO AUTOMÁTICA: se a data informada não cair no último dia do
   * mês (ex.: "2026-06-15"), a função a corrige internamente para "2026-06-30"
   * antes de iniciar qualquer cálculo. Isso garante consistência quando o
   * banco de dados armazenar uma data ligeiramente diferente do padrão.
   */
  currentBaseDate?: string | null;
  /** Ciclo: 6 meses (IFR/135.297) ou 12 meses (Tipo/135.293) */
  cycleMonths: CycleMonths;
}

export interface NextDueDateResult {
  /** Nova data base (vencimento) em ISO (YYYY-MM-DD) */
  newBaseDateISO: string;
  /** Nova data base em formato BR (DD/MM/YYYY) */
  newBaseDateBR: string;
  /** Caso da janela aplicado */
  case: WindowCase;
  /** Descrição legível do caso para logs e auditoria */
  description: string;
  /** Início da janela de 90 dias (ISO) — null se sem base anterior */
  windowStartISO: string | null;
  /**
   * Dias de antecipação em relação ao vencimento anterior.
   * Positivo = adiantado, Negativo = atrasado, Null = sem base anterior.
   */
  daysRelativeToBase: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS (sem efeito de timezone — trabalhamos em UTC midnight)
// ─────────────────────────────────────────────────────────────────────────────

/** Parseia ISO YYYY-MM-DD em Date UTC midnight */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Data ISO inválida: "${iso}"`);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formata Date UTC para ISO YYYY-MM-DD */
function toISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Formata Date UTC para DD/MM/YYYY */
function toBR(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Adiciona N meses a uma data UTC, sem overflow de dia.
 * Usa dia 1 do mês alvo; o ajuste para último dia fica em adjustToEndOfMonth.
 */
function addMonthsUTC(date: Date, months: number): Date {
  const totalMonths = date.getUTCMonth() + months;
  const targetYear  = date.getUTCFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12; // garante positivo
  return new Date(Date.UTC(targetYear, targetMonth, 1));
}

/**
 * REGRA DO ÚLTIMO DIA DO MÊS (Mês de Graça — padrão ANAC)
 *
 * Toda Data Base deve terminar no último dia do mês para facilitar a
 * fiscalização. Ex.: cálculo resulta em qualquer dia de junho → 30/06.
 *
 * Implementação: Date.UTC(ano, mês+1, 0) retorna o último dia do mês `mês`.
 */
function adjustToEndOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/** Subtrai N dias de uma data UTC */
function subtractDaysUTC(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86400000);
}

/**
 * Início da janela de renovação ANAC: 1° dia do 2° mês anterior à Data Base.
 *
 * Regra: o piloto não perde a Data Base se realizar o cheque no mês de
 * vencimento ou nos 2 meses calendários anteriores (janela = 3 meses).
 *
 * Exemplo: base = 30/06 → windowStart = 01/04 (primeiro dia de abril).
 */
function startOfWindowUTC(base: Date): Date {
  const totalMonths = base.getUTCMonth() - 2;
  const targetYear  = base.getUTCFullYear() + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;
  return new Date(Date.UTC(targetYear, targetMonth, 1));
}

/** Diferença em dias inteiros entre duas datas UTC (b − a) */
function daysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * calculateNextQualificationExpiry
 *
 * Calcula o próximo vencimento ("Next Due Date") de uma qualificação de piloto,
 * aplicando a regra da Data Base e a Janela de 90 Dias da ANAC (RBAC 135).
 *
 * PROTEÇÃO DA DATA BASE (Caso 1 — WITHIN_WINDOW):
 * Quando o piloto realiza o cheque dentro da janela de renovação (mês de vencimento
 * + 2 meses calendários anteriores), o novo vencimento é calculado a partir da
 * Data Base original (não da data de realização). Isso preserva o ciclo do piloto
 * e impede que ele "perca" dias ao renovar preventivamente.
 *
 * Exemplo: Data Base = 30/06/2026, ciclo 6 meses. Piloto realiza em 16/05/2026
 * (45 dias antes). Sem a proteção: venceria em 30/11/2026 (perde 45 dias).
 * COM a proteção: venceria em 31/12/2026 (base original preservada).
 *
 * @param input - Parâmetros da qualificação
 * @returns Resultado com nova data base e diagnóstico do caso
 *
 * @example — Cheque dentro da janela (45 dias antes):
 * calculateNextQualificationExpiry({
 *   completionDate:  '2026-05-16',
 *   currentBaseDate: '2026-06-30',
 *   cycleMonths: 6,
 * })
 * // → { newBaseDateISO: '2026-12-31', case: 'WITHIN_WINDOW', daysRelativeToBase: 45 }
 */
export function calculateNextQualificationExpiry(input: NextDueDateInput): NextDueDateResult {
  const { completionDate, currentBaseDate, cycleMonths } = input;

  const completion = parseISO(completionDate);

  // ── Sem Data Base anterior (primeiro registro do piloto) ─────────────────
  if (!currentBaseDate) {
    const raw    = addMonthsUTC(completion, cycleMonths);
    const newBase = adjustToEndOfMonth(raw);
    return {
      newBaseDateISO: toISO(newBase),
      newBaseDateBR:  toBR(newBase),
      case: 'NO_BASE',
      description: `Primeiro registro. Base criada: ${toBR(completion)} + ${cycleMonths}m → ${toBR(newBase)} (último dia do mês).`,
      windowStartISO: null,
      daysRelativeToBase: null,
    };
  }

  const baseParsed  = parseISO(currentBaseDate);
  // ── NORMALIZAÇÃO: forçar Data Base para o último dia do seu mês ─────────
  // Garante que uma base "2026-06-15" seja tratada como "2026-06-30" antes
  // de qualquer comparação ou cálculo, conforme requisito ANAC RBAC 135.
  const base        = adjustToEndOfMonth(baseParsed);
  const windowStart = startOfWindowUTC(base); // 1° dia do 2° mês anterior à base

  // Positivo = antecipado, Negativo = atrasado (em relação à data base normalizada)
  const daysRelativeToBase = daysDiff(completion, base);

  // ── CASO 3: Atrasado — realizou APÓS o vencimento ───────────────────────
  // A Data Base original foi perdida. O ciclo reinicia a partir da realização.
  if (completion > base) {
    const raw     = addMonthsUTC(completion, cycleMonths);
    const newBase = adjustToEndOfMonth(raw);
    return {
      newBaseDateISO: toISO(newBase),
      newBaseDateBR:  toBR(newBase),
      case: 'AFTER_BASE',
      description: `Realizado ${Math.abs(daysRelativeToBase)} dia(s) APÓS o vencimento (${toBR(base)}). Data Base perdida. Nova base: ${toBR(completion)} + ${cycleMonths}m → ${toBR(newBase)}.`,
      windowStartISO: toISO(windowStart),
      daysRelativeToBase,
    };
  }

  // ── CASO 1: Dentro da Janela (3 meses: mês de vencimento + 2 anteriores) ─
  // completionDate está entre windowStart (1° do 2° mês anterior) e base.
  //
  // ✅ PROTEÇÃO DA DATA BASE:
  // O novo vencimento parte da base normalizada, NÃO da data de realização.
  // O piloto não perde os dias de antecipação.
  if (completion >= windowStart) {
    const raw     = addMonthsUTC(base, cycleMonths); // ← base normalizada, não completion
    const newBase = adjustToEndOfMonth(raw);
    return {
      newBaseDateISO: toISO(newBase),
      newBaseDateBR:  toBR(newBase),
      case: 'WITHIN_WINDOW',
      description: `Realizado ${daysRelativeToBase} dia(s) antes do vencimento (dentro da janela — a partir de ${toBR(windowStart)}). ✅ Data Base protegida: ${toBR(base)} + ${cycleMonths}m → ${toBR(newBase)}.`,
      windowStartISO: toISO(windowStart),
      daysRelativeToBase,
    };
  }

  // ── CASO 2: Fora da Janela — muito antecipado ────────────────────────────
  // completionDate é anterior a windowStart (mais de 3 meses antes do vencimento).
  // Uma nova base é criada a partir da data de realização.
  const raw     = addMonthsUTC(completion, cycleMonths);
  const newBase = adjustToEndOfMonth(raw);
  return {
    newBaseDateISO: toISO(newBase),
    newBaseDateBR:  toBR(newBase),
    case: 'BEFORE_WINDOW',
    description: `Realizado ${daysRelativeToBase} dia(s) antes do vencimento (FORA da janela — janela inicia em ${toBR(windowStart)}). Nova base: ${toBR(completion)} + ${cycleMonths}m → ${toBR(newBase)}.`,
    windowStartISO: toISO(windowStart),
    daysRelativeToBase,
  };
}
