import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControleVoosStatusActions from '../ControleVoosStatusActions';
import type { CvVoo } from '@/react-app/hooks/useControleVoos';

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));
vi.mock('@/react-app/services/apiClient', () => ({
  apiClient: { get: getMock, post: postMock },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function flight(status: CvVoo['status'] = 'planejado'): CvVoo {
  return {
    id: 77,
    empresa_id: 1,
    prefixo: 'PR-ABC',
    data_programacao: '2026-09-21',
    origem_id: 1,
    destino_id: 2,
    numero_voo: 'V123',
    numero_db: 'DB456',
    contrato_id: 40,
    tipo_voo_id: 10,
    natureza_voo_id: 20,
    aeronave_id: 30,
    horario_previsto_partida: '2026-09-21T13:00:00.000Z',
    horario_previsto_chegada: '2026-09-21T15:00:00.000Z',
    horario_real_partida: null,
    horario_real_chegada: null,
    status,
    observacoes: null,
    cancelado_motivo_id: null,
    alternado_destino_id: null,
    versao: 4,
    created_at: '2026-09-20T10:00:00Z',
    updated_at: '2026-09-20T10:00:00Z',
  };
}

describe('ControleVoosStatusActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postMock.mockResolvedValue({ success: true, data: { ...flight(), versao: 5 } });
  });

  it('libera voo planejado usando a versão atual', async () => {
    const onChanged = vi.fn();
    render(<ControleVoosStatusActions voo={flight()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Liberar voo' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock).toHaveBeenCalledWith(
      '/controle-voos/voos/77/status',
      expect.objectContaining({ status: 'liberado_operacionalmente', versao: 4 }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('exige motivo operacional antes de cancelar', async () => {
    getMock.mockResolvedValue({
      success: true,
      data: [{ id: 9, nome: 'Meteorologia', tipo: 'cancelamento', ativo: 1 }],
    });
    const onChanged = vi.fn();
    render(<ControleVoosStatusActions voo={flight()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar voo' }));
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/controle-voos/catalogos/motivos'));
    expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo operacional'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Observação'), { target: { value: 'Meteorologia abaixo do mínimo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock).toHaveBeenCalledWith(
      '/controle-voos/voos/77/status',
      expect.objectContaining({
        status: 'cancelado',
        versao: 4,
        motivo_id: 9,
        descricao: 'Meteorologia abaixo do mínimo',
      }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('não oferece transição adicional a voo concluído', () => {
    render(<ControleVoosStatusActions voo={flight('concluido_operacionalmente')} onChanged={vi.fn()} />);
    expect(screen.getByText(/estado terminal/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Liberar|Iniciar|Registrar|Concluir|Cancelar/ })).toBeNull();
  });
});
