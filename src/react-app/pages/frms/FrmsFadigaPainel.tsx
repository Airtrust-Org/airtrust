import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, ShieldAlert } from 'lucide-react';
import { frmsBrazilOperationalTodayIso } from './frmsOperationalDate';
import { classifyDailyMonitorItem, summarizeDailyMonitor } from './frmsDailyMonitorRisk';
import type { FrmsDailyFatigueStatus } from '@/react-app/hooks/useFrms';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import {
  useFrmsDailyFatigue,
  useFrmsDailyFatigueAlerts,
  useFrmsFadigaAnalytics,
} from '@/react-app/hooks/useFrms';

type FrmsDailyMonitorRow = FrmsDailyFatigueStatus & {
  funcionario_nome?: string;
  score_fadiga?: number | null;
};

export default function FrmsFadigaPainel() {
  const navigate = useNavigate();
  const [data, setData] = useState(frmsBrazilOperationalTodayIso());
  const { data: dailyData, loading, refetch } = useFrmsDailyFatigue(data, 'team');
  const { data: alertsData, loading: alertsLoading, error: alertsError, refetch: refetchAlerts } = useFrmsDailyFatigueAlerts(data);
  const { data: analyticsData } = useFrmsFadigaAnalytics(30);

  const dailyItemsValid = Array.isArray(dailyData?.items);
  const alertItemsValid = Array.isArray(alertsData?.items);
  const itens: FrmsDailyMonitorRow[] = dailyItemsValid ? (dailyData?.items ?? []) : [];
  const alertItems = alertItemsValid ? (alertsData?.items ?? []) : [];

  const resumo = summarizeDailyMonitor(itens, alertItems);
  const { alertIndex } = resumo;
  // Missing/malformed API data is unknown, NOT a confirmed empty roster or
  // zero alerts. Both sources must be complete for an operational risk summary.
  const riskUnavailable = loading || alertsLoading || Boolean(alertsError) ||
    !dailyItemsValid || !alertItemsValid;

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="Monitor de Fadiga"
          subtitle="Visão do gestor de risco diário, tendência e priorização operacional"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => navigate('/frms/controle-operacional')}>
                Controle Operacional
              </Button>
              <Button variant="secondary" onClick={() => navigate('/frms/checkin')}>
                Fadiga Diária
              </Button>
              <Button variant="secondary" onClick={() => navigate('/frms/fadiga-historico')}>
                Histórico
              </Button>
            </div>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 text-sm text-slate-600">
              <Calendar className="h-4 w-4" />
              Data de referência
            </div>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <Button
              variant="secondary"
              disabled={loading || alertsLoading}
              onClick={() => {
                // Both sources describe the same operational day. Refreshing
                // only the roster can incorrectly pair a current check-in
                // with outdated risk alerts in the monitor.
                refetch();
                refetchAlerts();
              }}
            >
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Check-ins</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{loading || !dailyItemsValid ? '—' : Number(resumo.complete)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Score médio</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {loading || !dailyItemsValid || resumo.mediaScore === null ? '—' : Math.round(resumo.mediaScore)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Atenção + Crítica (check-ins completos)</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">{riskUnavailable || resumo.riskPct === null ? '—' : `${resumo.riskPct}%`}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pendente/incompleto</p>
            <p className="mt-2 text-2xl font-bold text-violet-600">
              {loading || !dailyItemsValid ? '—' : Number(resumo.pending)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShieldAlert className="h-4 w-4" />
              Lista operacional do dia
            </div>
            {loading || alertsLoading ? (
              <div className="py-10 text-center text-sm text-slate-400">Carregando painel e alertas...</div>
            ) : alertsError || !alertItemsValid || !dailyItemsValid ? (
              <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p>Não foi possível verificar os alertas de fadiga. A condição operacional não pode ser presumida como normal.</p>
                <Button variant="secondary" onClick={() => refetchAlerts()}>Reconsultar alertas</Button>
              </div>
            ) : itens.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Sem registros para esta data.
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map((item) => {
                  const status = classifyDailyMonitorItem(item, alertIndex);
                  const tone =
                    status === 'critical'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : status === 'attention' || status === 'incomplete_checkin'
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : status === 'not_submitted'
                          ? 'bg-violet-50 border-violet-200 text-violet-700'
                          : status === 'normal'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600';
                  const statusLabel =
                    status === 'not_submitted'
                      ? 'Não preenchida'
                      : status === 'incomplete_checkin'
                        ? 'Check-in incompleto'
                        : status === 'attention'
                        ? 'Atenção'
                        : status === 'critical'
                          ? 'Crítica'
                          : status === 'normal'
                            ? 'Preenchida — sem alerta identificado'
                            : 'Situação não determinada';
                  const sourceLabel =
                    String(item.data_source || 'crew_reported') === 'not_applicable'
                      ? 'Sem jornada/check-in disponível para a data'
                      : String(item.data_source || 'crew_reported') === 'missing_checkin'
                      ? 'Check-in pendente — sem cálculo'
                      : status === 'incomplete_checkin'
                        ? 'Dados obrigatórios incompletos — sem cálculo'
                        : String(item.data_source || '') === 'default_estimate'
                          ? 'Estimativa legada'
                          : 'Informado pelo tripulante';

                  return (
                    <div key={String(item.funcionario_id)} className={`rounded-xl border px-3 py-3 ${tone}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            <Link
                              to={`/frms/tripulante/${encodeURIComponent(String(item.funcionario_id || ''))}`}
                              className="text-sm font-semibold hover:underline"
                            >
                              {String(item.funcionario_nome || `#${item.funcionario_id}`)}
                            </Link>
                          </p>
                          <p className="text-xs opacity-80">{statusLabel} • {sourceLabel}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">
                            {item.score_fadiga == null ? '—' : Number(item.score_fadiga)}
                          </p>
                          <p className="text-[11px] uppercase tracking-wide">{statusLabel}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <BarChart3 className="h-4 w-4" />
              Tendência (30 dias)
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              {(analyticsData?.serie || []).slice(-10).map((row, idx) => (
                <div
                  key={`${row.data_checkin}-${idx}`}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span>{String(row.data_checkin)}</span>
                    <span className="font-semibold">{Math.round(Number(row.media_score || 0))}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {Number(row.alto_critico || 0)} alto/crítico • {Number(row.requer_frat || 0)} revisão FRAT
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Alertas de Fadiga Diária</p>
              <p className="text-xs text-slate-500">
                Sinalizações operacionais para revisão humana da escala.
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate('/frms/escalas')}>
              Revisar escala
            </Button>
          </div>
          {alertsLoading ? (
            <p className="text-sm text-slate-500">Verificando alertas de fadiga diária...</p>
          ) : alertsError || !alertItemsValid ? (
            <p role="alert" className="text-sm text-amber-800">Não foi possível consultar os alertas. O estado de risco permanece desconhecido.</p>
          ) : alertItems.length === 0 ? (
            <p className="text-sm text-slate-500">Sem alertas identificados na data selecionada.</p>
          ) : (
            <div className="space-y-2">
              {alertItems.map((alert) => (
                <div
                  key={String(alert.id)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-slate-800">
                    {String(alert.tripulante_nome || `Tripulante #${alert.tripulante_id}`)}
                  </p>
                  <p className="text-slate-600">{String(alert.mensagem || '')}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
