/**
 * Focused regression tests for #281 - Cadastros de Simuladores.
 *
 * Proves the visual + interaction contract for destructive actions moved
 * behind RowActionsMenu across:
 *   1. Modelos de Sessão (/simuladores/cadastros/modelos-sessao)
 *   2. Tipos de Sessão (/simuladores/cadastros/tipos)
 *   3. Categorias (/simuladores/cadastros/categorias)
 *   4. Simuladores (/simuladores/cadastros/simuladores)
 *   5. Instrutores (/simuladores/cadastros/instrutores)
 *   6. Modelos (/simuladores/cadastros/modelos)
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CrudModelosSessao from '../modelos-sessao';
import CrudTiposSessao from '../tipos-sessao';
import CrudCategorias from '../categorias';
import CrudSimuladores from '../simuladores/crud-completo';
import CrudInstrutores from '../instrutores';
import CrudModelos from '../modelos';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost/api',
  getAccessToken: () => 'fake-test-token',
}));

const confirmDialogMock = vi.fn();
vi.mock('@/react-app/utils/confirmDialog', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
  showAlertDialog: vi.fn(),
}));

function jsonOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  } as Response);
}

describe('Cadastros de Simuladores — Destructive Actions behind RowActionsMenu (#281)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    confirmDialogMock.mockResolvedValue(true);
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/modelos-sessao')) {
        return jsonOk([
          {
            id: 101,
            codigo: 'MOD-01',
            nome: 'Modelo Alpha',
            tipo_sessao_id: 1,
            tipo_sessao_nome: 'Treinamento',
            duracao_estimada: 120,
            total_manobras: 5,
          },
        ]);
      }
      if (url.includes('/simuladores/tipos-sessao')) {
        return jsonOk([
          { id: 201, codigo: 'TIPO-01', nome: 'Treinamento Periódico', descricao: 'Desc' },
        ]);
      }
      if (url.includes('/simuladores/categorias')) {
        return jsonOk([
          { id: 301, nome: 'Emergência', descricao: 'Manobras anormais', cor: '#ef4444' },
        ]);
      }
      if (url.includes('/simuladores/instrutores')) {
        return jsonOk([
          {
            id: 401,
            funcionario_id: 10,
            funcionario_nome: 'Capitão Silva',
            habilitacoes: 'AW139',
          },
        ]);
      }
      if (url.includes('/simuladores') && !url.includes('/manobras')) {
        return jsonOk([
          {
            id: 501,
            nome: 'Simulador FTD 1',
            tipo: 'AW139',
            status: 'ATIVO',
          },
        ]);
      }
      if (url.includes('/modelos-aeronave')) {
        return jsonOk([{ id: 1, modelo: 'AW139', nome: 'AW139' }]);
      }
      if (url.includes('/funcionarios')) {
        return jsonOk([{ id: 10, nome: 'Capitão Silva' }]);
      }
      if (url.includes('/categorias')) {
        return jsonOk([]);
      }
      if (url.includes('/qualificacoes/tipos')) {
        return jsonOk([]);
      }
      if (url.includes('/simuladores/manobras')) {
        return jsonOk([]);
      }
      return jsonOk([]);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1. Modelos de Sessão: delete is in secondary menu, Editar is primary, cancel prevents delete', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CrudModelosSessao />
      </MemoryRouter>,
    );

    await screen.findByText('Modelo Alpha');

    // Primary action 'Editar' exists
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();

    // Direct delete button is absent from primary strip
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Excluir modelo' })).not.toBeInTheDocument();

    // Trigger exists
    const trigger = screen.getByRole('button', { name: 'Mais ações para MOD-01' });
    expect(trigger.className).toMatch(/min-h-11/);
    await user.click(trigger);

    // Menuitem is visible and marked destructive
    const menuitem = await screen.findByRole('menuitem', { name: 'Excluir modelo' });
    expect(menuitem.className).toMatch(/text-red-700/);

    // Cancel deletion
    confirmDialogMock.mockResolvedValueOnce(false);
    await user.click(menuitem);

    expect(confirmDialogMock).toHaveBeenCalledWith('Excluir este modelo?');
    const deleteCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).includes('/simuladores/modelos-sessao/101') &&
        (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);

    // Confirm deletion
    confirmDialogMock.mockResolvedValueOnce(true);
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir modelo' }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/simuladores/modelos-sessao/101') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(calls).toHaveLength(1);
    });
  });

  it('2. Tipos de Sessão: delete is in secondary menu, Editar is primary, confirm deletes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CrudTiposSessao />
      </MemoryRouter>,
    );

    await screen.findByText('Treinamento Periódico');

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Mais ações para TIPO-01' });
    await user.click(trigger);

    const menuitem = await screen.findByRole('menuitem', { name: 'Excluir tipo de sessão' });
    expect(menuitem.className).toMatch(/text-red-700/);

    confirmDialogMock.mockResolvedValueOnce(true);
    await user.click(menuitem);

    expect(confirmDialogMock).toHaveBeenCalledWith('Excluir este tipo de sessão?');
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/simuladores/tipos-sessao/201') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(calls).toHaveLength(1);
    });
  });

  it('3. Categorias: delete is in secondary menu, Editar is primary, confirm deletes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CrudCategorias />
      </MemoryRouter>,
    );

    await screen.findByText('Emergência');

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Mais ações para Emergência' });
    await user.click(trigger);

    const menuitem = await screen.findByRole('menuitem', { name: 'Excluir categoria' });
    expect(menuitem.className).toMatch(/text-red-700/);

    confirmDialogMock.mockResolvedValueOnce(true);
    await user.click(menuitem);

    expect(confirmDialogMock).toHaveBeenCalledWith('Excluir esta categoria?');
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/simuladores/categorias/301') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(calls).toHaveLength(1);
    });
  });

  it('4. Simuladores: delete is in secondary menu, Editar is primary, confirm deletes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CrudSimuladores />
      </MemoryRouter>,
    );

    await screen.findByText('Simulador FTD 1');

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Mais ações para Simulador FTD 1' });
    await user.click(trigger);

    const menuitem = await screen.findByRole('menuitem', { name: 'Excluir simulador' });
    expect(menuitem.className).toMatch(/text-red-700/);

    confirmDialogMock.mockResolvedValueOnce(true);
    await user.click(menuitem);

    expect(confirmDialogMock).toHaveBeenCalledWith('Excluir este simulador?');
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/simuladores/501') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(calls).toHaveLength(1);
    });
  });

  it('5. Instrutores: remover is in secondary menu, Editar is primary, confirm deletes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CrudInstrutores />
      </MemoryRouter>,
    );

    await screen.findByText('Capitão Silva');

    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Mais ações para instrutor Capitão Silva' });
    await user.click(trigger);

    const menuitem = await screen.findByRole('menuitem', { name: 'Remover instrutor' });
    expect(menuitem.className).toMatch(/text-red-700/);

    confirmDialogMock.mockResolvedValueOnce(true);
    await user.click(menuitem);

    expect(confirmDialogMock).toHaveBeenCalledWith('Tem certeza que deseja remover este instrutor?');
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/simuladores/instrutores/401') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(calls).toHaveLength(1);
    });
  });

  it('6. Modelos: Excluir is in secondary menu, primary actions stay accessible', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CrudModelos />
      </MemoryRouter>,
    );

    await screen.findByText('Modelo Alpha');

    // Primary non-destructive actions are visible
    expect(screen.getByRole('button', { name: 'Ver Manobras' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clonar' })).toBeInTheDocument();

    // Direct delete button is absent
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'Mais ações para MOD-01' });
    await user.click(trigger);

    const menuitem = await screen.findByRole('menuitem', { name: 'Excluir modelo' });
    expect(menuitem.className).toMatch(/text-red-700/);

    confirmDialogMock.mockResolvedValueOnce(true);
    await user.click(menuitem);

    expect(confirmDialogMock).toHaveBeenCalledWith('Tem certeza que deseja excluir este modelo?');
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/simuladores/modelos-sessao/101') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(calls).toHaveLength(1);
    });
  });
});
