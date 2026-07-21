import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BotaoGuiaSessao } from '../BotaoGuiaSessao';

const mockUseGuiaDaSessao = vi.fn();
const mockPermissoes = { podeVisualizar: true, isLoading: false };

// Fonte única de autorização — nunca texto de role/perfil. Reflete a mesma
// decisão real do backend (inclui Platform Admin/Administrador Master).
vi.mock('@/react-app/hooks/guias-instrutor/useGuiasInstrutorPermissions', () => ({
  useGuiasInstrutorPermissions: () => mockPermissoes,
}));

vi.mock('@/react-app/lib/guias-instrutor/api', () => ({
  useGuiaDaSessao: (...args: unknown[]) => mockUseGuiaDaSessao(...args),
}));

function renderBotao() {
  return render(
    <MemoryRouter>
      <BotaoGuiaSessao sessaoId={42} />
    </MemoryRouter>,
  );
}

describe('BotaoGuiaSessao', () => {
  it('não renderiza nada para usuário sem podeVisualizar, mesmo que exista guia', () => {
    mockPermissoes.podeVisualizar = false;
    mockPermissoes.isLoading = false;
    mockUseGuiaDaSessao.mockReturnValue({ data: { id: 1, codigo: 'A139-I-01/12' } });
    const { container } = renderBotao();
    expect(container).toBeEmptyDOMElement();
  });

  it('não renderiza nada enquanto a permissão ainda está carregando (nunca mostra estado incorreto)', () => {
    mockPermissoes.podeVisualizar = true;
    mockPermissoes.isLoading = true;
    mockUseGuiaDaSessao.mockReturnValue({ data: { id: 1, codigo: 'A139-I-01/12' } });
    const { container } = renderBotao();
    expect(container).toBeEmptyDOMElement();
  });

  it('não renderiza nada para usuário autorizado sem guia vinculado (sem fallback quebrado)', () => {
    mockPermissoes.podeVisualizar = true;
    mockPermissoes.isLoading = false;
    mockUseGuiaDaSessao.mockReturnValue({ data: null });
    const { container } = renderBotao();
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza o botão para usuário autorizado com guia vinculado', () => {
    mockPermissoes.podeVisualizar = true;
    mockPermissoes.isLoading = false;
    mockUseGuiaDaSessao.mockReturnValue({ data: { id: 7, codigo: 'A139-P-02/04-C1' } });
    renderBotao();
    expect(screen.getByText('Guia desta sessão')).toBeInTheDocument();
  });

  it('platform admin (podeVisualizar via bypass do backend) vê o botão contextual', () => {
    mockPermissoes.podeVisualizar = true;
    mockPermissoes.isLoading = false;
    mockUseGuiaDaSessao.mockReturnValue({ data: { id: 9, codigo: 'SK76-I-01/12' } });
    renderBotao();
    expect(screen.getByText('Guia desta sessão')).toBeInTheDocument();
  });
});
