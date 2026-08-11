/**
 * AirTrust Global Tables Standard
 *
 * This component ensures ALL tables across the application follow the exact same
 * visual and behavioral patterns: sorting indicators, status coloring, pagination, search, etc.
 *
 * @version 1.0.0
 * @date 2025-11-04
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from 'lucide-react';

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  searchable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (value: unknown, item: Record<string, unknown>, index: number) => React.ReactNode;
}

export interface GlobalTableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  idKey?: string;
  title?: string;
  subtitle?: string;

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
export const GlobalTable: React.FC<GlobalTableProps> = ({
  columns,
  data,
  idKey = 'id',
  title,
  subtitle,
  getRowStatus,
  getRowClassName,
  enableSearch = true,
  searchPlaceholder = 'Pesquisar...',
  searchableColumns,
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
  actions,
  className = '',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | 'none'>('none');

  // Determine searchable columns
  const actualSearchableColumns = useMemo(() => {
    if (searchableColumns) return searchableColumns;
    return columns.filter((c) => c.searchable !== false).map((c) => c.key);
  }, [columns, searchableColumns]);

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

    // Apply sort
    if (sortColumn && sortDirection !== 'none') {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];

        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;

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
    return processedData.slice(start, start + pageSize);
  }, [processedData, currentPage, pageSize, enablePagination]);

  const totalPages = Math.ceil(processedData.length / pageSize);

  // Handlers
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setCurrentPage(1);
      onSearch?.(query);
    },
    [onSearch],
  );

  const handleSort = useCallback(
    (columnKey: string) => {
      const column = columns.find((c) => c.key === columnKey);
      if (!column?.sortable) return;

      let newDirection: 'asc' | 'desc' | 'none' = 'asc';
      if (sortColumn === columnKey) {
        if (sortDirection === 'asc') newDirection = 'desc';
        else if (sortDirection === 'desc') newDirection = 'none';
      }

      setSortColumn(newDirection === 'none' ? null : columnKey);
      setSortDirection(newDirection);
      setCurrentPage(1);
      onSort?.(columnKey, newDirection);
    },
    [columns, sortColumn, sortDirection, onSort],
  );

  const renderSortIndicator = (columnKey: string) => {
    const column = columns.find((c) => c.key === columnKey);
    if (!column?.sortable) return null;

    const isActive = sortColumn === columnKey;
    const isAsc = isActive && sortDirection === 'asc';

    if (isActive) {
      return (
        <div className="inline-flex items-center ml-1">
          {isAsc ? (
            <ArrowUp className="w-4 h-4 text-primary font-bold" strokeWidth={3} />
          ) : (
            <ArrowDown className="w-4 h-4 text-primary font-bold" strokeWidth={3} />
          )}
        </div>
      );
    }

    return (
      <div className="inline-flex items-center ml-1 opacity-40">
        <ChevronsUpDown className="w-4 h-4 text-neutral-400" strokeWidth={1.5} />
      </div>
    );
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-neutral-500">Carregando...</div>
        </div>
      </div>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-neutral-500">{emptyMessage}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      {(title || enableSearch || enableExport || actions) && (
        <div className="border-b border-neutral-200 p-6">
          {title && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
              {subtitle && <p className="text-sm text-neutral-600 mt-1">{subtitle}</p>}
            </div>
          )}

          {/* Search and controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {enableSearch && (
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg focus-visible:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {enableExport && (
              <div className="flex gap-2">
                <button
                  onClick={() => onExport?.(processedData, 'csv')}
                  className="flex items-center gap-2 px-3 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
                <button
                  onClick={() => onExport?.(processedData, 'pdf')}
                  className="flex items-center gap-2 px-3 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </button>
              </div>
            )}

            {actions}
          </div>

          {/* Results info */}
          {processedData.length !== data.length && (
            <div className="mt-4 text-sm text-neutral-600">
              {processedData.length} resultado{processedData.length !== 1 ? 's' : ''} encontrado
              {processedData.length !== data.length ? `s de ${data.length}` : ''}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-6 py-3 text-left text-xs font-semibold text-neutral-700 uppercase tracking-wider whitespace-nowrap ${
                    column.sortable ? 'hover:bg-neutral-100 transition-colors' : ''
                  }`}
                  aria-sort={
                    sortColumn === column.key
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : sortDirection === 'desc'
                          ? 'descending'
                          : 'none'
                      : column.sortable
                        ? 'none'
                        : undefined
                  }
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column.key)}
                      className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 rounded"
                    >
                      {column.label}
                      {renderSortIndicator(column.key)}
                    </button>
                  ) : (
                    <div className="flex items-center">{column.label}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {paginatedData.map((item, index) => {
              const rowStatus = getRowStatus?.(item);
              const rowStyleKey = rowStatus as keyof typeof statusStyles;
              const rowStyles = rowStatus ? statusStyles[rowStyleKey] : null;

              return (
                <tr
                  key={`${String(item[idKey] || index)}`}
                  className={`hover:bg-neutral-50 transition-colors ${
                    rowStyles ? `${rowStyles.background} ${rowStyles.border}` : ''
                  } ${getRowClassName?.(item) || ''}`}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((column) => (
                    <td
                      key={`${String(item[idKey])}-${column.key}`}
                      className={`px-6 py-4 ${
                        column.align === 'right' ? 'text-right' : 'text-left'
                      } ${column.align === 'center' ? 'text-center' : ''}`}
                    >
                      {column.render
                        ? column.render(item[column.key], item, index)
                        : ((item[column.key] as React.ReactNode) ?? '-')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {enablePagination && totalPages > 1 && (
        <div className="border-t border-neutral-200 px-6 py-4 flex items-center justify-between bg-neutral-50">
          <div className="text-sm text-neutral-600">
            Página {currentPage} de {totalPages} ({processedData.length} registros)
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCurrentPage(Math.max(1, currentPage - 1));
                onPageChange?.(Math.max(1, currentPage - 1));
              }}
              disabled={currentPage === 1}
              className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
              aria-label="Página anterior"
              title="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPage(Math.min(totalPages, currentPage + 1));
                onPageChange?.(Math.min(totalPages, currentPage + 1));
              }}
              disabled={currentPage === totalPages}
              className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
              aria-label="Próxima página"
              title="Próxima página"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalTable;
