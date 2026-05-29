/**
 * Input Components - Inputs com acessibilidade completa
 *
 * Benefícios:
 * - ARIA labels para screen readers
 * - Error states acessíveis (aria-invalid)
 * - Helper text com aria-describedby
 * - Keyboard navigation
 * - Focus visible
 */

import { forwardRef, InputHTMLAttributes, useMemo } from 'react';
import { cn } from '@/react-app/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      required = false,
      icon,
      className,
      disabled,
      type = 'text',
      id,
      ...props
    },
    ref,
  ) => {
    // Gerar IDs únicos para acessibilidade
    const inputId = useMemo(() => id || `input-${Math.random().toString(36).slice(2)}`, [id]);
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const requiredId = `${inputId}-required`;

    const describedBy = [
      error ? errorId : null,
      helperText && !error ? helperId : null,
      required ? requiredId : null,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 mb-2">
            {label}
            {required && (
              <span id={requiredId} className="text-critical ml-1" aria-label="obrigatório">
                *
              </span>
            )}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={type}
            disabled={disabled}
            aria-invalid={!!error}
            aria-required={required}
            aria-describedby={describedBy || undefined}
            className={cn(
              'w-full px-4 py-2 border border-slate-300 rounded-lg',
              'focus-visible:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
              'transition-colors duration-200',
              'placeholder-slate-400 text-slate-900',
              'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
              error && 'border-red-400 focus:ring-red-400/30 focus:border-red-400',
              icon && 'pl-12',
              className,
            )}
            {...props}
          />

          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              {icon}
            </div>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1 text-sm font-medium text-critical flex items-center gap-1"
          >
            <span>⚠</span>
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={helperId} className="mt-1 text-sm text-slate-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

// TextArea variant com acessibilidade
interface TextAreaProps extends InputHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  rows?: number;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    { label, error, helperText, required = false, rows = 4, className, disabled, id, ...props },
    ref,
  ) => {
    const textareaId = useMemo(() => id || `textarea-${Math.random().toString(36).slice(2)}`, [id]);
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;
    const requiredId = `${textareaId}-required`;

    const describedBy = [
      error ? errorId : null,
      helperText && !error ? helperId : null,
      required ? requiredId : null,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-slate-700 mb-2">
            {label}
            {required && (
              <span id={requiredId} className="text-critical ml-1" aria-label="obrigatório">
                *
              </span>
            )}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          aria-invalid={!!error}
          aria-required={required}
          aria-describedby={describedBy || undefined}
          className={cn(
            'w-full px-4 py-2 border border-slate-300 rounded-lg',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            'transition-colors duration-200',
            'placeholder-slate-400 text-slate-900',
            'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
            'resize-vertical',
            error && 'border-red-400 focus:ring-red-400/30 focus:border-red-400',
            className,
          )}
          {...props}
        />

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1 text-sm font-medium text-critical flex items-center gap-1"
          >
            <span>⚠</span>
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={helperId} className="mt-1 text-sm text-slate-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

TextArea.displayName = 'TextArea';

// Select variant com acessibilidade
interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      required = false,
      options,
      className,
      disabled,
      id,
      placeholder,
      ...props
    },
    ref,
  ) => {
    const selectId = useMemo(() => id || `select-${Math.random().toString(36).slice(2)}`, [id]);
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;
    const requiredId = `${selectId}-required`;

    const describedBy = [
      error ? errorId : null,
      helperText && !error ? helperId : null,
      required ? requiredId : null,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-2">
            {label}
            {required && (
              <span id={requiredId} className="text-critical ml-1" aria-label="obrigatório">
                *
              </span>
            )}
          </label>
        )}

        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={!!error}
          aria-required={required}
          aria-describedby={describedBy || undefined}
          className={cn(
            'w-full px-4 py-2 border border-slate-300 rounded-lg',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            'transition-colors duration-200',
            'text-slate-900',
            'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
            'appearance-none bg-white pr-8',
            error && 'border-red-400 focus:ring-red-400/30 focus:border-red-400',
            className,
          )}
          {...props}
        >
          <option value="">{placeholder || 'Selecione uma opção'}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-1 text-sm font-medium text-critical flex items-center gap-1"
          >
            <span>⚠</span>
            {error}
          </p>
        )}

        {helperText && !error && (
          <p id={helperId} className="mt-1 text-sm text-slate-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
