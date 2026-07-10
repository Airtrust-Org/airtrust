import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualificacaoSectionBox } from '../QualificacaoSectionBox';

describe('QualificacaoSectionBox', () => {
  it('renders default white box without title', () => {
    const { container } = render(<QualificacaoSectionBox>Content</QualificacaoSectionBox>);
    expect(container.firstChild).toHaveClass('bg-white');
  });

  it('renders slate box with title', () => {
    const { container } = render(<QualificacaoSectionBox variant="slate" title="My Title">Content</QualificacaoSectionBox>);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-slate-50');
  });
});
