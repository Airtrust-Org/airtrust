import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Simuladores from '../Simuladores';

// Ponto de entrada real: o botão "Nova Sessão de Voo" na página de
// Simuladores deve abrir ModalNovaSessao (que por sua vez expõe o toggle
// "Sessão simples"/"Sessão compartilhada" e o SharedSessionForm — cobertos
// em detalhe por ModalNovaSessao.loading-stability.test.tsx). Este teste
// cobre especificamente a integração botão → modal, que não tinha teste
// próprio antes.

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/react-app/components/modals/ModalNovaSessao', () => ({
  default: (props: { isOpen: boolean; onClose: () => void }) =>
    props.isOpen ? (
      <div role="dialog" aria-label="modal-nova-sessao-mock">
        Nova Sessão de Treinamento (mock)
        <button onClick={props.onClose}>Fechar mock</button>
      </div>
    ) : null,
}));

vi.mock('../simuladores/agenda/CalendarioAgendamentos', () => ({
  default: () => <div>tab-agenda-mock</div>,
}));
vi.mock('../simuladores/fichas/index', () => ({
  FichasAvaliacaoContent: () => <div>tab-fichas-mock</div>,
}));
vi.mock('../simuladores/tabs/TabGestaoWrapper', () => ({
  default: () => <div>tab-gestao-mock</div>,
}));
vi.mock('../instrutor/GuiasInstrutor', () => ({
  GuiasInstrutorContent: () => <div>tab-guias-instrutor-mock</div>,
}));
const mockGuiasPermissoes = {
  podeVisualizar: false,
  podeGerenciar: false,
  isPlatformAdmin: false,
  isLoading: false,
};
vi.mock('@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions', () => ({
  useGuiasInstrutorPermissions: () => mockGuiasPermissoes,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/simuladores']}>
      <Simuladores />
    </MemoryRouter>,
  );
}

describe('Simuladores — ponto de entrada "Nova Sessão de Voo"', () => {
  it('nao renderiza o modal antes do clique', () => {
    renderPage();
    expect(screen.queryByRole('dialog', { name: /modal-nova-sessao-mock/i })).not.toBeInTheDocument();
  });

  it('clicar em "Nova Sessão de Voo" abre ModalNovaSessao com isOpen=true', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Nova Sessão de Voo/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /modal-nova-sessao-mock/i })).toBeInTheDocument();
    });
  });

  it('fechar o modal (onClose) remove-o da árvore, sem deixar estado residual visível', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /Nova Sessão de Voo/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /modal-nova-sessao-mock/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Fechar mock/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /modal-nova-sessao-mock/i })).not.toBeInTheDocument();
    });

    // Reabrir deve funcionar normalmente de novo (não fica travado fechado).
    await user.click(screen.getByRole('button', { name: /Nova Sessão de Voo/i }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /modal-nova-sessao-mock/i })).toBeInTheDocument();
    });
  });
});

describe('Simuladores — quarta aba "Guias do Instrutor"', () => {
  it('não aparece para usuário sem simuladores.guias.visualizar', () => {
    mockGuiasPermissoes.podeVisualizar = false;
    mockGuiasPermissoes.isPlatformAdmin = false;
    renderPage();
    expect(screen.queryByRole('button', { name: /Guias do Instrutor/i })).not.toBeInTheDocument();
  });

  it('aparece para usuário com simuladores.guias.visualizar (instructor/manager/admin autorizados)', async () => {
    mockGuiasPermissoes.podeVisualizar = true;
    const user = userEvent.setup();
    renderPage();

    const aba = screen.getByRole('button', { name: /Guias do Instrutor/i });
    expect(aba).toBeInTheDocument();

    await user.click(aba);
    await waitFor(() => {
      expect(screen.getByText('tab-guias-instrutor-mock')).toBeInTheDocument();
    });
  });

  it('aparece para Platform Admin/Administrador Master (bypass real do backend)', () => {
    mockGuiasPermissoes.podeVisualizar = true;
    mockGuiasPermissoes.isPlatformAdmin = true;
    renderPage();
    expect(screen.getByRole('button', { name: /Guias do Instrutor/i })).toBeInTheDocument();
  });
});
