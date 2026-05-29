/**
 * Button Component - Botão com múltiplas variantes e acessibilidade
 *
 * Benefícios:
 * - isLoading state com spinner animado
 * - loadingText customizável
 * - Keyboard navigation (Enter, Space)
 * - aria-busy para screen readers
 * - Múltiplas variantes e tamanhos
 */

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/react-app/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  isLoading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  ariaLabel?: string;
}

/**
 * Spinner SVG reutilizável
 */
function LoadingSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  isLoading,
  loadingText = 'Carregando...',
  fullWidth,
  className,
  disabled,
  ariaLabel,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        // Base styles
        'inline-flex items-center justify-center gap-2 rounded-md font-medium',
        'transition-transform duration-100 ease-out active:scale-[0.97]',
        'focus-visible:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-inset',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',

        // Variant styles
        {
          'bg-primary text-white hover:bg-primary-700 focus:ring-primary shadow-sm':
            variant === 'primary',
          'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus:ring-slate-600':
            variant === 'secondary',
          'text-slate-700 hover:bg-slate-100 focus:ring-slate-500 dark:text-slate-100 dark:hover:bg-slate-800 dark:focus:ring-slate-600':
            variant === 'ghost',
          'bg-critical text-white hover:bg-red-600 focus:ring-critical shadow-sm':
            variant === 'danger',
        },

        // Size styles
        {
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-6 text-base': size === 'lg',
        },

        // Full width
        fullWidth && 'w-full',

        className,
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      aria-label={ariaLabel}
      {...props}
    >
      {isLoading ? (
        <>
          <LoadingSpinner />
          {loadingText}
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}
