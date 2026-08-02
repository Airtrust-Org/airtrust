import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import Button from '@/react-app/components/Button';
import { cn } from '@/react-app/lib/utils';

interface Column {
  key: string;
  label: string;
}

interface ColumnSelectorProps {
  columns: Column[];
  visibleColumns: string[];
  onChangeVisibleColumns: (columns: string[]) => void;
  disabled?: boolean;
}

export function ColumnSelector({
  columns,
  visibleColumns,
  onChangeVisibleColumns,
  disabled = false,
}: ColumnSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Salvar preferências no localStorage
  useEffect(() => {
    const key = 'table_visible_columns';
    try {
      localStorage.setItem(key, JSON.stringify(visibleColumns));
    } catch (e) {
      console.error('Failed to save column preferences:', e);
    }
  }, [visibleColumns]);

  const toggleColumn = (columnKey: string) => {
    const newColumns = visibleColumns.includes(columnKey)
      ? visibleColumns.filter((c) => c !== columnKey)
      : [...visibleColumns, columnKey];

    // Garantir que pelo menos uma coluna fica visível
    if (newColumns.length > 0) {
      onChangeVisibleColumns(newColumns);
    }
  };

  const allVisible = visibleColumns.length === columns.length;
  const noneVisible = visibleColumns.length === 0;

  return (
    <div className="relative inline-block">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="gap-2"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span>Colunas</span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-3 border-b border-gray-200">
            <button
              onClick={() => onChangeVisibleColumns(allVisible ? [] : columns.map((c) => c.key))}
              className="text-sm font-medium text-primary hover:underline w-full text-left"
              disabled={noneVisible}
            >
              {allVisible ? 'Ocultar Todas' : 'Mostrar Todas'}
            </button>
          </div>

          <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
            {columns.map((column) => (
              <label
                key={column.key}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column.key)}
                  onChange={() => toggleColumn(column.key)}
                  disabled={visibleColumns.length === 1 && visibleColumns.includes(column.key)}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
                <span className="text-sm text-gray-700">{column.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ColumnSelector;
