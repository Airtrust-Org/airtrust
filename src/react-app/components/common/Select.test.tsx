import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './Select';

describe('shared Select', () => {
  it('uses the semantic field/focus primitives and a 44px touch target', () => {
    render(
      <Select
        value=""
        onChange={vi.fn()}
        ariaLabel="Status"
        options={[{ value: 'ativo', label: 'Ativo' }]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Status' });
    expect(select).toHaveClass('at-field', 'at-focus', 'min-h-11');
  });

  it('preserves placeholder/options and reports the selected value', () => {
    const onChange = vi.fn();
    render(
      <Select
        value=""
        onChange={onChange}
        ariaLabel="Situação"
        options={[{ value: 'ativo', label: 'Ativo' }]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Situação' });
    expect(screen.getByRole('option', { name: 'Selecione...' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'ativo' } });
    expect(onChange).toHaveBeenCalledWith('ativo');
  });
});
