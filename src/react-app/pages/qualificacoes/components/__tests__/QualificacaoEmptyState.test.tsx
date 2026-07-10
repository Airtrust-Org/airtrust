import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualificacaoEmptyState } from '../QualificacaoEmptyState';
import { Tag } from 'lucide-react';

describe('QualificacaoEmptyState', () => {
  it('renders title and description', () => {
    render(
      <QualificacaoEmptyState 
        title="Test Title" 
        description="Test Desc" 
        icon={Tag} 
      />
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Desc')).toBeInTheDocument();
  });
});
