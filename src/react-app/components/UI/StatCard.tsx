import React from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className: string }>;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'amber' | 'teal' | 'indigo';
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  className?: string;
}

/**
 * Statistics card component for dashboard display
 * Follows design system with color variants
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  color,
  variant,
  className = '',
}: StatCardProps) {
  const colorClasses = {
    blue: 'bg-primary/10 border-blue-200 text-primary hover:bg-primary/20 hover:shadow-blue-100',
    green: 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100 hover:shadow-green-100',
    orange:
      'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100 hover:shadow-orange-100',
    red: 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 hover:shadow-red-100',
    purple:
      'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100 hover:shadow-purple-100',
    amber: 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100 hover:shadow-amber-100',
    teal: 'bg-teal-50 border-teal-200 text-teal-600 hover:bg-teal-100 hover:shadow-teal-100',
    indigo:
      'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100 hover:shadow-indigo-100',
  };

  const variantClass = variant ? `card card-${variant}` : '';
  const colorClass = color ? colorClasses[color] : '';

  return (
    <div
      className={`
        ${variantClass || colorClass}
        border-2 shadow-lg
        hover:shadow-xl 
        transition-all duration-300
        p-6 rounded-lg
        cursor-pointer
        transform hover:scale-105
        ${className}
      `}
    >
      <Icon className="w-10 h-10 mb-3 opacity-80" />
      <p className="text-sm font-semibold text-gray-600 mb-2">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
