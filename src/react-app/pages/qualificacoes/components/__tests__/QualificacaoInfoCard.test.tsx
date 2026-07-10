import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualificacaoInfoCard } from '../QualificacaoInfoCard';

describe('QualificacaoInfoCard', () => {
  it('renders label and value correctly with default classes', () => {
    render(<QualificacaoInfoCard label="Test Label" value="Test Value" />);
    
    expect(screen.getByText('Test Label')).toBeInTheDocument();
    
    const valueEl = screen.getByText('Test Value');
    expect(valueEl).toBeInTheDocument();
    expect(valueEl.className).toContain('font-semibold');
    expect(valueEl.className).toContain('text-slate-900');
  });

  it('renders with custom valueClassName', () => {
    render(
      <QualificacaoInfoCard 
        label="Custom Label" 
        value="Custom Value" 
        valueClassName="text-slate-700" 
      />
    );
    
    const valueEl = screen.getByText('Custom Value');
    expect(valueEl).toBeInTheDocument();
    expect(valueEl.className).toContain('text-slate-700');
    expect(valueEl.className).not.toContain('font-semibold');
  });
});
