import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {Icon && (
        <Icon className="text-gray-300 mb-4" size={64} />
      )}
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      
      {description && (
        <p className="text-gray-600 text-center mb-6 max-w-md">
          {description}
        </p>
      )}
      
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
