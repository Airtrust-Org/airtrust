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
    'min-h-[44px] min-w-[44px] px-4 py-2 font-medium rounded-lg transition-all duration-200 flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-all motion-safe:duration-200';

  const variantClasses = {
    primary:
      'bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow focus-visible:ring-primary-500',
    secondary:
      'bg-white border border-gray-300 text-slate-700 hover:bg-gray-50 focus-visible:ring-primary-400',
    ghost:
      'text-primary-600 hover:bg-primary-50 focus-visible:ring-primary-400',
    danger:
      'bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow focus-visible:ring-red-500',
  };

  return (
    <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {icon && (
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
