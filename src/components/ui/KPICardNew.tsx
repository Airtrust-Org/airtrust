import React from 'react';

interface KPICardNewProps {
  label: string;
  value: string | number;
  change?: string;
  changeDirection?: 'up' | 'down';
  variant?: 'default' | 'warning' | 'danger' | 'success';
}

export function KPICardNew({
  label,
  value,
  change,
  changeDirection,
  variant = 'default',
}: KPICardNewProps) {
  const variantStyles = {
    default: 'text-slate-900',
    warning: 'text-warning-600',
    danger: 'text-danger-600',
    success: 'text-success-600',
  };

  const changeStyles =
    changeDirection === 'up'
      ? 'text-success-600'
      : changeDirection === 'down'
      ? 'text-danger-600'
      : 'text-slate-500';

  return (
    <div className="flex flex-1 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-6">
      <p className="text-base font-medium leading-normal text-slate-600">{label}</p>
      <div className="flex items-baseline gap-3">
        <p className={`text-4xl font-bold leading-tight tracking-tight ${variantStyles[variant]}`}>
          {value}
        </p>
        {change && <p className={`text-sm font-medium leading-normal ${changeStyles}`}>{change}</p>}
      </div>
    </div>
  );
}
