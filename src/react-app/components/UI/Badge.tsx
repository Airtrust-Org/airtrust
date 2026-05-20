import { HTMLAttributes } from 'react';
import { cn } from '@/react-app/lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',

        // Variant styles
        {
          'bg-slate-100 text-slate-800': variant === 'default',
          'bg-success-light text-green-800': variant === 'success',
          'bg-warning-light text-yellow-800': variant === 'warning',
          'bg-critical-light text-red-800': variant === 'danger',
          'bg-primary-light text-blue-800': variant === 'info',
        },

        // Size styles
        {
          'px-2 py-0.5 text-xs': size === 'sm',
          'px-2.5 py-0.5 text-sm': size === 'md',
        },

        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
