import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { FileText, Download, Eye, Trash2, Calendar, AlertCircle } from 'lucide-react';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';

interface Certificado {
  id: number;
  uuid: string;
  nome_arquivo: string;
  arquivo_tamanho: number;
  tamanho?: number;
  tipo: string;
  categoria: string;
  data_documento: string;
  data_upload: string;
  uploaded_at: string;
}

interface AbaCertificadosProps {
  funcionarioId: number;
}

export default function AbaCertificados({ funcionarioId }: AbaCertificadosProps) {
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  useEffect(() => {
    const carregarCertificados = async () => {
      try {
        const token = getAccessToken();
        const res = await fetch(`${API_BASE_URL}/certificados/funcionario/${funcionarioId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (data.success) {
          setCertificados(data.data || []);
        }
      } catch (error) {
        console.error('Erro ao carregar certificados:', error);
        setCertificados([]);
      } finally {
        setLoading(false);
      }
    };

    carregarCertificados();
  }, [funcionarioId]);

  const handleDownload = async (id: number, filename: string) => {
    try {
      const token = getAccessToken();
      await previewPdfBeforeDownload({
        fileName: filename,
        title: 'Certificado',
        fetcher: () =>
          fetch(`${API_BASE_URL}/pasta-virtual/stream/${id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }),
      });
      toast.success('Visualizacao aberta');
    } catch (error) {
      console.error('Erro ao baixar certificado:', error);
      toast.error('Erro ao baixar certificado');
    }
  };

  const handlePreview = async (id: number, filename: string) => {
    await handleDownload(id, filename);
  };

  const handleDelete = async (id: number) => {
    const cert = certificados.find((c) => c.id === id);
    if (!cert) return;

    console.log('[AbaCertificados] handleDelete - abrindo confirmação para:', cert.nome_arquivo);
    setShowConfirmDelete({ id, nome: cert.nome_arquivo });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id, nome } = showConfirmDelete;
    console.log('[AbaCertificados] handleConfirmDelete - cert ID:', id);
    const toastId = toast.loading(`Deletando "${nome}"...`);

    setDeletandoId(id);
    setShowConfirmDelete(null);

    try {
      const token = getAccessToken();

      const res = await fetch(`${API_BASE_URL}/pasta-virtual/delete/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();

      if (data.success) {
        console.log('[AbaCertificados] Delete bem-sucedido, removendo da lista...');
        setCertificados((prev) => prev.filter((c) => c.id !== id));
        toast.success(`"${nome}" deletado com sucesso!`, { id: toastId });
      } else {
        console.error('[AbaCertificados] Delete retornou success=false:', data);
        toast.error(data.error || 'Erro ao excluir certificado', { id: toastId });
      }
    } catch (error) {
      console.error('[AbaCertificados] Erro ao excluir:', error);
      const msg = error instanceof Error ? error.message : 'Erro ao excluir certificado';
      toast.error(msg, { id: toastId });
    } finally {
      setDeletandoId(null);
    }
  };

  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('pt-BR');
    } catch {
      return '-';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-600">Carregando certificados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Certificados</h2>
          <p className="text-gray-600 mt-1">{certificados.length} certificado(s) cadastrado(s)</p>
        </div>
      </div>

      {/* Lista de Certificados */}
      {certificados.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum certificado cadastrado</h3>
          <p className="text-gray-600 mb-4">Este funcionário ainda não possui certificados.</p>
          <p className="text-sm text-gray-500">
            Para adicionar certificados, acesse a página de <strong>Qualificações</strong>
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Header do Grupo */}
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded text-sm font-medium bg-primary/20 text-blue-700">
                Certificados
              </span>
              <span className="text-sm text-gray-500">({certificados.length} arquivos)</span>
            </div>
          </div>

          {/* Lista de Certificados */}
          <div className="divide-y divide-gray-200">
            {certificados.map((cert) => (
              <div key={cert.id} className="px-6 py-4 hover:bg-gray-50 transition">
                <div className="flex items-center justify-between">
                  {/* Info do Certificado */}
                  <div className="flex items-center gap-4 flex-1">
                    <FileText className="h-10 w-10 text-red-600 flex-shrink-0" />

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {cert.nome_arquivo || 'Documento sem nome'}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(cert.data_documento || cert.uploaded_at || cert.data_upload)}
                        </span>
                        <span>{formatFileSize(cert.arquivo_tamanho || cert.tamanho)}</span>
                        <span>Upload: {formatDate(cert.uploaded_at || cert.data_upload)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() =>
                        handlePreview(cert.id, cert.nome_arquivo || 'certificado.pdf')
                      }
                      className="p-2 text-primary hover:bg-primary/10 rounded transition"
                      title="Visualizar"
                    >
                      <Eye className="h-5 w-5" />
                    </button>

                    <button
                      onClick={() =>
                        handleDownload(cert.id, cert.nome_arquivo || 'certificado.pdf')
                      }
                      className="p-2 text-green-600 hover:bg-green-50 rounded transition"
                      title="Download"
                    >
                      <Download className="h-5 w-5" />
                    </button>

                    <button
                      onClick={() => handleDelete(cert.id)}
                      disabled={deletandoId === cert.id}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Excluir"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Delete */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Confirmar exclusão</h3>
            </div>

            <p className="text-gray-600 mb-6">
              Tem certeza que deseja excluir{' '}
              <span className="font-medium text-gray-900">"{showConfirmDelete.nome}"</span>?
              <br />
              <span className="text-sm mt-2 block text-gray-500">
                Esta ação não poderá ser desfeita.
              </span>
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmDelete(null)}
                disabled={deletandoId !== null}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletandoId !== null}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletandoId !== null && (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
