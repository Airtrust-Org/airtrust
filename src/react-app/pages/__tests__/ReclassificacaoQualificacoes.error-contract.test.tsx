import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// F14-03: `showAlertDialog` era chamado sem import. Dentro do `try`, o
// ReferenceError caía no `catch` e a tela mostrava o genérico "Erro na
// requisição" no lugar do erro real devolvido pela API.
const { apiClientMock, confirmDialogMock, showAlertDialogMock, toastWarningMock } = vi.hoisted(
  () => ({
    apiClientMock: vi.fn(),
    confirmDialogMock: vi.fn(),
    showAlertDialogMock: vi.fn(),
    toastWarningMock: vi.fn(),
  }),
);

vi.mock('@/react-app/services/apiClient', () => ({ apiClient: apiClientMock }));
vi.mock('@/react-app/utils/confirmDialog', () => ({
  confirmDialog: confirmDialogMock,
  showAlertDialog: showAlertDialogMock,
}));
vi.mock('sonner', () => ({
  toast: { warning: toastWarningMock, success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/react-app/components/funcionarios/FuncionarioLink', () => ({
  default: ({ nome }: { nome: string }) => <span>{nome}</span>,
}));
vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  getAccessToken: () => 'token-de-teste',
}));

import ReclassificacaoQualificacoes from '../ReclassificacaoQualificacoes';

const ERRO_REAL_DA_API = 'Tipo de destino pertence a outra empresa';

describe('ReclassificacaoQualificacoes — contrato de erro ao aplicar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmDialogMock.mockResolvedValue(true);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({
          success: true,
          data: {
            items: [
              {
                id: 1,
                historico_id: '901',
                current_codigo: 'GEN-01',
                funcionario_id: 7,
                funcionario_nome: 'Fulano de Tal',
              },
            ],
          },
        }),
      })),
    );

    apiClientMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url.endsWith('/qualificacoes/tipos')) {
        return {
          success: true,
          data: [{ id: '55', nome: 'Tipo Alvo', codigo: 'ALVO', categoria: 'CAT' }],
        };
      }
      if (url.endsWith('/qualificacoes/reclass/progresso')) {
        return { success: true, data: { total: 1, pendentes: 1, aplicadas: 0, ignoradas: 0 } };
      }
      if (init?.method === 'PATCH') {
        return { success: false, error: ERRO_REAL_DA_API };
      }
      return { success: true, data: [] };
    });
  });

  it('exibe a mensagem real da API quando o PATCH devolve success:false', async () => {
    render(<ReclassificacaoQualificacoes />);

    const campoTipo = await screen.findByPlaceholderText('Código ou nome');
    fireEvent.change(campoTipo, { target: { value: 'ALVO' } });

    const aplicar = await screen.findByRole('button', { name: /aplicar/i });
    await waitFor(() => expect(aplicar).toBeEnabled());
    fireEvent.click(aplicar);

    await waitFor(() => expect(showAlertDialogMock).toHaveBeenCalledWith(ERRO_REAL_DA_API));
    expect(toastWarningMock).not.toHaveBeenCalledWith('Erro na requisição');
  });

  it('usa o texto de fallback quando a API falha sem mensagem', async () => {
    apiClientMock.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url.endsWith('/qualificacoes/tipos')) {
        return {
          success: true,
          data: [{ id: '55', nome: 'Tipo Alvo', codigo: 'ALVO', categoria: 'CAT' }],
        };
      }
      if (init?.method === 'PATCH') return { success: false };
      return { success: true, data: { total: 1, pendentes: 1, aplicadas: 0, ignoradas: 0 } };
    });

    render(<ReclassificacaoQualificacoes />);
    fireEvent.change(await screen.findByPlaceholderText('Código ou nome'), {
      target: { value: 'ALVO' },
    });
    const aplicar = await screen.findByRole('button', { name: /aplicar/i });
    await waitFor(() => expect(aplicar).toBeEnabled());
    fireEvent.click(aplicar);

    await waitFor(() => expect(showAlertDialogMock).toHaveBeenCalledWith('Falha ao aplicar'));
    expect(toastWarningMock).not.toHaveBeenCalledWith('Erro na requisição');
  });
});
