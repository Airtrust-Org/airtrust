import { useEffect, useState } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { FileText, Download, Trash2, Calendar, Loader, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';

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
      <div className="py-8 text-center">
        <Loader className="mx-auto mb-2 h-8 w-8 animate-spin text-orange-600" />
        <p className="text-gray-600 dark:text-slate-300">Carregando documentos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-300" />
        <div>
          <p className="font-semibold text-red-900 dark:text-red-100">Erro ao carregar</p>
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      </div>
    );
  }

  if (documentos.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 py-8 text-center dark:border-slate-700 dark:bg-slate-900">
        <FileText className="mx-auto mb-2 h-12 w-12 text-gray-400 dark:text-slate-500" />
        <p className="font-semibold text-gray-600 dark:text-slate-200">Nenhum documento anexado</p>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Use a aba &quot;Enviar Documento&quot; para adicionar
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        Documentos anexados ({documentos.length})
      </h3>

      <div className="space-y-2">
        {documentos.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex-shrink-0 rounded-lg bg-orange-50 p-2 dark:bg-orange-950/30">
                <FileText className="h-6 w-6 text-orange-600 dark:text-orange-300" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900 dark:text-slate-100">{doc.tipo_documento}</p>
                  <span className="whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">
                    {(doc.tamanho_bytes / 1024).toFixed(2)} KB
                  </span>
                </div>
                <p className="truncate text-sm text-gray-600 dark:text-slate-300">{doc.nome_arquivo}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                  <Calendar className="h-3 w-3" />
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

            <div className="ml-2 flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => handleDownload(doc.id, doc.nome_arquivo)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                title="Baixar"
                aria-label={`Baixar ${doc.nome_arquivo}`}
              >
                <Download className="h-5 w-5" aria-hidden="true" />
              </button>
              <RowActionsMenu
                label={`Mais ações para ${doc.nome_arquivo}`}
                actions={[
                  {
                    label: 'Excluir documento',
                    destructive: true,
                    icon: Trash2,
                    onSelect: () => handleExcluir(doc.id),
                  },
                ]}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
