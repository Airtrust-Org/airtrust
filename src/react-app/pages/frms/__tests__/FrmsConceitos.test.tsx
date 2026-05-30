import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FrmsConceitos from '../FrmsConceitos';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('FrmsConceitos', () => {
  it('mostra limite de 365 dias em 930h e nao em 960h', () => {
    render(<FrmsConceitos />);

    expect(screen.getAllByText(/930\s*h/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/960 h/i)).not.toBeInTheDocument();
  });

  it('reforca que o uso e operacional e de triagem, sem diagnostico medico', () => {
    render(<FrmsConceitos />);

    expect(screen.getAllByText(/triagem operacional/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/KSS não entra na fórmula de effectiveness atual/i)).toBeInTheDocument();
    expect(screen.getAllByText(/proxy local/i).length).toBeGreaterThan(0);
  });
});
