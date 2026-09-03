import { useEffect, useState, useCallback } from 'react';
import { PASTA_VIRTUAL_CATEGORIAS } from '@/react-app/config/pastaVirtual';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';

export type TipoDocumento =
  | 'CERTIFICADO_QUALIFICACAO'
  | 'DOCUMENTO_PESSOAL'
  | 'EXAME_MEDICO'
  | 'SIMULADOR'
  | 'OUTROS';

export interface DocumentoPV {
  id: number;
  nome: string;
  tipo: TipoDocumento;
  arquivo_url?: string;
  data_upload: string;
  data_vencimento?: string;
  tamanho: number;
  status: string;
  versaoAtual?: boolean;
  substituidoPorId?: number | null;
}

export interface CategoriaPV {
  tipo: TipoDocumento;
  titulo: string;
  documentos: DocumentoPV[];
  expandido: boolean;
  cor: string;
}

interface UsePastaVirtualResult {
  categorias: CategoriaPV[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteDocumento: (id: number) => Promise<void>;
  downloadDocumento: (doc: DocumentoPV) => Promise<void>;
}

const CATEGORIA_BASE: Omit<CategoriaPV, 'documentos'>[] = PASTA_VIRTUAL_CATEGORIAS.map((c) => ({
  tipo: c.tipo,
  titulo: c.titulo,
  cor: c.cor,
  expandido: c.expandidoInicial ?? false,
}));

export function isPastaVirtualDocumentAvailable(doc: Pick<DocumentoPV, 'tamanho' | 'arquivo_url'>) {
  return Number(doc.tamanho) > 0 && Boolean(String(doc.arquivo_url || '').trim());
}

export function usePastaVirtual(funcionarioId: number | undefined): UsePastaVirtualResult {
  const [categorias, setCategorias] = useState<CategoriaPV[]>(
    CATEGORIA_BASE.map((c) => ({ ...c, documentos: [] })),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!funcionarioId) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const timestamp = Date.now();
      const categoryRes = await fetch(
        `${API_BASE_URL}/pasta-virtual/by-category/${funcionarioId}?_t=${timestamp}`,
        { headers },
      );

      if (!categoryRes.ok) throw new Error(`API retornou ${categoryRes.status}`);

      const categoryData = await categoryRes.json();

      interface DocumentoApi {
        id: number;
        nome: string;
        tipo: string;
        url: string;
        dataUpload: string;
        status: string;
        tamanho: number;
        versaoAtual?: boolean;
        substituidoPorId?: number | null;
      }

      const mapToDocumentoPV = (docs: DocumentoApi[], tipo: TipoDocumento): DocumentoPV[] =>
        docs.map((d) => ({
          id: d.id,
          nome: d.nome,
          tipo,
          arquivo_url: d.url,
          data_upload: d.dataUpload,
          data_vencimento: undefined,
          tamanho: Number(d.tamanho) || 0,
          status: d.status || 'Válido',
          versaoAtual: d.versaoAtual,
          substituidoPorId: d.substituidoPorId ?? null,
        }));

      const categorizedDocs = categoryData.data || {};
      const agrupado: Record<TipoDocumento, DocumentoPV[]> = {
        CERTIFICADO_QUALIFICACAO: mapToDocumentoPV(
          categorizedDocs['Certificados de Qualificação'] || [],
          'CERTIFICADO_QUALIFICACAO',
        ),
        DOCUMENTO_PESSOAL: mapToDocumentoPV(
          categorizedDocs['Documentos Pessoais'] || [],
          'DOCUMENTO_PESSOAL',
        ),
        EXAME_MEDICO: mapToDocumentoPV(
          categorizedDocs['Exames Médicos (ASO, CMA)'] || [],
          'EXAME_MEDICO',
        ),
        SIMULADOR: mapToDocumentoPV(categorizedDocs['Simuladores'] || [], 'SIMULADOR'),
        OUTROS: mapToDocumentoPV(categorizedDocs['Outros'] || [], 'OUTROS'),
      };

      setCategorias((prev) =>
        prev.map((c) => ({ ...c, documentos: agrupado[c.tipo] || [], expandido: c.expandido })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar documentos');
      setCategorias((prev) => prev.map((c) => ({ ...c, documentos: [] })));
    } finally {
      setLoading(false);
    }
  }, [funcionarioId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const deleteDocumento = useCallback(
    async (id: number) => {
      const token = getAccessToken();
      const fetchConfig: RequestInit = { method: 'DELETE' };
      if (token) fetchConfig.headers = { Authorization: `Bearer ${token}` };

      const res = await fetch(`${API_BASE_URL}/pasta-virtual/delete/${id}`, fetchConfig);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Falha ao excluir (${res.status})`);
      }

      await res.json().catch(() => ({}));
      try {
        await Promise.race([
          refetch(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout no refetch')), 10000),
          ),
        ]);
      } catch (refetchError) {
        console.warn('[usePastaVirtual] Refetch falhou após delete concluído:', refetchError);
      }
    },
    [refetch],
  );

  const downloadDocumento = useCallback(async (doc: DocumentoPV) => {
    if (!isPastaVirtualDocumentAvailable(doc)) {
      throw new Error('Arquivo indisponível para visualização');
    }

    const token = getAccessToken();
    const fetchConfig: RequestInit = {};
    if (token) fetchConfig.headers = { Authorization: `Bearer ${token}` };

    const endpoint = `${API_BASE_URL}/pasta-virtual/download/${doc.id}`;
    const res = await fetch(endpoint, fetchConfig);
    if (!res.ok) throw new Error('Erro ao baixar');
    const data = await res.json();
    if (!data.success || !data.data?.url) throw new Error('URL de download não fornecida');

    const urlPath = data.data.url.startsWith('/') ? data.data.url.slice(1) : data.data.url;
    const streamUrl = data.data.url.startsWith('http')
      ? data.data.url
      : `${API_BASE_URL}/${urlPath}`;
    await previewPdfBeforeDownload({
      fileName: doc.nome,
      title: doc.nome,
      fetcher: () => fetch(streamUrl, fetchConfig),
    });
  }, []);

  return {
    categorias,
    loading,
    error,
    refetch,
    deleteDocumento,
    downloadDocumento,
  };
}

export default usePastaVirtual;
