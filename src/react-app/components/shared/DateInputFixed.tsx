import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';

interface DateInputFixedProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

const DateInputFixed: React.FC<DateInputFixedProps> = ({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  className = "",
  label,
  required = false,
  disabled = false,
  error
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (value) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          setDisplayValue(formatDateBR(date));
        }
      } catch {
        setDisplayValue('');
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const formatDateBR = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const parseDateBR = (dateStr: string): string | null => {
    const cleanStr = dateStr.replace(/[^\d/]/g, '');
    
    let masked = cleanStr;
    if (masked.length >= 2 && !masked.includes('/')) {
      masked = masked.substring(0, 2) + '/' + masked.substring(2);
    }
    if (masked.length >= 5 && masked.split('/').length === 2) {
      const parts = masked.split('/');
      masked = parts[0] + '/' + parts[1].substring(0, 2) + '/' + parts[1].substring(2);
    }

    if (masked.length === 10) {
      const [day, month, year] = masked.split('/').map(Number);
      
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
        try {
          const date = new Date(year, month - 1, day);
          if (date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year) {
            return date.toISOString().split('T')[0];
          }
        } catch {
          return null;
        }
      }
    }

    return null;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    const cleanValue = inputValue.replace(/[^\d/]/g, '');
    let maskedValue = cleanValue;

    if (maskedValue.length >= 3 && maskedValue.charAt(2) !== '/') {
      maskedValue = maskedValue.substring(0, 2) + '/' + maskedValue.substring(2);
    }
    if (maskedValue.length >= 6 && maskedValue.charAt(5) !== '/') {
      maskedValue = maskedValue.substring(0, 5) + '/' + maskedValue.substring(5);
    }
    
    if (maskedValue.length > 10) {
      maskedValue = maskedValue.substring(0, 10);
    }

    setDisplayValue(maskedValue);

    const isoDate = parseDateBR(maskedValue);
    if (isoDate) {
      onChange(isoDate);
    } else if (maskedValue === '') {
      onChange('');
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    
    if (displayValue) {
      const isoDate = parseDateBR(displayValue);
      if (isoDate) {
        onChange(isoDate);
        setDisplayValue(formatDateBR(new Date(isoDate)));
      } else {
        setDisplayValue('');
        onChange('');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End'
    ];

    if (allowedKeys.includes(e.key)) {
      return;
    }

    if (!/[\d/]/.test(e.key)) {
      e.preventDefault();
    }
  };

  const inputClasses = `
    w-full px-3 py-2 pr-10 border rounded-md focus-visible:outline-none focus:ring-2 focus:ring-primary/30
    ${error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500'}
    ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
    ${className}
  `.trim();

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={inputClasses}
          disabled={disabled}
          maxLength={10}
        />
        
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <Calendar className={`h-4 w-4 ${error ? 'text-red-400' : 'text-gray-400'}`} />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {isFocused && (
        <p className="text-xs text-gray-500">
          Digite no formato: dd/mm/aaaa (ex: 25/12/2024)
        </p>
      )}
    </div>
  );
};

export default DateInputFixed;
