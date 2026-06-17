import { useState, useMemo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { buildUserScopedStorageKey } from '../../react-app/utils/userPreferences';

export interface Column<T> {
  id: string;
  label: string;
  accessor: (row: T) => unknown;
  sortable?: boolean;
  visible?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
  width?: string;
  minWidth?: string;
}

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
  column: string | null;
  direction: SortDirection;
}

function ensureAtLeastOneVisibleColumn<T>(
  columns: Column<T>[],
  preferredVisibleColumnId?: string,
): Column<T>[] {
  if (columns.some((column) => column.visible !== false)) {
    return columns;
  }

  return columns.map((column, index) => ({
    ...column,
    visible:
      preferredVisibleColumnId != null
        ? column.id === preferredVisibleColumnId
        : index === 0,
  }));
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;
  onColumnOrderChange?: (newOrder: string[]) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  actions?: (row: T) => React.ReactNode;
  tableId?: string; // Unique identifier for localStorage
  // Column config control (optional controlled mode)
  columnConfigOpen?: boolean;
  onColumnConfigOpenChange?: (open: boolean) => void;
  showInternalColumnConfigButton?: boolean; // default: true. When false, hide internal trigger
  // Pagination
  page?: number; // 1-based page index (controlled)
  total?: number; // total items (when server-side)
  pageSize?: number; // page size (controlled)
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[]; // default: [50, 100]
  // Server-side sorting
  sortConfig?: SortConfig; // controlled sort state
  onSortChange?: (sortConfig: SortConfig) => void; // callback when sort changes
  virtualizeRows?: boolean;
  virtualizeThreshold?: number;
  estimatedRowHeight?: number;
  maxTableHeight?: number;
  enableColumnWidthConfig?: boolean;
}

export function DataTable<T extends { id?: string | number }>({
  data,
  columns: initialColumns,
  onColumnVisibilityChange,
  onColumnOrderChange,
  loading,
  emptyState,
  onRowClick,
  rowClassName,
  actions,
  tableId = 'default-table',
  // column config
  columnConfigOpen,
  onColumnConfigOpenChange,
  showInternalColumnConfigButton = true,
  // pagination
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [50, 100],
  // sorting
  sortConfig: controlledSortConfig,
  onSortChange,
  virtualizeRows = true,
  virtualizeThreshold = 80,
  estimatedRowHeight = 52,
  maxTableHeight = 600,
  enableColumnWidthConfig = true,
}: DataTableProps<T>) {
  // localStorage key for this table (scoped by logged user)
  const storageKey = buildUserScopedStorageKey(`airtrust_datatable_${tableId}`);

  const getInitialPageSize = () => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return pageSizeOptions[0] ?? 50;
      const config = JSON.parse(saved) as { pageSize?: number };
      if (typeof config.pageSize === 'number' && config.pageSize > 0) {
        return config.pageSize;
      }
    } catch {
      // ignore parse errors and keep default
    }
    return pageSizeOptions[0] ?? 50;
  };

  const [internalSortColumn, setInternalSortColumn] = useState<string | null>(null);
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>(null);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [columns, setColumns] = useState(initialColumns);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const resizeStateRef = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  // Internal pagination state (used when uncontrolled / client-side)
  const [internalPage, setInternalPage] = useState<number>(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(getInitialPageSize);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Use controlled sort if provided, otherwise use internal state
  const sortColumn = controlledSortConfig?.column ?? internalSortColumn;
  const sortDirection = controlledSortConfig?.direction ?? internalSortDirection;

  // Load saved configuration on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        const widths = (config.widths ?? {}) as Record<string, string | undefined>;

        // Apply saved column visibility
        const updatedColumns = ensureAtLeastOneVisibleColumn(
          initialColumns.map((col) => ({
            ...col,
            visible: config.visibility?.[col.id] !== false,
            width: widths[col.id] || col.width,
          })),
        );

        if (typeof config.pageSize === 'number' && config.pageSize > 0) {
          setInternalPageSize(config.pageSize);
        }

        // Apply saved column order if available
        if (config.order && config.order.length === updatedColumns.length) {
          const orderedColumns = ensureAtLeastOneVisibleColumn(
            config.order
              .map((id: string) => updatedColumns.find((col) => col.id === id))
              .filter(Boolean) as Column<T>[],
          );
          setColumns(orderedColumns);
        } else {
          setColumns(updatedColumns);
        }
      } catch {
        // If JSON parsing fails, just use initial columns
        setColumns(ensureAtLeastOneVisibleColumn(initialColumns));
      }
    } else {
      setColumns(ensureAtLeastOneVisibleColumn(initialColumns));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]); // Apenas tableId como dependência para evitar resetar config

  // Keep column definitions fresh when parent render/accessor functions change,
  // while preserving the user's current order and visibility preferences.
  useEffect(() => {
    setColumns((prevColumns) => {
      if (prevColumns.length === 0) {
        return initialColumns;
      }

      const previousById = new Map(prevColumns.map((column) => [column.id, column]));
      const mergedColumns = initialColumns.map((column) => {
        const previous = previousById.get(column.id);
        return previous ? { ...column, visible: previous.visible, width: previous.width } : column;
      });

      const previousOrder = prevColumns.map((column) => column.id);
      const orderedColumns = ensureAtLeastOneVisibleColumn([
        ...previousOrder
          .map((id) => mergedColumns.find((column) => column.id === id))
          .filter(Boolean),
        ...mergedColumns.filter((column) => !previousOrder.includes(column.id)),
      ] as Column<T>[]);

      const changed =
        orderedColumns.length !== prevColumns.length ||
        orderedColumns.some((column, index) => column !== prevColumns[index]);

      return changed ? orderedColumns : prevColumns;
    });
  }, [initialColumns]);

  // Save configuration to localStorage whenever columns change
  const saveConfiguration = (updatedColumns: Column<T>[]) => {
    try {
      const config = {
        visibility: updatedColumns.reduce(
          (acc, col) => ({
            ...acc,
            [col.id]: col.visible !== false,
          }),
          {} as Record<string, boolean>,
        ),
        order: updatedColumns.map((col) => col.id),
        widths: updatedColumns.reduce(
          (acc, col) => ({
            ...acc,
            [col.id]: col.width,
          }),
          {} as Record<string, string | undefined>,
        ),
        pageSize: pageSize ?? internalPageSize,
      };
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch (err) {
      console.warn('Failed to save table configuration:', err);
    }
  };

  // Filtrar colunas visíveis
  const visibleColumns = useMemo(() => {
    return columns.filter((col) => col.visible !== false);
  }, [columns]);

  // Ordenar dados
  // Skip client-side sorting when server-side sorting is active
  const sortedData = useMemo(() => {
    // If server-side sorting is enabled, assume data is already sorted by the server
    if (typeof onSortChange === 'function') return data;

    if (!sortColumn || !sortDirection) return data;

    const column = columns.find((col) => col.id === sortColumn);
    if (!column) return data;

    return [...data].sort((a, b) => {
      const aValue = column.accessor(a);
      const bValue = column.accessor(b);

      if (aValue === bValue) return 0;

      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue, 'pt-BR');
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      } else {
        comparison = String(aValue).localeCompare(String(bValue), 'pt-BR');
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, columns, onSortChange]);

  // Pagination calculations
  const effectivePageSize = pageSize ?? internalPageSize;
  const effectivePage = page ?? internalPage;
  const effectiveTotal = total ?? sortedData.length;

  const totalPages = Math.max(1, Math.ceil(effectiveTotal / Math.max(1, effectivePageSize)));
  const currentPage = Math.min(Math.max(1, effectivePage), totalPages);
  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, effectiveTotal);

  // If server-side pagination (total provided and caller controls the page), assume data is already sliced
  // Also skip client-side sorting when server-side sorting is enabled
  const isServerPaginated = typeof total === 'number' && typeof onPageChange === 'function';
  const isServerSorted = typeof onSortChange === 'function';
  const displayData =
    isServerPaginated || isServerSorted ? sortedData : sortedData.slice(startIndex, endIndex);
  const shouldVirtualize =
    virtualizeRows &&
    !isServerPaginated &&
    !isServerSorted &&
    displayData.length >= virtualizeThreshold;
  const rowVirtualizer = useVirtualizer({
    count: displayData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 8,
  });
  const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];

  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [currentPage, effectivePageSize, displayData.length]);

  const handleSort = (columnId: string) => {
    const column = columns.find((col) => col.id === columnId);
    if (!column?.sortable) return;

    let newDirection: SortDirection = 'asc';
    let newColumn: string | null = columnId;

    if (sortColumn === columnId) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
        newColumn = null;
      }
    }

    // Server-side sorting: call callback
    if (onSortChange) {
      onSortChange({ column: newColumn, direction: newDirection });
    } else {
      // Client-side sorting: update internal state
      setInternalSortColumn(newColumn);
      setInternalSortDirection(newDirection);
    }
  };

  const toggleColumnVisibility = (columnId: string) => {
    const newColumns = ensureAtLeastOneVisibleColumn(
      columns.map((col) =>
        col.id === columnId ? { ...col, visible: col.visible === false ? true : false } : col,
      ),
      columnId,
    );
    setColumns(newColumns);
    saveConfiguration(newColumns);
    onColumnVisibilityChange?.(
      columnId,
      newColumns.find((c) => c.id === columnId)?.visible !== false,
    );
  };

  const updateColumnWidth = (columnId: string, widthPx: number | null) => {
    const newColumns = columns.map((col) => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        width: widthPx && widthPx > 0 ? `${Math.max(120, Math.round(widthPx))}px` : undefined,
      };
    });

    setColumns(newColumns);
    saveConfiguration(newColumns);
  };

  const getColumnWidthInputValue = (width?: string) => {
    if (!width) return '';
    const normalized = String(width).trim().toLowerCase();
    if (normalized.endsWith('rem')) {
      const remValue = Number.parseFloat(normalized.replace('rem', ''));
      return Number.isFinite(remValue) ? String(Math.round(remValue * 16)) : '';
    }
    const pxValue = Number.parseFloat(normalized.replace('px', ''));
    return Number.isFinite(pxValue) ? String(Math.round(pxValue)) : '';
  };

  const handleDragStart = (columnId: string) => {
    setDraggedColumnId(columnId);
  };

  const handleDragOver = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    if (!draggedColumnId || draggedColumnId === targetColumnId) return;

    const draggedIndex = columns.findIndex((col) => col.id === draggedColumnId);
    const targetIndex = columns.findIndex((col) => col.id === targetColumnId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);

    setColumns(newColumns);
    saveConfiguration(newColumns);
    onColumnOrderChange?.(newColumns.map((col) => col.id));
  };

  const handleDragEnd = () => {
    setDraggedColumnId(null);
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);

      setColumns((prevColumns) =>
        prevColumns.map((column) =>
          column.id === resizeState.columnId
            ? { ...column, width: `${Math.max(120, Math.round(nextWidth))}px` }
            : column,
        ),
      );
    };

    const handleMouseUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColumns((currentColumns) => {
        saveConfiguration(currentColumns);
        return currentColumns;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const beginResize = (event: React.MouseEvent, columnId: string, width?: string) => {
    event.preventDefault();
    event.stopPropagation();

    const parsedWidth = Number.parseFloat(String(width || '').replace('px', ''));
    const fallbackWidth = 180;
    resizeStateRef.current = {
      columnId,
      startX: event.clientX,
      startWidth: Number.isFinite(parsedWidth) ? parsedWidth : fallbackWidth,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const getSortIcon = (columnId: string) => {
    if (sortColumn !== columnId) {
      return <span className="material-symbols-outlined text-slate-400">unfold_more</span>;
    }
    if (sortDirection === 'asc') {
      return <span className="material-symbols-outlined text-primary-600">arrow_upward</span>;
    }
    return <span className="material-symbols-outlined text-primary-600">arrow_downward</span>;
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4 block animate-pulse">
          hourglass_empty
        </span>
        <p className="text-slate-500">Carregando dados...</p>
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="relative">
      {/* Column Config Button */}
      {showInternalColumnConfigButton && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() =>
              columnConfigOpen === undefined
                ? setShowColumnConfig((prev) => !prev)
                : onColumnConfigOpenChange?.(!columnConfigOpen)
            }
            className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-base">view_column</span>
            <span>Configurar Colunas</span>
          </button>
        </div>
      )}

      {/* Column Configuration Panel */}
      {(columnConfigOpen ?? showColumnConfig) && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Configurar Colunas</h3>
            <span className="text-xs text-slate-500">
              <span className="material-symbols-outlined text-base align-middle">
                drag_indicator
              </span>
              Arraste para reordenar
            </span>
          </div>
          <div className="space-y-2">
            {columns.map((column) => (
              <div
                key={column.id}
                draggable
                onDragStart={() => handleDragStart(column.id)}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 rounded-md bg-white px-3 py-2.5 text-sm border border-slate-200 transition-all cursor-move hover:border-primary-300 hover:shadow-sm ${
                  draggedColumnId === column.id ? 'opacity-50 scale-95' : ''
                }`}
              >
                <span className="material-symbols-outlined text-slate-400 text-lg">
                  drag_indicator
                </span>
                <label className="flex flex-1 items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={column.visible !== false}
                    onChange={() => toggleColumnVisibility(column.id)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                  />
                  <span className="text-slate-700 font-medium">{column.label}</span>
                </label>
                {enableColumnWidthConfig && (
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                    {getColumnWidthInputValue(column.width) || 'auto'} px
                  </span>
                )}
                {column.sortable && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    Ordenável
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div
        ref={tableContainerRef}
        className="airtrust-table-container overflow-x-auto overflow-y-auto border border-slate-200 rounded-lg"
        style={{ maxHeight: `${maxTableHeight}px` }}
      >
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            {visibleColumns.map((column) => (
              <col
                key={column.id}
                style={
                  column.width || column.minWidth
                    ? {
                        width: column.width,
                        minWidth: column.minWidth || column.width,
                      }
                    : undefined
                }
              />
            ))}
            {actions && <col style={{ width: '140px', minWidth: '140px' }} />}
          </colgroup>
          <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 shadow-[0_1px_0_0_rgba(148,163,184,0.25)]">
            <tr>
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  className={`relative px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap ${
                    column.sortable ? 'cursor-pointer select-none hover:bg-slate-100' : ''
                  }`}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{column.label}</span>
                    {column.sortable && <span className="text-lg">{getSortIcon(column.id)}</span>}
                  </div>
                  <div
                    className="absolute right-0 top-0 h-full w-3 cursor-col-resize select-none"
                    onMouseDown={(event) => beginResize(event, column.id, column.width)}
                  />
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 text-right whitespace-nowrap">
                  Ações
                </th>
              )}
            </tr>
          </thead>
          {shouldVirtualize ? (
            <tbody
              className="relative block divide-y divide-slate-200 bg-white"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {virtualRows.map((virtualRow) => {
                const row = displayData[virtualRow.index];
                if (!row) return null;

                return (
                  <tr
                    key={row.id || virtualRow.index}
                    className={`absolute left-0 transition-colors hover:bg-slate-50 ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${rowClassName ? rowClassName(row) : ''}`}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      height: `${virtualRow.size}px`,
                      width: '100%',
                      display: 'table',
                      tableLayout: 'fixed',
                    }}
                    onClick={() => onRowClick?.(row)}
                  >
                    {visibleColumns.map((column) => {
                      const value = column.accessor(row);
                      const contentClassName = column.render
                        ? 'min-w-0 max-w-full overflow-hidden'
                        : 'airtrust-cell-content min-w-0 max-w-full';
                      return (
                        <td key={column.id} className="px-4 py-3 text-sm align-middle">
                          <div className={contentClassName}>
                            {column.render ? column.render(value, row) : String(value ?? '')}
                          </div>
                        </td>
                      );
                    })}
                    {actions && (
                      <td
                        className="px-4 py-3 text-sm align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-2">{actions(row)}</div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          ) : (
            <tbody className="divide-y divide-slate-200 bg-white">
              {displayData.map((row, index) => (
                <tr
                  key={row.id || index}
                  className={`transition-colors hover:bg-slate-50 ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${rowClassName ? rowClassName(row) : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {visibleColumns.map((column) => {
                    const value = column.accessor(row);
                    const contentClassName = column.render
                      ? 'min-w-0 max-w-full overflow-hidden'
                      : 'airtrust-cell-content min-w-0 max-w-full';
                    return (
                      <td key={column.id} className="px-4 py-3 text-sm align-middle">
                        <div className={contentClassName}>
                          {column.render ? column.render(value, row) : String(value ?? '')}
                        </div>
                      </td>
                    );
                  })}
                  {actions && (
                    <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">{actions(row)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      {/* Pagination footer */}
      <div className="mt-4 flex items-center justify-between px-2">
        {/* Page size selector */}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Itens por página:</span>
          <select
            className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
            value={effectivePageSize}
            onChange={(e) => {
              const size = parseInt(e.target.value, 10) || pageSizeOptions[0] || 50;
              if (onPageSizeChange) onPageSizeChange(size);
              else setInternalPageSize(size);
              localStorage.setItem(
                storageKey,
                JSON.stringify({
                  ...(() => {
                    try {
                      return JSON.parse(localStorage.getItem(storageKey) || '{}');
                    } catch {
                      return {};
                    }
                  })(),
                  pageSize: size,
                }),
              );
              // reset page to 1
              if (onPageChange) onPageChange(1);
              else setInternalPage(1);
            }}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Range and nav */}
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span>
            {effectiveTotal === 0
              ? '0–0 de 0'
              : `${startIndex + 1}–${
                  isServerPaginated ? startIndex + displayData.length : endIndex
                } de ${effectiveTotal}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
              disabled={currentPage <= 1}
              onClick={() => {
                const next = currentPage - 1;
                if (onPageChange) {
                  onPageChange(next);
                  // Scroll to top da tabela
                  setTimeout(() => {
                    const tableContainer = document.querySelector('.airtrust-table-container');
                    if (tableContainer) {
                      tableContainer.scrollTop = 0;
                    }
                  }, 0);
                } else {
                  setInternalPage(next);
                }
              }}
            >
              Anterior
            </button>
            <button
              className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
              disabled={currentPage >= totalPages}
              onClick={() => {
                const next = currentPage + 1;
                if (onPageChange) {
                  onPageChange(next);
                  // Scroll to top da tabela
                  setTimeout(() => {
                    const tableContainer = document.querySelector('.airtrust-table-container');
                    if (tableContainer) {
                      tableContainer.scrollTop = 0;
                    }
                  }, 0);
                } else {
                  setInternalPage(next);
                }
              }}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
