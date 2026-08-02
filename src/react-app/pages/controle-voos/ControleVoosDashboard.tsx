import { Link, useSearchParams } from 'react-router-dom';
import {
  Plane,
  FileText,
  AlertTriangle,
  Users,
  Wrench,
  CheckCircle,
  TrendingUp,
  BookOpenCheck,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosStatCards from './components/ControleVoosStatCards';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import { useControleVoosDashboard } from '@/react-app/hooks/useControleVoos';
import { formatTime, formatDate } from './data/controleVoosUtils';
import ControleVoosDateControls from './components/ControleVoosDateControls';
import { useControleVoosDate } from './hooks/useControleVoosDate';
import EdbShadowPrototype from './EdbShadowPrototype';

const DEMO_LINK_BADGE_CLASS =
  'rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300';

function AlertIcon({ gravidade }: { gravidade: 'critico' | 'alerta' | 'info' }) {
  if (gravidade === 'critico') {
    return <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-red-500" />;
  }
  if (gravidade === 'alerta') {
    return <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-amber-500" />;
  }
  return <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-blue-500" />;
}

function ControleVoosDashboardContent() {
  const { selectedDate, setSelectedDate, setToday } = useControleVoosDate();
  const { data: dashboard, isLoading, error } = useControleVoosDashboard(selectedDate);

  const totais = dashboard?.totais;
  const alertas = dashboard?.alertas_operacionais;
  const proximosVoos = dashboard?.proximos_voos || [];

  const cardData = totais
    ? [
        {
          label: 'Voos no período',
          value: totais.voos,
          icon: <Plane className="h-5 w-5" />,
          variant: 'default' as const,
          subtitle: `${totais.voos_planejados} planejado(s)`,
        },
        {
          label: 'Em andamento',
          value: totais.voos_em_andamento + totais.voos_pousados,
          icon: <TrendingUp className="h-5 w-5" />,
          variant: 'info' as const,
          subtitle: `${totais.voos_pousados} pousado(s)`,
        },
        {
          label: 'Concluídos',
          value: totais.voos_concluidos_operacionalmente,
          icon: <CheckCircle className="h-5 w-5" />,
          variant: 'default' as const,
          subtitle: `${totais.voos_alternados_divergidos} alternado(s)/divergido(s)`,
        },
        {
          label: 'Cancelados',
          value: totais.voos_cancelados,
          icon: <AlertTriangle className="h-5 w-5" />,
          variant: totais.voos_cancelados > 0 ? ('danger' as const) : ('default' as const),
          subtitle: 'no período',
        },
        {
          label: 'RDVs pendentes',
          value: totais.rdvs_rascunho,
          icon: <FileText className="h-5 w-5" />,
          variant: totais.rdvs_rascunho > 0 ? ('warning' as const) : ('default' as const),
          subtitle: `${totais.rdvs_preenchimento_finalizado} finalizado(s)`,
        },
        {
          label: 'Voos sem RDV',
          value: totais.voos_sem_rdv,
          icon: <FileText className="h-5 w-5" />,
          variant: totais.voos_sem_rdv > 0 ? ('warning' as const) : ('default' as const),
          subtitle: 'necessitam preenchimento',
        },
      ]
    : [];

  const alertasOperacionais = alertas
    ? ([
        alertas.voos_sem_tripulacao > 0
          ? {
              id: 'al-sem-trip',
              mensagem: `${alertas.voos_sem_tripulacao} voo(s) sem tripulação atribuída`,
              gravidade: 'critico' as const,
            }
          : null,
        alertas.voos_sem_aeronave > 0
          ? {
              id: 'al-sem-aero',
              mensagem: `${alertas.voos_sem_aeronave} voo(s) sem aeronave atribuída`,
              gravidade: 'alerta' as const,
            }
          : null,
        alertas.voos_concluidos_sem_rdv > 0
          ? {
              id: 'al-sem-rdv',
              mensagem: `${alertas.voos_concluidos_sem_rdv} voo(s) concluído(s) sem RDV`,
              gravidade: 'alerta' as const,
            }
          : null,
      ].filter(Boolean) as {
        id: string;
        mensagem: string;
        gravidade: 'critico' | 'alerta' | 'info';
      }[])
    : [];

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosPageHeader
            title="Painel Operacional — Controle de Voos"
            description="Uso operacional interno com dados reais N1. Não regulado. Não fiscal. Não substitui Diário de Bordo, eDB ou SDRMe."
          >
            <ControleVoosDateControls
              value={selectedDate}
              onChange={setSelectedDate}
              onToday={setToday}
            />
          </ControleVoosPageHeader>

          {isLoading && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando dashboard…</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
              <p className="text-sm text-red-700 dark:text-red-300">
                Erro ao carregar dashboard: {error.message}
              </p>
            </div>
          )}

          {!isLoading && !error && (
            <>
              {dashboard && (
                <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
                  Período: {formatDate(dashboard.periodo.data_inicio)}
                  {dashboard.periodo.data_inicio !== dashboard.periodo.data_fim
                    ? ` — ${formatDate(dashboard.periodo.data_fim)}`
                    : ''}
                </p>
              )}

              <ControleVoosStatCards cards={cardData} className="mb-8" />

              <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    to: `/controle-voos/voos?data=${selectedDate}`,
                    icon: <Plane className="h-5 w-5 text-blue-500" />,
                    label: 'Voos / Programação',
                  },
                  {
                    to: `/controle-voos/rdv?data=${selectedDate}`,
                    icon: <FileText className="h-5 w-5 text-purple-500" />,
                    label: 'RDVs',
                  },
                  {
                    to: `/controle-voos/jornadas?data=${selectedDate}`,
                    icon: <Users className="h-5 w-5 text-teal-500" />,
                    label: 'Jornadas',
                  },
                  {
                    to: `/controle-voos/indisponibilidades?data=${selectedDate}`,
                    icon: <Wrench className="h-5 w-5 text-amber-500" />,
                    label: 'Indisponibilidades',
                    preview: true,
                  },
                  {
                    to: '/controle-voos?edb-shadow=1',
                    icon: <BookOpenCheck className="h-5 w-5 text-red-600" />,
                    label: 'Protótipo eDB Shadow',
                    preview: true,
                  },
                ].map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    title={
                      link.preview
                        ? 'Tela em preview - não usar como fonte operacional ou regulatória'
                        : undefined
                    }
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-600"
                  >
                    {link.icon}
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <span>{link.label}</span>
                      {link.preview && <span className={DEMO_LINK_BADGE_CLASS}>Preview</span>}
                    </span>
                  </Link>
                ))}
              </div>

              {alertasOperacionais.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    Alertas operacionais
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {alertasOperacionais.map((alerta) => {
                      const bgColor =
                        alerta.gravidade === 'critico'
                          ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                          : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20';
                      const textColor =
                        alerta.gravidade === 'critico'
                          ? 'text-red-800 dark:text-red-200'
                          : 'text-amber-800 dark:text-amber-200';
                      const subColor =
                        alerta.gravidade === 'critico'
                          ? 'text-red-500 dark:text-red-400'
                          : 'text-amber-500 dark:text-amber-400';
                      return (
                        <div
                          key={alerta.id}
                          className={`flex items-start gap-3 rounded-xl border p-4 ${bgColor}`}
                        >
                          <AlertIcon gravidade={alerta.gravidade} />
                          <div>
                            <p className={`text-sm font-medium ${textColor}`}>{alerta.mensagem}</p>
                            <p className={`text-xs ${subColor}`}>
                              {alerta.gravidade === 'critico' ? 'Crítico' : 'Atenção'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {alertasOperacionais.length === 0 && !isLoading && totais && (
                <div className="mb-8 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Nenhum alerta operacional no período.
                  </p>
                </div>
              )}

              {proximosVoos.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-3 text-lg font-semibold text-slate-800 dark:text-slate-100">
                    Próximos voos do período
                  </h2>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                              Data
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                              Voo
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                              Previsto
                            </th>
                            <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">
                              Status
                            </th>
                            <th className="w-10 px-4 py-3 text-left" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {proximosVoos.map((voo) => (
                            <tr
                              key={voo.id}
                              className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            >
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
                </section>
              )}

              {proximosVoos.length === 0 && !isLoading && totais && (
                <div className="mb-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                  <Plane className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Nenhum voo encontrado no período.
                  </p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Crie o primeiro voo na tela de Programação.
                  </p>
                </div>
              )}
            </>
          )}

          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
            Uso operacional interno — não regulado. Não substitui Diário de Bordo, eDB, SDRMe ou
            registro ANAC.
          </p>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}

export default function ControleVoosDashboard() {
  const [searchParams] = useSearchParams();
  if (searchParams.get('edb-shadow') === '1') {
    return <EdbShadowPrototype />;
  }
  return <ControleVoosDashboardContent />;
}
