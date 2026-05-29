/**
 * AirTrust Enhanced Global Table Component v2.0
 *
 * NEW FEATURES (All 4 Optional):
 * 1. Sort State Persistence - Saves sort column/direction to localStorage
 * 2. Column Visibility Toggle - Show/hide columns with checkbox menu
 * 3. Sticky Table Header - Header stays visible when scrolling
 * 4. Column Drag-to-Reorder - Drag headers to reorder, persisted to localStorage
 *
 * Maintained Features:
 * - Sort indicators (↑↓)
 * - Global status coloring
 * - Pagination
 * - Search functionality
 * - Export capabilities
 * - Custom rendering
 * - Responsive design
 * - WCAG 2.1 AA compliance
 *
 * @version 2.0.0
 * @date 2025-11-04
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Settings,
} from 'lucide-react';
import {
  saveSortState,
  loadSortState,
  saveColumnVisibility,
  loadColumnVisibility,
  saveColumnOrder,
  loadColumnOrder,
} from '@/react-app/utils/storageUtils';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  searchable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, item: Record<string, unknown>, index: number) => React.ReactNode;
}

export interface GlobalTablePropsEnhanced {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  idKey?: string;
  title?: string;
  subtitle?: string;
  pageName?: string; // For localStorage persistence

  // Status and styling
  getRowStatus?: (
    item: Record<string, unknown>,
  ) => 'valid' | 'expiring' | 'expired' | 'revoked' | 'total' | undefined;
  getRowClassName?: (item: Record<string, unknown>) => string;

  // Search and filtering
  enableSearch?: boolean;
  searchPlaceholder?: string;
  searchableColumns?: string[];
  onSearch?: (query: string) => void;

  // Pagination
  enablePagination?: boolean;
  pageSize?: number;
  onPageChange?: (page: number) => void;

  // Export
  enableExport?: boolean;
  onExport?: (data: Record<string, unknown>[], format: 'csv' | 'pdf' | 'excel') => void;

  // Callbacks
  onSort?: (column: string, direction: 'asc' | 'desc' | 'none') => void;
  onRowClick?: (item: Record<string, unknown>) => void;

  // State
  loading?: boolean;
  emptyMessage?: string;

  // New Features
  enableSortPersistence?: boolean; // Feature 1
  enableColumnVisibility?: boolean; // Feature 2
  enableStickyHeader?: boolean; // Feature 3
  enableColumnReorder?: boolean; // Feature 4

  // Custom actions
  actions?: React.ReactNode;

  // Styling
  className?: string;
}

const statusStyles = {
  valid: {
    background: 'bg-green-50',
    border: 'border-l-4 border-green-600',
    text: 'text-green-600',
  },
  expiring: {
    background: 'bg-orange-50',
    border: 'border-l-4 border-orange-600',
    text: 'text-orange-600',
  },
  expired: {
    background: 'bg-red-50',
    border: 'border-l-4 border-red-600',
    text: 'text-red-600',
  },
  revoked: {
    background: 'bg-neutral-100',
    border: 'border-l-4 border-neutral-400',
    text: 'text-neutral-600',
  },
  total: {
    background: 'bg-primary/10',
    border: 'border-l-4 border-primary',
    text: 'text-primary',
  },
};

export const GlobalTableEnhanced: React.FC<GlobalTablePropsEnhanced> = ({
  columns: initialColumns,
  data,
  idKey = 'id',
  title,
  subtitle,
  pageName = 'default',
  getRowStatus,
  getRowClassName,
  enableSearch = true,
  searchPlaceholder = 'Pesquisar...',
  searchableColumns: propSearchableColumns,
  onSearch,
  enablePagination = true,
  pageSize = 25,
  onPageChange,
  enableExport = false,
  onExport,
  onSort,
  onRowClick,
  loading = false,
  emptyMessage = 'Nenhum registro encontrado',
  enableSortPersistence = true,
  enableColumnVisibility = true,
  enableStickyHeader = true,
  enableColumnReorder = true,
  actions,
  className = '',
}) => {
  // ========== STATE MANAGEMENT ==========

  // Feature 1: Sort State Persistence
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | 'none'>('none');

  // Feature 2: Column Visibility
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Feature 3 & 4: Column Order (Drag-to-Reorder)
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Basic state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // ========== INITIALIZATION & PERSISTENCE ==========

  // Initialize columns and load persisted state
  useEffect(() => {
    const defaultColumnKeys = initialColumns.map((c) => c.key);
    const defaultOrder = initialColumns.map((c) => c.key);

    // Load persisted visibility
    const savedVisibility = enableColumnVisibility
      ? loadColumnVisibility(pageName, defaultColumnKeys)
      : defaultColumnKeys;
    setVisibleColumns(savedVisibility);

    // Load persisted order
    const savedOrder = enableColumnReorder ? loadColumnOrder(pageName, defaultOrder) : defaultOrder;
    setColumnOrder(savedOrder);

    // Load persisted sort state
    if (enableSortPersistence) {
      const savedSort = loadSortState(pageName);
      if (savedSort) {
        setSortColumn(savedSort.column);
        setSortDirection(savedSort.direction);
      }
    }
  }, [
    initialColumns,
    pageName,
    enableColumnVisibility,
    enableColumnReorder,
    enableSortPersistence,
  ]);

  // ========== CALLBACKS ==========

  // Handle sort change
  const handleSort = useCallback(
    (column: string) => {
      let newDirection: 'asc' | 'desc' | 'none' = 'asc';

      if (sortColumn === column) {
        if (sortDirection === 'asc') newDirection = 'desc';
        else if (sortDirection === 'desc') newDirection = 'none';
      }

      setSortColumn(newDirection === 'none' ? null : column);
      setSortDirection(newDirection);

      // Persist sort state
      if (enableSortPersistence) {
        saveSortState(pageName, newDirection === 'none' ? null : column, newDirection);
      }

      onSort?.(column, newDirection);
    },
    [sortColumn, sortDirection, onSort, enableSortPersistence, pageName],
  );

  // Toggle column visibility
  const handleColumnVisibilityChange = useCallback(
    (columnKey: string) => {
      const updated = visibleColumns.includes(columnKey)
        ? visibleColumns.filter((k) => k !== columnKey)
        : [...visibleColumns, columnKey];

      // Ensure at least one column visible
      if (updated.length > 0) {
        setVisibleColumns(updated);
        if (enableColumnVisibility) {
          saveColumnVisibility(pageName, updated);
        }
      }
    },
    [visibleColumns, enableColumnVisibility, pageName],
  );

  // Handle column drag start
  const handleColumnDragStart = useCallback((e: React.DragEvent, columnKey: string) => {
    setDraggedColumn(columnKey);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Handle column drag over
  const handleColumnDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // Handle column drop (reorder)
  const handleColumnDrop = useCallback(
    (e: React.DragEvent, targetColumn: string) => {
      e.preventDefault();
      if (!draggedColumn || draggedColumn === targetColumn) {
        setDraggedColumn(null);
        return;
      }

      const draggedIndex = columnOrder.indexOf(draggedColumn);
      const targetIndex = columnOrder.indexOf(targetColumn);

      if (draggedIndex === -1 || targetIndex === -1) {
        setDraggedColumn(null);
        return;
      }

      const newOrder = [...columnOrder];
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedColumn);

      setColumnOrder(newOrder);
      if (enableColumnReorder) {
        saveColumnOrder(pageName, newOrder);
      }

      setDraggedColumn(null);
    },
    [draggedColumn, columnOrder, enableColumnReorder, pageName],
  );

  // ========== DATA PROCESSING ==========

  // Determine searchable columns
  const actualSearchableColumns = useMemo(() => {
    if (propSearchableColumns) return propSearchableColumns;
    return initialColumns.filter((c) => c.searchable !== false).map((c) => c.key);
  }, [initialColumns, propSearchableColumns]);

  // Get ordered and visible columns
  const displayColumns = useMemo(() => {
    const ordered =
      columnOrder.length > 0
        ? initialColumns.sort((a, b) => columnOrder.indexOf(a.key) - columnOrder.indexOf(b.key))
        : initialColumns;

    if (!enableColumnVisibility || visibleColumns.length === 0) return ordered;

    return ordered.filter((c) => visibleColumns.includes(c.key));
  }, [initialColumns, columnOrder, visibleColumns, enableColumnVisibility]);

  // Filter and sort data
  const processedData = useMemo(() => {
    let filtered = data;

    // Apply search
    if (searchQuery && actualSearchableColumns.length > 0) {
      filtered = data.filter((item) =>
        actualSearchableColumns.some((colKey) => {
          const value = item[colKey];
          return value && value.toString().toLowerCase().includes(searchQuery.toLowerCase());
        }),
      );
    }

    // Apply sorting
    if (sortColumn && sortDirection !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        return 0;
      });
    }

    return filtered;
  }, [data, searchQuery, sortColumn, sortDirection, actualSearchableColumns]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!enablePagination) return processedData;

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return processedData.slice(start, end);
  }, [processedData, currentPage, pageSize, enablePagination]);

  const totalPages = Math.ceil(processedData.length / pageSize);

  // ========== RENDER ==========

  return (
    <div className={`w-full ${className}`} ref={tableRef}>
      {/* Header */}
      {(title || actions) && (
        <div className="mb-6 flex items-center justify-between">
          {title && (
            <div>
              <h2 className="text-2xl font-bold text-neutral-900">{title}</h2>
              {subtitle && <p className="text-sm text-neutral-600 mt-1">{subtitle}</p>}
            </div>
          )}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}

      {/* Controls */}
      <div className="mb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        {enableSearch && (
          <div className="w-full md:w-64 relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onSearch?.(e.target.value);
              }}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus-visible:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {/* Right Controls */}
        <div className="flex gap-2 items-center">
          {/* Export */}
          {enableExport && (
            <button
              onClick={() => onExport?.(paginatedData, 'csv')}
              className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
              title="Exportar CSV"
            >
              <Download className="w-5 h-5 text-neutral-600" />
            </button>
          )}

          {/* Column Visibility Toggle */}
          {enableColumnVisibility && (
            <div className="relative">
              <button
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                title="Configurar colunas"
              >
                <Settings className="w-5 h-5 text-neutral-600" />
              </button>

              {showColumnMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-neutral-200 rounded-lg shadow-lg z-50">
                  <div className="p-4 border-b border-neutral-200">
                    <p className="text-sm font-semibold text-neutral-900">Colunas Visíveis</p>
                  </div>
                  <div className="p-2 max-h-64 overflow-y-auto">
                    {initialColumns.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 p-2 hover:bg-neutral-50 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col.key)}
                          onChange={() => handleColumnVisibilityChange(col.key)}
                          className="w-4 h-4 rounded border-neutral-300"
                        />
                        <span className="text-sm text-neutral-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table Container - Sticky Header */}
      <div
        className={`overflow-x-auto border border-neutral-200 rounded-lg ${
          enableStickyHeader ? 'relative' : ''
        }`}
      >
        <table className="w-full">
          {/* Header - Sticky */}
          <thead
            className={`
            ${enableStickyHeader ? 'sticky top-0 z-10' : ''}
            bg-white border-b border-neutral-200
          `}
          >
            <tr>
              {displayColumns.map((col) => (
                <th
                  key={col.key}
                  draggable={enableColumnReorder && col.sortable !== false}
                  onDragStart={(e) => handleColumnDragStart(e, col.key)}
                  onDragOver={handleColumnDragOver}
                  onDrop={(e) => handleColumnDrop(e, col.key)}
                  className={`
                    px-4 py-3 text-left font-semibold text-neutral-900 text-sm
                    ${
                      enableColumnReorder && col.sortable !== false
                        ? 'cursor-move hover:bg-neutral-50'
                        : ''
                    }
                    ${draggedColumn === col.key ? 'bg-primary/10 opacity-50' : ''}
                    transition-colors duration-150
                    ${col.width || 'w-auto'}
                    text-${col.align || 'left'}
                  `}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-2">
                    <span>{col.label}</span>
                    {col.sortable && (
                      <>
                        {sortColumn === col.key && sortDirection === 'asc' && (
                          <ArrowUp className="w-4 h-4 text-primary" />
                        )}
                        {sortColumn === col.key && sortDirection === 'desc' && (
                          <ArrowDown className="w-4 h-4 text-primary" />
                        )}
                        {sortColumn !== col.key && (
                          <ChevronsUpDown className="w-4 h-4 text-neutral-400" />
                        )}
                      </>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={displayColumns.length} className="px-4 py-8 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    <span className="text-neutral-600">Carregando...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={displayColumns.length}
                  className="px-4 py-8 text-center text-neutral-600"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                const rowStatus = getRowStatus?.(item);
                const statusStyle = rowStatus
                  ? statusStyles[rowStatus]
                  : { background: '', border: '' };

                return (
                  <tr
                    key={String(item[idKey] || index)}
                    onClick={() => onRowClick?.(item)}
                    className={`
                      border-b border-neutral-200 hover:bg-neutral-50 transition-colors
                      ${statusStyle.background} ${statusStyle.border}
                      ${onRowClick ? 'cursor-pointer' : ''}
                      ${getRowClassName?.(item) || ''}
                    `}
                  >
                    {displayColumns.map((col) => (
                      <td
                        key={`${String(item[idKey] || index)}-${col.key}`}
                        className={`px-4 py-3 text-sm text-neutral-900 ${
                          col.width || 'w-auto'
                        } text-${col.align || 'left'}`}
                      >
                        {col.render
                          ? col.render(item[col.key], item, index)
                          : (item[col.key] as React.ReactNode) ?? '-'}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {enablePagination && (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
          <span>
            Página {currentPage} de {totalPages || 1} ({processedData.length} registros)
          </span>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                onPageChange?.(Math.max(1, currentPage - 1));
              }}
              disabled={currentPage === 1}
              className="p-2 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
                onPageChange?.(Math.min(totalPages, currentPage + 1));
              }}
              disabled={currentPage === totalPages}
              className="p-2 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalTableEnhanced;
