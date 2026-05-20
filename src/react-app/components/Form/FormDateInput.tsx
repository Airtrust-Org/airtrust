/**
 * src/react-app/components/Form/FormDateInput.tsx
 * Componente de input de data com validação
 */

import React, { useState, useCallback } from 'react';
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
    [minDate, maxDate, onChange, onValidationError]
  );

  const displayError = error || validationError;

  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </span>
      </label>

      <input
        type="date"
        value={value}
        onChange={handleChange}
        min={minDate}
        max={maxDate}
        disabled={disabled}
        required={required}
        className={`w-full px-3 py-2 border rounded-lg transition-colors
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
          ${
            displayError
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:ring-primary/30'
          }
          focus:outline-none focus:ring-2
        `}
        aria-invalid={!!displayError}
        aria-describedby={displayError ? `${label}-error` : undefined}
      />

      {displayError && (
        <div
          id={`${label}-error`}
          className="flex items-center gap-1 text-red-500 text-sm mt-2"
        >
          <AlertCircle className="w-4 h-4" />
          {displayError}
        </div>
      )}

      {helperText && !displayError && (
        <p className="text-gray-500 text-sm mt-1">{helperText}</p>
      )}
    </div>
  );
}

function formatDateBR(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR');
}
