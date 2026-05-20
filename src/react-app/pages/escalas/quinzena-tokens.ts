// FIX: [BUG 5] - Quinzena helpers now support compact Q1/Q2 labels without line breaks.

import { Q1, Q2 } from './constants/escalaTokens';

export const QUINZENA_TOKENS = {
  q1: {
    bg: Q1.bg,
    text: Q1.text,
    border: Q1.border,
    accent: Q1.accent,
    accentText: 'text-white',
    pill: Q1.pill,
    pillActive: Q1.pillActive,
  },
  q2: {
    bg: Q2.bg,
    text: Q2.text,
    border: Q2.border,
    accent: Q2.accent,
    accentText: 'text-white',
    pill: Q2.pill,
    pillActive: Q2.pillActive,
  },
} as const;

export function getQuinzenaToken(quinzenaNumero: number | string | null | undefined) {
  const n = Number(quinzenaNumero);
  return n === 2 ? QUINZENA_TOKENS.q2 : QUINZENA_TOKENS.q1;
}

export function getQuinzenaNumero(quinzena: number | string | null | undefined): 1 | 2 | null {
  if (quinzena == null) return null;
  if (typeof quinzena === 'number') return quinzena === 2 ? 2 : 1;

  const normalized = String(quinzena).trim().toLowerCase();
  if (!normalized) return null;
  if (['2', '2q', '2ª', '2a', 'segunda', 'segunda quinzena'].includes(normalized)) return 2;
  if (['1', '1q', '1ª', '1a', 'primeira', 'primeira quinzena'].includes(normalized)) return 1;
  return null;
}

export function getQuinzenaShortLabel(
  quinzena: number | string | null | undefined,
): '1Q' | '2Q' | null {
  const numero = getQuinzenaNumero(quinzena);
  if (numero === 1) return Q1.short;
  if (numero === 2) return Q2.short;
  return null;
}

export function getQuinzenaBadgeClasses(
  quinzena: number | string | null | undefined,
  active = false,
): string {
  const numero = getQuinzenaNumero(quinzena);
  if (!numero) return active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600';
  const token = getQuinzenaToken(numero);
  return active ? `${token.accent} ${token.accentText}` : `${token.bg} ${token.text}`;
}

export function isQ1(label: string | null | undefined): boolean {
  const normalized = String(label || '')
    .trim()
    .toUpperCase();
  return normalized.startsWith('1') || normalized.startsWith('Q1');
}

/** Format ISO date (YYYY-MM-DD) to "DD/MM/YYYY" */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

export function fmtDateRange(
  dataInicio: string | null | undefined,
  dataFim: string | null | undefined,
): string {
  if (!dataInicio || !dataFim) return 'Defina o período';
  if (dataInicio === dataFim) return fmtDateShort(dataInicio);
  return `${fmtDateShort(dataInicio)} → ${fmtDateShort(dataFim)}`;
}
