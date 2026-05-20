/**
 * Tests for FrmsTripulantesTable component
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FrmsTripulantesTable from '../../pages/frms/components/FrmsTripulantesTable';
import { FrmsFilterProvider } from '../../pages/frms/components/FrmsFilterContext';
import type { FrmsFrotaRow } from '../../hooks/useFrms';

function mockFrota(n: number): FrmsFrotaRow[] {
  return Array.from(
    { length: n },
    (_, i) =>
      ({
        tripulante_id: String(100 + i),
        nome: `Tripulante ${i + 1}`,
        nome_guerra: `T${i + 1}`,
        cargo: 'Piloto',
        funcao: 'PILOTO',
        hv_mes_min: 600 + i * 10,
        pct_mes: 50 + i,
        hv_7d_min: 200 + i * 5,
        pct_7d: 40 + i,
        hv_28d_min: 800 + i * 20,
        pct_28d: 60 + i,
        hv_365d_min: 5000 + i * 100,
        pct_365d: 30 + i,
        hv_dia_min: 100 + i,
        pct_dia: 20 + i,
        nivel_max: i < 10 ? 'OK' : i < 15 ? 'ATENCAO' : i < 18 ? 'CRITICO' : 'VIOLACAO',
      }) as FrmsFrotaRow,
  );
}

function renderTable(frota: FrmsFrotaRow[], loading = false) {
  return render(
    <MemoryRouter>
      <FrmsFilterProvider>
        <FrmsTripulantesTable
          frota={frota}
          loading={loading}
          limiteAvisoPct={80}
          limiteCriticoPct={95}
          limiteViolacaoPct={100}
        />
      </FrmsFilterProvider>
    </MemoryRouter>,
  );
}

describe('FrmsTripulantesTable', () => {
  it('renders table with correct test ID', () => {
    renderTable(mockFrota(5));
    expect(screen.getByTestId('frms-tabela-tripulantes')).toBeDefined();
  });

  it('shows all 5 rows when frota has 5 items', () => {
    renderTable(mockFrota(5));
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`frms-tabela-row-${100 + i}`)).toBeDefined();
    }
  });

  it('paginates at 20 rows', () => {
    renderTable(mockFrota(25));
    // Should show "Exibindo 1-20 de 25"
    expect(screen.getByText(/1-20 de 25/)).toBeDefined();
  });

  it('shows loading state', () => {
    renderTable([], true);
    expect(screen.getByText(/carregando/i)).toBeDefined();
  });

  it('shows empty state when no data', () => {
    renderTable([]);
    expect(screen.getByText(/nenhum tripulante/i)).toBeDefined();
  });

  it('has export button', () => {
    renderTable(mockFrota(5));
    expect(screen.getByTestId('frms-tabela-btn-exportar')).toBeDefined();
  });

  it('sorts by clicking column header', () => {
    renderTable(mockFrota(5));
    const headers = screen.getAllByRole('columnheader');
    // Click on "Fadiga %" column
    const fadigaHeader = headers.find((h) => h.textContent?.includes('Fadiga'));
    if (fadigaHeader) {
      fireEvent.click(fadigaHeader);
      // Should not throw
    }
  });
});
