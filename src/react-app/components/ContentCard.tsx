import React from 'react';

interface ContentCardProps {
  children: React.ReactNode;
  className?: string;
}

export const ContentCard: React.FC<ContentCardProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`flex flex-col gap-4 rounded-lg border border-slate-200 p-6 bg-white ${className}`}
    >
      {children}
    </div>
  );
};

export default ContentCard;
