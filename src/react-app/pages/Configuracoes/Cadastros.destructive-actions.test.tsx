import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Cadastros } from './Cadastros';

const { authMock, confirmDialogMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  confirmDialogMock: vi.fn(),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({ useAuth: () => authMock() }));
vi.mock('@/react-app/utils/confirmDialog', () => ({ confirmDialog: confirmDialogMock }));
vi.mock('@/react-app/utils/lazyWithRetry', () => ({
  lazyWithRetry: () => () => null,
}));

const records = {
  funcoes: [{ id: 11, nome: 'Piloto', codigo: 'PIL', ativo: true }],
  setores: [{ id: 12, nome: 'Operações', codigo: 'OPS', ativo: true }],
  modelos: [{ id: 13, modelo: 'A320', ativo: true }],
  aeronaves: [{ id: 14, modelo: 'A320', prefixo: 'PT-ABC', ativo: true }],
};

function jsonResponse(data: unknown) {
  return { ok: true, json: async () => data, text: async () => '' } as Response;
}

describe('Cadastros destructive actions', () => {
  beforeEach(() => {
    authMock.mockReturnValue({ token: 'tenant-token' });
    confirmDialogMock.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) => {
        if (input.includes('/funcoes')) return Promise.resolve(jsonResponse(records.funcoes));
        if (input.includes('/setores')) return Promise.resolve(jsonResponse(records.setores));
        if (input.includes('/modelos-aeronave')) return Promise.resolve(jsonResponse(records.modelos));
        return Promise.resolve(jsonResponse(records.aeronaves));
      }),
    );
  });

  it.each([
    ['função Piloto', 'Mais ações para a função Piloto', 'Excluir função', '/funcoes/11'],
    ['setor Operações', 'Mais ações para o setor Operações', 'Excluir setor', '/setores/12'],
    ['equipamento A320', 'Mais ações para o equipamento A320', 'Excluir equipamento', '/modelos-aeronave/13'],
    ['aeronave PT-ABC', 'Mais ações para a aeronave PT-ABC', 'Excluir aeronave', '/aeronaves/14'],
  ])('keeps %s destructive action secondary and preserves DELETE contract', async (label, triggerLabel, action, endpoint) => {
    const user = userEvent.setup();
    render(<Cadastros />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    vi.mocked(fetch).mockClear();

    if (label.startsWith('setor')) await user.click(screen.getByRole('button', { name: 'Setores' }));
    if (label.startsWith('equipamento')) await user.click(screen.getByRole('button', { name: 'Equipamentos' }));
    if (label.startsWith('aeronave')) await user.click(screen.getByRole('button', { name: 'Aeronaves' }));

    const trigger = await screen.findByRole('button', { name: triggerLabel });
    expect(screen.queryByRole('menuitem', { name: action })).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: action }));

    expect(confirmDialogMock).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();

    confirmDialogMock.mockResolvedValueOnce(true);
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: action }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(endpoint),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});
