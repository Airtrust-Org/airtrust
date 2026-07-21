import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BotaoGuiaSessao } from '../BotaoGuiaSessao';

const mockUseGuiaDaSessao = vi.fn();

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({ role: mockRole.value }),
}));

vi.mock('@/react-app/lib/guias-instrutor/api', () => ({
  useGuiaDaSessao: (...args: unknown[]) => mockUseGuiaDaSessao(...args),
}));

const mockRole = { value: 'INSTRUTOR' };

function renderBotao() {
  return render(
    <MemoryRouter>
      <BotaoGuiaSessao sessaoId={42} />
    </MemoryRouter>,
  );
}

describe('BotaoGuiaSessao', () => {
  it('não renderiza nada para aluno, mesmo que exista guia', () => {
    mockRole.value = 'ALUNO';
    mockUseGuiaDaSessao.mockReturnValue({ data: { id: 1, codigo: 'A139-I-01/12' } });
    const { container } = renderBotao();
    expect(container).toBeEmptyDOMElement();
  });

  it('não renderiza nada para instrutor sem guia vinculado (sem fallback quebrado)', () => {
    mockRole.value = 'INSTRUTOR';
    mockUseGuiaDaSessao.mockReturnValue({ data: null });
    const { container } = renderBotao();
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza o botão para instrutor com guia vinculado', () => {
    mockRole.value = 'INSTRUTOR';
    mockUseGuiaDaSessao.mockReturnValue({ data: { id: 7, codigo: 'A139-P-02/04-C1' } });
    renderBotao();
    expect(screen.getByText('Guia desta sessão')).toBeInTheDocument();
  });
});
