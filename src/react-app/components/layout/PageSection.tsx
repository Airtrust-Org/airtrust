import React from 'react';

interface PageSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const PageSection: React.FC<PageSectionProps> = ({ title, icon, children }) => {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 border border-neutral-200">
      <h2 className="text-2xl font-bold mb-6 flex items-center">
        {icon && <span className="mr-3 w-6 h-6">{icon}</span>}
        {title}
      </h2>
      {children}
    </div>
  );
};

export default PageSection;
