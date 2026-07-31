import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalCertificado } from './ModalCertificado';
import { apiFetch } from '@/react-app/lib/apiFetch';
import {
  openPreviewWindow,
  previewPdfBeforeDownload,
  showPdfPreviewError,
} from '@/react-app/utils/pdfPreview';
import { toast } from 'sonner';
import { gerarPDFListaPresenca } from '@/react-app/services/pdf-lista-presenca';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/react-app/config/api', () => ({
  getAccessToken: () => 'token-teste',
}));

vi.mock('@/react-app/lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/react-app/utils/pdfPreview', () => ({
  openPreviewWindow: vi.fn(),
  previewPdfBeforeDownload: vi.fn(),
  showPdfPreviewError: vi.fn(),
}));

vi.mock('@/react-app/services/pdf-lista-presenca', () => ({
  gerarPDFListaPresenca: vi.fn(),
}));

function renderModal() {
  return render(
    <MemoryRouter>
      <ModalCertificado
        isOpen
        onClose={vi.fn()}
        qualificacao={{
          id: 321,
          funcionario_id: 15,
          funcionario_nome: 'Tripulante Teste',
          matricula: '00123',
          qualificacao_nome: 'CRM Recorrente',
          codigo: 'CRM',
          data_conclusao: '2026-06-15',
        }}
      />
    </MemoryRouter>,
  );
}

describe('ModalCertificado', () => {
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  it('mostra mensagem controlada quando nao ha certificado', async () => {
    renderModal();

    expect(await screen.findByText('Nenhum certificado cadastrado')).toBeInTheDocument();
    expect(
      screen.getByText('Use as ações acima para gerar ou anexar um certificado'),
    ).toBeInTheDocument();
  });

  it('pre-abre a janela e reutiliza a mesma referencia no preview da ficha', async () => {
    const order: string[] = [];
    const previewWindow = { closed: false, close: vi.fn() } as unknown as Window;

    vi.mocked(openPreviewWindow).mockImplementation(() => {
      order.push('open');
      return previewWindow;
    });
    vi.mocked(gerarPDFListaPresenca).mockImplementation(async () => {
      order.push('generate');
      return new Blob(['pdf'], { type: 'application/pdf' });
    });
    vi.mocked(previewPdfBeforeDownload).mockImplementation(async ({ fileName, existingWindow }) => {
      order.push('preview');
      expect(existingWindow).toBe(previewWindow);
      expect(fileName).toMatch(/^PRESENCA-00123-CRM-20260615-[a-z0-9]{8}\.pdf$/i);
    });

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });

    renderModal();
    await screen.findByText('Nenhum certificado cadastrado');

    fireEvent.click(screen.getByRole('button', { name: /gerar lista de presença/i }));

    await waitFor(() => {
      expect(previewPdfBeforeDownload).toHaveBeenCalledTimes(1);
    });

    expect(order).toEqual(['open', 'generate', 'preview']);
  });

  it('fecha a janela vazia e mostra erro amigavel quando a geracao falha', async () => {
    const previewWindow = { closed: false, close: vi.fn() } as unknown as Window;

    vi.mocked(openPreviewWindow).mockReturnValue(previewWindow);
    vi.mocked(gerarPDFListaPresenca).mockRejectedValue(new Error('falha pdf'));

    renderModal();
    await screen.findByText('Nenhum certificado cadastrado');

    fireEvent.click(screen.getByRole('button', { name: /gerar lista de presença/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('❌ Erro ao gerar lista: falha pdf');
    });

    expect(previewPdfBeforeDownload).not.toHaveBeenCalled();
    expect(showPdfPreviewError).toHaveBeenCalledWith(
      previewWindow,
      'Lista de Presença — CRM',
      'falha pdf',
    );
  });

  describe('Gerar Certificado — contrato de erro do backend', () => {
    function mockGerarResponse(body: Record<string, unknown>, status: number) {
      vi.mocked(apiFetch).mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/certificados/gerar')) {
          return new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
    }

    it('exibe a mensagem específica quando o backend nega por RBAC (CERTIFICATE_ACCESS_DENIED)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGerarResponse(
        {
          success: false,
          error: 'Você não tem permissão para emitir certificados para esta qualificação.',
          code: 'CERTIFICATE_ACCESS_DENIED',
          requestId: 'req-teste-403',
        },
        403,
      );

      renderModal();
      await screen.findByText('Nenhum certificado cadastrado');
      fireEvent.click(screen.getByRole('button', { name: 'Gerar Certificado' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          '❌ Erro: Você não tem permissão para emitir certificados para esta qualificação.',
        );
      });

      // O código e o requestId (topo do corpo, sem camada de remapeamento)
      // devem chegar ao log de correlação, provando que o contrato real
      // (apiFetch cru, não o httpClient compartilhado) é lido corretamente.
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ModalCertificado] Erro ao gerar certificado:',
        expect.objectContaining({
          code: 'CERTIFICATE_ACCESS_DENIED',
          requestId: 'req-teste-403',
        }),
      );
      consoleErrorSpy.mockRestore();
    });

    it('exibe a mensagem específica quando o domínio da qualificação não está classificado', async () => {
      mockGerarResponse(
        {
          success: false,
          error:
            'Esta qualificação ainda não possui um domínio operacional classificado. Não é possível emitir o certificado até a classificação ser corrigida.',
          code: 'CERTIFICATE_RESOURCE_DOMAIN_UNCLASSIFIED',
          requestId: 'req-teste-unclassified',
        },
        403,
      );

      renderModal();
      await screen.findByText('Nenhum certificado cadastrado');
      fireEvent.click(screen.getByRole('button', { name: 'Gerar Certificado' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          '❌ Erro: Esta qualificação ainda não possui um domínio operacional classificado. Não é possível emitir o certificado até a classificação ser corrigida.',
        );
      });
    });

    it('usa a mensagem de fallback local quando o backend envia código sem mensagem', async () => {
      mockGerarResponse(
        {
          success: false,
          code: 'CERTIFICATE_TEMPLATE_NOT_CONFIGURED',
          requestId: 'req-teste-fallback',
        },
        422,
      );

      renderModal();
      await screen.findByText('Nenhum certificado cadastrado');
      fireEvent.click(screen.getByRole('button', { name: 'Gerar Certificado' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          '❌ Erro: Nenhum template de certificado está configurado para esta empresa. Configure um template antes de gerar certificados.',
        );
      });
    });
  });
});
