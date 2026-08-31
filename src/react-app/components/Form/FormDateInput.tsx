/**
 * src/react-app/components/Form/FormDateInput.tsx
 * Componente de input de data com validação
 */

import React, { useCallback, useId, useState } from 'react';
import { AlertCircle, Calendar } from 'lucide-react';

interface FormDateInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  onValidationError?: (error: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  className?: string;
}

export function FormDateInput({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  onValidationError,
  error,
  required = false,
  disabled = false,
  helperText,
  className = '',
}: FormDateInputProps) {
  const [validationError, setValidationError] = useState<string>('');
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      if (!newValue) {
        setValidationError('');
        onChange(newValue);
        return;
      }

      const date = new Date(newValue + 'T00:00:00');
      let currentError = '';

      // Validar minDate
      if (minDate) {
        const min = new Date(minDate + 'T00:00:00');
        if (date < min) {
          currentError = `Data não pode ser anterior a ${formatDateBR(minDate)}`;
        }
      }

      // Validar maxDate
      if (!currentError && maxDate) {
        const max = new Date(maxDate + 'T00:00:00');
        if (date > max) {
          currentError = `Data não pode ser posterior a ${formatDateBR(maxDate)}`;
        }
      }

      setValidationError(currentError);
      if (currentError) {
        onValidationError?.(currentError);
      }

      onChange(newValue);
    },
    [minDate, maxDate, onChange, onValidationError],
  );

  const displayError = error || validationError;
  const describedBy = displayError ? errorId : helperText ? helperId : undefined;

  return (
    <div className={`mb-4 ${className}`}>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-gray-700">
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          {label}
          {required && (
            <span className="ml-1" style={{ color: 'var(--at-critical)' }} aria-hidden="true">
              *
            </span>
          )}
        </span>
      </label>

      <input
        id={inputId}
        type="date"
        value={value}
        onChange={handleChange}
        min={minDate}
        max={maxDate}
        disabled={disabled}
        required={required}
        className="at-field at-focus min-h-11 w-full rounded-lg border px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={displayError ? { borderColor: 'var(--at-critical)' } : undefined}
        aria-invalid={!!displayError}
        aria-describedby={describedBy}
      />

      {displayError && (
        <div
          id={errorId}
          className="mt-2 flex items-center gap-1 text-sm"
          style={{ color: 'var(--at-critical)' }}
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {displayError}
        </div>
      )}

      {helperText && !displayError && (
        <p id={helperId} className="at-muted mt-1 text-sm">
          {helperText}
        </p>
      )}
    </div>
  );
}

function formatDateBR(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR');
}
