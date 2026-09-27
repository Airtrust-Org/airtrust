import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/react-app/hooks/useFrms', () => ({
  useFrmsConfiguracoes: () => ({
    data: {
      limites: {
        ALERTA_AVISO_PCT: 82,
        ALERTA_ATENCAO_PCT: 91,
        ALERTA_CRITICO_PCT: 97,
        ALERTA_VIOLACAO_PCT: 100,
        EFFECTIV_VERDE_MIN: 90,
        EFFECTIV_AMARELO_MAX: 77,
        EFFECTIV_VERMELHO_MAX: 65,
        HV_365_DIAS_HORAS: 930,
      },
    },
  }),
}));

import FrmsConceitos from '../FrmsConceitos';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('FrmsConceitos', () => {
  it('usa thresholds governados e nao reintroduz limite anual obsoleto de 960h', () => {
    render(<FrmsConceitos />);

    expect(screen.getAllByText(/82%/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/91%/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/97%/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/960 h/i)).not.toBeInTheDocument();
  });

  it('reforca que o uso e operacional e de triagem, sem diagnostico medico', () => {
    render(<FrmsConceitos />);

    expect(screen.getAllByText(/triagem operacional/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/KSS não entra na fórmula de effectiveness atual/i)).toBeInTheDocument();
    expect(screen.getAllByText(/proxy local/i).length).toBeGreaterThan(0);
  });
});
