import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CvVoo } from '@/react-app/hooks/useControleVoos';
import ControleVoosEdicaoRapida from '../ControleVoosEdicaoRapida';

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }));
vi.mock('@/react-app/services/apiClient', () => ({ apiClient: { patch: patchMock } }));

const voo = {
  id: 41, versao: 2, numero_voo: '123', numero_db: 'DB',
  horario_previsto_partida: '2026-10-10T10:00:00.000Z',
  horario_previsto_chegada: '2026-10-10T12:00:00.000Z', observacoes: '',
} as CvVoo;

describe('ControleVoosEdicaoRapida', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('salva apenas campos gerais pelo PATCH CAS sem alterar rota/tripulantes', async () => {
    patchMock.mockResolvedValue({ success: true, data: { success: true, data: { ...voo, versao: 3 } } });
    const onSaved = vi.fn();
    render(<ControleVoosEdicaoRapida voo={voo} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Número do voo'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados' }));
    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
    expect(patchMock.mock.calls[0][1]).toMatchObject({ versao: 2, numero_voo: '999' });
    expect(patchMock.mock.calls[0][1]).not.toHaveProperty('rota_ids');
    expect(patchMock.mock.calls[0][1]).not.toHaveProperty('tripulantes');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('mantém edição aberta quando API retorna erro de negócio dentro do envelope', async () => {
    patchMock.mockResolvedValue({ success: true, data: { success: false, error: 'Versão desatualizada.' } });
    const onSaved = vi.fn();
    render(<ControleVoosEdicaoRapida voo={voo} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Versão desatualizada.');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
