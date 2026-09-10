import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AeronaveSelect from '../AeronaveSelect';

const { useApiMock } = vi.hoisted(() => ({ useApiMock: vi.fn() }));

vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

describe('AeronaveSelect coverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders placeholder when aircraft data is absent', () => {
    useApiMock.mockReturnValue({ data: undefined });
    render(<AeronaveSelect value="" onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Selecione uma aeronave' })).toBeInTheDocument();
    expect(useApiMock).toHaveBeenCalledWith('/api/aeronaves');
  });

  it('renders aircraft options, custom props and propagates selection', () => {
    const onChange = vi.fn();
    useApiMock.mockReturnValue({
      data: [
        { id: 1, codigo: 'PR-AAA', nome: 'AW139' },
        { id: 2, codigo: 'PR-BBB', nome: 'S76' },
      ],
    });

    render(
      <AeronaveSelect
        value="PR-AAA"
        onChange={onChange}
        className="qa-select"
        placeholder="Escolha"
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('qa-select');
    expect(screen.getByRole('option', { name: 'Escolha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PR-AAA - AW139' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PR-BBB - S76' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'PR-BBB' } });
    expect(onChange).toHaveBeenCalledWith('PR-BBB');
  });
});
