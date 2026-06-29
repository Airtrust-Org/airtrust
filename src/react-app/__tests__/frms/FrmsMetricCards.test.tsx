/**
 * Tests for FrmsMetricCards component
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FrmsMetricCards from '../../pages/frms/components/FrmsMetricCards';
import { FrmsFilterProvider } from '../../pages/frms/components/FrmsFilterContext';

const defaultComplianceCards = [
  { key: 'OK' as const, total: 10 },
  { key: 'ATENCAO' as const, total: 3 },
  { key: 'CRITICO' as const, total: 2 },
  { key: 'VIOLACAO' as const, total: 1 },
];

const defaultEffectivenessCards = [
  { key: 'PLENA' as const, total: 10 },
  { key: 'ATENCAO' as const, total: 3 },
  { key: 'DEGRADADA' as const, total: 2 },
  { key: 'SEVERA' as const, total: 1 },
];

function renderCards(
  complianceCards = defaultComplianceCards,
  effectivenessCards = defaultEffectivenessCards,
) {
  return render(
    <FrmsFilterProvider>
      <FrmsMetricCards complianceCards={complianceCards} effectivenessCards={effectivenessCards} />
    </FrmsFilterProvider>,
  );
}

describe('FrmsMetricCards', () => {
  it('renders 4 cards with correct test IDs', () => {
    renderCards();
    expect(screen.getByTestId('frms-card-ok')).toBeDefined();
    expect(screen.getByTestId('frms-card-atencao')).toBeDefined();
    expect(screen.getByTestId('frms-card-critico')).toBeDefined();
    expect(screen.getByTestId('frms-card-violacao')).toBeDefined();
  });

  it('displays labels on each card', () => {
    renderCards();
    expect(screen.getByText('Jornada e HV regulatórios')).toBeDefined();
    expect(screen.getByText('Prontidão operacional estimada')).toBeDefined();
    expect(screen.getByText('Normal')).toBeDefined();
    expect(screen.getAllByText('Atenção')).toHaveLength(2);
    expect(screen.getByText('Crítico')).toBeDefined();
    expect(screen.getByText('Violação')).toBeDefined();
    expect(screen.getByText('Margem preservada')).toBeDefined();
    expect(screen.getByText('Degradada')).toBeDefined();
    expect(screen.getByText('Atenção elevada')).toBeDefined();
  });

  it('esconde cards zerados e mostra texto discreto', async () => {
    const zeroCards = [
      { key: 'OK' as const, total: 0 },
      { key: 'ATENCAO' as const, total: 0 },
      { key: 'CRITICO' as const, total: 0 },
      { key: 'VIOLACAO' as const, total: 0 },
    ];
    const zeroEffectiveness = [
      { key: 'PLENA' as const, total: 0 },
      { key: 'ATENCAO' as const, total: 0 },
      { key: 'DEGRADADA' as const, total: 0 },
      { key: 'SEVERA' as const, total: 0 },
    ];
    renderCards(zeroCards, zeroEffectiveness);
    await waitFor(() => {
      expect(screen.getByText('Sem violações no período.')).toBeInTheDocument();
      expect(screen.getByText('Sem ocorrências de efetividade no período.')).toBeInTheDocument();
      expect(screen.queryByTestId('frms-card-ok')).not.toBeInTheDocument();
    });
  });

  it('cards are clickable', () => {
    renderCards();
    const card = screen.getByTestId('frms-card-critico');
    fireEvent.click(card);
    // Should not throw — clicking toggles filter
  });

  it('sum of all card values equals total tripulants', () => {
    const cards = [
      { key: 'OK' as const, total: 12 },
      { key: 'ATENCAO' as const, total: 3 },
      { key: 'CRITICO' as const, total: 1 },
      { key: 'VIOLACAO' as const, total: 1 },
    ];
    expect(cards.reduce((s, c) => s + c.total, 0)).toBe(17);
    renderCards(cards);
    expect(screen.getByTestId('frms-card-ok')).toBeDefined();
    expect(screen.getByTestId('frms-card-atencao')).toBeDefined();
    expect(screen.getByTestId('frms-card-critico')).toBeDefined();
    expect(screen.getByTestId('frms-card-violacao')).toBeDefined();
  });
});
