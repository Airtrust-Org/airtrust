/**
 * DS-01 — Configuração centralizada de status de escala
 * Token único para cores, labels, ícones e transições.
 * Importar em qualquer componente que precise de status info.
 */

import type { StatusEscala } from '../hooks/queries/useEscalasQuery';

export interface StatusConfig {
  label: string;
  /** Tailwind classes for badge */
  className: string;
  /** Tailwind bar color class */
  barColor: string;
  /** Tailwind dot color class */
  dotColor: string;
  /** Hex color for charts/custom rendering */
  hex: string;
  /** Lucide icon name */
  icon: string;
  /** Next status in the state machine */
  next?: StatusEscala;
  /** Action button label */
  actionLabel?: string;
  /** Action button icon name */
  actionIcon?: string;
}

export const STATUS_CONFIG: Record<StatusEscala, StatusConfig> = {
  rascunho: {
    label: 'Rascunho',
    className: 'border border-slate-200 bg-slate-50 text-slate-600',
    barColor: 'bg-slate-200',
    dotColor: 'bg-slate-400',
    hex: '#94a3b8',
    icon: 'file-edit',
    next: 'em_revisao',
    actionLabel: 'Enviar para Revisão',
    actionIcon: 'send',
  },
  em_revisao: {
    label: 'Em Revisão',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    barColor: 'bg-amber-300',
    dotColor: 'bg-amber-400',
    hex: '#f59e0b',
    icon: 'eye',
    next: 'aprovada',
    actionLabel: 'Aprovar Escala',
    actionIcon: 'check_circle',
  },
  aprovada: {
    label: 'Aprovada',
    className: 'bg-sky-50 text-sky-700 border border-sky-200',
    barColor: 'bg-sky-400',
    dotColor: 'bg-sky-500',
    hex: '#38bdf8',
    icon: 'check-circle',
    next: 'publicada',
    actionLabel: 'Publicar para Tripulantes',
    actionIcon: 'publish',
  },
  publicada: {
    label: 'Publicada',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    barColor: 'bg-emerald-400',
    dotColor: 'bg-emerald-500',
    hex: '#10b981',
    icon: 'send',
    next: 'arquivada',
    actionLabel: 'Arquivar Escala',
    actionIcon: 'archive',
  },
  arquivada: {
    label: 'Arquivada',
    className: 'border border-stone-200 bg-stone-100 text-stone-700',
    barColor: 'bg-stone-300',
    dotColor: 'bg-stone-400',
    hex: '#a8a29e',
    icon: 'archive',
  },
};

/** Get a status config safely (fallback to rascunho) */
export function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status as StatusEscala] ?? STATUS_CONFIG.rascunho;
}
