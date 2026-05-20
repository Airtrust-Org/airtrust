/**
 * VirtualTable - Tabela virtualizada com suporte a keyboard navigation e acessibilidade
 *
 * Benefícios:
 * - Renderiza apenas linhas visíveis (~15-20 em vez de 500+)
 * - Keyboard navigation: Tab, Enter, Space, Arrows
 * - ARIA labels para screen readers
 * - role="table" semanticamente correto
 * - Sort com arrows e persistência em localStorage
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

interface VirtualTableColumn<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  width?: string;
  sortable?: boolean;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: VirtualTableColumn<T>[];
  rowHeight?: number;
  maxHeight?: string;
  className?: string;
  onRowClick?: (item: T) => void;
  ariaLabel?: string;
}

export function VirtualTable<T extends { id?: string | number }>({
  data,
  columns,
  rowHeight = 60,
  maxHeight = 'h-[600px]',
  className,
  onRowClick,
  ariaLabel = 'Tabela de dados virtualizada',
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Carregar preferências de sort do localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('table_sort_preference');
      if (saved) {
        const { column, direction } = JSON.parse(saved);
        setSortColumn(column);
        setSortDirection(direction);
      }
    } catch (e) {
      console.error('Failed to load sort preference:', e);
    }
  }, []);

  // Ordenar dados
  const sortedData = sortColumn
    ? [...data].sort((a, b) => {
        const aVal = (a as unknown as Record<string, unknown>)[sortColumn];
        const bVal = (b as unknown as Record<string, unknown>)[sortColumn];

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        let comparison = 0;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        } else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      })
    : data;

  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const handleSort = (columnKey: string) => {
    const isSortable = columns.find((c) => c.key === columnKey)?.sortable !== false;
    if (!isSortable) return;

    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }

    // Salvar preferência
    try {
      localStorage.setItem(
        'table_sort_preference',
        JSON.stringify({ column: columnKey, direction: sortDirection }),
      );
    } catch (e) {
      console.error('Failed to save sort preference:', e);
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, rowIndex: number, item: T) => {
    // Enter e Space para clicar na linha
    if ((e.key === 'Enter' || e.key === ' ') && onRowClick) {
      e.preventDefault();
      onRowClick(item);
      return;
    }

    // Arrow Up/Down para navegar
    if (e.key === 'ArrowDown' && rowIndex < sortedData.length - 1) {
      e.preventDefault();
      setFocusedRowIndex(rowIndex + 1);
      const nextRow = document.querySelector(
        `[role="row"][data-row-index="${rowIndex + 1}"]`,
      ) as HTMLElement;
      nextRow?.focus();
      return;
    }

    if (e.key === 'ArrowUp' && rowIndex > 0) {
      e.preventDefault();
      setFocusedRowIndex(rowIndex - 1);
      const prevRow = document.querySelector(
        `[role="row"][data-row-index="${rowIndex - 1}"]`,
      ) as HTMLElement;
      prevRow?.focus();
      return;
    }

    // Home/End para primeira/última linha
    if (e.key === 'Home') {
      e.preventDefault();
      setFocusedRowIndex(0);
      const firstRow = document.querySelector(`[role="row"][data-row-index="0"]`) as HTMLElement;
      firstRow?.focus();
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      const lastIndex = sortedData.length - 1;
      setFocusedRowIndex(lastIndex);
      const lastRow = document.querySelector(
        `[role="row"][data-row-index="${lastIndex}"]`,
      ) as HTMLElement;
      lastRow?.focus();
      return;
    }
  };

  return (
    <div
      ref={parentRef}
      role="table"
      aria-label={ariaLabel}
      aria-rowcount={sortedData.length}
      className={cn('overflow-auto border border-slate-200 rounded-lg', maxHeight, className)}
    >
      {/* Cabeçalho */}
      <div
        role="row"
        className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 flex"
        aria-rowindex={1}
      >
        {columns.map((col) => {
          const isSortable = col.sortable !== false;
          const isSorted = sortColumn === col.key;

          return (
            <div
              key={col.key}
              role="columnheader"
              style={{ width: col.width || 'auto' }}
              className={cn(
                'flex-1 px-6 py-3 font-medium text-slate-600 text-sm min-w-[100px]',
                isSortable && 'cursor-pointer hover:bg-slate-100 transition-colors',
              )}
              aria-sort={isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              onClick={() => handleSort(col.key)}
            >
              <div className="flex items-center gap-2">
                {col.header}
                {isSorted &&
                  (sortDirection === 'asc' ? (
                    <ChevronUp className="w-4 h-4 text-primary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-primary" />
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Corpo da tabela */}
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = sortedData[virtualRow.index];
          const isEven = virtualRow.index % 2 === 0;
          const rowId = item?.id ? `row-${item.id}` : `row-${virtualRow.index}`;

          return (
            <div
              key={rowId}
              role="row"
              data-row-index={virtualRow.index}
              tabIndex={focusedRowIndex === virtualRow.index ? 0 : -1}
              aria-rowindex={virtualRow.index + 2}
              aria-selected={focusedRowIndex === virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => {
                onRowClick?.(item);
                setFocusedRowIndex(virtualRow.index);
              }}
              onKeyDown={(e) => handleRowKeyDown(e, virtualRow.index, item)}
              onFocus={() => setFocusedRowIndex(virtualRow.index)}
              className={cn(
                'flex items-center border-b border-slate-200 hover:bg-slate-50 transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary',
                onRowClick && 'cursor-pointer',
                isEven && 'bg-white',
                !isEven && 'bg-slate-50/50',
              )}
            >
              {columns.map((col) => (
                <div
                  key={`${rowId}-${col.key}`}
                  role="cell"
                  style={{ width: col.width || 'auto' }}
                  className="flex-1 px-6 py-4 text-slate-800 min-w-[100px]"
                >
                  {col.render(item)}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Empty state com acessibilidade */}
      {sortedData.length === 0 && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center h-64 text-slate-500"
        >
          <p>Nenhum registro encontrado</p>
        </div>
      )}
    </div>
  );
}
