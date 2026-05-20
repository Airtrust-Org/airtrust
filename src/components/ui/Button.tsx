import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseClasses =
    'h-10 px-4 py-2 font-medium rounded-lg transition-all duration-200 flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow',
    secondary: 'bg-white border border-gray-300 text-slate-700 hover:bg-gray-50',
    ghost: 'text-primary-600 hover:bg-primary-50',
    danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow',
  };

  return (
    <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {icon && <span className="material-symbols-outlined text-lg">{icon}</span>}
      {children}
    </button>
  );
}
