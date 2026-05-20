import React from 'react';
import { toast } from 'sonner';

import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { Upload, File, Trash2, Download, FolderOpen, Search } from 'lucide-react';
import { LoadingSpinner } from '@/react-app/components/common/LoadingSpinner';
import ConfirmDeleteModal from '@/react-app/components/modals/ConfirmDeleteModal';
import { showAlertDialog } from '@/react-app/utils/confirmDialog';

interface Arquivo {
  id: number;
  nome: string;
  tamanho: number;
  tipo: string;
  url: string;
  created_at: string;
}

export default function PastaVirtualGeral() {
  const [arquivos, setArquivos] = React.useState<Arquivo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [filtro, setFiltro] = React.useState('');
  const [showConfirmDelete, setShowConfirmDelete] = React.useState<{
    id: number;
    nome: string;
  } | null>(null);
  const [deletandoId, setDeletandoId] = React.useState<number | null>(null);

  React.useEffect(() => {
    carregarArquivos();
  }, []);

  const carregarArquivos = async () => {
    try {
      setLoading(true);
      // Cache busting
      const response = await fetch(`${API_BASE_URL}/pasta-virtual?t=${new Date().getTime()}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      const data = await response.json();
      if (data.success) {
        setArquivos(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar arquivos:', error);
      toast.error('Erro ao carregar arquivos');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE_URL}/pasta-virtual/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Erro ao enviar ${file.name}`);
        }
      }

      carregarArquivos();
    } catch (error) {
      showAlertDialog('Erro: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = (arquivo: Arquivo) => {
    setShowConfirmDelete({ id: arquivo.id, nome: arquivo.nome });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id, nome } = showConfirmDelete;
    setDeletandoId(id);

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/pasta-virtual/delete/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Optimistic update
          setArquivos((prev) => prev.filter((a) => a.id !== id));

          toast.success(`"${nome}" excluído com sucesso!`);
          setShowConfirmDelete(null);

          // Aguardar e recarregar
          await new Promise((resolve) => setTimeout(resolve, 500));
          await carregarArquivos();
        } else {
          await carregarArquivos();
          toast.error(data.error || 'Erro ao excluir arquivo');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao deletar');
      }
    } catch (error) {
      console.error('Erro ao deletar:', error);
      toast.error('Falha ao excluir arquivo');
    } finally {
      setDeletandoId(null);
    }
  };

  const handleDownload = (arquivo: Arquivo) => {
    window.open(arquivo.url, '_blank');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const arquivosFiltrados = arquivos.filter(
    (arq) => !filtro || arq.nome.toLowerCase().includes(filtro.toLowerCase()),
  );

  if (loading) {
    return <LoadingSpinner message="Carregando arquivos..." />;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderOpen size={28} />
            Pasta Virtual
          </h1>
          <p className="text-gray-600">Armazene e gerencie documentos do sistema</p>
        </div>

        <label className="flex items-center gap-2  py-3 bg-primary text-white rounded-lg cursor-pointer hover:bg-primary/90">
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Enviando...
            </>
          ) : (
            <>
              <Upload size={20} />
              Upload Arquivo(s)
            </>
          )}
          <input
            type="file"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      <div className="bg-white rounded-lg shadow mb-6 p-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Buscar arquivos..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {arquivosFiltrados.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FolderOpen size={64} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg mb-4">
            {filtro ? 'Nenhum arquivo encontrado' : 'Pasta vazia'}
          </p>
          {!filtro && (
            <label className="inline-flex items-center gap-2  py-3 bg-primary text-white rounded-lg cursor-pointer hover:bg-primary/90">
              <Upload size={20} />
              Enviar Primeiro Arquivo
              <input type="file" multiple onChange={handleUpload} className="hidden" />
            </label>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {arquivosFiltrados.map((arquivo) => (
            <div
              key={arquivo.id}
              className="bg-white rounded-lg shadow p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-center mb-3">
                <File size={64} className="text-primary" />
              </div>
              <h3 className="font-bold text-center mb-2 truncate" title={arquivo.nome}>
                {arquivo.nome}
              </h3>
              <p className="text-sm text-gray-500 text-center mb-4">
                {formatBytes(arquivo.tamanho)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(arquivo)}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
                >
                  <Download size={16} />
                  Baixar
                </button>
                <button
                  onClick={() => handleDelete(arquivo)}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                {new Date(arquivo.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-sm text-gray-600">Total: {arquivosFiltrados.length} arquivo(s)</div>

      {/* Modal de Confirmação de Delete */}
      <ConfirmDeleteModal
        isOpen={!!showConfirmDelete}
        onClose={() => setShowConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        message="Tem certeza que deseja deletar este arquivo?"
        itemName={showConfirmDelete?.nome || ''}
        loading={deletandoId !== null}
      />
    </div>
  );
}
