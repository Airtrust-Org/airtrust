import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigurarColunas, {
  DEFAULT_COLUNAS,
  FUNCIONARIOS_COLUNAS_STORAGE_KEY,
} from '../ConfigurarColunas';

describe('ConfigurarColunas', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('permite revelar uma coluna privada, reordenar, restaurar e salvar a configuração', async () => {
    const onSalvar = vi.fn();
    const onClose = vi.fn();

    render(<ConfigurarColunas onSalvar={onSalvar} onClose={onClose} />);

    const cpfToggle = screen.getByRole('button', { name: 'Mostrar coluna CPF' });
    fireEvent.click(cpfToggle);
    expect(screen.getByRole('button', { name: 'Ocultar coluna CPF' })).toBeInTheDocument();

    const nomeRow = screen.getByText('Nome').closest('[draggable="true"]');
    const statusRow = screen.getByText('Status').closest('[draggable="true"]');
    expect(nomeRow).not.toBeNull();
    expect(statusRow).not.toBeNull();

    fireEvent.dragStart(nomeRow!);
    fireEvent.dragEnter(statusRow!);
    fireEvent.dragOver(statusRow!);
    fireEvent.drop(statusRow!);
    fireEvent.dragEnd(nomeRow!);

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão seguro' }));
    expect(screen.getByRole('button', { name: 'Mostrar coluna CPF' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar coluna CPF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }));

    expect(onSalvar).toHaveBeenCalledTimes(1);
    const saved = onSalvar.mock.calls[0][0] as typeof DEFAULT_COLUNAS;
    expect(saved.find((coluna) => coluna.id === 'cpf')?.visivel).toBe(true);
    expect(saved.map((coluna) => coluna.ordem)).toEqual(saved.map((_, index) => index));
    expect(JSON.parse(localStorage.getItem(FUNCIONARIOS_COLUNAS_STORAGE_KEY) || '[]')).toEqual(saved);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mescla preferências salvas com o padrão seguro atual', async () => {
    localStorage.setItem(
      FUNCIONARIOS_COLUNAS_STORAGE_KEY,
      JSON.stringify([
        { id: 'nome', label: 'Nome antigo', visivel: false, ordem: 1 },
        { id: 'cpf', label: 'CPF', visivel: true, ordem: 0 },
      ]),
    );

    render(<ConfigurarColunas onSalvar={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ocultar coluna CPF' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Mostrar coluna Nome antigo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fechar configuração de colunas' })).not.toBeInTheDocument();
  });

  it('ignora preferência inválida e mantém o padrão seguro', async () => {
    localStorage.setItem(FUNCIONARIOS_COLUNAS_STORAGE_KEY, '{invalido');

    render(<ConfigurarColunas onSalvar={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Mostrar coluna CPF' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Ocultar coluna Nome' })).toBeInTheDocument();
  });
});
