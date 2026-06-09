import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  getAccessToken: () => 'token-teste',
}));

import { FuncionarioCombobox } from '../FuncionarioCombobox';

describe('FuncionarioCombobox', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: 69,
            nome: 'Alexandre Ramos',
            matricula: 'AT-069',
            funcao: 'PILOTO',
            status: 'ATIVO',
          },
        ],
      }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('busca em /funcionarios com auth header e seleciona participante', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<FuncionarioCombobox onSelect={onSelect} placeholder="Participante 1..." />);

    const input = screen.getByPlaceholderText('Participante 1...');
    fireEvent.change(input, { target: { value: 'ra' } });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:8787/api/funcionarios?search=ra&limit=20',
        expect.objectContaining({
          headers: { Authorization: 'Bearer token-teste' },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    const option = await screen.findByText('Alexandre Ramos');
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 69,
        nome: 'Alexandre Ramos',
      }),
    );
  });

  it('mostra erro e permite tentar novamente', async () => {
    vi.mocked(globalThis.fetch)
      .mockRejectedValueOnce(new Error('Falha de rede'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response);

    const user = userEvent.setup();
    render(<FuncionarioCombobox onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Buscar funcionário...'), {
      target: { value: 'ra' },
    });

    expect(await screen.findByText('Falha de rede')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  });
});
