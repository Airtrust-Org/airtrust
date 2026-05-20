import { useEffect, useState } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { FileText, Download, Trash2, Calendar, Loader, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';

interface Documento {
  id: number;
  funcionario_id: number;
  tipo_documento: string;
  nome_arquivo: string;
  tamanho_bytes: number;
  mime_type: string;
  descricao?: string;
  data_upload: string;
  uploaded_by?: string;
}

interface ListaDocumentosProps {
  funcionarioId: number;
}

export default function ListaDocumentos({ funcionarioId }: ListaDocumentosProps) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    carregarDocumentos();
  }, [funcionarioId]);

  const carregarDocumentos = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await fetch(`${API_BASE_URL}/funcionarios/${funcionarioId}/documentos`, {
        headers,
        cache: 'no-cache',
      });

      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setDocumentos(result.data || []);
    } catch (error) {
      console.error('Erro ao carregar documentos:', error);
      setError('Erro ao carregar documentos');
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (docId: number, nomeArquivo: string) => {
    try {
      const token = getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await apiFetch(`/api/documentos/${docId}/download`, {
        headers,
      });

      await previewPdfBeforeDownload({
        fileName: nomeArquivo,
        title: nomeArquivo,
        mimeType: documentos.find((doc) => doc.id === docId)?.mime_type,
        fetcher: async () => {
          if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
          }
          return response;
        },
      });
      toast.success('Visualizacao aberta');
    } catch (error) {
      console.error('Erro no download:', error);
      toast.error('Erro ao baixar documento');
    }
  };

  const handleExcluir = async (docId: number) => {
    if (!(await confirmDialog('Tem certeza que deseja excluir este documento?'))) return;

    try {
      const token = getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await apiFetch(`/api/documentos/${docId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error(`Erro ${response.status}: ${response.statusText}`);
      }

      toast.success('Documento excluído com sucesso');
      carregarDocumentos();
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir documento');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader className="w-8 h-8 animate-spin text-orange-600 mx-auto mb-2" />
        <p className="text-gray-600">Carregando documentos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-900">Erro ao carregar</p>
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  if (documentos.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600 font-semibold">Nenhum documento anexado</p>
        <p className="text-sm text-gray-500 mt-1">Use a aba "Enviar Documento" para adicionar</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">📁 Documentos Anexados ({documentos.length})</h3>

      <div className="space-y-2">
        {documentos.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 bg-orange-50 rounded-lg flex-shrink-0">
                <FileText className="w-6 h-6 text-orange-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900">{doc.tipo_documento}</p>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {(doc.tamanho_bytes / 1024).toFixed(2)} KB
                  </span>
                </div>
                <p className="text-sm text-gray-600 truncate">{doc.nome_arquivo}</p>
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(doc.data_upload).toLocaleDateString('pt-BR')}
                  {doc.descricao && (
                    <>
                      <span>•</span>
                      <span className="truncate">{doc.descricao}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0 ml-2">
              <button
                onClick={() => handleDownload(doc.id, doc.nome_arquivo)}
                className="p-2 text-primary hover:bg-primary/10 rounded-lg transition"
                title="Baixar"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleExcluir(doc.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                title="Excluir"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
