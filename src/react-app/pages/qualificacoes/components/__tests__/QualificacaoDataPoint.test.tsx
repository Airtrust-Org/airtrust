import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualificacaoDataPoint } from '../QualificacaoDataPoint';

describe('QualificacaoDataPoint', () => {
  it('renders label and value', () => {
    render(<QualificacaoDataPoint label="My Label" value="My Value" />);
    expect(screen.getByText('My Label')).toBeInTheDocument();
    expect(screen.getByText('My Value')).toBeInTheDocument();
  });
});
