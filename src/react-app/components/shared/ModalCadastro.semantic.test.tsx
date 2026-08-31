import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ModalCadastro } from './ModalCadastro';

const fields = [
  { name: 'nome', label: 'Nome', type: 'text' as const, required: true },
  {
    name: 'tipo',
    label: 'Tipo',
    type: 'select' as const,
    options: [
      { value: 'asa-fixa', label: 'Asa fixa' },
      { value: 'helicoptero', label: 'Helicóptero' },
    ],
  },
];

describe('ModalCadastro semantic accessibility', () => {
  it('uses the shared accessible modal and associates labels with semantic fields', () => {
    render(
      <ModalCadastro
        isOpen
        onClose={vi.fn()}
        title="Novo cadastro"
        fields={fields}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Novo cadastro' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveClass('at-field', 'at-focus', 'min-h-11');
    expect(screen.getByLabelText('Tipo')).toHaveClass('at-field', 'at-focus', 'min-h-11');
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveClass('min-h-11', 'at-focus');
  });

  it('sanitizes technical save errors before rendering them to the user', async () => {
    render(
      <ModalCadastro
        isOpen
        onClose={vi.fn()}
        title="Novo cadastro"
        fields={fields}
        onSave={vi.fn().mockRejectedValue(new Error('SQLITE_ERROR: no such table: setores'))}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível concluir a operação.');
    });
    expect(screen.queryByText(/SQLITE_ERROR/i)).not.toBeInTheDocument();
  });
});
