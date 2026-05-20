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
  status: 'ATIVO' | 'VENCIDO' | 'VENCENDO';
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
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Carregar documentos agrupados por categoria do novo endpoint
      // Adicionar timestamp para forçar bypass de cache
      const timestamp = Date.now();
      const categoryRes = await fetch(
        `${API_BASE_URL}/pasta-virtual/by-category/${funcionarioId}?_t=${timestamp}`,
        { headers },
      );

      if (!categoryRes.ok) {
        throw new Error(`API retornou ${categoryRes.status}`);
      }

      const categoryData = await categoryRes.json();

      interface DocumentoApi {
        id: number;
        nome: string;
        tipo: string;
        url: string;
        dataUpload: string;
        status: string;
        tamanho: number;
      }

      // Mapear categorias da API para categorias do frontend
      const mapToDocumentoPV = (docs: DocumentoApi[]): DocumentoPV[] =>
        docs.map((d) => ({
          id: d.id,
          nome: d.nome,
          tipo: 'CERTIFICADO_QUALIFICACAO', // Será mapeado por categoria
          arquivo_url: d.url,
          data_upload: d.dataUpload,
          data_vencimento: undefined,
          tamanho: d.tamanho,
          status: (d.status as DocumentoPV['status']) || 'ATIVO',
        }));

      // Mapear categorias da API para tipos do frontend
      const categorizedDocs = categoryData.data || {};

      const agrupado: Record<TipoDocumento, DocumentoPV[]> = {
        CERTIFICADO_QUALIFICACAO: mapToDocumentoPV(
          categorizedDocs['Certificados de Qualificação'] || [],
        ),
        DOCUMENTO_PESSOAL: mapToDocumentoPV(categorizedDocs['Documentos Pessoais'] || []),
        EXAME_MEDICO: (categorizedDocs['Exames Médicos (ASO, CMA)'] || []).map(
          (d: DocumentoApi) => ({
            id: d.id,
            nome: d.nome,
            tipo: 'EXAME_MEDICO',
            arquivo_url: d.url,
            data_upload: d.dataUpload,
            data_vencimento: undefined,
            tamanho: d.tamanho,
            status: (d.status as DocumentoPV['status']) || 'ATIVO',
          }),
        ),
        SIMULADOR: mapToDocumentoPV(categorizedDocs['Simuladores'] || []),
        OUTROS: mapToDocumentoPV(categorizedDocs['Outros'] || []),
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

  // uploadDocumento removido - agora usa UploadDocumentoModal com nomenclatura padronizada

  const deleteDocumento = useCallback(
    async (id: number) => {
      const token = getAccessToken();
      const fetchConfig: RequestInit = { method: 'DELETE' };
      if (token) {
        fetchConfig.headers = { Authorization: `Bearer ${token}` };
      }

      console.log(`[usePastaVirtual] Deletando documento ${id}`);

      const res = await fetch(`${API_BASE_URL}/pasta-virtual/delete/${id}`, fetchConfig);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || `Falha ao excluir (${res.status})`;
        console.error('[usePastaVirtual] Delete falhou:', errorMsg);
        throw new Error(errorMsg);
      }

      const data = await res.json().catch(() => ({}));
      console.log('[usePastaVirtual] Delete sucesso, iniciando refetch...');

      // Aguardar refetch com timeout para evitar travamento
      try {
        await Promise.race([
          refetch(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout no refetch')), 10000),
          ),
        ]);
        console.log('[usePastaVirtual] Refetch completo');
      } catch (refetchError) {
        console.warn('[usePastaVirtual] Refetch falhou, mas delete foi sucesso:', refetchError);
        // Mesmo que refetch falhe, o delete foi bem-sucedido
      }
    },
    [refetch],
  );

  const downloadDocumento = useCallback(async (doc: DocumentoPV) => {
    try {
      const token = getAccessToken();
      const fetchConfig: RequestInit = {};
      if (token) {
        fetchConfig.headers = { Authorization: `Bearer ${token}` };
      }
      // Todos os downloads agora vêm do mesmo endpoint
      const endpoint = `${API_BASE_URL}/pasta-virtual/download/${doc.id}`;
      const res = await fetch(endpoint, fetchConfig);
      if (!res.ok) throw new Error('Erro ao baixar');
      const data = await res.json();

      if (!data.success || !data.data?.url) {
        throw new Error('URL de download não fornecida');
      }

      // Agora fazer streaming do arquivo
      // data.data.url pode vir como URL relativa, precisamos absolutizar
      // Remove barra inicial se existir para evitar URL como /api//pasta-virtual
      const urlPath = data.data.url.startsWith('/') ? data.data.url.slice(1) : data.data.url;
      const streamUrl = data.data.url.startsWith('http')
        ? data.data.url
        : `${API_BASE_URL}/${urlPath}`;
      await previewPdfBeforeDownload({
        fileName: doc.nome,
        title: doc.nome,
        fetcher: () => fetch(streamUrl, fetchConfig),
      });
    } catch {
      // silencioso
    }
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
