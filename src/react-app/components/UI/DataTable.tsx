/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Edit2, Trash2, Eye } from 'lucide-react';
import { classHelpers, iconWrappers } from '@/react-app/styles/design-tokens';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

type SortDirection = 'asc' | 'desc' | null;
type RowStatus = 'valid' | 'expiring' | 'expired' | 'revoked' | 'total' | undefined;

interface DataTableColumn {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (value: any, item: any) => React.ReactNode;
}

interface DataTableProps {
  columns: DataTableColumn[];
  data: any[];
  onEdit?: (id: string | number) => void;
  onDelete?: (id: string | number) => void;
  onView?: (id: string | number) => void;
  getRowStatus?: (item: any) => RowStatus;
  idKey?: string;
  loading?: boolean;
  emptyMessage?: string;
  showActions?: boolean;
}

/**
 * Global DataTable Component
 * Features:
 * - Sortable columns with visual indicators
 * - Status-based row coloring
 * - Inline actions (edit, delete, view)
 * - Responsive design
 */
export function DataTable({
  columns,
  data,
  onEdit,
  onDelete,
  onView,
  getRowStatus,
  idKey = 'id',
  loading = false,
  emptyMessage = 'Nenhum dado disponível',
  showActions = true,
}: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Get row background color based on status
  const getRowBackgroundColor = (status: RowStatus) => {
    if (!status) return 'bg-white';

    switch (status) {
      case 'valid':
        return 'bg-green-50 hover:bg-green-100';
      case 'expiring':
        return 'bg-yellow-50 hover:bg-yellow-100';
      case 'expired':
        return 'bg-red-50 hover:bg-red-100';
      case 'revoked':
        return 'bg-neutral-100 hover:bg-neutral-200';
      case 'total':
        return 'bg-primary/10 hover:bg-primary/20';
      default:
        return 'bg-white hover:bg-neutral-50';
    }
  };

  // Get border color for status
  const getRowBorderColor = (status: RowStatus) => {
    switch (status) {
      case 'valid':
        return 'border-l-4 border-green-600';
      case 'expiring':
        return 'border-l-4 border-yellow-600';
      case 'expired':
        return 'border-l-4 border-red-600';
      case 'revoked':
        return 'border-l-4 border-neutral-400';
      case 'total':
        return 'border-l-4 border-primary';
      default:
        return '';
    }
  };

  // Sorting logic
  const handleSort = (columnKey: string) => {
    const column = columns.find((c) => c.key === columnKey);
    if (!column?.sortable) return;

    if (sortColumn === columnKey) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;

    const sorted = [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDirection === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      return 0;
    });

    return sorted;
  }, [data, sortColumn, sortDirection]);

  // Render sort indicator
  const renderSortIndicator = (columnKey: string) => {
    if (!columns.find((c) => c.key === columnKey)?.sortable) return null;

    if (sortColumn !== columnKey) {
      return <ChevronDown className={`${iconWrappers.sm} text-neutral-300`} />;
    }

    return sortDirection === 'asc' ? (
      <ChevronUp className={`${iconWrappers.sm} text-primary-600`} />
    ) : (
      <ChevronDown className={`${iconWrappers.sm} text-primary-600`} />
    );
  };

  if (loading) {
    return (
      <div className={classHelpers.centerContent + ' h-96'}>
        <div className="text-neutral-500">Carregando...</div>
      </div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className={classHelpers.centerContent + ' h-96'}>
        <div className="text-neutral-500">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-200 bg-neutral-50">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-6 py-3 text-left text-sm font-semibold text-neutral-900 ${
                  column.sortable ? 'cursor-pointer hover:bg-neutral-100' : ''
                }`}
                style={{ width: column.width }}
                onClick={() => column.sortable && handleSort(column.key)}
              >
                <div className="flex items-center gap-2">
                  {column.label}
                  {column.sortable && renderSortIndicator(column.key)}
                </div>
              </th>
            ))}
            {showActions && (
              <th className="px-6 py-3 text-left text-sm font-semibold text-neutral-900">Ações</th>
            )}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((item, index) => {
            const rowStatus = getRowStatus?.(item);
            const backgroundColor = getRowBackgroundColor(rowStatus);
            const borderColor = getRowBorderColor(rowStatus);

            return (
              <tr
                key={item[idKey] || index}
                className={`border-b border-neutral-200 transition-colors duration-150 ${backgroundColor} ${borderColor}`}
              >
                {columns.map((column) => (
                  <td
                    key={`${item[idKey]}-${column.key}`}
                    className="px-6 py-4 text-sm text-neutral-700"
                    style={{ width: column.width }}
                  >
                    {column.render ? (
                      column.render(item[column.key], item)
                    ) : (
                      <span>{item[column.key]}</span>
                    )}
                  </td>
                ))}
                {showActions && (
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {onView && (
                        <button
                          onClick={() => onView(item[idKey])}
                          className="text-primary hover:text-primary transition-colors"
                          title="Visualizar"
                        >
                          <Eye className={iconWrappers.sm} />
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={() => onEdit(item[idKey])}
                          className="text-primary-600 hover:text-primary-800 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className={iconWrappers.sm} />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={async () => {
                            if (await confirmDialog('Tem certeza que deseja deletar?')) {
                              onDelete(item[idKey]);
                            }
                          }}
                          className="text-red-600 hover:text-red-800 transition-colors"
                          title="Deletar"
                        >
                          <Trash2 className={iconWrappers.sm} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
