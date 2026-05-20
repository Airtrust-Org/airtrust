import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModalRenovarQualificacao } from './ModalRenovarQualificacao';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:3000/api',
  getAccessToken: () => 'token-teste',
}));

vi.mock('@/react-app/utils/dateUtils', () => ({
  getDataHojeHTML: () => '2026-03-28',
}));

vi.mock('@/react-app/lib/moduloBus', () => ({
  emitirEventoModulo: vi.fn(),
}));

describe('ModalRenovarQualificacao', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispara apenas uma requisicao ao confirmar repetidamente', async () => {
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ success: true, data: { novo_registro_id: 123 } }),
            } as Response);
          }, 20);
        }),
    );

    vi.stubGlobal('fetch', fetchMock);

    render(
      <ModalRenovarQualificacao
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        qualificacao={{
          id: 3515,
          funcionario_nome: 'Caio Cesar Simões De Alcantara',
          qualificacao_nome: 'FAP 05.2 - Habilitacao de Tipo Helicoptero - AW139',
          qualificacao_codigo: 'FAP05.2-139',
          data_vencimento: '2026-01-31',
          data_realizacao: '2025-01-31',
        }}
      />,
    );

    const botao = screen.getByRole('button', { name: /confirmar renovação/i });

    fireEvent.click(botao);
    fireEvent.click(botao);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it('permite renovar G1-SEM e propaga sucesso com data de realizacao informada', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              novo_registro_id: 991,
              nova_data_conclusao: '2026-03-28',
              nova_data_vencimento: '2026-09-28',
              validade_meses: 6,
              tipo_treinamento: 'SEMESTRAL',
            },
          }),
        }) as Response,
    );

    vi.stubGlobal('fetch', fetchMock);

    render(
      <ModalRenovarQualificacao
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        qualificacao={{
          id: 3516,
          funcionario_nome: 'Adriana Brasil',
          qualificacao_nome: 'G1-SEM (Semestral)',
          qualificacao_codigo: 'G1-SEM',
          data_vencimento: '2026-03-28',
          data_realizacao: '2025-09-28',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /confirmar renovação/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/qualificacoes/historico/3516/renovar',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          nova_data_conclusao: '2026-03-28',
        }),
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith();
    expect(emitirEventoModulo).toHaveBeenCalled();
  });
});
