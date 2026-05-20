/**
 * ==========================================================================
 * SIMULADORES LAYOUT - DESIGN SYSTEM PADRONIZADO
 * ==========================================================================
 *
 * Layout wrapper para todas as páginas do módulo Simuladores
 * Baseado no Design System AirTrust v1.0
 *
 * Cores: CSS Variables (--color-*)
 * Fontes: Inter (--font-family-base)
 * Espaçamento: --spacing-*
 * Sombras: --shadow-*
 * ==========================================================================
 */

import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';

interface SimuladoresLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  backUrl?: string;
  loading?: boolean;
  className?: string;
}

export const SimuladoresLayout = ({
  children,
  title,
  subtitle,
  icon,
  actions,
  backUrl,
  loading = false,
  className = '',
}: SimuladoresLayoutProps) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Container Principal */}
      <div className={`max-w-[1400px] mx-auto px-6 py-8 ${className}`}>
        {/* Header */}
        <div className="mb-8">
          {/* Botão Voltar */}
          {backUrl && (
            <button
              onClick={() => navigate(backUrl)}
              className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          )}

          {/* Título e Ações */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Título com Ícone */}
            <div className="flex items-center gap-4">
              {icon && (
                <div className="flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-md">
                  {icon}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1 text-sm font-medium text-gray-600 dark:text-slate-400">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Ações */}
            {actions && <div className="flex items-center gap-3">{actions}</div>}
          </div>
        </div>

        {/* Conteúdo */}
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
};

/**
 * Card Padronizado do Design System
 */
interface SimuladoresCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

export const SimuladoresCard = ({
  children,
  className = '',
  padding = 'md',
  hover = false,
  onClick,
}: SimuladoresCardProps) => {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={`
        bg-white dark:bg-slate-900
        rounded-lg 
        border border-gray-200 dark:border-slate-800
        shadow-sm
        ${hover ? 'transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:hover:border-slate-700' : ''}
        ${paddingClasses[padding]}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

/**
 * Badge Padronizado
 */
interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}

export const Badge = ({ children, variant = 'neutral', size = 'md' }: BadgeProps) => {
  const variants = {
    success: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:border-yellow-500/30',
    error: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30',
    info: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30',
    neutral: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center
        font-medium
        rounded-full
        border
        ${variants[variant]}
        ${sizes[size]}
      `}
    >
      {children}
    </span>
  );
};

/**
 * Stat Card - Card de Estatística
 */
interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'info' | 'purple';
  trend?: {
    value: string;
    isPositive: boolean;
  };
  onClick?: () => void;
}

export const StatCard = ({
  title,
  value,
  icon,
  variant = 'primary',
  trend,
  onClick,
}: StatCardProps) => {
  const variants = {
    primary: {
      bg: 'from-blue-50 to-blue-100',
      border: 'border-blue-200',
      text: 'text-blue-700',
      valueText: 'text-blue-900',
      iconBg: 'bg-blue-500',
    },
    success: {
      bg: 'from-green-50 to-green-100',
      border: 'border-green-200',
      text: 'text-green-700',
      valueText: 'text-green-900',
      iconBg: 'bg-green-500',
    },
    warning: {
      bg: 'from-yellow-50 to-yellow-100',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      valueText: 'text-yellow-900',
      iconBg: 'bg-yellow-500',
    },
    info: {
      bg: 'from-cyan-50 to-cyan-100',
      border: 'border-cyan-200',
      text: 'text-cyan-700',
      valueText: 'text-cyan-900',
      iconBg: 'bg-cyan-500',
    },
    purple: {
      bg: 'from-purple-50 to-purple-100',
      border: 'border-purple-200',
      text: 'text-purple-700',
      valueText: 'text-purple-900',
      iconBg: 'bg-purple-500',
    },
  };

  const style = variants[variant];

  return (
    <SimuladoresCard
      className={`bg-gradient-to-br ${style.bg} ${style.border} ${onClick ? 'cursor-pointer' : ''}`}
      padding="md"
      onClick={onClick}
      hover={!!onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className={`text-sm font-medium ${style.text} mb-1`}>{title}</p>
          <p className={`text-2xl font-bold ${style.valueText}`}>{value}</p>
          {trend && (
            <p
              className={`text-xs font-medium mt-2 ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {trend.isPositive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className={`flex items-center justify-center w-12 h-12 ${style.iconBg} rounded-lg`}>
          {icon}
        </div>
      </div>
    </SimuladoresCard>
  );
};

/**
 * Empty State - Estado Vazio
 */
interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => {
  return (
    <SimuladoresCard padding="lg">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        {description && <p className="text-sm text-gray-600 mb-6 max-w-md">{description}</p>}
        {action && <div>{action}</div>}
      </div>
    </SimuladoresCard>
  );
};
