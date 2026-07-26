/**
 * Fluxo canônico e único de download de certificado, usado por
 * CardMeusEAD e useCertificados. Nunca usa r2_key na URL — sempre
 * resolve o documento_id e baixa via /api/pasta-virtual/stream/:id.
 */
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import { previewPdfBeforeDownload } from './pdfPreview';

export interface CertificadoDownloadSource {
  id?: number | null;
  documento_id?: number | null;
  nome_arquivo?: string | null;
  arquivo_nome?: string | null;
  numero_certificado?: string | null;
  tipo?: string | null;
}

const STREAM_ERROR_MESSAGES: Record<number, string> = {
  401: 'Sessão expirada. Faça login novamente para baixar o certificado.',
  403: 'Você não tem permissão para baixar este certificado.',
  404: 'Certificado não encontrado ou arquivo ausente no armazenamento.',
};

/**
 * O endpoint de listagem sempre retorna documento_id === id (ambos vêm de
 * d.id na query). O fallback para `id` só se aplica quando documento_id
 * vier ausente do payload, nunca como suposição alternativa de contrato.
 */
export function resolveCertificadoDocumentoId(cert: CertificadoDownloadSource): number | null {
  if (typeof cert.documento_id === 'number' && Number.isFinite(cert.documento_id)) {
    return cert.documento_id;
  }
  if (typeof cert.id === 'number' && Number.isFinite(cert.id)) {
    return cert.id;
  }
  return null;
}

export async function baixarCertificadoCanonico(cert: CertificadoDownloadSource): Promise<void> {
  const documentoId = resolveCertificadoDocumentoId(cert);
  if (!documentoId) {
    throw new Error('Certificado sem identificador de documento válido.');
  }

  const fileName = cert.nome_arquivo || cert.arquivo_nome || 'certificado.pdf';

  await previewPdfBeforeDownload({
    fileName,
    title: `Certificado ${cert.numero_certificado || fileName}`,
    mimeType: cert.tipo || 'application/pdf',
    fetcher: async () => {
      const response = await fetchWithAuth(`${API_BASE_URL}/pasta-virtual/stream/${documentoId}`);
      if (!response.ok) {
        const sanitized = STREAM_ERROR_MESSAGES[response.status];
        if (sanitized) {
          throw new Error(sanitized);
        }
      }
      return response;
    },
  });
}
