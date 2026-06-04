import { useState } from 'react';
import { toast } from 'sonner';

import {
  FileText,
  Download,
  Trash2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Plus,
  AlertCircle,
} from 'lucide-react';
import { usePastaVirtual, TipoDocumento } from '@/react-app/hooks/usePastaVirtual';
import { PASTA_VIRTUAL_CATEGORIAS } from '@/react-app/config/pastaVirtual';
import UploadDocumentoModal from './UploadDocumentoModal';

interface PastaVirtualCompletaProps {
  funcionarioId: number;
}

export default function PastaVirtualCompleta({ funcionarioId }: PastaVirtualCompletaProps) {
  const { categorias, loading, deleteDocumento, downloadDocumento, refetch } =
    usePastaVirtual(funcionarioId);
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<Set<TipoDocumento>>(
    new Set(['CERTIFICADO_QUALIFICACAO']),
  );
  const [modalUploadAberto, setModalUploadAberto] = useState(false);
  const [tipoUploadSelecionado, setTipoUploadSelecionado] = useState<TipoDocumento>(
    'CERTIFICADO_QUALIFICACAO',
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );

  const toggleCategoria = (tipo: TipoDocumento) => {
    setCategoriasExpandidas((prev) => {
      const nova = new Set(prev);
      if (nova.has(tipo)) {
        nova.delete(tipo);
      } else {
        nova.add(tipo);
      }
      return nova;
    });
  };

  const handleDownload = downloadDocumento;

  const handleDeleteClick = (id: number, nome: string) => {
    setShowConfirmDelete({ id, nome });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id, nome } = showConfirmDelete;
    setDeletandoId(id);
    setShowConfirmDelete(null);

    try {
      toast.promise(deleteDocumento(id), {
        loading: `Deletando "${nome}"...`,
        success: `"${nome}" deletado com sucesso!`,
        error: (err) => `Erro ao deletar: ${err instanceof Error ? err.message : 'Desconhecido'}`,
      });
    } catch {
      // Erro já é tratado pelo toast.promise
    } finally {
      setDeletandoId(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatarDataUpload = (dataStr: string): string => {
    if (!dataStr) return 'Data não disponível';

    try {
      // Remove qualquer parte de timestamp se houver
      const dataLimpa = dataStr.split('T')[0];

      // Tenta parsear como YYYY-MM-DD
      const partes = dataLimpa.split('-');
      if (partes.length === 3) {
        const [ano, mes, dia] = partes;
        const data = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));

        if (!isNaN(data.getTime())) {
          return data.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          });
        }
      }

      return 'Data inválida';
    } catch (error) {
      console.error('Erro ao formatar data:', error);
      return 'Data inválida';
    }
  };

  const getCorClasse = (cor: string) => {
    const cores = {
      blue: 'bg-primary/20 text-blue-700 border-blue-200',
      red: 'bg-red-100 text-red-700 border-red-200',
      purple: 'bg-purple-100 text-purple-700 border-purple-200',
      green: 'bg-green-100 text-green-700 border-green-200',
      orange: 'bg-orange-100 text-orange-700 border-orange-200',
      cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
      gray: 'bg-gray-100 text-gray-700 border-gray-200',
    };
    return cores[cor as keyof typeof cores] || cores.gray;
  };

  const getCorIcone = (cor: string) => {
    const cores = {
      blue: 'text-primary',
      red: 'text-red-600',
      purple: 'text-purple-600',
      green: 'text-green-600',
      orange: 'text-orange-600',
      cyan: 'text-cyan-600',
      gray: 'text-gray-600',
    };
    return cores[cor as keyof typeof cores] || cores.gray;
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-600">Carregando documentos...</p>
      </div>
    );
  }

  const totalDocumentos = categorias.reduce((acc, cat) => acc + cat.documentos.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Pasta 360</h2>
        <p className="text-gray-600">{totalDocumentos} documento(s) organizados por categoria</p>
      </div>

      {/* Categorias */}
      <div className="space-y-3">
        {categorias
          .sort((a, b) => {
            const ca = PASTA_VIRTUAL_CATEGORIAS.find((c) => c.tipo === a.tipo)?.ordem || 999;
            const cb = PASTA_VIRTUAL_CATEGORIAS.find((c) => c.tipo === b.tipo)?.ordem || 999;
            return ca - cb;
          })
          .map((categoria) => {
            const config = PASTA_VIRTUAL_CATEGORIAS.find((c) => c.tipo === categoria.tipo);
            const Icone = config?.icone || FileText;
            const temDocumentos = categoria.documentos.length > 0;
            const expandido = categoriasExpandidas.has(categoria.tipo);

            return (
              <div
                key={categoria.tipo}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              >
                {/* Header da Categoria */}
                <div className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition">
                  <button
                    onClick={() => toggleCategoria(categoria.tipo)}
                    className="flex items-center gap-3 flex-1"
                  >
                    {expandido ? (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}

                    <div className={`p-2 rounded-lg ${getCorClasse(categoria.cor)}`}>
                      <Icone className={`h-5 w-5 ${getCorIcone(categoria.cor)}`} />
                    </div>

                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">{categoria.titulo}</h3>
                      <p className="text-sm text-gray-500">
                        {categoria.documentos.length} documento(s)
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTipoUploadSelecionado(categoria.tipo);
                      setModalUploadAberto(true);
                    }}
                    className="p-2 text-primary hover:bg-primary/10 rounded transition"
                    title="Adicionar documento"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>

                {/* Lista de Documentos */}
                {expandido && (
                  <div className="border-t border-gray-200">
                    {!temDocumentos ? (
                      <div className="px-6 py-8 text-center">
                        <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">Nenhum documento nesta categoria</p>
                        <p className="text-sm text-gray-400 mt-1">
                          Clique no botão "Upload" para adicionar
                        </p>
                        <button
                          onClick={() => {
                            setTipoUploadSelecionado(categoria.tipo);
                            setModalUploadAberto(true);
                          }}
                          className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Upload Documento
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {categoria.documentos.map((doc) => (
                          <div key={doc.id} className="px-6 py-4 hover:bg-gray-50 transition">
                            <div className="flex items-center justify-between">
                              {/* Info do Documento */}
                              <div className="flex items-center gap-4 flex-1">
                                <FileText className="h-8 w-8 text-red-600 flex-shrink-0" />

                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{doc.nome}</p>
                                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {formatarDataUpload(doc.data_upload)}
                                    </span>
                                    <span>{formatFileSize(doc.tamanho)}</span>
                                    {doc.data_vencimento && (
                                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                        Válido
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Ações */}
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  onClick={() => handleDownload(doc)}
                                  className="p-2 text-green-600 hover:bg-green-50 rounded transition"
                                  title="Download"
                                >
                                  <Download className="h-5 w-5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteClick(doc.id, doc.nome)}
                                  disabled={deletandoId === doc.id}
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
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Modal de Upload */}
      <UploadDocumentoModal
        isOpen={modalUploadAberto}
        onClose={() => setModalUploadAberto(false)}
        onSuccess={() => {
          refetch();
        }}
        funcionarioId={funcionarioId}
        tipoInicial={tipoUploadSelecionado}
      />

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
