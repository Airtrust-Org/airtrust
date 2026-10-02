const TARGET_DPI = 150;
const JPEG_QUALITY = 0.82;
const MIN_SAVINGS_RATIO = 0.05;
const MAX_IMAGE_DIMENSION = 1800;

export interface PdfUploadPreparation {
  file: File;
  optimized: boolean;
  convertedToPdf: boolean;
  preservedDigitalSignature: boolean;
  originalSize: number;
  finalSize: number;
}

export function certificatePdfFileName(name: string): string {
  const trimmed = name.trim() || 'certificado';
  if (/\.pdf$/i.test(trimmed)) return trimmed;
  if (/\.(jpe?g|png)$/i.test(trimmed)) return trimmed.replace(/\.(jpe?g|png)$/i, '.pdf');
  return `${trimmed}.pdf`;
}

export function hasPdfDigitalSignature(bytes: Uint8Array): boolean {
  const text = new TextDecoder('latin1').decode(bytes);
  return text.includes('/ByteRange') || /\/Type\s*\/Sig\b/.test(text);
}
async function canvasToJpegDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

function fitImage(width: number, height: number): { width: number; height: number } {
  const largest = Math.max(width, height);
  if (largest <= MAX_IMAGE_DIMENSION) return { width, height };
  const scale = MAX_IMAGE_DIMENSION / largest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function imageFileToPdf(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const fitted = fitImage(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível para converter certificado');
  ctx.drawImage(bitmap, 0, 0, fitted.width, fitted.height);
  bitmap.close();

  const { jsPDF } = await import('jspdf');
  const widthPt = (fitted.width * 72) / TARGET_DPI;
  const heightPt = (fitted.height * 72) / TARGET_DPI;
  const orientation = widthPt > heightPt ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'pt', format: [widthPt, heightPt], orientation, compress: true });
  pdf.addImage(
    await canvasToJpegDataUrl(canvas),
    'JPEG',
    0,
    0,
    widthPt,
    heightPt,
    undefined,
    'FAST',
  );
  const blob = pdf.output('blob');
  return new File([blob], certificatePdfFileName(file.name), {
    type: 'application/pdf',
    lastModified: file.lastModified,
  });
}

async function rasterizeScannedPdf(file: File, bytes: Uint8Array): Promise<File | null> {
  const pdfjs =
    (await import('pdfjs-dist/legacy/build/pdf.mjs')) as typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const source = await loadingTask.promise;

  // Preserve digital/searchable PDFs. Rasterization is reserved for scans
  // without a meaningful text layer so storage savings never remove search,
  // copy/paste or accessibility from a document that already has them.
  let digitalTextLength = 0;
  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
    const page = await source.getPage(pageNumber);
    const content = await page.getTextContent();
    digitalTextLength += (content.items || []).reduce((total, item) => {
      const text = 'str' in item && typeof item.str === 'string' ? item.str.trim() : '';
      return total + text.length;
    }, 0);
    page.cleanup();
    if (digitalTextLength >= 20) {
      await source.destroy();
      return null;
    }
  }

  const { jsPDF } = await import('jspdf');
  let output: InstanceType<typeof jsPDF> | null = null;

  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
    const page = await source.getPage(pageNumber);
    const pointViewport = page.getViewport({ scale: 1 });
    const renderViewport = page.getViewport({ scale: TARGET_DPI / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(renderViewport.width));
    canvas.height = Math.max(1, Math.round(renderViewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível para otimizar certificado');
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    const orientation = pointViewport.width > pointViewport.height ? 'landscape' : 'portrait';
    if (!output) {
      output = new jsPDF({
        unit: 'pt',
        format: [pointViewport.width, pointViewport.height],
        orientation,
        compress: true,
      });
    } else {
      output.addPage([pointViewport.width, pointViewport.height], orientation);
    }
    output.addImage(
      await canvasToJpegDataUrl(canvas),
      'JPEG',
      0,
      0,
      pointViewport.width,
      pointViewport.height,
      undefined,
      'FAST',
    );
    page.cleanup();
  }

  await source.destroy();
  if (!output) throw new Error('PDF sem páginas válidas');
  const blob = output.output('blob');
  return new File([blob], file.name, { type: 'application/pdf', lastModified: file.lastModified });
}
export async function preparePdfUploadFile(file: File): Promise<PdfUploadPreparation> {
  const originalSize = file.size;
  const isImage = /image\/(jpeg|jpg|png)/i.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
  if (isImage) {
    const converted = await imageFileToPdf(file);
    return {
      file: converted,
      optimized: converted.size < originalSize,
      convertedToPdf: true,
      preservedDigitalSignature: false,
      originalSize,
      finalSize: converted.size,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (hasPdfDigitalSignature(bytes)) {
    return {
      file,
      optimized: false,
      convertedToPdf: false,
      preservedDigitalSignature: true,
      originalSize,
      finalSize: originalSize,
    };
  }

  const candidate = await rasterizeScannedPdf(file, bytes);
  const useCandidate =
    candidate !== null && candidate.size <= originalSize * (1 - MIN_SAVINGS_RATIO);
  return {
    file: useCandidate && candidate ? candidate : file,
    optimized: useCandidate,
    convertedToPdf: false,
    preservedDigitalSignature: false,
    originalSize,
    finalSize: useCandidate && candidate ? candidate.size : originalSize,
  };
}

export const prepareCertificateUploadFile = preparePdfUploadFile;
export type CertificateUploadPreparation = PdfUploadPreparation;
