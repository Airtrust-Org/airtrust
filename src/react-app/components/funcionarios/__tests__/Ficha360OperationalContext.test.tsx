import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Ficha360OperationalContext from '../Ficha360OperationalContext';

describe('Ficha360OperationalContext', () => {
  it('shows only operational context and routes personal data to the dedicated profile', () => {
    const onOpenPersonalProfile = vi.fn();

    render(
      <Ficha360OperationalContext
        status="ATIVO"
        funcao="Comandante"
        base="SBJR"
        aeronave="AW139"
        licenca="PLA"
        updatedAtLabel="29/08/2026 22:00"
        onOpenPersonalProfile={onOpenPersonalProfile}
      />,
    );

    expect(screen.getByText('Contexto Operacional')).toBeInTheDocument();
    expect(screen.getByText('Comandante')).toBeInTheDocument();
    expect(screen.getByText('AW139')).toBeInTheDocument();
    expect(screen.queryByText(/CPF/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nascimento/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/E-mail|Email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Telefone/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dados pessoais/i }));
    expect(onOpenPersonalProfile).toHaveBeenCalledTimes(1);
  });

  it('renders an inactive status and safe placeholders when optional operational fields are absent', () => {
    render(
      <Ficha360OperationalContext
        status="INATIVO"
        funcao="Mecânico"
        base={null}
        aeronave={null}
        licenca={null}
        updatedAtLabel="-"
        onOpenPersonalProfile={vi.fn()}
      />,
    );

    expect(screen.getByText('INATIVO')).toBeInTheDocument();
    expect(screen.getByText('Mecânico')).toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(4);
  });
});
