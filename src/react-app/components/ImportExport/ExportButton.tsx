import React from 'react';

interface ExportButtonProps<T> {
  data: T[];
  filename?: string;
  toCSV: (rows: T[]) => string;
  label?: string;
}

export default function ExportButton<T>({ data, filename = 'export.csv', toCSV, label = 'Exportar CSV' }: ExportButtonProps<T>) {
  const handleExport = () => {
    const csv = toCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
      onClick={handleExport}
    >
      {label}
    </button>
  );
}

