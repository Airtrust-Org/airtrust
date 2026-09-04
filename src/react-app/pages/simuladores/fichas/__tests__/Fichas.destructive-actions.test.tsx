/**
 * Focused regression tests for #281 - Fichas de Simuladores.
 *
 * Proves the visual + interaction contract for destructive actions moved
 * behind RowActionsMenu in /simuladores/fichas:
 *   - delete action absent from primary strip (desktop table & mobile card)
 *   - "Mais ações" trigger present with accessible label
 *   - menuitem has role="menuitem" and destructive style
 *   - cancelation in ConfirmDeleteModal performs no mutation
 *   - confirmation executes DELETE /simuladores/fichas/:id
 *   - non-admin/non-gestor RBAC hides the delete menu
 *   - primary actions (e.g. Visualizar Ficha) remain primary
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FichasAvaliacaoContent } from '../index';

const permissionsRef = {
  isAdmin: true,
  isGestor: false,
  isAluno: false,
  isInstrutor: false,
  role: 'ADMINISTRADOR',
};

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => permissionsRef,
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, funcionario_id: 1, role: 'ADMINISTRADOR', permissions: [] },
  }),
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost/api',
  getAccessToken: () => 'fake-test-token',
}));

vi.mock('../fichaAvailability', () => ({
  isFichaFutureEvaluation: () => false,
}));

function jsonOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  } as Response);
}

describe('Fichas de Avaliação — Destructive Actions behind RowActionsMenu (#281)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const fichaMock = {
    id: 999,
    participante_nome: 'Carlos Comandante',
    participante_funcao: 'PIC',
    aluno_codigo_anac: '123456',
    simulador_codigo: 'SIM-01',
    simulador_nome: 'Simulador B737',
    sessao_modelo: 'MOD-B737',
    sessao_titulo: 'Sessão Periódica',
    tipo_sessao: 'TREINAMENTO',
    data_hora: '2026-09-03T10:00:00.000Z',
    instrutor_nome: 'Instrutor Santos',
    status: 'CONCLUIDA',
    assinatura_aluno_timestamp: '2026-09-03T11:00:00.000Z',
    assinatura_instrutor_timestamp: '2026-09-03T11:05:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    permissionsRef.isAdmin = true;
    permissionsRef.isGestor = false;
    permissionsRef.isAluno = false;
    permissionsRef.isInstrutor = false;
    permissionsRef.role = 'ADMINISTRADOR';

    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas')) {
        return jsonOk([fichaMock]);
      }
      if (url.includes('/simuladores/instrutores')) {
        return jsonOk([{ id: 1, nome: 'Instrutor Santos' }]);
      }
      return jsonOk([]);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1. Admin: delete button is secondary, "Visualizar Ficha" is primary, cancelation in modal aborts delete', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FichasAvaliacaoContent mode="all" />
      </MemoryRouter>,
    );

    const match = await screen.findAllByText('Carlos Comandante');
    expect(match.length).toBeGreaterThan(0);

    // Primary action 'Visualizar Ficha' exists
    const visualizacaoButtons = screen.getAllByTitle('Visualizar Ficha');
    expect(visualizacaoButtons.length).toBeGreaterThan(0);

    // Direct delete button is absent from primary strip
    expect(screen.queryByTitle('Excluir')).not.toBeInTheDocument();

    // Trigger exists
    const triggers = screen.getAllByRole('button', {
      name: 'Mais ações para ficha de Carlos Comandante',
    });
    expect(triggers.length).toBeGreaterThan(0);
    const trigger = triggers[0];
    expect(trigger.className).toMatch(/min-h-11/);

    await user.click(trigger);

    // Menuitem is visible and styled as destructive
    const menuitem = await screen.findByRole('menuitem', { name: 'Excluir ficha' });
    expect(menuitem.className).toMatch(/text-red-700/);

    // Click menuitem -> opens ConfirmDeleteModal
    await user.click(menuitem);

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeInTheDocument();

    // Cancel modal
    const cancelBtn = within(dialog).getByRole('button', { name: 'Cancelar' });
    await user.click(cancelBtn);

    const deleteCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).includes('/simuladores/fichas/999') &&
        (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);

    // Reopen and confirm
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir ficha' }));
    const dialog2 = await screen.findByRole('alertdialog');
    const confirmBtn = within(dialog2).getByRole('button', { name: 'Excluir' });
    await user.click(confirmBtn);

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).includes('/simuladores/fichas/999') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(calls).toHaveLength(1);
    });
  });

  it('2. Non-admin / non-gestor (e.g. Aluno): delete menu is completely absent', async () => {
    permissionsRef.isAdmin = false;
    permissionsRef.isGestor = false;
    permissionsRef.isAluno = true;
    permissionsRef.role = 'TRIPULANTE';

    render(
      <MemoryRouter>
        <FichasAvaliacaoContent mode="all" />
      </MemoryRouter>,
    );

    await screen.findAllByText('Carlos Comandante');

    expect(
      screen.queryByRole('button', { name: 'Mais ações para ficha de Carlos Comandante' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Excluir ficha' })).not.toBeInTheDocument();
  });
});
