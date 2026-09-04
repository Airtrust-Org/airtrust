import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CrudManobras from '../index';

const mockManobra = {
  id: 42,
  codigo: 'MAN-042',
  nome: 'Autorrotação com 180 graus',
  categoria: 'EMERGENCIA',
  tipo_aeronave: 'AW139',
  descricao: 'Manobra de emergência simulada',
  nivel_dificuldade: 'AVANCADO' as const,
  tempo_estimado: 30,
  pontuacao_minima: 80,
};

const mockCategoria = {
  id: 1,
  codigo: 'EMERGENCIA',
  nome: 'Procedimentos de Emergência',
};

describe('CrudManobras (active /simuladores/cadastros/manobras) — destructive actions contract', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? 'GET';

        if (method === 'GET') {
          if (urlStr.includes('/simuladores/manobras')) {
            return {
              ok: true,
              json: async () => ({ success: true, data: [mockManobra] }),
            } as Response;
          }
          if (urlStr.includes('/simuladores/categorias')) {
            return {
              ok: true,
              json: async () => ({ success: true, data: [mockCategoria] }),
            } as Response;
          }
        }

        if (method === 'DELETE') {
          return {
            ok: true,
            json: async () => ({ success: true }),
          } as Response;
        }

        return { ok: true, json: async () => ({ success: true }) } as Response;
      }),
    );

    vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const getDeleteCalls = () =>
    (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );

  it('preserves Editar as accessible primary action and does not render direct destructive button', async () => {
    render(<CrudManobras />);
    await screen.findByText('Autorrotação com 180 graus');

    // Primary action 'Editar' remains visible and accessible
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();

    // Destructive delete action is NOT rendered as an always-visible button
    expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Excluir manobra' })).not.toBeInTheDocument();

    // Trigger button "Mais ações" meets the minimum 44px touch/click target
    const trigger = screen.getByRole('button', { name: 'Mais ações' });
    expect(trigger).toBeInTheDocument();
    expect(trigger.className).toMatch(/min-h-11/);
    expect(trigger.className).toMatch(/min-w-11/);
  });

  it('reveals "Excluir manobra" in secondary menu, cancelling yields zero DELETEs, confirming deletes via active endpoint', async () => {
    const user = userEvent.setup();
    render(<CrudManobras />);
    await screen.findByText('Autorrotação com 180 graus');

    // Open secondary menu
    const trigger = screen.getByRole('button', { name: 'Mais ações' });
    await user.click(trigger);

    // Destructive menu item is revealed with role "menuitem" and destructive style
    const menuItem = await screen.findByRole('menuitem', { name: 'Excluir manobra' });
    expect(menuItem).toBeInTheDocument();
    expect(menuItem.className).toMatch(/text-red-700/);

    // Scenario 1: User cancels confirmation -> zero DELETE mutations sent
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(menuItem);

    expect(window.confirm).toHaveBeenCalledWith('Excluir esta manobra?');
    expect(getDeleteCalls()).toHaveLength(0);

    // Scenario 2: User opens menu again and confirms -> DELETE hits the active /simuladores/manobras/:id endpoint
    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    const menuItemToConfirm = await screen.findByRole('menuitem', { name: 'Excluir manobra' });

    vi.mocked(window.confirm).mockReturnValueOnce(true);
    await user.click(menuItemToConfirm);

    expect(window.confirm).toHaveBeenCalledWith('Excluir esta manobra?');

    await waitFor(() => expect(getDeleteCalls()).toHaveLength(1));
    const [deleteUrl, deleteInit] = getDeleteCalls()[0];
    expect(String(deleteUrl)).toContain('/simuladores/manobras/42');
    expect(deleteInit?.method).toBe('DELETE');
  });
});
