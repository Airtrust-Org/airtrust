import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  error?: string;
}

export function Input({ label, icon, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}

      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
            {icon}
          </span>
        )}

        <input
          className={`
            w-full h-10 ${icon ? 'pl-10' : 'pl-3'} pr-3 py-2 
            border ${error ? 'border-red-500 ring-2 ring-red-500/20' : 'border-gray-300'}
            rounded-lg bg-white text-slate-900 
            placeholder:text-slate-400 
            focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 
            outline-none transition-all
            disabled:bg-gray-50 disabled:text-slate-500 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        />
      </div>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
