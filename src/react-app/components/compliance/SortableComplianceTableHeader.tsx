import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type TableSortDirection = 'asc' | 'desc';

export type TableSortState<Key extends string> = {
  key: Key;
  direction: TableSortDirection;
};

export function nextComplianceTableSort<Key extends string>(
  current: TableSortState<Key>,
  key: Key,
): TableSortState<Key> {
  return {
    key,
    direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  };
}

const collator = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base',
});

function isEmpty(value: unknown) {
  return value == null || value === '';
}

export function sortComplianceRows<Row, Key extends string>(
  rows: readonly Row[],
  sort: TableSortState<Key>,
  valueFor: (row: Row, key: Key) => string | number | null | undefined,
): Row[] {
  return [...rows].sort((left, right) => {
    const leftValue = valueFor(left, sort.key);
    const rightValue = valueFor(right, sort.key);
    if (isEmpty(leftValue) && isEmpty(rightValue)) return 0;
    if (isEmpty(leftValue)) return 1;
    if (isEmpty(rightValue)) return -1;

    const comparison =
      typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : collator.compare(String(leftValue), String(rightValue));
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

export function SortableComplianceTableHeader<Key extends string>({
  column,
  label,
  sort,
  onSort,
  className = 'px-3 py-3 text-left',
}: {
  column: Key;
  label: string;
  sort: TableSortState<Key>;
  onSort: (column: Key) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1.5 font-semibold transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label={`Ordenar por ${label} em ordem ${active && sort.direction === 'asc' ? 'decrescente' : 'crescente'}`}
      >
        {label}
        <Icon
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-slate-400'}`}
        />
      </button>
    </th>
  );
}
