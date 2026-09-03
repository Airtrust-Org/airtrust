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

const SUCCESS = 'at-status-success ring-current/20';
const ATTENTION = 'at-status-attention ring-current/20';
const RISK = 'at-status-risk ring-current/20';
const CRITICAL = 'at-status-critical ring-current/20';
const INFO = 'at-status-info ring-current/20';
const NEUTRAL = 'bg-slate-50 text-slate-600 ring-slate-500/20';
const NEUTRAL_SUBTLE = 'bg-slate-50 text-slate-500 ring-slate-400/20';

const STATUS_MAP: Record<string, StatusConfig> = {
  // Qualificações
  VALIDA: { label: 'Válida', className: SUCCESS },
  VENCIDA: { label: 'Vencida', className: CRITICAL },
  A_VENCER: { label: 'A vencer', className: ATTENTION },
  PENDENTE: { label: 'Pendente', className: NEUTRAL },
  NAO_POSSUI: { label: 'Não possui', className: NEUTRAL_SUBTLE },
  RENOVADA: { label: 'Renovada', className: INFO },

  // FRMS
  APTO: { label: 'Apto', className: SUCCESS },
  ATENCAO: { label: 'Atenção', className: ATTENTION },
  ALERTA: { label: 'Alerta', className: RISK },
  CRITICO: { label: 'Crítico', className: CRITICAL },
  INDISPONIVEL: { label: 'Indisponível', className: NEUTRAL },

  // SGSO
  ABERTO: { label: 'Aberto', className: INFO },
  EM_ANALISE: { label: 'Em análise', className: INFO },
  FECHADO: { label: 'Fechado', className: NEUTRAL },
  CANCELADO: { label: 'Cancelado', className: CRITICAL },
  IMPLEMENTADO: { label: 'Implementado', className: SUCCESS },

  // Escalas
  ATIVO: { label: 'Ativo', className: SUCCESS },
  FOLGA: { label: 'Folga', className: NEUTRAL },
  FERIAS: { label: 'Férias', className: INFO },
  AFASTADO: { label: 'Afastado', className: ATTENTION },
  LICENCA: { label: 'Licença', className: INFO },

  // Genérico
  INATIVO: { label: 'Inativo', className: NEUTRAL_SUBTLE },
  SUSPENSO: { label: 'Suspenso', className: RISK },
  APROVADO: { label: 'Aprovado', className: SUCCESS },
  REPROVADO: { label: 'Reprovado', className: CRITICAL },
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
    className: NEUTRAL,
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
