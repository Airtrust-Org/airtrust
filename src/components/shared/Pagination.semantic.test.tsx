import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination';

describe('shared Pagination semantic accessibility', () => {
  it('exposes the current page, semantic controls and known-zero totals', () => {
    render(
      <Pagination
        currentPage={2}
        totalPages={3}
        onPageChange={vi.fn()}
        hasPrev
        hasNext
        total={0}
        limit={50}
        onLimitChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Paginação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Página anterior' })).toHaveClass(
      'min-h-11',
      'min-w-11',
      'at-focus',
    );
    expect(screen.getAllByRole('combobox', { name: 'Itens por página' })).toHaveLength(2);
    expect(screen.getByText(/Mostrando/)).toHaveTextContent('Mostrando 0 de 0 registros');
  });

  it('preserves page and limit callbacks', () => {
    const onPageChange = vi.fn();
    const onLimitChange = vi.fn();

    render(
      <Pagination
        currentPage={1}
        totalPages={2}
        onPageChange={onPageChange}
        hasPrev={false}
        hasNext
        total={75}
        limit={50}
        onLimitChange={onLimitChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Página 2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    const [mobileLimit] = screen.getAllByRole('combobox', { name: 'Itens por página' });
    fireEvent.change(mobileLimit, { target: { value: '100' } });
    expect(onLimitChange).toHaveBeenCalledWith(100);
  });
});
