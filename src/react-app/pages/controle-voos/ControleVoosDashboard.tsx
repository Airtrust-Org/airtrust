import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpenCheck, CheckCircle, FileText, Plane } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { useControleVoosDashboard } from '@/react-app/hooks/useControleVoos';
import { formatTime, formatDate } from './data/controleVoosUtils';
import ControleVoosDateControls from './components/ControleVoosDateControls';
import { useControleVoosDate } from './hooks/useControleVoosDate';
import EdbShadowPrototypeWithAssessment from './EdbShadowPrototypeWithAssessment';
import { isEdbShadowPilotEnabled } from '@/react-app/config/edbShadowPilot';

function AttentionDot({ critical }: { critical?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${critical ? 'bg-red-500' : 'bg-amber-500'}`}
    />
  );
}

function ControleVoosDashboardContent({ edbShadowEnabled }: { edbShadowEnabled: boolean }) {
  const { selectedDate, setSelectedDate, setToday } = useControleVoosDate();
  const { data: dashboard, isLoading, error } = useControleVoosDashboard(selectedDate);

  const totais = dashboard?.totais;
  const alertas = dashboard?.alertas_operacionais;
  const proximosVoos = dashboard?.proximos_voos || [];

  const attentionItems = alertas
    ? [
        alertas.voos_sem_tripulacao > 0
          ? {
              id: 'sem-tripulacao',
              count: alertas.voos_sem_tripulacao,
              label: `${alertas.voos_sem_tripulacao} voo(s) sem tripulação atribuída`,
              to: `/controle-voos/voos?data=${selectedDate}`,
              critical: true,
            }
          : null,
        alertas.voos_sem_aeronave > 0
          ? {
              id: 'sem-aeronave',
              count: alertas.voos_sem_aeronave,
              label: `${alertas.voos_sem_aeronave} voo(s) sem aeronave atribuída`,
              to: `/controle-voos/voos?data=${selectedDate}`,
              critical: false,
            }
          : null,
        alertas.voos_concluidos_sem_rdv > 0
          ? {
              id: 'sem-rdv',
              count: alertas.voos_concluidos_sem_rdv,
              label: `${alertas.voos_concluidos_sem_rdv} voo(s) concluído(s) sem RDV`,
              to: `/controle-voos/rdv?data=${selectedDate}`,
              critical: false,
            }
          : null,
      ].filter(Boolean) as Array<{
        id: string;
        count: number;
        label: string;
        to: string;
        critical: boolean;
      }>
    : [];

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Controle de Voos — Hoje"
            description="Acompanhe primeiro o que exige ação e, em seguida, a programação do período. Uso operacional interno N1."
          >
            <ControleVoosDateControls
              value={selectedDate}
              onChange={setSelectedDate}
              onToday={setToday}
            />
          </ControleVoosPageHeader>

          {isLoading && (
            <div
              className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900"
              aria-live="polite"
            >
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando situação operacional…</p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-950/20"
            >
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Não foi possível carregar a situação operacional.
              </p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                Atualize a página ou tente novamente em instantes.
              </p>
            </div>
          )}

          {!isLoading && !error && totais && (
            <>
              {dashboard && (
                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                  Período: {formatDate(dashboard.periodo.data_inicio)}
                  {dashboard.periodo.data_inicio !== dashboard.periodo.data_fim
                    ? ` — ${formatDate(dashboard.periodo.data_fim)}`
                    : ''}
                </p>
              )}

              <section className="mb-6" aria-labelledby="controle-voos-atencao-title">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2
                      id="controle-voos-atencao-title"
                      className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Atenção operacional
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Pendências que podem exigir ação antes de consultar indicadores.
                    </p>
                  </div>
                  {attentionItems.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                      {attentionItems.reduce((sum, item) => sum + item.count, 0)} pendência(s)
                    </span>
                  )}
                </div>

                {attentionItems.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    {attentionItems.map((item, index) => (
                      <Link
                        key={item.id}
                        to={item.to}
                        className={`flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset dark:hover:bg-slate-800/60 ${
                          index > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
                        }`}
                      >
                        <span className="flex min-w-0 items-start gap-3">
                          <AttentionDot critical={item.critical} />
                          <span>
                            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                              {item.label}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {item.critical ? 'Prioridade alta' : 'Requer conferência'}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">
                          Ver
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-sm text-emerald-800 dark:text-emerald-200">
                      Nenhuma pendência operacional identificada no período.
                    </p>
                  </div>
                )}
              </section>

              <section className="mb-6" aria-labelledby="controle-voos-situacao-title">
                <h2
                  id="controle-voos-situacao-title"
                  className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  Situação do período
                </h2>
                <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-900">
                  {[
                    {
                      label: 'Em andamento',
                      value: totais.voos_em_andamento + totais.voos_pousados,
                    },
                    { label: 'Planejados', value: totais.voos_planejados },
                    { label: 'RDVs pendentes', value: totais.rdvs_rascunho },
                    { label: 'Cancelados', value: totais.voos_cancelados },
                  ].map((item, index) => (
                    <div
                      key={item.label}
                      className={`px-4 py-3 ${
                        index > 0 ? 'border-t border-slate-100 sm:border-l sm:border-t-0 dark:border-slate-800' : ''
                      } ${index === 2 ? 'lg:border-l' : ''}`}
                    >
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-6" aria-labelledby="controle-voos-proximos-title">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2
                      id="controle-voos-proximos-title"
                      className="text-lg font-semibold text-slate-900 dark:text-slate-100"
                    >
                      Próximos voos
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Programação mais próxima para o período selecionado.
                    </p>
                  </div>
                  <Link
                    to={`/controle-voos/voos?data=${selectedDate}`}
                    className="shrink-0 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Ver programação
                  </Link>
                </div>

                {proximosVoos.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Data</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Voo</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Previsto</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                            <th className="w-16 px-4 py-3 text-left"><span className="sr-only">Ação</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {proximosVoos.map((voo) => (
                            <tr key={voo.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                {formatDate(voo.data_programacao)}
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                                {voo.prefixo}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">
                                {formatTime(voo.horario_previsto_partida)}
                              </td>
                              <td className="px-4 py-3">
                                <ControleVoosStatusBadge status={voo.status} />
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  to={`/controle-voos/voos/${voo.id}`}
                                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  Abrir
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                    <Plane className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Nenhum voo encontrado no período.
                    </p>
                  </div>
                )}
              </section>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
                <Link to={`/controle-voos/rdv?data=${selectedDate}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
                  <FileText className="h-4 w-4" /> RDVs
                </Link>
                <Link to={`/controle-voos/voos?data=${selectedDate}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
                  <Plane className="h-4 w-4" /> Programação
                </Link>
                {edbShadowEnabled && (
                  <Link
                    to="/controle-voos?edb-shadow=1"
                    title="Protótipo controlado — não usar como fonte regulatória"
                    className="inline-flex items-center gap-1.5 text-slate-500 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400"
                  >
                    <BookOpenCheck className="h-4 w-4" /> eDB Shadow (preview)
                  </Link>
                )}
              </div>
            </>
          )}

          <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">
            Uso operacional interno — não regulado. Não substitui Diário de Bordo, eDB, SDRMe ou registro ANAC.
          </p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}

export default function ControleVoosDashboard() {
  const [searchParams] = useSearchParams();
  const [edbShadowEnabled, setEdbShadowEnabled] = useState(false);
  const [capabilityResolved, setCapabilityResolved] = useState(false);

  useEffect(() => {
    let active = true;
    void isEdbShadowPilotEnabled(true).then((enabled) => {
      if (!active) return;
      setEdbShadowEnabled(enabled);
      setCapabilityResolved(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (searchParams.get('edb-shadow') === '1') {
    if (!capabilityResolved) return null;
    if (!edbShadowEnabled) return <Navigate to="/controle-voos" replace />;
    return <EdbShadowPrototypeWithAssessment />;
  }

  return <ControleVoosDashboardContent edbShadowEnabled={edbShadowEnabled} />;
}
