import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  isPastaVirtualDocumentAvailable,
  usePastaVirtual,
  type DocumentoPV,
  type TipoDocumento,
} from '@/react-app/hooks/usePastaVirtual';
import { PASTA_VIRTUAL_CATEGORIAS } from '@/react-app/config/pastaVirtual';
import UploadDocumentoModal from './UploadDocumentoModal';

interface PastaVirtualCompletaProps {
  funcionarioId: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadDate(dataStr: string): string {
  if (!dataStr) return 'Data não disponível';
  try {
    const [ano, mes, dia] = dataStr.split('T')[0].split('-');
    if (!ano || !mes || !dia) return 'Data inválida';
    const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
    return Number.isNaN(data.getTime()) ? 'Data inválida' : data.toLocaleDateString('pt-BR');
  } catch {
    return 'Data inválida';
  }
}

function isCurrentVersion(doc: DocumentoPV) {
  return doc.versaoAtual !== false && doc.status !== 'Substituído';
}

export default function PastaVirtualCompleta({ funcionarioId }: PastaVirtualCompletaProps) {
  const { categorias, loading, error, deleteDocumento, downloadDocumento, refetch } =
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
      if (nova.has(tipo)) nova.delete(tipo);
      else nova.add(tipo);
      return nova;
    });
  };

  const handleDownload = async (doc: DocumentoPV) => {
    try {
      await downloadDocumento(doc);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Arquivo indisponível');
    }
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;
    const { id, nome } = showConfirmDelete;
    setDeletandoId(id);
    setShowConfirmDelete(null);
    try {
      await toast.promise(deleteDocumento(id), {
        loading: `Deletando "${nome}"...`,
        success: `"${nome}" deletado com sucesso!`,
        error: (err) => `Erro ao deletar: ${err instanceof Error ? err.message : 'Desconhecido'}`,
      });
    } finally {
      setDeletandoId(null);
    }
  };

  const getCorClasse = (cor: string) => {
    const cores = {
      blue: 'bg-primary/10 text-primary border-primary/20',
      red: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900',
      purple:
        'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-900',
      green:
        'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-900',
      orange:
        'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-900',
      cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-900',
      gray: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    };
    return cores[cor as keyof typeof cores] || cores.gray;
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-slate-600 dark:text-slate-300">Carregando documentos...</p>
      </div>
    );
  }

  const todosDocumentos = categorias.flatMap((categoria) => categoria.documentos);
  const totalDisponiveis = todosDocumentos.filter(isPastaVirtualDocumentAvailable).length;
  const totalIndisponiveis = todosDocumentos.length - totalDisponiveis;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Pasta 360</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {totalDisponiveis} documento(s) disponível(is)
          {totalIndisponiveis > 0 ? ` · ${totalIndisponiveis} artefato(s) indisponível(is)` : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          Não foi possível carregar a Pasta 360: {error}
        </div>
      )}

      <div className="space-y-3">
        {[...categorias]
          .sort((a, b) => {
            const ca = PASTA_VIRTUAL_CATEGORIAS.find((c) => c.tipo === a.tipo)?.ordem || 999;
            const cb = PASTA_VIRTUAL_CATEGORIAS.find((c) => c.tipo === b.tipo)?.ordem || 999;
            return ca - cb;
          })
          .map((categoria) => {
            const config = PASTA_VIRTUAL_CATEGORIAS.find((c) => c.tipo === categoria.tipo);
            const Icone = config?.icone || FileText;
            const expandido = categoriasExpandidas.has(categoria.tipo);
            const disponiveis = categoria.documentos
              .filter(isPastaVirtualDocumentAvailable)
              .sort((a, b) => {
                const versionOrder = Number(isCurrentVersion(b)) - Number(isCurrentVersion(a));
                if (versionOrder !== 0) return versionOrder;
                return String(b.data_upload).localeCompare(String(a.data_upload));
              });
            const indisponiveis = categoria.documentos.filter(
              (doc) => !isPastaVirtualDocumentAvailable(doc),
            );
            const temRegistros = disponiveis.length > 0 || indisponiveis.length > 0;

            return (
              <div
                key={categoria.tipo}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:px-6 sm:py-4">
                  <button
                    onClick={() => toggleCategoria(categoria.tipo)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {expandido ? (
                      <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    )}
                    <div className={`rounded-lg border p-2 ${getCorClasse(categoria.cor)}`}>
                      <Icone className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900 dark:text-white">
                        {categoria.titulo}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {disponiveis.length} disponível(is)
                        {indisponiveis.length > 0 ? ` · ${indisponiveis.length} indisponível(is)` : ''}
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setTipoUploadSelecionado(categoria.tipo);
                      setModalUploadAberto(true);
                    }}
                    className="rounded p-2 text-primary transition hover:bg-primary/10"
                    title="Adicionar documento"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>

                {expandido && (
                  <div className="border-t border-slate-200 dark:border-slate-700">
                    {!temRegistros ? (
                      <div className="px-6 py-8 text-center">
                        <FileText className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-700" />
                        <p className="text-slate-500 dark:text-slate-400">Nenhum documento nesta categoria</p>
                        <button
                          onClick={() => {
                            setTipoUploadSelecionado(categoria.tipo);
                            setModalUploadAberto(true);
                          }}
                          className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm text-white transition hover:bg-primary/90"
                        >
                          <Plus className="mr-2 h-4 w-4" /> Upload Documento
                        </button>
                      </div>
                    ) : (
                      <>
                        {disponiveis.length > 0 && (
                          <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {disponiveis.map((doc) => {
                              const atual = isCurrentVersion(doc);
                              return (
                                <div key={`${categoria.tipo}-${doc.id}`} className="px-4 py-4 sm:px-6">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex min-w-0 flex-1 items-start gap-3">
                                      <FileText className="mt-0.5 h-7 w-7 shrink-0 text-red-600" />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="min-w-0 truncate font-medium text-slate-900 dark:text-white">
                                            {doc.nome}
                                          </p>
                                          <span
                                            className={
                                              atual
                                                ? 'rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                                : 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                            }
                                          >
                                            {atual ? 'Versão atual' : 'Substituído'}
                                          </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                                          <span className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" /> {formatUploadDate(doc.data_upload)}
                                          </span>
                                          <span>{formatFileSize(doc.tamanho)}</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 self-end sm:self-auto">
                                      <button
                                        onClick={() => handleDownload(doc)}
                                        className="rounded p-2 text-green-600 transition hover:bg-green-50 dark:hover:bg-green-950/30"
                                        title="Visualizar documento"
                                      >
                                        <Download className="h-5 w-5" />
                                      </button>
                                      <button
                                        onClick={() => setShowConfirmDelete({ id: doc.id, nome: doc.nome })}
                                        disabled={deletandoId === doc.id}
                                        className="rounded p-2 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/30"
                                        title="Excluir"
                                      >
                                        <Trash2 className="h-5 w-5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {indisponiveis.length > 0 && (
                          <div className="border-t border-amber-200 bg-amber-50/70 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/20 sm:px-6">
                            <div className="mb-3 flex items-start gap-2 text-amber-900 dark:text-amber-200">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              <div>
                                <p className="text-sm font-semibold">Artefatos indisponíveis</p>
                                <p className="text-xs">
                                  Registros sem arquivo válido ou com tamanho zero são separados da lista documental canônica.
                                </p>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {indisponiveis.map((doc) => (
                                <div
                                  key={`invalid-${categoria.tipo}-${doc.id}`}
                                  className="flex flex-col gap-2 rounded-md border border-amber-200 bg-white/70 px-3 py-2 text-sm dark:border-amber-900 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-800 dark:text-slate-100">{doc.nome}</p>
                                    <p className="text-xs text-amber-800 dark:text-amber-300">
                                      {doc.tamanho <= 0 ? 'Arquivo com 0 KB' : 'Arquivo de armazenamento indisponível'}
                                      {' · '}{formatUploadDate(doc.data_upload)}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => setShowConfirmDelete({ id: doc.id, nome: doc.nome })}
                                    disabled={deletandoId === doc.id}
                                    className="self-end rounded p-2 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/30 sm:self-auto"
                                    title="Excluir registro indisponível"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <UploadDocumentoModal
        isOpen={modalUploadAberto}
        onClose={() => setModalUploadAberto(false)}
        onSuccess={() => refetch()}
        funcionarioId={funcionarioId}
        tipoInicial={tipoUploadSelecionado}
      />

      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Confirmar exclusão</h3>
            </div>
            <p className="mb-6 text-slate-600 dark:text-slate-300">
              Tem certeza que deseja excluir{' '}
              <span className="font-medium text-slate-900 dark:text-white">"{showConfirmDelete.nome}"</span>?
              <span className="mt-2 block text-sm text-slate-500">Esta ação não poderá ser desfeita.</span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmDelete(null)}
                disabled={deletandoId !== null}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletandoId !== null}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deletandoId !== null && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
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
