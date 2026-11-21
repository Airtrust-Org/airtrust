import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/react-app/lib/utils';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'type'> {
  /** Nome acessível obrigatório (também usado como tooltip nativo). */
  label: string;
  /** Ícone decorativo; o componente aplica `aria-hidden`. */
  icon: ReactNode;
  variant?: 'ghost' | 'subtle' | 'danger';
  /** `md` mantém o alvo de toque mínimo de 44×44 px. */
  size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
}

const variantClasses: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  danger: 'text-red-700 hover:bg-red-50',
};

const sizeClasses: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'min-h-9 min-w-9',
  md: 'min-h-11 min-w-11',
};

/**
 * Botão somente com ícone. `label` é obrigatório no tipo, o que impede botões
 * sem nome acessível (WCAG 4.1.2).
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', type = 'button', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'at-focus inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      <span className="inline-flex" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
});
