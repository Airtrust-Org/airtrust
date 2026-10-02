import { useCallback, useEffect, useState } from 'react';
import { PASTA_VIRTUAL_CATEGORIAS, type TipoDocumento } from '@/react-app/config/pastaVirtual';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';
import { api } from '@/react-app/utils/api-client';

export type { TipoDocumento } from '@/react-app/config/pastaVirtual';

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
  origem?: 'documentos' | 'pasta_virtual' | 'ficha_sessao';
  ficha_id?: number | null;
  proveniencia?: 'gerado' | 'upload';
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
  previewDocumento: (doc: DocumentoPV) => Promise<void>;
  downloadDocumento: (doc: DocumentoPV) => Promise<void>;
}

const CATEGORIA_BASE: Omit<CategoriaPV, 'documentos'>[] = PASTA_VIRTUAL_CATEGORIAS.map(
  (categoria) => ({
    tipo: categoria.tipo,
    titulo: categoria.titulo,
    cor: categoria.cor,
    expandido: categoria.expandidoInicial ?? false,
  }),
);

export function isPastaVirtualDocumentAvailable(
  doc: Pick<DocumentoPV, 'tamanho' | 'arquivo_url' | 'origem'>,
) {
  if (doc.origem === 'ficha_sessao') return true;
  return Number(doc.tamanho) > 0 && Boolean(String(doc.arquivo_url || '').trim());
}

function triggerDocumentDownload(blob: Blob, fileName: string): void {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName || 'documento.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export function usePastaVirtual(funcionarioId: number | undefined): UsePastaVirtualResult {
  const [categorias, setCategorias] = useState<CategoriaPV[]>(
    CATEGORIA_BASE.map((categoria) => ({ ...categoria, documentos: [] })),
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
        origem?: 'documentos' | 'pasta_virtual' | 'ficha_sessao';
        fichaId?: number | null;
        proveniencia?: 'gerado' | 'upload';
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
          origem: d.origem,
          ficha_id: d.fichaId ?? null,
          proveniencia: d.proveniencia,
        }));

      const categorizedDocs: Record<string, DocumentoApi[]> = categoryData.data || {};
      const agrupado = Object.fromEntries(
        PASTA_VIRTUAL_CATEGORIAS.map((config) => {
          const documentos = config.apiCategorias.flatMap(
            (apiCategoria) => categorizedDocs[apiCategoria] || [],
          );
          return [config.tipo, mapToDocumentoPV(documentos, config.tipo)];
        }),
      ) as Record<TipoDocumento, DocumentoPV[]>;

      setCategorias((prev) =>
        prev.map((categoria) => ({
          ...categoria,
          documentos: agrupado[categoria.tipo] || [],
          expandido: categoria.expandido,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar documentos');
      setCategorias((prev) => prev.map((categoria) => ({ ...categoria, documentos: [] })));
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

  const previewDocumento = useCallback(async (doc: DocumentoPV) => {
    if (!isPastaVirtualDocumentAvailable(doc)) {
      throw new Error('Arquivo indisponível para visualização');
    }

    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    if (doc.origem === 'ficha_sessao') {
      const fichaId = Number(doc.ficha_id || doc.id);
      if (!Number.isFinite(fichaId) || fichaId <= 0) {
        throw new Error('Ficha de treinamento inválida');
      }
      await previewPdfBeforeDownload({
        fileName: doc.nome,
        title: doc.nome,
        fetcher: async () => {
          const blob = await api.getBlob(`/simuladores/fichas/${fichaId}/pdf`, {
            method: 'POST',
            headers,
          });
          return new Response(blob, {
            status: 200,
            headers: { 'Content-Type': blob.type || 'application/pdf' },
          });
        },
      });
      return;
    }

    const fetchConfig: RequestInit = { headers };
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

  const downloadDocumento = useCallback(async (doc: DocumentoPV) => {
    if (!isPastaVirtualDocumentAvailable(doc)) {
      throw new Error('Arquivo indisponível para download');
    }

    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    let blob: Blob;
    if (doc.origem === 'ficha_sessao') {
      const fichaId = Number(doc.ficha_id || doc.id);
      if (!Number.isFinite(fichaId) || fichaId <= 0) {
        throw new Error('Ficha de treinamento inválida');
      }
      blob = await api.getBlob(`/simuladores/fichas/${fichaId}/pdf`, {
        method: 'POST',
        headers,
      });
    } else {
      blob = await api.getBlob(`/pasta-virtual/stream/${doc.id}`, { headers });
    }

    triggerDocumentDownload(blob, doc.nome);
  }, []);

  return {
    categorias,
    loading,
    error,
    refetch,
    deleteDocumento,
    previewDocumento,
    downloadDocumento,
  };
}

export default usePastaVirtual;
