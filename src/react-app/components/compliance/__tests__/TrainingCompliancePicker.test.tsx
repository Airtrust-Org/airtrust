import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrainingCompliancePicker } from '../TrainingCompliancePicker';

describe('TrainingCompliancePicker', () => {
  const tipos = [
    { id: 1, nome: 'Zulu', codigo: 'Z-1', area_nome: 'Operações' },
    { id: 2, nome: 'Álgebra de voo', codigo: 'A-2', area_nome: 'Operações' },
    { id: 3, nome: 'Manutenção básica', codigo: 'M-1', area_nome: 'Manutenção' },
    { id: 4, nome: 'Sem classificação', codigo: 'S-1', area_nome: null },
  ];

  it('groups options by area and sorts areas and trainings alphabetically', () => {
    render(<TrainingCompliancePicker tipos={tipos} value={null} onChange={vi.fn()} />);

    const select = screen.getByRole('combobox', { name: /treinamento/i });
    const groups = within(select).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('label'))).toEqual([
      'Manutenção',
      'Operações',
      'Sem área definida',
    ]);
    expect(within(groups[1]).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Álgebra de voo (A-2)',
      'Zulu (Z-1)',
    ]);
  });

  it('filters by training, code, and area before selecting', () => {
    const onChange = vi.fn();
    render(<TrainingCompliancePicker tipos={tipos} value={null} onChange={onChange} />);

    fireEvent.change(screen.getByRole('searchbox', { name: /buscar treinamento/i }), {
      target: { value: 'manutenção' },
    });
    expect(screen.getByRole('option', { name: 'Manutenção básica (M-1)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Zulu (Z-1)' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: /treinamento/i }), {
      target: { value: '3' },
    });
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
