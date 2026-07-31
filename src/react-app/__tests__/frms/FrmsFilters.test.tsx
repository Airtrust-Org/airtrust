/**
 * Tests for FrmsFilterContext + FrmsFilterChips
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FrmsFilterProvider, useFrmsFilters } from '../../pages/frms/components/FrmsFilterContext';
import FrmsFilterChips from '../../pages/frms/components/FrmsFilterChips';
import FrmsFilters from '../../pages/frms/components/FrmsFilters';

// Helper to read filter state
function FilterReader() {
  const { filters, periodoNumDias } = useFrmsFilters();
  return (
    <div>
      <span data-testid="periodo">{filters.periodo}</span>
      <span data-testid="periodoNumDias">{periodoNumDias}</span>
      <span data-testid="busca">{filters.busca}</span>
      <span data-testid="status">{JSON.stringify(filters.status)}</span>
    </div>
  );
}

// Helper to write filter state
function FilterWriter() {
  const { setFilter } = useFrmsFilters();
  return (
    <div>
      <button data-testid="set-periodo-90" onClick={() => setFilter('periodo', 90)}>
        90d
      </button>
      <button data-testid="set-busca" onClick={() => setFilter('busca', 'Carlos')}>
        Carlos
      </button>
      <button data-testid="set-status" onClick={() => setFilter('status', ['CRITICO'])}>
        Critico
      </button>
    </div>
  );
}

describe('FrmsFilterContext', () => {
  it('provides default values', () => {
    render(
      <FrmsFilterProvider>
        <FilterReader />
      </FrmsFilterProvider>,
    );
    expect(screen.getByTestId('periodo').textContent).toBe('30');
    expect(screen.getByTestId('periodoNumDias').textContent).toBe('30');
    expect(screen.getByTestId('busca').textContent).toBe('');
    expect(screen.getByTestId('status').textContent).toBe('["OK","ATENCAO","CRITICO","VIOLACAO"]');
  });

  it('setFilter updates state', () => {
    render(
      <FrmsFilterProvider>
        <FilterReader />
        <FilterWriter />
      </FrmsFilterProvider>,
    );
    fireEvent.click(screen.getByTestId('set-periodo-90'));
    expect(screen.getByTestId('periodo').textContent).toBe('90');
    expect(screen.getByTestId('periodoNumDias').textContent).toBe('90');
  });

  it('setFilter updates busca', () => {
    render(
      <FrmsFilterProvider>
        <FilterReader />
        <FilterWriter />
      </FrmsFilterProvider>,
    );
    fireEvent.click(screen.getByTestId('set-busca'));
    expect(screen.getByTestId('busca').textContent).toBe('Carlos');
  });
});

describe('FrmsFilterChips', () => {
  it('renders nothing when all defaults', () => {
    const { container } = render(
      <FrmsFilterProvider>
        <FrmsFilterChips />
      </FrmsFilterProvider>,
    );
    // Should render empty or minimal — no active filters
    const chips = container.querySelectorAll('[data-testid^="frms-chip-"]');
    expect(chips.length).toBe(0);
  });

  it('shows chip when status is set', () => {
    function Setup() {
      const { setFilter } = useFrmsFilters();
      return (
        <>
          <button data-testid="add-status" onClick={() => setFilter('status', ['CRITICO'])}>
            Add
          </button>
          <FrmsFilterChips />
        </>
      );
    }

    render(
      <FrmsFilterProvider>
        <Setup />
      </FrmsFilterProvider>,
    );

    fireEvent.click(screen.getByTestId('add-status'));
    // Chip renders the label "Crítico" (not the key CRITICO)
    expect(screen.getByText('Crítico')).toBeDefined();
  });
});

describe('FrmsFilters', () => {
  it('exposes an accessible clear control and clears the search', () => {
    render(
      <FrmsFilterProvider>
        <FrmsFilters />
      </FrmsFilterProvider>,
    );

    const input = screen.getByTestId('frms-filtro-nome') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Carlos' } });

    const clearButton = screen.getByRole('button', { name: 'Limpar busca' });
    expect(clearButton).toHaveAttribute('type', 'button');
    expect(clearButton.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(clearButton);
    expect(input.value).toBe('');
  });
});
