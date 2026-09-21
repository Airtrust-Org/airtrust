import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ControleVoosEditarVooDialog from '../ControleVoosEditarVooDialog';
import type { CvVoo } from '@/react-app/hooks/useControleVoos';

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }));
vi.mock('@/react-app/services/apiClient', () => ({ apiClient: { patch: patchMock } }));

const voo: CvVoo = {
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
  status: 'planejado',
  observacoes: 'Inicial',
  cancelado_motivo_id: null,
  alternado_destino_id: null,
  versao: 4,
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
};

describe('ControleVoosEditarVooDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('edita programação existente usando a versão CAS atual do voo', async () => {
    patchMock.mockResolvedValue({
      success: true,
      data: { ...voo, numero_voo: 'V999', observacoes: 'Atualizado', versao: 5 },
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <ControleVoosEditarVooDialog open voo={voo} onClose={onClose} onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByLabelText('Número do voo'), { target: { value: 'V999' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Atualizado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    expect(patchMock).toHaveBeenCalledWith(
      '/controle-voos/voos/77',
      expect.objectContaining({
        versao: 4,
        numero_voo: 'V999',
        numero_db: 'DB456',
        data_programacao: '2026-09-21',
        observacoes: 'Atualizado',
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ versao: 5, numero_voo: 'V999' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bloqueia horários invertidos antes de chamar a API', async () => {
    render(
      <ControleVoosEditarVooDialog open voo={voo} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Partida prevista'), {
      target: { value: '2026-09-21T18:00' },
    });
    fireEvent.change(screen.getByLabelText('Chegada prevista'), {
      target: { value: '2026-09-21T17:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A chegada prevista não pode ser anterior à partida prevista.',
    );
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('mantém o diálogo aberto quando o backend rejeita versão desatualizada', async () => {
    patchMock.mockRejectedValue(new Error('Versao do voo desatualizada. Recarregue os dados antes de continuar.'));
    const onClose = vi.fn();
    render(
      <ControleVoosEditarVooDialog open voo={voo} onClose={onClose} onSaved={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Versao do voo desatualizada/);
    expect(onClose).not.toHaveBeenCalled();
  });
});
