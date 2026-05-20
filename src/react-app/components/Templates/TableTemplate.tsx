import React, { useState } from 'react';
import styles from './templates.module.css';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
}

interface TableTemplateProps {
  title: string;
  columns: Column[];
  data: Array<Record<string, string | number | boolean>>;
  onRowClick?: (row: Record<string, string | number | boolean>) => void;
  searchable?: boolean;
  filters?: React.ReactNode;
  actions?: (row: Record<string, string | number | boolean>) => React.ReactNode;
}

export const TableTemplate: React.FC<TableTemplateProps> = ({
  title,
  columns,
  data,
  onRowClick,
  searchable = true,
  filters,
  actions,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);

  const filteredData = data.filter((row) =>
    Object.values(row).some(
      (val) => val && val.toString().toLowerCase().includes(searchTerm.toLowerCase()),
    ),
  );

  const sortedData = sortKey
    ? [...filteredData].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDesc ? -comparison : comparison;
      })
    : filteredData;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(false);
    }
  };

  return (
    <div className={styles.pageLayout}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{title}</h1>
      </div>

      {/* Filter Row */}
      <div className={styles.filterRow}>
        {searchable && (
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
        )}
        {filters}
      </div>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  style={{ width: col.width }}
                  className={col.sortable ? styles.sortable : ''}
                >
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    <span className={styles.sortIcon}>{sortDesc ? ' ▼' : ' ▲'}</span>
                  )}
                </th>
              ))}
              {actions && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? styles.clickable : ''}
              >
                {columns.map((col) => (
                  <td key={col.key}>{row[col.key]}</td>
                ))}
                {actions && <td>{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedData.length === 0 && (
        <div className={styles.emptyState}>
          <p>No data found</p>
        </div>
      )}
    </div>
  );
};

export default TableTemplate;
