import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ModalAtribuirQualificacao } from './ModalAtribuirQualificacao';

const serviceMocks = vi.hoisted(() => ({
  atualizarHistoricoQualificacao: vi.fn(),
  criarHistoricoQualificacao: vi.fn(),
}));

const funcionariosMock = [
  {
    id: 1,
    nome: 'Ramon Godinho Bastos',
    matricula: '00264',
    cpf: '12345678901',
    is_instrutor: 0,
  },
  {
    id: 2,
    nome: 'Instrutor Cadastrado',
    matricula: '00999',
    cpf: '99999999999',
    is_instrutor: 1,
  },
];

const tiposMock = [
  {
    id: 10,
    nome: 'AW139 — Curriculo de Solo (F1)',
    codigo: 'F1',
    categoria: 'TREINAMENTO TEÓRICO',
    categoria_id: 3,
    validade: 12,
  },
];

vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/react-app/components/modals/ModalCertificado', () => ({
  ModalCertificado: () => null,
}));

vi.mock('@/react-app/services/qualificacoesService', () => ({
  atualizarHistoricoQualificacao: (...args: unknown[]) =>
    serviceMocks.atualizarHistoricoQualificacao(...args),
  criarHistoricoQualificacao: (...args: unknown[]) =>
    serviceMocks.criarHistoricoQualificacao(...args),
}));

vi.mock('@/react-app/hooks/qualificacoes/useFuncionariosAtivos', () => ({
  useFuncionariosAtivos: () => ({
    data: funcionariosMock,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/react-app/hooks/qualificacoes/useTiposQualificacao', () => ({
  useTiposQualificacao: () => ({
    data: tiposMock,
    isLoading: false,
  }),
}));

vi.mock('@/react-app/hooks/qualificacoes/useCategoriasQualificacao', () => ({
  useCategoriasQualificacao: () => ({
    data: [{ id: 3, codigo: 'TEORICO', nome: 'Teórico', ativo: true, ordem: 3 }],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/react-app/utils/confirmDialog', () => ({
  showAlertDialog: vi.fn(),
}));

vi.mock('@/react-app/lib/moduloBus', () => ({
  emitirEventoModulo: vi.fn(),
}));

describe('ModalAtribuirQualificacao', () => {
  beforeEach(() => {
    serviceMocks.atualizarHistoricoQualificacao.mockReset();
    serviceMocks.criarHistoricoQualificacao.mockReset();
    serviceMocks.atualizarHistoricoQualificacao.mockResolvedValue({ id: 77 });
  });

  it('uses only the canonical category catalog rather than legacy type text', () => {
    render(<ModalAtribuirQualificacao isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('option', { name: 'Teórico' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'TREINAMENTO TEÓRICO' })).not.toBeInTheDocument();
  });

  it('preserva o instrutor selecionado apos rerender do parent e envia no update', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const props = {
      isOpen: true,
      onClose,
      onSuccess,
      habilitacao: {
        id: 77,
        funcionario_id: 1,
        qualificacao_id: 10,
        qualificacao_codigo: 'F1',
        qualificacao_nome: 'AW139 — Curriculo de Solo (F1)',
        data_conclusao: '2026-03-15',
        data_vencimento: '2027-03-15',
        instrutor: '',
        observacoes: '',
        tipo_treinamento: 'RECORRENTE',
      },
    };

    const { rerender } = render(<ModalAtribuirQualificacao {...props} />);

    const instrutorSelect = screen.getAllByRole('combobox').at(-1)!;
    fireEvent.change(instrutorSelect, { target: { value: '2' } });

    rerender(
      <ModalAtribuirQualificacao
        {...props}
        habilitacao={{
          ...props.habilitacao,
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').at(-1)).toHaveValue('2');
    });

    const saveButton = screen.getByRole('button', { name: '✓ Salvar' });

    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(serviceMocks.atualizarHistoricoQualificacao).toHaveBeenCalledWith(
        77,
        expect.objectContaining({
          instrutor_id: 2,
        }),
      );
    });
  });
});
