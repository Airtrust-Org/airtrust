import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualificacaoChip } from '../QualificacaoChip';

describe('QualificacaoChip', () => {
  it('renders with default slate color', () => {
    render(<QualificacaoChip>Label</QualificacaoChip>);
    const el = screen.getByText('Label');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('text-slate-600');
  });

  it('renders with purple color', () => {
    render(<QualificacaoChip color="purple">Purple</QualificacaoChip>);
    expect(screen.getByText('Purple').className).toContain('text-purple-700');
  });
});
