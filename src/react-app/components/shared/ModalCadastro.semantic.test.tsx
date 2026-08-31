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

function getRequiredNomeField() {
  return screen.getByRole('textbox', { name: 'Nome' });
}

function getCadastroForm() {
  const form = getRequiredNomeField().closest('form');
  expect(form).not.toBeNull();
  return form as HTMLFormElement;
}

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

    const form = getCadastroForm();
    expect(screen.getByRole('dialog', { name: 'Novo cadastro' })).toBeInTheDocument();
    expect(getRequiredNomeField()).toHaveClass('at-field', 'at-focus', 'min-h-11');
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveClass(
      'at-field',
      'at-focus',
      'min-h-11',
    );
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveClass('min-h-11', 'at-focus');
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('form', form.id);
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

    fireEvent.change(getRequiredNomeField(), { target: { value: 'Cadastro válido' } });
    fireEvent.submit(getCadastroForm());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível concluir a operação.');
    });
    expect(screen.queryByText(/SQLITE_ERROR/i)).not.toBeInTheDocument();
  });

  it('covers defaults, optional field fallbacks and field change paths', () => {
    const optionalFields = [
      { name: 'nome', label: 'Nome', type: 'text' as const },
      { name: 'quantidade', label: 'Quantidade', type: 'number' as const },
      { name: 'observacoes', label: 'Observações', type: 'textarea' as const },
      { name: 'categoria', label: 'Categoria', type: 'select' as const },
      { name: 'ativo', label: 'Ativo', type: 'checkbox' as const },
      {
        name: 'disponivel',
        label: 'Disponível',
        type: 'checkbox' as const,
        placeholder: 'Disponível para uso',
      },
    ];
    const onClose = vi.fn();

    render(
      <ModalCadastro
        isOpen
        onClose={onClose}
        title="Cadastro opcional"
        fields={optionalFields}
        onSave={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('');
    expect(screen.getByLabelText('Quantidade')).toHaveValue(null);
    expect(screen.getByLabelText('Observações')).toHaveValue('');
    expect(screen.getByLabelText('Categoria')).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Disponível para uso' })).toBeChecked();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo nome' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Observação' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ativo' }));

    expect(screen.getByLabelText('Nome')).toHaveValue('Novo nome');
    expect(screen.getByLabelText('Quantidade')).toHaveValue(3);
    expect(screen.getByLabelText('Observações')).toHaveValue('Observação');
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prefills initial data, submits edited values and closes after a successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ModalCadastro
        isOpen
        onClose={onClose}
        title="Editar cadastro"
        fields={fields}
        initialData={{ nome: 'Cadastro anterior', tipo: 'asa-fixa' }}
        onSave={onSave}
      />,
    );

    expect(getRequiredNomeField()).toHaveValue('Cadastro anterior');
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveValue('asa-fixa');

    fireEvent.change(getRequiredNomeField(), { target: { value: 'Cadastro atualizado' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Tipo' }), {
      target: { value: 'helicoptero' },
    });
    fireEvent.submit(getCadastroForm());

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        nome: 'Cadastro atualizado',
        tipo: 'helicoptero',
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
