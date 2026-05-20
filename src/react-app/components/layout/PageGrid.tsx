import React from 'react';

interface PageGridProps {
  children: React.ReactNode;
  cols?: number;
}

const PageGrid: React.FC<PageGridProps> = ({ children, cols = 2 }) => {
  const gridColsClass =
    {
      1: 'grid-cols-1',
      2: 'grid-cols-1 md:grid-cols-2',
      3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
      5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
    }[cols] || 'grid-cols-1 md:grid-cols-2';

  return <div className={`grid ${gridColsClass} gap-8`}>{children}</div>;
};

export default PageGrid;
