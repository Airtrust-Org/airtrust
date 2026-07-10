import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualificacaoStatusBadge } from '../QualificacaoStatusBadge';

describe('QualificacaoStatusBadge', () => {
  it('renders standard status correctly (e.g. VALIDA)', () => {
    render(<QualificacaoStatusBadge status="VALIDA" />);
    // getStatusLabel returns 'Válida' for 'VALIDA'
    const badge = screen.getByText('Válida');
    expect(badge).toBeInTheDocument();
    // Check if color classes from getStatusColor are applied
    expect(badge.className).toContain('bg-success-600/10');
    expect(badge.className).toContain('text-success-600');
  });

  it('renders standard status correctly (e.g. VENCIDA)', () => {
    render(<QualificacaoStatusBadge status="VENCIDA" />);
    // getStatusLabel returns 'Vencida' for 'VENCIDA'
    const badge = screen.getByText('Vencida');
    expect(badge).toBeInTheDocument();
    // Check if color classes from getStatusColor are applied
    expect(badge.className).toContain('bg-danger-600/10');
    expect(badge.className).toContain('text-danger-600');
  });

  it('renders isRenovada override correctly', () => {
    render(<QualificacaoStatusBadge status="VENCIDA" isRenovada={true} />);
    // When isRenovada is true, the label is always 'Renovada' regardless of status
    const badge = screen.getByText('Renovada');
    expect(badge).toBeInTheDocument();
    // Check if the specific blue colors are applied
    expect(badge.className).toContain('bg-blue-600/10');
    expect(badge.className).toContain('text-blue-600');
  });
});
