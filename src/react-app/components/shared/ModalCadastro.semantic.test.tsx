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

const extendedFields = [
  ...fields,
  {
    name: 'observacoes',
    label: 'Observações',
    type: 'textarea' as const,
    placeholder: 'Detalhes do cadastro',
  },
  { name: 'ativo', label: 'Ativo', type: 'checkbox' as const },
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

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cadastro válido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível concluir a operação.');
    });
    expect(screen.queryByText(/SQLITE_ERROR/i)).not.toBeInTheDocument();
  });

  it('prefills every field type, submits edited values and exposes the loading state', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const onClose = vi.fn();

    render(
      <ModalCadastro
        isOpen
        onClose={onClose}
        title="Editar cadastro"
        fields={extendedFields}
        initialData={{
          nome: 'Cadastro anterior',
          tipo: 'asa-fixa',
          observacoes: 'Observação anterior',
          ativo: false,
        }}
        onSave={onSave}
      />,
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('Cadastro anterior');
    expect(screen.getByLabelText('Tipo')).toHaveValue('asa-fixa');
    expect(screen.getByLabelText('Observações')).toHaveValue('Observação anterior');
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).not.toBeChecked();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cadastro atualizado' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'helicoptero' } });
    fireEvent.change(screen.getByLabelText('Observações'), {
      target: { value: 'Observação atualizada' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        nome: 'Cadastro atualizado',
        tipo: 'helicoptero',
        observacoes: 'Observação atualizada',
        ativo: true,
      });
      expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    });

    resolveSave();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('creates checkbox defaults and cancels without persisting', () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ModalCadastro
        isOpen
        onClose={onClose}
        title="Novo cadastro"
        fields={extendedFields}
        onSave={onSave}
      />,
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('');
    expect(screen.getByLabelText('Observações')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
