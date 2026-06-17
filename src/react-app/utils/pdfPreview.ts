function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPdfFile(fileName: string, mimeType?: string | null): boolean {
  const normalizedMime = (mimeType || '').toLowerCase();
  const normalizedName = fileName.toLowerCase();

  return normalizedMime.includes('application/pdf') || normalizedName.endsWith('.pdf');
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const namedBlob =
    typeof File !== 'undefined'
      ? new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
      : blob;
  const objectUrl = window.URL.createObjectURL(namedBlob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

function renderLoadingState(previewWindow: Window, title: string): void {
  previewWindow.document.open();
  previewWindow.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #525659; font-family: Arial, sans-serif; }
    #loading {
      display: flex; align-items: center; justify-content: center;
      height: 100%; gap: 12px; color: #fff;
    }
    .spinner {
      width: 20px; height: 20px;
      border: 3px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #toolbar {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2;
      min-height: 48px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      background: #111827;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    #toolbarTitle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
    #downloadLink {
      flex-shrink: 0;
      border-radius: 8px;
      background: #2563eb;
      color: #fff;
      padding: 8px 12px;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    #viewer, #viewerFallback {
      display: none;
      position: fixed;
      top: 48px;
      left: 0;
      width: 100%;
      height: calc(100% - 48px);
      border: none;
      background: #525659;
    }
    #errorBox {
      display: none; padding: 24px; max-width: 520px; margin: auto;
      background: #fff; border-radius: 12px; color: #7c2d12;
    }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <span>A preparar visualiza&#231;&#227;o do PDF&#8230;</span>
  </div>
  <div id="toolbar">
    <span id="toolbarTitle">${escapeHtml(title)}</span>
    <a id="downloadLink" href="#" download>Baixar PDF</a>
  </div>
  <object id="viewer" type="application/pdf" title="${escapeHtml(title)}">
    <iframe id="viewerFallback" title="${escapeHtml(title)}"></iframe>
  </object>
  <div id="errorBox"></div>
  <script>
    // Called by the opener once PDF bytes are ready.
    // Runs entirely inside this window's context:
    //   - new Blob() -> owned by this document
    //   - URL.createObjectURL() -> blob URL registered to this document
    //   - iframe.src = url -> consumed immediately in this same document
    // No cross-window blob ownership, no location.assign navigation.
    window.__renderPdf = function(buffer, mimeType, fileName) {
      try {
        var blob = new Blob([buffer], { type: mimeType || 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var viewer = document.getElementById('viewer');
        var fallback = document.getElementById('viewerFallback');
        var loading = document.getElementById('loading');
        var toolbar = document.getElementById('toolbar');
        var download = document.getElementById('downloadLink');
        loading.style.display = 'none';
        toolbar.style.display = 'flex';
        download.href = url;
        download.download = fileName || 'documento.pdf';
        viewer.data = url;
        viewer.style.display = 'block';
        fallback.src = url;
        fallback.style.display = 'block';
      } catch (e) {
        window.__pdfError('Erro ao criar visualizacao: ' + e.message);
      }
    };
    window.__pdfError = function(msg) {
      document.getElementById('loading').style.display = 'none';
      var box = document.getElementById('errorBox');
      box.textContent = 'Erro: ' + (msg || 'Falha ao carregar PDF');
      box.style.display = 'block';
    };
  </script>
</body>
</html>`);
  previewWindow.document.close();
}

function renderErrorState(previewWindow: Window, title: string, message: string): void {
  previewWindow.document.open();
  previewWindow.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #fff7ed;
        color: #7c2d12;
        font-family: Arial, sans-serif;
      }
      .box {
        max-width: 520px;
        border: 1px solid #fdba74;
        border-radius: 14px;
        padding: 24px;
        background: #ffffff;
        box-shadow: 0 10px 30px rgba(124, 45, 18, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 20px;
      }
      p {
        margin: 0;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>Falha ao abrir o PDF</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  </body>
</html>`);
  previewWindow.document.close();
}

type PreviewRendererWindow = Window & {
  __pdfError?: (message?: string) => void;
  __renderPdf?: (buffer: ArrayBuffer, mimeType: string, fileName: string) => void;
};

function hasPreviewRenderer(previewWindow: Window): previewWindow is PreviewRendererWindow {
  const candidate = previewWindow as PreviewRendererWindow;
  return (
    typeof candidate.__renderPdf === 'function' && typeof candidate.__pdfError === 'function'
  );
}

async function waitForPreviewRenderer(previewWindow: Window, timeoutMs = 1_500): Promise<void> {
  const startedAt = Date.now();

  while (!previewWindow.closed && Date.now() - startedAt < timeoutMs) {
    if (hasPreviewRenderer(previewWindow)) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }

  throw new Error('A janela de preview não ficou pronta a tempo');
}

async function renderPdfPreview(
  previewWindow: Window,
  buffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
): Promise<void> {
  // Delegates to __renderPdf which was injected into the preview window's own
  // document by renderLoadingState. Running inside the child window's script context
  // means new Blob(), URL.createObjectURL(), and iframe.src are all scoped to the
  // same document, eliminating every cross-window blob-ownership issue.
  await waitForPreviewRenderer(previewWindow);
  (previewWindow as PreviewRendererWindow).__renderPdf?.(buffer, mimeType, fileName);
}

interface PdfPreviewOptions {
  fileName: string;
  title?: string;
  mimeType?: string | null;
  fetcher: () => Promise<Response>;
  /** Pre-opened window — call openPreviewWindow() before async work to avoid popup-blocker */
  existingWindow?: Window | null;
}

/**
 * Opens a blank preview window synchronously (before any async work).
 * Pass the returned reference as `existingWindow` to previewPdfBeforeDownload.
 */
export function openPreviewWindow(title = 'Visualizacao de PDF'): Window | null {
  const previewWindow = window.open('', '_blank');
  if (previewWindow) {
    renderLoadingState(previewWindow, title);
  }
  return previewWindow;
}

export function showPdfPreviewError(
  previewWindow: Window | null | undefined,
  title: string,
  message: string,
): void {
  if (previewWindow && !previewWindow.closed) {
    renderErrorState(previewWindow, title, message);
  }
}

export async function previewPdfBeforeDownload({
  fileName,
  title,
  mimeType,
  fetcher,
  existingWindow,
}: PdfPreviewOptions): Promise<void> {
  const previewTitle = title || fileName || 'Visualizacao de PDF';
  const previewWindow = existingWindow ?? window.open('', '_blank');
  let downloadedFallback = false;
  let pdfBlob: Blob | null = null;

  if (previewWindow) {
    renderLoadingState(previewWindow, previewTitle);
  }

  try {
    const response = await fetcher();
    if (!response.ok) {
      throw new Error(`Erro ao abrir arquivo (${response.status})`);
    }

    const responseMimeType = response.headers.get('content-type') || mimeType || '';
    const blob = await response.blob();
    pdfBlob = blob;
    const blobMimeType = blob.type || responseMimeType;

    if (!isPdfFile(fileName, blobMimeType)) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      triggerBlobDownload(blob, fileName);
      return;
    }

    // Convert blob to ArrayBuffer so we can pass raw bytes to __renderPdf.
    // The blob URL creation and iframe rendering are done inside the preview
    // window's own script context (see __renderPdf in renderLoadingState),
    // avoiding every cross-window blob-ownership issue in Chrome/Brave.
    const arrayBuffer = await blob.arrayBuffer();
    const effectiveMime = blobMimeType || 'application/pdf';

    if (previewWindow && !previewWindow.closed) {
      await renderPdfPreview(previewWindow, arrayBuffer, effectiveMime, fileName);
      return;
    }

    const fallbackWindow = window.open('', '_blank');
    if (!fallbackWindow) {
      triggerBlobDownload(blob, fileName);
      return;
    }
    renderLoadingState(fallbackWindow, previewTitle);
    await renderPdfPreview(fallbackWindow, arrayBuffer, effectiveMime, fileName);
  } catch (error) {
    const baseMessage = error instanceof Error ? error.message : 'Erro ao abrir o arquivo';
    let finalMessage = baseMessage;

    if (pdfBlob) {
      try {
        triggerBlobDownload(pdfBlob, fileName);
        downloadedFallback = true;
        finalMessage = `${baseMessage}. O download foi iniciado automaticamente.`;
      } catch {
        // Mantém a mensagem original quando nem o fallback de download é possível.
      }
    }

    if (previewWindow && !previewWindow.closed) {
      renderErrorState(previewWindow, previewTitle, finalMessage);
    }

    throw new Error(finalMessage);
  }
}
