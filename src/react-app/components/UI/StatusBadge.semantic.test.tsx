import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './StatusBadge';

describe('StatusBadge semantic states', () => {
  it.each([
    ['VALIDA', 'at-status-success'],
    ['A_VENCER', 'at-status-attention'],
    ['ALERTA', 'at-status-risk'],
    ['CRITICO', 'at-status-critical'],
    ['ABERTO', 'at-status-info'],
  ] as const)('maps %s to %s', (status, semanticClass) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(/.+/)).toHaveClass(semanticClass);
  });

  it('keeps the optional dot decorative and inherits the semantic status color', () => {
    render(<StatusBadge status="APROVADO" dot />);
    const badge = screen.getByText('Aprovado');
    expect(badge).toHaveClass('at-status-success');
    expect(badge.querySelector('[aria-hidden="true"]')).toHaveClass('bg-current');
  });
});
