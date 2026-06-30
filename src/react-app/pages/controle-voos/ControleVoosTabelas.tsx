import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Building2,
  Calendar,
  Eye,
  FolderTree,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  Tag,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { fetchWithAuth } from '@/react-app/config/api';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';

type CatalogItem = Record<string, unknown> & { id: number };
type CatalogName = 'aeroportos' | 'tipos' | 'naturezas' | 'motivos';

type CatalogResponse = {
  success: boolean;
  data?: CatalogItem[];
  error?: string;
};

type TableLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'success';
      data: {
        aeroportos: CatalogItem[];
        tipos: CatalogItem[];
        naturezas: CatalogItem[];
        motivos: CatalogItem[];
      };
    };

const ICON_MAP: Record<string, React.ReactNode> = {
  aeroportos: <MapPin className="h-5 w-5 text-blue-500" />,
  tipos: <Tag className="h-5 w-5 text-emerald-500" />,
  naturezas: <Layers className="h-5 w-5 text-purple-500" />,
  motivos: <Ban className="h-5 w-5 text-orange-500" />,
};

const PREVIEW_TABLES = [
  {
    id: 'causas-indisponibilidade',
    nome: 'Causas de indisponibilidade',
    descricao: 'Ainda depende de contrato próprio e schema operacional dedicado.',
    icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
  },
  {
    id: 'grupos-indisponibilidade',
    nome: 'Grupos de indisponibilidade',
    descricao: 'Ainda depende de contrato próprio e schema operacional dedicado.',
    icon: <FolderTree className="h-5 w-5 text-amber-500" />,
  },
  {
    id: 'hangaragem',
    nome: 'Hangaragem',
    descricao: 'Ainda não existe tabela operacional real para exibição consistente.',
    icon: <Building2 className="h-5 w-5 text-slate-500" />,
  },
];

async function loadCatalog(name: CatalogName, signal?: AbortSignal) {
  const response = await fetchWithAuth(`/api/controle-voos/catalogos/${name}`, { signal });
  const payload = (await response.json()) as CatalogResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || `Erro HTTP ${response.status}`);
  }

  return payload.data;
}

export default function ControleVoosTabelas() {
  const [state, setState] = useState<TableLoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      loadCatalog('aeroportos', controller.signal),
      loadCatalog('tipos', controller.signal),
      loadCatalog('naturezas', controller.signal),
      loadCatalog('motivos', controller.signal),
    ])
      .then(([aeroportos, tipos, naturezas, motivos]) =>
        setState({
          status: 'success',
          data: { aeroportos, tipos, naturezas, motivos },
        }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao carregar tabelas operacionais.',
        });
      });

    return () => controller.abort();
  }, []);

  const retry = () => {
    setState({ status: 'loading' });
    void Promise.all([loadCatalog('aeroportos'), loadCatalog('tipos'), loadCatalog('naturezas'), loadCatalog('motivos')])
      .then(([aeroportos, tipos, naturezas, motivos]) =>
        setState({
          status: 'success',
          data: { aeroportos, tipos, naturezas, motivos },
        }),
      )
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao carregar tabelas operacionais.',
        }),
      );
  };

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Tabelas Operacionais"
            description="Catálogos reais já disponíveis no backend, com indicação clara do que ainda depende de contrato ou schema."
          >
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </ControleVoosPageHeader>

          {state.status === 'loading' && (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Carregando catálogos operacionais…</p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Erro ao carregar tabelas operacionais.</p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{state.message}</p>
            </div>
          )}

          {state.status === 'success' && (
            <>
              <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { id: 'aeroportos', nome: 'Aeroportos / Plataformas', descricao: 'Catálogo real do tenant.', total: state.data.aeroportos.length },
                  { id: 'tipos', nome: 'Tipos de voo', descricao: 'Catálogo real do tenant.', total: state.data.tipos.length },
                  { id: 'naturezas', nome: 'Naturezas de voo', descricao: 'Catálogo real do tenant.', total: state.data.naturezas.length },
                  { id: 'motivos', nome: 'Motivos operacionais', descricao: 'Catálogo real do tenant.', total: state.data.motivos.length },
                  ...PREVIEW_TABLES.map((item) => ({
                    id: item.id,
                    nome: item.nome,
                    descricao: item.descricao,
                    total: null,
                    preview: true,
                  })),
                ].map((tab) => (
                  <div
                    key={tab.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                        {'preview' in tab && tab.preview ? PREVIEW_TABLES.find((item) => item.id === tab.id)?.icon : ICON_MAP[tab.id]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{tab.nome}</h3>
                          {'preview' in tab && tab.preview && (
                            <span className="inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                              Preview
                            </span>
                          )}
                        </div>
                        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{tab.descricao}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400 dark:text-slate-500">
                            {typeof tab.total === 'number' ? `${tab.total} registros` : 'Sem schema real'}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <Eye className="h-3 w-3" />
                            {'preview' in tab && tab.preview ? 'Aguardando backend' : 'Conectado'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <section className="mb-8">
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                  <MapPin className="h-4 w-4 text-blue-500" />
                  Aeroportos / Plataformas
                </h2>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  {state.data.aeroportos.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      Nenhum aeroporto ativo cadastrado para este tenant.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">ICAO</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">IATA</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Cidade</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">UF</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {state.data.aeroportos.map((apt) => (
                            <tr key={String(apt.id)} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                                {String(apt.codigo_icao || apt.codigo || '—')}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">
                                {String(apt.codigo_iata || '—')}
                              </td>
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{String(apt.nome || '—')}</td>
                              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{String(apt.cidade || '—')}</td>
                              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{String(apt.uf || '—')}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{String(apt.tipo || '—')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              <div className="mb-8 grid gap-6 sm:grid-cols-2">
                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                    <Tag className="h-4 w-4 text-emerald-500" />
                    Tipos de voo
                  </h2>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    {state.data.tipos.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        Nenhum tipo de voo ativo cadastrado.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Descrição</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {state.data.tipos.map((item) => (
                            <tr key={String(item.id)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{String(item.nome || '—')}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{String(item.descricao || '—')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>

                <section>
                  <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                    <Layers className="h-4 w-4 text-purple-500" />
                    Naturezas de voo
                  </h2>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    {state.data.naturezas.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        Nenhuma natureza de voo ativa cadastrada.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Descrição</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {state.data.naturezas.map((item) => (
                            <tr key={String(item.id)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{String(item.nome || '—')}</td>
                              <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{String(item.descricao || '—')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
              </div>

              <section>
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                  <Calendar className="h-4 w-4 text-orange-500" />
                  Motivos operacionais
                </h2>
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  {state.data.motivos.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      Nenhum motivo operacional ativo cadastrado.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Nome</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Tipo</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Descrição</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {state.data.motivos.map((item) => (
                          <tr key={String(item.id)} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{String(item.nome || '—')}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{String(item.tipo || '—')}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{String(item.descricao || '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </>
          )}
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
