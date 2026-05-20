/**
 * StatusBadge — Badges de status para todos os módulos do AirTrust
 *
 * Substitui as 3 implementações locais de badge de status espalhadas pelo sistema.
 * Use este componente para qualificações, FRMS, SGSO, escalas, etc.
 *
 * Uso:
 *   <StatusBadge status="VALIDA" />
 *   <StatusBadge status="VENCIDA" />
 *   <StatusBadge status="A_VENCER" />
 */

import { cn } from '@/react-app/lib/utils';

// ===== TIPOS DE STATUS =====

// Qualificações / Certificados
export type QualificacaoStatus =
  | 'VALIDA'
  | 'VENCIDA'
  | 'A_VENCER'
  | 'PENDENTE'
  | 'NAO_POSSUI'
  | 'RENOVADA';

// FRMS — Fadiga
export type FrmsStatus = 'APTO' | 'ATENCAO' | 'ALERTA' | 'CRITICO' | 'INDISPONIVEL';

// SGSO
export type SgsoStatus =
  | 'ABERTO'
  | 'EM_ANALISE'
  | 'FECHADO'
  | 'CANCELADO'
  | 'IMPLEMENTADO'
  | 'PENDENTE';

// Escalas
export type EscalaStatus = 'ATIVO' | 'FOLGA' | 'FERIAS' | 'AFASTADO' | 'LICENCA';

// Genérico
export type GenericStatus = 'ATIVO' | 'INATIVO' | 'SUSPENSO' | 'APROVADO' | 'REPROVADO';

type AllStatus =
  | QualificacaoStatus
  | FrmsStatus
  | SgsoStatus
  | EscalaStatus
  | GenericStatus
  | string;

// ===== MAPEAMENTO VISUAL =====

interface StatusConfig {
  label: string;
  className: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // Qualificações
  VALIDA: { label: 'Válida', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  VENCIDA: { label: 'Vencida', className: 'bg-red-50 text-red-700 ring-red-600/20' },
  A_VENCER: { label: 'A vencer', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  PENDENTE: { label: 'Pendente', className: 'bg-slate-50 text-slate-600 ring-slate-500/20' },
  NAO_POSSUI: { label: 'Não possui', className: 'bg-slate-50 text-slate-500 ring-slate-400/20' },
  RENOVADA: { label: 'Renovada', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },

  // FRMS
  APTO: { label: 'Apto', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  ATENCAO: { label: 'Atenção', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  ALERTA: { label: 'Alerta', className: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
  CRITICO: { label: 'Crítico', className: 'bg-red-50 text-red-700 ring-red-600/20' },
  INDISPONIVEL: {
    label: 'Indisponível',
    className: 'bg-slate-50 text-slate-600 ring-slate-500/20',
  },

  // SGSO
  ABERTO: { label: 'Aberto', className: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  EM_ANALISE: { label: 'Em análise', className: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
  FECHADO: { label: 'Fechado', className: 'bg-slate-50 text-slate-600 ring-slate-500/20' },
  CANCELADO: { label: 'Cancelado', className: 'bg-red-50 text-red-600 ring-red-500/20' },
  IMPLEMENTADO: {
    label: 'Implementado',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },

  // Escalas
  ATIVO: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  FOLGA: { label: 'Folga', className: 'bg-slate-50 text-slate-600 ring-slate-500/20' },
  FERIAS: { label: 'Férias', className: 'bg-blue-50 text-blue-600 ring-blue-500/20' },
  AFASTADO: { label: 'Afastado', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  LICENCA: { label: 'Licença', className: 'bg-violet-50 text-violet-600 ring-violet-500/20' },

  // Genérico
  INATIVO: { label: 'Inativo', className: 'bg-slate-50 text-slate-500 ring-slate-400/20' },
  SUSPENSO: { label: 'Suspenso', className: 'bg-orange-50 text-orange-700 ring-orange-600/20' },
  APROVADO: { label: 'Aprovado', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  REPROVADO: { label: 'Reprovado', className: 'bg-red-50 text-red-700 ring-red-600/20' },
};

// ===== COMPONENTE =====

interface StatusBadgeProps {
  status: AllStatus;
  /** Sobrescreve o label padrão */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
  /** Mostra um ponto colorido antes do texto */
  dot?: boolean;
}

export function StatusBadge({
  status,
  label,
  size = 'sm',
  className,
  dot = false,
}: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    className: 'bg-slate-50 text-slate-600 ring-slate-500/20',
  };

  const displayLabel = label ?? config.label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        config.className,
        className,
      )}
    >
      {dot && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70"
          aria-hidden="true"
        />
      )}
      {displayLabel}
    </span>
  );
}
