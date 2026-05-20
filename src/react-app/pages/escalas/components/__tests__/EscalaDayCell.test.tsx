import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EscalaDayCell } from '../EscalaDayCell';

describe('EscalaDayCell', () => {
  it('renderiza sigla configuravel de duas letras no quadrado', () => {
    render(
      <EscalaDayCell
        events={[
          {
            type: 'SIMULADOR',
            label: 'Treinamento Simulador',
            badgeLabel: 'TS',
            backgroundColor: '#6366F1',
          },
        ]}
      />,
    );

    expect(screen.getByText('TS')).toBeInTheDocument();
  });

  it('mantem tokens compactos como 2P sem reduzi-los para uma letra', () => {
    render(
      <EscalaDayCell
        events={[
          {
            type: 'ALOCACAO',
            label: '2P',
            backgroundColor: '#3B82F6',
          },
        ]}
      />,
    );

    expect(screen.getByText('2P')).toBeInTheDocument();
  });

  it('preserva maiusculas e minusculas da sigla configurada', () => {
    render(
      <EscalaDayCell
        events={[
          {
            type: 'SIMULADOR',
            label: 'Treinamento Simulador',
            badgeLabel: 'Si',
            backgroundColor: '#6366F1',
          },
        ]}
      />,
    );

    expect(screen.getByText('Si')).toBeInTheDocument();
  });

  it('aplica texto escuro quando a cor do quadrado e muito clara', () => {
    render(
      <EscalaDayCell
        events={[
          {
            type: 'FOLGA',
            label: 'Folga',
            badgeLabel: 'Fo',
            backgroundColor: '#FDE68A',
            textColor: '#000000',
          },
        ]}
      />,
    );

    expect(screen.getByText('Fo').parentElement).toHaveStyle({ color: '#000000' });
  });
});
