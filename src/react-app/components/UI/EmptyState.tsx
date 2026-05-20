/**
 * EmptyState Component - Estados vazios contextuais
 *
 * Benefícios:
 * - Variants contextuais (default, search, error)
 * - Cores semânticas
 * - Ícones customizáveis
 * - Ações primárias e secundárias
 * - Mensagens personalizadas
 */

import { ReactNode } from 'react';
import { Button } from './Button';

type EmptyStateVariant = 'default' | 'search' | 'error' | 'success' | 'info';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    icon?: ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  variant?: EmptyStateVariant;
}

/**
 * Configuração de cores por variant
 */
const variantConfig = {
  default: {
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-400',
    titleColor: 'text-slate-900',
    descriptionColor: 'text-slate-600',
  },
  search: {
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-500',
    titleColor: 'text-slate-900',
    descriptionColor: 'text-slate-600',
  },
  error: {
    iconBg: 'bg-red-100',
    iconColor: 'text-red-500',
    titleColor: 'text-slate-900',
    descriptionColor: 'text-slate-600',
  },
  success: {
    iconBg: 'bg-green-100',
    iconColor: 'text-green-500',
    titleColor: 'text-slate-900',
    descriptionColor: 'text-slate-600',
  },
  info: {
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-500',
    titleColor: 'text-slate-900',
    descriptionColor: 'text-slate-600',
  },
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'default',
}: EmptyStateProps) {
  const config = variantConfig[variant];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* Ícone com background colorido */}
      <div className={`mb-4 p-3 rounded-full ${config.iconBg}`}>
        <div className={`text-5xl ${config.iconColor}`}>{icon}</div>
      </div>

      {/* Título */}
      <h3 className={`text-lg font-semibold mb-2 ${config.titleColor}`}>{title}</h3>

      {/* Descrição */}
      {description && (
        <p className={`text-sm mb-6 max-w-sm ${config.descriptionColor}`}>{description}</p>
      )}

      {/* Ações */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant || 'primary'}
              leftIcon={action.icon}
            >
              {action.label}
            </Button>
          )}

          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant="secondary"
              leftIcon={secondaryAction.icon}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
