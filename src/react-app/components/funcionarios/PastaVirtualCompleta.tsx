import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  History,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  isPastaVirtualDocumentAvailable,
  usePastaVirtual,
  type CategoriaPV,
  type DocumentoPV,
  type TipoDocumento,
} from '@/react-app/hooks/usePastaVirtual';
import {
  PASTA_VIRTUAL_CATEGORIAS,
  PASTA_VIRTUAL_GRUPOS,
  pastaVirtualCategoriaPorTipo,
  isTripulacaoVooFuncionario,
} from '@/react-app/config/pastaVirtual';
import UploadDocumentoModal from './UploadDocumentoModal';

interface PastaVirtualCompletaProps {
  funcionarioId: number;
  funcao?: string | null;
  cargo?: string | null;
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

function normalizarBusca(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function PastaVirtualCompleta({
  funcionarioId,
  funcao,
  cargo,
}: PastaVirtualCompletaProps) {
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
  const [busca, setBusca] = useState('');
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const toggleCategoria = (tipo: TipoDocumento) => {
    setCategoriasExpandidas((prev) => {
      const nova = new Set(prev);
      if (nova.has(tipo)) nova.delete(tipo);
      else nova.add(tipo);
      return nova;
    });
  };

  const abrirUpload = (tipo: TipoDocumento = 'CERTIFICADO_QUALIFICACAO') => {
    setTipoUploadSelecionado(tipo);
    setModalUploadAberto(true);
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

  const tripulacaoVoo = isTripulacaoVooFuncionario(funcao, cargo);
  const categoriasPermitidas = useMemo(
    () =>
      categorias.filter((categoria) => {
        const config = pastaVirtualCategoriaPorTipo[categoria.tipo];
        return !config.somenteTripulacaoVoo || tripulacaoVoo;
      }),
    [categorias, tripulacaoVoo],
  );

  const todosDocumentos = useMemo(
    () => categoriasPermitidas.flatMap((categoria) => categoria.documentos),
    [categoriasPermitidas],
  );
  const documentosDisponiveis = todosDocumentos.filter(isPastaVirtualDocumentAvailable);
  const totalAtuais = documentosDisponiveis.filter(isCurrentVersion).length;
  const totalHistoricos = documentosDisponiveis.length - totalAtuais;
  const totalIndisponiveis = todosDocumentos.length - documentosDisponiveis.length;
  const buscaNormalizada = normalizarBusca(busca);

  const categoriaVisivel = (categoria: CategoriaPV) => {
    const config = pastaVirtualCategoriaPorTipo[categoria.tipo];
    const textoCategoria = normalizarBusca(`${config.titulo} ${config.descricao}`);
    const categoriaCasaBusca = !buscaNormalizada || textoCategoria.includes(buscaNormalizada);
    const documentoCasaBusca = categoria.documentos.some((doc) =>
      normalizarBusca(doc.nome).includes(buscaNormalizada),
    );
    const casaBusca = !buscaNormalizada || categoriaCasaBusca || documentoCasaBusca;
    return casaBusca;
  };

  const renderCategoria = (categoria: CategoriaPV) => {
    const config = pastaVirtualCategoriaPorTipo[categoria.tipo];
    const Icone = config?.icone || FileText;
    const expandido = categoriasExpandidas.has(categoria.tipo);
    const categoriaCasaBusca = normalizarBusca(`${config.titulo} ${config.descricao}`).includes(
      buscaNormalizada,
    );

    const disponiveisTodos = categoria.documentos
      .filter(isPastaVirtualDocumentAvailable)
      .sort((a, b) => {
        const versionOrder = Number(isCurrentVersion(b)) - Number(isCurrentVersion(a));
        if (versionOrder !== 0) return versionOrder;
        return String(b.data_upload).localeCompare(String(a.data_upload));
      });
    const disponiveis = disponiveisTodos.filter((doc) => {
      if (!mostrarHistorico && !isCurrentVersion(doc)) return false;
      if (!buscaNormalizada || categoriaCasaBusca) return true;
      return normalizarBusca(doc.nome).includes(buscaNormalizada);
    });
    const indisponiveis = categoria.documentos.filter((doc) => {
      if (isPastaVirtualDocumentAvailable(doc)) return false;
      if (!buscaNormalizada || categoriaCasaBusca) return true;
      return normalizarBusca(doc.nome).includes(buscaNormalizada);
    });
    const atuais = disponiveisTodos.filter(isCurrentVersion).length;
    const historicos = disponiveisTodos.length - atuais;
    const temRegistrosFiltrados = disponiveis.length > 0 || indisponiveis.length > 0;

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
                {config.titulo}
              </h3>
              <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
                {config.descricao}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {atuais} atual(is)
                {historicos > 0 ? ` · ${historicos} histórico(s)` : ''}
                {indisponiveis.length > 0 ? ` · ${indisponiveis.length} indisponível(is)` : ''}
              </p>
            </div>
          </button>

          <button
            onClick={(event) => {
              event.stopPropagation();
              abrirUpload(categoria.tipo);
            }}
            className="rounded-lg p-2 text-primary transition hover:bg-primary/10"
            title={`Adicionar em ${config.titulo}`}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {expandido && (
          <div className="border-t border-slate-200 dark:border-slate-700">
            {!temRegistrosFiltrados ? (
              <div className="px-6 py-7 text-center">
                <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {buscaNormalizada
                    ? 'Nenhum documento corresponde à busca nesta categoria.'
                    : 'Nenhum documento nesta categoria.'}
                </p>
                {!buscaNormalizada && (
                  <button
                    onClick={() => abrirUpload(categoria.tipo)}
                    className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm text-white transition hover:bg-primary/90"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Adicionar documento
                  </button>
                )}
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
                                  <p className="min-w-0 break-all font-medium text-slate-900 dark:text-white">
                                    {doc.nome}
                                  </p>
                                  <span
                                    className={
                                      atual
                                        ? 'rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                        : 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                    }
                                  >
                                    {atual ? 'Versão atual' : 'Histórico'}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />{' '}
                                    {formatUploadDate(doc.data_upload)}
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
                          Registros sem arquivo válido ou com tamanho zero são separados da lista
                          documental canônica.
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
                            <p className="break-all font-medium text-slate-800 dark:text-slate-100">
                              {doc.nome}
                            </p>
                            <p className="text-xs text-amber-800 dark:text-amber-300">
                              {doc.tamanho <= 0
                                ? 'Arquivo com 0 KB'
                                : 'Arquivo de armazenamento indisponível'}{' '}
                              · {formatUploadDate(doc.data_upload)}
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
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-slate-600 dark:text-slate-300">Carregando documentos...</p>
      </div>
    );
  }

  const gruposVisiveis = [...PASTA_VIRTUAL_GRUPOS]
    .sort((a, b) => a.ordem - b.ordem)
    .map((grupo) => ({
      ...grupo,
      categorias: categoriasPermitidas
        .filter((categoria) => pastaVirtualCategoriaPorTipo[categoria.tipo]?.grupo === grupo.id)
        .filter(categoriaVisivel)
        .sort(
          (a, b) =>
            pastaVirtualCategoriaPorTipo[a.tipo].ordem - pastaVirtualCategoriaPorTipo[b.tipo].ordem,
        ),
    }))
    .filter((grupo) => grupo.categorias.length > 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Pasta Virtual</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {totalAtuais} documento(s) atual(is)
              {totalHistoricos > 0 ? ` · ${totalHistoricos} histórico(s)` : ''}
              {totalIndisponiveis > 0 ? ` · ${totalIndisponiveis} indisponível(is)` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Documentos organizados por finalidade. Versões anteriores permanecem preservadas no
              histórico.
            </p>
          </div>
          <button
            onClick={() => abrirUpload()}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            <Plus className="mr-2 h-4 w-4" /> Adicionar documento
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          Não foi possível carregar a Pasta Virtual: {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por documento ou categoria..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <button
            onClick={() => setMostrarHistorico((value) => !value)}
            className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition ${mostrarHistorico ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            <History className="mr-2 h-4 w-4" />{' '}
            {mostrarHistorico
              ? 'Ocultar histórico'
              : `Mostrar histórico${totalHistoricos ? ` (${totalHistoricos})` : ''}`}
          </button>
        </div>
      </div>

      {gruposVisiveis.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
          <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-700 dark:text-slate-200">
            Nenhum documento encontrado
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Ajuste a busca ou adicione um documento à Pasta Virtual.
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {gruposVisiveis.map((grupo) => (
            <section key={grupo.id} className="space-y-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  {grupo.titulo}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {grupo.descricao}
                </p>
              </div>
              <div className="space-y-3">{grupo.categorias.map(renderCategoria)}</div>
            </section>
          ))}
        </div>
      )}

      <UploadDocumentoModal
        isOpen={modalUploadAberto}
        onClose={() => setModalUploadAberto(false)}
        onSuccess={() => refetch()}
        funcionarioId={funcionarioId}
        tipoInicial={tipoUploadSelecionado}
        tiposPermitidos={categoriasPermitidas.map((categoria) => categoria.tipo)}
      />

      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg dark:bg-slate-900">
            <div className="mb-4 flex items-center gap-3">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Confirmar exclusão
              </h3>
            </div>
            <p className="mb-6 text-slate-600 dark:text-slate-300">
              Tem certeza que deseja excluir{' '}
              <span className="font-medium text-slate-900 dark:text-white">
                "{showConfirmDelete.nome}"
              </span>
              ?
              <span className="mt-2 block text-sm text-slate-500">
                Esta ação não poderá ser desfeita.
              </span>
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
