import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControleVoosTripulacaoCard from '../ControleVoosTripulacaoCard';

const { getMock, updateMock, createMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock('@/react-app/services/apiClient', () => ({
  apiClient: { get: getMock },
}));

vi.mock('@/react-app/hooks/useControleVoos', () => ({
  useTripulantes: () => ({
    data: [
      {
        id: 501, voo_id: 99, funcionario_id: 101, funcao: 'PIC',
        funcionario_nome: 'Tripulante de teste', funcionario_codigo_anac: 'ABC123',
        horario_apresentacao: null,
      },
    ],
    isLoading: false,
  }),
  useCriarTripulante: () => ({ mutateAsync: createMock, isPending: false }),
  useAtualizarTripulante: () => ({ mutateAsync: updateMock, isPending: false }),
}));

describe('ControleVoosTripulacaoCard — apresentação manual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue({
      success: true,
      data: [
        { id: 101, nome: 'PIC teste', matricula: null, funcao_codigo: 'PIC', funcao_nome: 'Comandante' },
        { id: 102, nome: 'SIC teste', matricula: null, funcao_codigo: 'SIC', funcao_nome: 'Copiloto' },
      ],
    });
    updateMock.mockResolvedValue({ id: 501 });
    createMock.mockResolvedValue({ id: 502 });
  });

  it('atualiza somente o horário, sem substituir tripulante, e envia CAS do RDV', async () => {
    render(<ControleVoosTripulacaoCard vooId={99} aeronaveId={20} rdvVersion={4} />);
    expect(screen.getByText('Apresentação: Não informada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar apresentação' }));
    fireEvent.change(screen.getByLabelText('Hora de apresentação (manual)'), { target: { value: '07:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tripulação' }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({
      vooId: 99,
      tripulanteId: 501,
      horario_apresentacao: '07:30',
      versao: 4,
    }));
    expect(updateMock.mock.calls[0][0]).not.toHaveProperty('funcionario_id');
  });

  it('limpa o horário manual com valor nulo explícito', async () => {
    render(<ControleVoosTripulacaoCard vooId={99} aeronaveId={20} rdvVersion={4} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar apresentação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tripulação' }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({
      vooId: 99,
      tripulanteId: 501,
      horario_apresentacao: null,
      versao: 4,
    }));
  });

  it('permite definir a apresentação ao adicionar segundo tripulante', async () => {
    render(<ControleVoosTripulacaoCard vooId={99} aeronaveId={20} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar tripulante' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar tripulante' }));
    fireEvent.change(screen.getByLabelText('Tripulante'), { target: { value: '102' } });
    fireEvent.change(screen.getByLabelText('Hora de apresentação (manual)'), { target: { value: '08:05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tripulação' }));
    await waitFor(() => expect(createMock).toHaveBeenCalledWith({
      vooId: 99,
      funcionario_id: 102,
      funcao: 'SIC',
      horario_apresentacao: '08:05',
    }));
  });
});
