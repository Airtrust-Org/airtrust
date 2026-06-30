import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  FileText,
  Loader2,
  Plane,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { fetchWithAuth } from '@/react-app/config/api';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';

type ResumoOperacionalResponse = {
  success: boolean;
  data?: {
    periodo: {
      data_inicio: string;
      data_fim: string;
    };
    totais: {
      voos: number;
      horas_voadas: number;
      numero_pousos: number;
      ciclos: number;
      combustivel_consumo: number;
      voos_sem_rdv: number;
      rdvs_rascunho: number;
      rdvs_preenchimento_finalizado: number;
    };
    totais_por_status: Record<string, number>;
    cancelamentos_por_motivo: Array<{
      motivo_id: number | null;
      motivo_nome: string | null;
      total: number;
    }>;
    atrasos_ou_divergencias: {
      voos_com_atraso_partida: number;
      voos_com_atraso_chegada: number;
      voos_alternados_divergidos: number;
      rdvs_com_divergencias: number;
    };
    agregados_por_dia: Array<{
      data: string;
      totais: {
        voos: number;
        horas_voadas: number;
      };
      totais_por_status: Record<string, number>;
    }>;
  };
  error?: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: NonNullable<ResumoOperacionalResponse['data']> };

const numberFormatter = new Intl.NumberFormat('pt-BR');
const decimalFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const STATUS_LABELS: Record<string, string> = {
  planejado: 'Planejado',
  liberado_operacionalmente: 'Liberado',
  em_andamento: 'Em andamento',
  pousado: 'Pousado',
  concluido_operacionalmente: 'Concluído',
  cancelado: 'Cancelado',
  alternado_divergido: 'Alternado',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function buildDefaultPeriod(): { dataInicio: string; dataFim: string } {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return {
    dataInicio: start.toISOString().slice(0, 10),
    dataFim: end.toISOString().slice(0, 10),
  };
}

async function loadResumoOperacional(signal?: AbortSignal) {
  const { dataInicio, dataFim } = buildDefaultPeriod();
  const params = new URLSearchParams({ data_inicio: dataInicio, data_fim: dataFim });
  const response = await fetchWithAuth(`/api/controle-voos/relatorios/resumo-operacional?${params.toString()}`, {
    signal,
  });
  const payload = (await response.json()) as ResumoOperacionalResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || `Erro HTTP ${response.status}`);
  }

  return payload.data;
}

export default function ControleVoosRelatorios() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    void loadResumoOperacional(controller.signal)
      .then((data) => setState({ status: 'success', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao carregar relatórios operacionais.',
        });
      });

    return () => controller.abort();
  }, []);

  const retry = () => {
    setState({ status: 'loading' });
    void loadResumoOperacional()
      .then((data) => setState({ status: 'success', data }))
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Falha ao carregar relatórios operacionais.',
        }),
      );
  };

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Relatórios Operacionais"
            description="Resumo real de voos, RDVs, atrasos e cancelamentos no período."
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
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Carregando resumo operacional…</p>
            </div>
          )}

          {state.status === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Erro ao carregar relatórios operacionais.</p>
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{state.message}</p>
            </div>
          )}

          {state.status === 'success' && (
            <>
              <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
                Período consolidado: {formatDate(state.data.periodo.data_inicio)}{' '}
                {state.data.periodo.data_inicio !== state.data.periodo.data_fim
                  ? `— ${formatDate(state.data.periodo.data_fim)}`
                  : ''}
              </p>

              {state.data.totais.voos === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                  <FileText className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    Nenhum voo encontrado no período consultado.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        id: 'voos',
                        label: 'Voos no período',
                        value: numberFormatter.format(state.data.totais.voos),
                        icon: <Plane className="h-5 w-5 text-blue-500" />,
                      },
                      {
                        id: 'horas',
                        label: 'Horas voadas',
                        value: `${decimalFormatter.format(state.data.totais.horas_voadas)} h`,
                        icon: <Clock className="h-5 w-5 text-emerald-500" />,
                      },
                      {
                        id: 'rdv',
                        label: 'Voos sem RDV',
                        value: numberFormatter.format(state.data.totais.voos_sem_rdv),
                        icon: <FileText className="h-5 w-5 text-amber-500" />,
                      },
                      {
                        id: 'alertas',
                        label: 'Atrasos ou divergências',
                        value: numberFormatter.format(
                          state.data.atrasos_ou_divergencias.voos_com_atraso_partida +
                            state.data.atrasos_ou_divergencias.voos_com_atraso_chegada +
                            state.data.atrasos_ou_divergencias.rdvs_com_divergencias,
                        ),
                        icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
                      },
                    ].map((card) => (
                      <div
                        key={card.id}
                        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              {card.label}
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                              {card.value}
                            </p>
                          </div>
                          <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">{card.icon}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                        <BarChart3 className="h-4 w-4 text-indigo-500" />
                        Totais por status
                      </h2>
                      <div className="space-y-3">
                        {Object.entries(state.data.totais_por_status).map(([status, total]) => (
                          <div key={status} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                            <span className="text-sm text-slate-600 dark:text-slate-300">
                              {STATUS_LABELS[status] || status}
                            </span>
                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {numberFormatter.format(total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                        <TrendingUp className="h-4 w-4 text-rose-500" />
                        Atrasos, divergências e cancelamentos
                      </h2>
                      <div className="space-y-3">
                        {[
                          ['Voos com atraso na partida', state.data.atrasos_ou_divergencias.voos_com_atraso_partida],
                          ['Voos com atraso na chegada', state.data.atrasos_ou_divergencias.voos_com_atraso_chegada],
                          ['Voos alternados/divergidos', state.data.atrasos_ou_divergencias.voos_alternados_divergidos],
                          ['RDVs com divergências', state.data.atrasos_ou_divergencias.rdvs_com_divergencias],
                          ['RDVs em rascunho', state.data.totais.rdvs_rascunho],
                        ].map(([label, total]) => (
                          <div key={label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                            <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {numberFormatter.format(Number(total))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                    <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">
                      Cancelamentos por motivo
                    </h2>
                    {state.data.cancelamentos_por_motivo.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Nenhum cancelamento registrado no período.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {state.data.cancelamentos_por_motivo.map((item) => (
                          <div
                            key={`${item.motivo_id ?? 'sem-motivo'}-${item.motivo_nome ?? 'sem-nome'}`}
                            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
                          >
                            <span className="text-sm text-slate-600 dark:text-slate-300">
                              {item.motivo_nome || 'Sem motivo informado'}
                            </span>
                            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {numberFormatter.format(item.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
