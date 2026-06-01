import type { FocusEvent, InputHTMLAttributes } from 'react';
import {
  normalizeTimeInput,
  sanitizeTimeInputForTyping,
  formatTimeInputForDisplay,
} from '@/react-app/lib/time-input';

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'>;

interface TimeInputProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  invalidMessage?: string;
}

const DEFAULT_INVALID_MESSAGE = 'Informe um horário válido no formato HH:mm (00:00 até 23:59).';

export default function TimeInput({
  value,
  onChange,
  onBlur,
  invalidMessage = DEFAULT_INVALID_MESSAGE,
  placeholder = 'HH:mm',
  inputMode = 'numeric',
  maxLength = 5,
  ...props
}: TimeInputProps) {
  const handleChange = (nextValue: string) => {
    onChange(sanitizeTimeInputForTyping(nextValue));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.value;
    const trimmed = raw.trim();
    if (!trimmed) {
      event.currentTarget.setCustomValidity('');
      onChange('');
      onBlur?.(event);
      return;
    }

    const normalized = normalizeTimeInput(trimmed);
    if (!normalized) {
      event.currentTarget.setCustomValidity(invalidMessage);
      event.currentTarget.reportValidity();
      onBlur?.(event);
      return;
    }

    event.currentTarget.setCustomValidity('');
    onChange(formatTimeInputForDisplay(normalized));
    onBlur?.(event);
  };

  return (
    <input
      {...props}
      type="text"
      value={value}
      inputMode={inputMode}
      placeholder={placeholder}
      maxLength={maxLength}
      onInput={(event) => event.currentTarget.setCustomValidity('')}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={handleBlur}
      autoComplete="off"
      title={invalidMessage}
    />
  );
}
