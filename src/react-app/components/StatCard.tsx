import React, { ElementType } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ElementType;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'default';
}

const colorMap = {
  blue: { text: 'text-slate-800', bg: 'bg-primary/20', icon: 'text-primary' },
  green: { text: 'text-success', bg: 'bg-green-100', icon: 'text-green-600' },
  yellow: { text: 'text-warning', bg: 'bg-yellow-100', icon: 'text-yellow-600' },
  red: { text: 'text-critical', bg: 'bg-red-100', icon: 'text-red-600' },
  purple: { text: 'text-purple-600', bg: 'bg-purple-100', icon: 'text-purple-600' },
  default: { text: 'text-slate-800', bg: 'bg-gray-100', icon: 'text-gray-600' },
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  color = 'default',
}) => {
  const colors = colorMap[color] || colorMap.default;

  return (
    <div className="flex flex-1 flex-col gap-2 rounded-lg p-6 border border-slate-200 bg-white">
      <div className="flex items-center justify-between">
        <p className="text-slate-600 text-base font-medium leading-normal">{label}</p>
        {Icon && (
          <div className={`p-2 ${colors.bg} rounded-lg`}>
            <Icon size={20} className={colors.icon} />
          </div>
        )}
      </div>
      <p className={`${colors.text} tracking-tight text-2xl font-bold leading-tight`}>{value}</p>
    </div>
  );
};

export default StatCard;
