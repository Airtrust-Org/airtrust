import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  baixarCertificadoCanonico,
  resolveCertificadoDocumentoId,
} from '@/react-app/utils/certificadoDownload';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';

vi.mock('@/react-app/lib/apiFetch', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/react-app/utils/pdfPreview', () => ({
  previewPdfBeforeDownload: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);
const previewMock = vi.mocked(previewPdfBeforeDownload);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveCertificadoDocumentoId', () => {
  it('prefers documento_id when present', () => {
    expect(resolveCertificadoDocumentoId({ id: 1, documento_id: 42 })).toBe(42);
  });

  it('falls back to id when documento_id is absent', () => {
    expect(resolveCertificadoDocumentoId({ id: 7 })).toBe(7);
  });

  it('returns null when neither id nor documento_id is a finite number', () => {
    expect(resolveCertificadoDocumentoId({})).toBeNull();
    expect(resolveCertificadoDocumentoId({ id: null, documento_id: null })).toBeNull();
  });
});

describe('baixarCertificadoCanonico', () => {
  it('throws without calling the network when there is no canonical documento id', async () => {
    await expect(baixarCertificadoCanonico({ nome_arquivo: 'CERT.pdf' })).rejects.toThrow(
      'Certificado sem identificador de documento válido.',
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(previewMock).not.toHaveBeenCalled();
  });

  it('streams from /pasta-virtual/stream/:documento_id, never from r2_key', async () => {
    previewMock.mockImplementation(async ({ fetcher }) => {
      await fetcher();
    });
    apiFetchMock.mockResolvedValue(new Response(new Blob(['x']), { status: 200 }));

    await baixarCertificadoCanonico({
      id: 99,
      documento_id: 501,
      nome_arquivo: 'CERT.pdf',
      numero_certificado: 'C-001',
      tipo: 'application/pdf',
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(apiFetchMock.mock.calls[0][0]);
    expect(calledUrl).toMatch(/\/pasta-virtual\/stream\/501$/);
    expect(calledUrl).not.toMatch(/r2_key|documentos\/download/);
  });

  it('maps 401 to a sanitized session-expired message', async () => {
    apiFetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    previewMock.mockImplementation(async ({ fetcher }) => {
      await fetcher();
    });

    await expect(
      baixarCertificadoCanonico({ id: 1, nome_arquivo: 'CERT.pdf' }),
    ).rejects.toThrow('Sessão expirada. Faça login novamente para baixar o certificado.');
  });

  it('maps 403 to a sanitized permission message', async () => {
    apiFetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    previewMock.mockImplementation(async ({ fetcher }) => {
      await fetcher();
    });

    await expect(
      baixarCertificadoCanonico({ id: 1, nome_arquivo: 'CERT.pdf' }),
    ).rejects.toThrow('Você não tem permissão para baixar este certificado.');
  });

  it('maps 404 (missing document or missing R2 object) to a sanitized message', async () => {
    apiFetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    previewMock.mockImplementation(async ({ fetcher }) => {
      await fetcher();
    });

    await expect(
      baixarCertificadoCanonico({ id: 1, nome_arquivo: 'CERT.pdf' }),
    ).rejects.toThrow('Certificado não encontrado ou arquivo ausente no armazenamento.');
  });
});
