import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  nextComplianceTableSort,
  sortComplianceRows,
  SortableComplianceTableHeader,
  type TableSortState,
} from '../SortableComplianceTableHeader';

type TestColumn = 'name' | 'count';

describe('SortableComplianceTableHeader', () => {
  it('alternates the direction when the active column is selected', () => {
    const current: TableSortState<TestColumn> = { key: 'name', direction: 'asc' };

    expect(nextComplianceTableSort(current, 'name')).toEqual({ key: 'name', direction: 'desc' });
    expect(nextComplianceTableSort(current, 'count')).toEqual({ key: 'count', direction: 'asc' });
  });

  it('sorts Portuguese text and numeric values while retaining empty values at the end', () => {
    const rows = [
      { name: 'Álvaro', count: 12 },
      { name: 'Ana', count: 2 },
      { name: '', count: null },
    ];

    expect(
      sortComplianceRows(rows, { key: 'name', direction: 'asc' }, (row, key) => row[key]),
    ).toEqual([rows[0], rows[1], rows[2]]);
    expect(
      sortComplianceRows(rows, { key: 'count', direction: 'desc' }, (row, key) => row[key]),
    ).toEqual([rows[0], rows[1], rows[2]]);
  });

  it('exposes direction to assistive technology and invokes the column callback', () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableComplianceTableHeader
              column="name"
              label="Pessoa"
              sort={{ key: 'name', direction: 'asc' }}
              onSort={onSort}
            />
          </tr>
        </thead>
      </table>,
    );

    expect(screen.getByRole('columnheader', { name: /Pessoa/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    const button = screen.getByRole('button', { name: 'Ordenar por Pessoa em ordem decrescente' });
    fireEvent.click(button);
    expect(onSort).toHaveBeenCalledWith('name');
  });
});
