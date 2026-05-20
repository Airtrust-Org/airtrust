import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { FileText, Trash2, Calendar, File } from 'lucide-react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';

interface Certificado {
  id: number;
  arquivo_nome: string;
  arquivo_url: string;
  arquivo_tamanho: number;
  arquivo_tamanho_comprimido?: number;
  compressao_percentual?: number;
  qualificacao_codigo: string;
  qualificacao_nome: string;
  qualificacao_tipo: string;
  data_documento: string;
  uploaded_at: string;
}

interface CertificadoListaProps {
  funcionarioId: number;
  onDelete?: (id: number) => void;
  refreshTrigger?: number;
}

export default function CertificadoLista({
  funcionarioId,
  onDelete,
  refreshTrigger,
}: CertificadoListaProps) {
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarCertificados();
  }, [funcionarioId, refreshTrigger]);

  const carregarCertificados = async () => {
    try {
      const res = await apiFetch(`/api/certificados/funcionario/${funcionarioId}`);
      const data = await res.json();
      if (data.success) {
        setCertificados(data.data);
      }
    } catch (error) {
      console.error('Erro ao carregar certificados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id: number, filename: string) => {
    try {
      await previewPdfBeforeDownload({
        fileName: filename,
        title: 'Certificado',
        fetcher: () => apiFetch(`/api/pasta-virtual/stream/${id}`),
      });
    } catch (error) {
      console.error('Erro ao baixar certificado:', error);
      toast.warning('Erro ao baixar certificado');
    }
  };

  const handleDelete = async (id: number) => {
    if (!await confirmDialog('Tem certeza que deseja excluir este certificado?')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/certificados/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setCertificados((prev) => prev.filter((c) => c.id !== id));
        if (onDelete) onDelete(id);
      } else {
        toast.warning('Erro ao excluir certificado');
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.warning('Erro ao excluir certificado');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getTipoBadge = (tipo: string) => {
    const badges = {
      TREINAMENTO: 'bg-primary/20 text-blue-700',
      EXAME: 'bg-purple-100 text-purple-700',
      CHECK: 'bg-emerald-100 text-emerald-700',
    };
    return badges[tipo as keyof typeof badges] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="mt-2 text-gray-600">Carregando certificados...</p>
      </div>
    );
  }

  if (certificados.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600">Nenhum certificado cadastrado</p>
        <p className="text-sm text-gray-500 mt-1">Faça o upload do primeiro certificado acima</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
        <File className="h-5 w-5" />
        Certificados ({certificados.length})
      </h3>

      {certificados.map((cert) => (
        <div
          key={cert.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
        >
          <div className="flex items-start justify-between">
            {/* Info */}
            <div className="flex items-start gap-3 flex-1">
              <FileText className="h-10 w-10 text-red-600 flex-shrink-0 mt-1" />

              <div className="flex-1 min-w-0">
                {/* Nome do arquivo */}
                <p className="font-medium text-gray-900 truncate">{cert.arquivo_nome}</p>

                {/* Qualificação */}
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${getTipoBadge(
                      cert.qualificacao_tipo,
                    )}`}
                  >
                    {cert.qualificacao_tipo}
                  </span>
                  <span className="text-sm text-gray-600">
                    {cert.qualificacao_codigo} - {cert.qualificacao_nome}
                  </span>
                </div>

                {/* Metadados */}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(cert.data_documento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  <span>
                    {formatFileSize(cert.arquivo_tamanho_comprimido || cert.arquivo_tamanho)}
                    {cert.compressao_percentual && cert.compressao_percentual > 0 && (
                      <span className="ml-2 text-green-600 font-medium">
                        📦 -{cert.compressao_percentual.toFixed(0)}%
                      </span>
                    )}
                  </span>
                  <span>Upload: {new Date(cert.uploaded_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2 ml-4">
              {/* Download do certificado */}
              <button
                onClick={() => handleDownload(cert.id, cert.arquivo_nome)}
                className="p-2 text-primary hover:bg-primary/10 rounded transition"
                title="Download do certificado"
              >
                <File className="h-5 w-5" />
              </button>

              <button
                onClick={() => handleDelete(cert.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                title="Excluir"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
