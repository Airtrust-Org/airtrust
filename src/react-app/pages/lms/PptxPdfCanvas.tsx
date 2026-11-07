import { useEffect, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url,
).toString();

export type PptxPdfDocument = PDFDocumentProxy;

export async function openPptxPdf(bytes: ArrayBuffer): Promise<PptxPdfDocument> {
  return pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
}

/** Render only the visible page; completion evidence must wait for a completed paint. */
export function PptxPdfCanvas({ document, index, onReady, onError }: {
  document: PptxPdfDocument;
  index: number;
  onReady: (index: number) => void;
  onError: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | undefined;
    const render = async () => {
      try {
        const page = await document.getPage(index + 1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = (1280 / viewport.width) * Math.min(window.devicePixelRatio || 1, 2);
        const output = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) throw new Error('CANVAS_UNAVAILABLE');
        canvas.width = Math.ceil(output.width);
        canvas.height = Math.ceil(output.height);
        task = page.render({ canvasContext: context, viewport: output });
        await task.promise;
        if (!cancelled) onReady(index);
      } catch (error) {
        if (!cancelled) onError(error instanceof Error ? error.message : 'PDF_RENDER_FAILED');
      }
    };
    void render();
    return () => { cancelled = true; task?.cancel(); };
  }, [document, index, onReady, onError]);

  return <canvas ref={canvasRef} aria-label={`Slide ${index + 1} renderizado`} className="max-h-full max-w-full object-contain" />;
}
