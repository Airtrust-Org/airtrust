import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openPreviewWindow,
  previewPdfBeforeDownload,
  showPdfPreviewError,
} from '@/react-app/utils/pdfPreview';

type FakePreviewWindow = Window & {
  __pdfError?: (message?: string) => void;
  __renderPdf?: (buffer: ArrayBuffer, mimeType: string, fileName: string) => void;
  __writtenHtml: string[];
};

function createFakePreviewWindow(): FakePreviewWindow {
  const writes: string[] = [];
  return {
    closed: false,
    document: {
      open: vi.fn(),
      write: vi.fn((html: string) => {
        writes.push(html);
      }),
      close: vi.fn(),
    } as unknown as Document,
    __writtenHtml: writes,
  } as FakePreviewWindow;
}

function latestWrittenHtml(previewWindow: FakePreviewWindow): string {
  return previewWindow.__writtenHtml[previewWindow.__writtenHtml.length - 1] || '';
}

function createPdfResponse() {
  const pdfBlob = {
    size: 3,
    type: 'application/pdf',
    arrayBuffer: vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer),
  } as unknown as Blob;

  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/pdf' : null),
    },
    blob: vi.fn(async () => pdfBlob),
  } as unknown as Response;
}

describe('pdfPreview', () => {
  const originalWindowOpen = window.open;
  const originalCreateObjectUrl = window.URL.createObjectURL;
  const originalRevokeObjectUrl = window.URL.revokeObjectURL;
  const originalClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.open = originalWindowOpen;
    window.URL.createObjectURL = originalCreateObjectUrl;
    window.URL.revokeObjectURL = originalRevokeObjectUrl;
    HTMLAnchorElement.prototype.click = originalClick;
  });

  it('preenche a janela pre-aberta com loading imediato', () => {
    const previewWindow = createFakePreviewWindow();
    window.open = vi.fn(() => previewWindow);

    const openedWindow = openPreviewWindow('Lista de Presença — CRM');

    expect(openedWindow).toBe(previewWindow);
    expect(latestWrittenHtml(previewWindow)).toContain('Lista de Presença — CRM');
    expect(latestWrittenHtml(previewWindow)).toContain('Baixar PDF');
    expect(latestWrittenHtml(previewWindow)).toContain('A preparar visualiza');
  });

  it('reutiliza a janela existente para renderizar o preview do PDF', async () => {
    const previewWindow = createFakePreviewWindow();
    const renderPdf = vi.fn();
    previewWindow.__renderPdf = renderPdf;
    previewWindow.__pdfError = vi.fn();

    await previewPdfBeforeDownload({
      fileName: 'PRESENCA-00001-CRM-20260617-abcdefgh.pdf',
      title: 'Lista de Presença — CRM',
      mimeType: 'application/pdf',
      existingWindow: previewWindow,
      fetcher: async () => createPdfResponse(),
    });

    expect(renderPdf).toHaveBeenCalledTimes(1);
    expect(renderPdf.mock.calls[0]?.[1]).toBe('application/pdf');
    expect(renderPdf.mock.calls[0]?.[2]).toBe('PRESENCA-00001-CRM-20260617-abcdefgh.pdf');
    expect(latestWrittenHtml(previewWindow)).toContain('Lista de Presença — CRM');
  });

  it('mostra erro na janela e inicia download fallback quando o preview falha', async () => {
    const previewWindow = createFakePreviewWindow();
    previewWindow.__renderPdf = vi.fn(() => {
      throw new Error('falha preview');
    });
    previewWindow.__pdfError = vi.fn();

    const anchorClick = vi.fn();
    HTMLAnchorElement.prototype.click = anchorClick;
    window.URL.createObjectURL = vi.fn(() => 'blob:test');
    window.URL.revokeObjectURL = vi.fn();

    await expect(
      previewPdfBeforeDownload({
        fileName: 'PRESENCA-00001-CRM-20260617-abcdefgh.pdf',
        title: 'Lista de Presença — CRM',
        mimeType: 'application/pdf',
        existingWindow: previewWindow,
        fetcher: async () => createPdfResponse(),
      }),
    ).rejects.toThrow('falha preview. O download foi iniciado automaticamente.');

    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(latestWrittenHtml(previewWindow)).toContain('Falha ao abrir o PDF');
    expect(latestWrittenHtml(previewWindow)).toContain(
      'falha preview. O download foi iniciado automaticamente.',
    );
  });

  it('permite escrever erro amigavel na janela sem fechá-la', () => {
    const previewWindow = createFakePreviewWindow();

    showPdfPreviewError(previewWindow, 'Lista de Presença — CRM', 'falha pdf');

    expect(latestWrittenHtml(previewWindow)).toContain('Falha ao abrir o PDF');
    expect(latestWrittenHtml(previewWindow)).toContain('falha pdf');
  });
});
