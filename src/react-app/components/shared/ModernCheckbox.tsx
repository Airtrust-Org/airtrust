import { Check } from 'lucide-react';

interface ModernCheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export default function ModernCheckbox({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
}: ModernCheckboxProps) {
  return (
    <label
      className={`inline-flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div
          className={`
          w-3.5 h-3.5 rounded border-2 transition-all duration-200
          ${
            checked ? 'bg-primary border-primary' : 'bg-white border-gray-300 hover:border-blue-400'
          }
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
          peer-focus:ring-2 peer-focus:ring-blue-200 peer-focus:ring-offset-1
        `}
        >
          {checked && (
            <Check className="w-2.5 h-2.5 text-white absolute inset-0 m-auto" strokeWidth={3} />
          )}
        </div>
      </div>
      {label && <span className="text-sm text-gray-700 select-none">{label}</span>}
    </label>
  );
}
