import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GuiasInstrutorContent } from '../GuiasInstrutor';

// Testa apenas o conteúdo (sem AppLayout) — a decisão de acesso é o que
// importa aqui, não o chrome da página. Nunca deriva de texto de
// role/perfil: usa useGuiasInstrutorPermissions diretamente.
const mockPermissoes = { podeVisualizar: false, isLoading: true };

vi.mock('@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions', () => ({
  useGuiasInstrutorPermissions: () => mockPermissoes,
}));

vi.mock('@/react-app/lib/guias-instrutor/api', () => ({
  useGuiasInstrutor: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useProximasSessoesComGuia: () => ({ data: [], isLoading: false }),
  baixarGuiaPdf: vi.fn(),
}));

function renderContent() {
  return render(
    <MemoryRouter>
      <GuiasInstrutorContent />
    </MemoryRouter>,
  );
}

describe('GuiasInstrutorContent — gate de acesso', () => {
  it('enquanto a permissão carrega, NUNCA mostra "Acesso restrito" (mostra skeleton)', () => {
    mockPermissoes.podeVisualizar = false;
    mockPermissoes.isLoading = true;
    renderContent();
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument();
  });

  it('após carregar, sem autorização mostra "Acesso restrito"', () => {
    mockPermissoes.podeVisualizar = false;
    mockPermissoes.isLoading = false;
    renderContent();
    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
  });

  it('após carregar, com autorização (inclui Platform Admin via bypass do backend) renderiza a biblioteca', () => {
    mockPermissoes.podeVisualizar = true;
    mockPermissoes.isLoading = false;
    renderContent();
    expect(screen.queryByText('Acesso restrito')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Buscar por título ou código…')).toBeInTheDocument();
  });
});
