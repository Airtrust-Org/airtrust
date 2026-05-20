import { useState, useEffect } from 'react';
import InputMask from 'react-input-mask';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  disabled = false,
  required = false,
  className = '',
  id,
  name
}) => {
  const [internalValue, setInternalValue] = useState(value || '');
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setInternalValue(value || '');
  }, [value]);

  const validateDate = (dateStr: string): { isValid: boolean; errorMessage: string } => {
    if (!dateStr || dateStr.includes('_')) {
      return { isValid: true, errorMessage: '' }; // Incomplete date is ok during typing
    }

    const cleanDate = dateStr.replace(/[^\d]/g, '');
    if (cleanDate.length !== 8) {
      return { isValid: false, errorMessage: 'Data deve ter 8 dígitos' };
    }

    const day = parseInt(cleanDate.substring(0, 2));
    const month = parseInt(cleanDate.substring(2, 4));
    const year = parseInt(cleanDate.substring(4, 8));

    if (day < 1 || day > 31) {
      return { isValid: false, errorMessage: 'Dia deve estar entre 01 e 31' };
    }
    if (month < 1 || month > 12) {
      return { isValid: false, errorMessage: 'Mês deve estar entre 01 e 12' };
    }
    if (year < 1900 || year > 2100) {
      return { isValid: false, errorMessage: 'Ano deve estar entre 1900 e 2100' };
    }

    const jsDate = new Date(year, month - 1, day);
    if (jsDate.getFullYear() !== year || jsDate.getMonth() !== month - 1 || jsDate.getDate() !== day) {
      return { isValid: false, errorMessage: 'Data inválida' };
    }

    return { isValid: true, errorMessage: '' };
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInternalValue(newValue);

    const validation = validateDate(newValue);
    setIsValid(validation.isValid);
    setErrorMessage(validation.errorMessage);

    if (validation.isValid) {
      if (newValue.includes('_') || newValue === '') {
        onChange(''); // Incomplete date
      } else {
        const cleanDate = newValue.replace(/[^\d]/g, '');
        if (cleanDate.length === 8) {
          const day = cleanDate.substring(0, 2);
          const month = cleanDate.substring(2, 4);
          const year = cleanDate.substring(4, 8);
          const isoDate = `${year}-${month}-${day}`;
          onChange(isoDate);
        }
      }
    }
  };

  const handleBlur = () => {
    const validation = validateDate(internalValue);
    setIsValid(validation.isValid);
    setErrorMessage(validation.errorMessage);
  };

  const formatDisplayValue = (val: string): string => {
    if (!val) return '';
    
    if (val.includes('/')) return val;
    
    if (val.includes('-') && val.length === 10) {
      const [year, month, day] = val.split('-');
      return `${day}/${month}/${year}`;
    }
    
    return val;
  };

  const baseClasses = `
    block w-full px-3 py-2 border rounded-md shadow-sm 
    focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-transparent
    disabled:opacity-50 disabled:bg-gray-100
    ${isValid ? 'border-gray-300' : 'border-red-300 bg-red-50'}
    ${className}
  `.trim();

  return (
    <div className="relative">
      <InputMask
        mask="99/99/9999"
        maskChar="_"
        value={formatDisplayValue(internalValue)}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={baseClasses}
        id={id}
        name={name}
        autoComplete="off"
      />
      
      {!isValid && errorMessage && (
        <div className="absolute top-full left-0 mt-1 text-sm text-red-600">
          {errorMessage}
        </div>
      )}
      
      {required && (
        <div className="absolute top-2 right-2">
          <span className="text-red-500 text-sm">*</span>
        </div>
      )}
    </div>
  );
};

export default DateInput;
