import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QualificacaoAlert } from '../QualificacaoAlert';

describe('QualificacaoAlert', () => {
  it('renders default slate alert', () => {
    render(<QualificacaoAlert>Alert Msg</QualificacaoAlert>);
    const el = screen.getByText('Alert Msg');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('border-slate-200');
  });

  it('renders rose alert with custom class', () => {
    render(
      <QualificacaoAlert variant="rose" className="custom-class">
        Error
      </QualificacaoAlert>
    );
    const el = screen.getByText('Error');
    expect(el.className).toContain('border-rose-200');
    expect(el.className).toContain('custom-class');
  });
});
