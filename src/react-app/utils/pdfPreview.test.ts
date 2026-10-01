import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  openPreviewWindow,
  previewPdfBeforeDownload,
  showPdfPreviewError,
} from '@/react-app/utils/pdfPreview';

const pdfJsMocks = vi.hoisted(() => {
  const render = vi.fn(() => ({ promise: Promise.resolve() }));
  const cleanup = vi.fn();
  const destroy = vi.fn(async () => undefined);
  const getPage = vi.fn(async () => ({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render,
    cleanup,
  }));
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({ numPages: 1, getPage, destroy }),
  }));
  return { render, cleanup, destroy, getPage, getDocument };
});

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: pdfJsMocks.getDocument,
}));

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
  const originalUserAgent = window.navigator.userAgent;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.open = originalWindowOpen;
    window.URL.createObjectURL = originalCreateObjectUrl;
    window.URL.revokeObjectURL = originalRevokeObjectUrl;
    HTMLAnchorElement.prototype.click = originalClick;
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: originalUserAgent });
  });

  it('preenche a janela pre-aberta com loading imediato', () => {
    const previewWindow = createFakePreviewWindow();
    window.open = vi.fn(() => previewWindow);

    const openedWindow = openPreviewWindow('Lista de Presença — CRM');

    expect(openedWindow).toBe(previewWindow);
    expect(latestWrittenHtml(previewWindow)).toContain('Lista de Presença — CRM');
    expect(latestWrittenHtml(previewWindow)).toContain('Baixar PDF');
    expect(latestWrittenHtml(previewWindow)).toContain('A preparar visualiza');
    expect(latestWrittenHtml(previewWindow)).toContain('<iframe id="viewer"');
    expect(latestWrittenHtml(previewWindow)).not.toContain('<object id="viewer"');
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

  it('no Safari renderiza o PDF autenticado com PDF.js em vez de navegar para data URL', async () => {
    const previewWindow = createFakePreviewWindow();
    const loading = { style: { display: 'flex' } };
    const toolbar = { style: { display: 'none' } };
    const downloadLink = { style: {}, href: '', download: '' };
    const viewer = { style: { display: 'block' } };
    const pdfPages = {
      style: { display: 'none' },
      replaceChildren: vi.fn(),
      appendChild: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      style: {} as Record<string, string>,
      getContext: vi.fn(() => ({})),
    };
    const elements: Record<string, unknown> = {
      loading,
      toolbar,
      downloadLink,
      viewer,
      pdfPages,
    };
    const createObjectURL = vi.fn(() => 'blob:safari-rendered-pdf');

    Object.assign(previewWindow.document, {
      getElementById: vi.fn((id: string) => elements[id] || null),
      createElement: vi.fn((tag: string) => (tag === 'canvas' ? canvas : null)),
    });
    Object.defineProperty(previewWindow, 'Blob', { configurable: true, value: Blob });
    Object.defineProperty(previewWindow, 'URL', {
      configurable: true,
      value: { createObjectURL },
    });
    Object.defineProperty(previewWindow, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15',
    });
    const pdfBlob = {
      type: 'application/pdf',
      arrayBuffer: vi.fn(async () => Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer),
    } as unknown as Blob;

    await previewPdfBeforeDownload({
      fileName: 'CERTIFICADO.pdf',
      title: 'Certificado CRM_CORP',
      mimeType: 'application/pdf',
      existingWindow: previewWindow,
      fetcher: async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => 'application/pdf' },
          blob: async () => pdfBlob,
        }) as unknown as Response,
    });

    expect(pdfJsMocks.getDocument).toHaveBeenCalledTimes(1);
    expect(pdfJsMocks.render).toHaveBeenCalledTimes(1);
    expect(pdfPages.appendChild).toHaveBeenCalledWith(canvas);
    expect(pdfPages.style.display).toBe('block');
    expect(viewer.style.display).toBe('none');
    expect(toolbar.style.display).toBe('flex');
    expect(loading.style.display).toBe('none');
    expect(downloadLink.href).toBe('blob:safari-rendered-pdf');
    expect(downloadLink.download).toBe('CERTIFICADO.pdf');
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
