import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  useDesafio: vi.fn(),
  useResponder: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('@/react-app/hooks/useDesafioDiarioConhecimento', () => ({
  useDesafioDiarioConhecimento: hooks.useDesafio,
  useResponderDesafioDiario: hooks.useResponder,
}));

import { DesafioDiarioCard } from '../DesafioDiarioCard';

const questao = {
  data: '2026-09-26',
  aeronaveModelo: 'AW139',
  questaoId: 101,
  enunciado: 'Qual é a ação correta nesta condição?',
  topico: 'Limitations',
  criticidade: 'ALTA' as const,
  alternativas: [
    { id: 1, texto: 'Alternativa um', ordem: 1 },
    { id: 2, texto: 'Alternativa dois', ordem: 2 },
  ],
};

function responderState(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    variables: undefined,
    mutate: hooks.mutate,
    ...overrides,
  };
}

beforeEach(() => {
  hooks.mutate.mockReset();
  hooks.useDesafio.mockReset();
  hooks.useResponder.mockReset();
  hooks.useResponder.mockReturnValue(responderState());
});

describe('DesafioDiarioCard', () => {
  it('permanece visível durante o carregamento', () => {
    hooks.useDesafio.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    render(<DesafioDiarioCard />);

    expect(screen.getByTestId('desafio-diario-conhecimento')).toBeInTheDocument();
    expect(screen.getByText('Carregando a pergunta de hoje...')).toBeInTheDocument();
  });

  it('mantém o bloco visível quando a pergunta está indisponível', () => {
    hooks.useDesafio.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<DesafioDiarioCard />);

    expect(screen.getByTestId('desafio-diario-conhecimento')).toBeInTheDocument();
    expect(screen.getByText('Desafio diário indisponível no momento.')).toBeInTheDocument();
  });

  it('exibe a pergunta da aeronave e envia a alternativa selecionada', () => {
    hooks.useDesafio.mockReturnValue({ data: questao, isLoading: false, isError: false });

    render(<DesafioDiarioCard />);

    expect(screen.getByText('AW139')).toBeInTheDocument();
    expect(screen.getByText(questao.enunciado)).toBeInTheDocument();
    expect(screen.getByText('Limitations')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Alternativa um/i }));
    expect(hooks.mutate).toHaveBeenCalledWith(1);
  });

  it('mostra correção, explicação e fonte depois da resposta', () => {
    hooks.useDesafio.mockReturnValue({ data: questao, isLoading: false, isError: false });
    hooks.useResponder.mockReturnValue(
      responderState({
        data: {
          ...questao,
          alternativaId: 1,
          alternativaCorretaId: 2,
          correta: false,
          explicacao: 'A alternativa dois é a correta porque respeita a limitação aplicável.',
          oQueGuardar: 'Memorize o limite operacional.',
          fontes: [
            {
              tipoDocumento: 'RFM',
              titulo: 'AW139 RFM',
              revisao: '28',
              secao: '1.2',
              pagina: '45',
              referencia: null,
            },
          ],
        },
      }),
    );

    render(<DesafioDiarioCard />);

    expect(screen.getByText('Não foi desta vez.')).toBeInTheDocument();
    expect(
      screen.getByText('A alternativa dois é a correta porque respeita a limitação aplicável.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Memorize o limite operacional/)).toBeInTheDocument();
    expect(screen.getByText(/RFM · AW139 RFM · rev. 28/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alternativa um/i })).toBeDisabled();
  });

  it('não renderiza fora do escopo quando desabilitado explicitamente', () => {
    hooks.useDesafio.mockReturnValue({ data: questao, isLoading: false, isError: false });

    const { container } = render(<DesafioDiarioCard enabled={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
