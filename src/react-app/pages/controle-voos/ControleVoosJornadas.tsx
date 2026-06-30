import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Loader2, RefreshCw, Users } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { fetchWithAuth } from '@/react-app/config/api';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosDateControls from './components/ControleVoosDateControls';
import { useControleVoosDate } from './hooks/useControleVoosDate';
import { formatDate } from './data/controleVoosUtils';

type JornadaItem = {
  jornada_id: string;
  voo_id: number;
  etapa_id: number | null;
  external_id_sigvoos: number | null;
  sigvoos_leg_number: number | null;
  data_operacional: string;
  tripulante_id: number;
  nome: string | null;
  funcao: string;
  funcao_origem: string | null;
  aeronave: string | null;
  origem_icao: string | null;
  destino_icao: string | null;
  engine_start: string | null;
  takeoff_time: string | null;
  landing_time: string | null;
  engine_shutoff: string | null;
  tempo_total: string | null;
  tempo_navegacao: string | null;
  tempo_ifr: string | null;
  tempo_noturno: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  starts: number | null;
  pax: number | null;
  fuel_start: number | null;
  fuel_end: number | null;
  origem_dados: 'importado' | 'manual_interno' | 'editado_airtrust';
  qualidade_dado: 'completo' | 'incompleto' | 'pendente_mapeamento' | 'divergente';
  estado_conflito: 'pendente_mapeamento' | 'divergente' | 'incompleto' | 'erro' | null;
  evidencia: string | null;
  last_sync_at: string | null;
};

type JornadasResponse = {
  success: boolean;
  data?: {
    periodo: { data_inicio: string; data_fim: string };
    total: number;
    items: JornadaItem[];
  };
  error?: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; items: JornadaItem[]; total: number };

const ORIGEM_LABELS: Record<JornadaItem['origem_dados'], string> = {
  importado: 'SIGVOOS',
  manual_interno: 'Manual',
  editado_airtrust: 'Editado',
};

const QUALIDADE_LABELS: Record<JornadaItem['qualidade_dado'], string> = {
  completo: 'Completo',
  incompleto: 'Incompleto',
  pendente_mapeamento: 'Pendente mapeamento',
  divergente: 'Divergente',
};

function badgeClass(kind: 'origem' | 'qualidade', value: string): string {
  if (kind === 'origem') {
    if (value === 'importado') return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-200 dark:border-teal-900/40';
    if (value === 'editado_airtrust') return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-200 dark:border-blue-900/40';
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
  }

  if (value === 'completo') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40';
  if (value === 'pendente_mapeamento') return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40';
  if (value === 'divergente') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/40';
  return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700';
}

async function loadJornadas(data: string, signal?: AbortSignal): Promise<{ items: JornadaItem[]; total: number }> {
  const params = new URLSearchParams({ data });
  const response = await fetchWithAuth(`/api/controle-voos/jornadas?${params.toString()}`, { signal });
  const payload = (await response.json()) as JornadasResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || `Erro HTTP ${response.status}`);
  }

  return { items: payload.data.items, total: payload.data.total };
}

function formatTimeWindow(item: JornadaItem): string {
  const parts = [item.engine_start, item.takeoff_time, item.landing_time, item.engine_shutoff].filter(Boolean);
  return parts.length > 0 ? parts.join(' → ') : '—';
}

export default function ControleVoosJornadas() {
  const { selectedDate, setSelectedDate, setToday } = useControleVoosDate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void loadJornadas(selectedDate, controller.signal)
      .then(({ items, total }) => setState({ status: 'success', items, total }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao carregar jornadas do Controle de Voos.',
        });
      });

    return () => controller.abort();
  }, [selectedDate]);

  const reload = () => {
    setState({ status: 'loading' });
    void loadJornadas(selectedDate)
      .then(({ items, total }) => setState({ status: 'success', items, total }))
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao carregar jornadas do Controle de Voos.',
        });
      });
  };

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Jornadas"
            description="Jornadas operacionais derivadas do modelo canônico do Controle de Voos (SIGVOOS importado, manual ou editado), sem usar FRMS como fonte."
          >
            <div className="flex flex-wrap items-center gap-2">
              <ControleVoosDateControls value={selectedDate} onChange={setSelectedDate} onToday={setToday} />
              <button
                type="button"
                onClick={reload}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>
          </ControleVoosPageHeader>

          {state.status === 'loading' ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando jornadas do Controle de Voos…
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Erro ao carregar jornadas.</p>
                  <p className="mt-1">{state.message}</p>
                </div>
              </div>
            </div>
          ) : null}

          {state.status === 'success' && state.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <Users className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Nenhuma jornada para {formatDate(selectedDate)}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Quando houver tripulação vinculada a voos importados ou cadastrados no Controle de Voos, elas aparecerão aqui com origem, qualidade e conflitos de integração.
              </p>
            </div>
          ) : null}

          {state.status === 'success' && state.items.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {state.total} jornada(s) em {formatDate(selectedDate)}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Tripulante</th>
                      <th className="px-4 py-3">Função</th>
                      <th className="px-4 py-3">Aeronave / Trecho</th>
                      <th className="px-4 py-3">Horários</th>
                      <th className="px-4 py-3">Origem</th>
                      <th className="px-4 py-3">Qualidade</th>
                      <th className="px-4 py-3">Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.items.map((item) => (
                      <tr key={item.jornada_id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{item.nome || `Tripulante #${item.tripulante_id}`}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">Voo {item.voo_id}{item.etapa_id ? ` · Etapa ${item.etapa_id}` : ''}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{item.funcao}</div>
                          {item.funcao_origem ? (
                            <div className="text-xs text-slate-500 dark:text-slate-400">{item.funcao_origem}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div>{item.aeronave || '—'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {item.origem_icao || '—'} → {item.destino_icao || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                            <Clock3 className="h-3.5 w-3.5 text-teal-500" />
                            {formatTimeWindow(item)}
                          </div>
                          {item.tempo_total ? (
                            <div className="text-xs text-slate-500 dark:text-slate-400">Total {item.tempo_total}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass('origem', item.origem_dados)}`}>
                            {ORIGEM_LABELS[item.origem_dados]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass('qualidade', item.qualidade_dado)}`}>
                            {QUALIDADE_LABELS[item.qualidade_dado]}
                          </span>
                          {item.estado_conflito ? (
                            <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">{item.evidencia || item.estado_conflito}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {item.last_sync_at ? new Date(item.last_sync_at).toLocaleString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
