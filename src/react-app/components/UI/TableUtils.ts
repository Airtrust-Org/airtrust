/**
 * Table Standard Utilities
 * Helper functions for the global table standard
 */

/**
 * Determine global status based on expiry date
 */
export const getGlobalRowStatus = (
  item: Record<string, unknown>,
  expiryDateField: string
): 'valid' | 'expiring' | 'expired' | 'revoked' | 'total' | undefined => {
  const expiryValue = item[expiryDateField];
  if (!expiryValue || typeof expiryValue !== 'string') return undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiryDate = new Date(expiryValue);
  expiryDate.setHours(0, 0, 0, 0);

  const daysUntilExpiry = Math.ceil(
    (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring';
  return 'valid';
};

/**
 * Global status color styles used across all tables
 */
export const statusStyles = {
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

/**
 * Default column configurations for common table patterns
 */
export const defaultTableColumns = {
  actions: {
    key: 'actions',
    label: 'Ações',
    sortable: false,
    searchable: false,
    align: 'right' as const,
  },
  id: {
    key: 'id',
    label: 'ID',
    sortable: true,
    searchable: false,
  },
  nome: {
    key: 'nome',
    label: 'Nome',
    sortable: true,
    searchable: true,
  },
  email: {
    key: 'email',
    label: 'Email',
    sortable: true,
    searchable: true,
  },
  status: {
    key: 'status',
    label: 'Status',
    sortable: true,
    searchable: false,
  },
  dataCriacao: {
    key: 'data_criacao',
    label: 'Data de Criação',
    sortable: true,
    searchable: false,
  },
};

/**
 * Pagination sizes available in all tables
 */
export const TABLE_PAGE_SIZES = [10, 25, 50, 100];

/**
 * Export format options
 */
export const EXPORT_FORMATS = ['csv', 'pdf', 'excel'] as const;
