import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, ShieldAlert } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import {
  useFrmsDailyFatigue,
  useFrmsDailyFatigueAlerts,
  useFrmsFadigaAnalytics,
} from '@/react-app/hooks/useFrms';

function getTodayLocalKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function FrmsFadigaPainel() {
  const navigate = useNavigate();
  const [data, setData] = useState(getTodayLocalKey());
  const { data: dailyData, loading, refetch } = useFrmsDailyFatigue(data, 'team');
  const { data: alertsData } = useFrmsDailyFatigueAlerts(data);
  const { data: analyticsData } = useFrmsFadigaAnalytics(30);

  const itens = Array.isArray((dailyData as { items?: unknown[] } | null)?.items)
    ? (((dailyData as { items?: unknown[] } | null)?.items || []) as Array<Record<string, unknown>>)
    : [];
  const alertItems = Array.isArray((alertsData as { items?: unknown[] } | null)?.items)
    ? (((alertsData as { items?: unknown[] } | null)?.items || []) as Array<Record<string, unknown>>)
    : [];

  const resumo = useMemo(() => {
    const total = itens.filter((item) => item.status !== 'no_duty').length;
    const submitted = itens.filter(
      (item) => item.status !== 'not_submitted' && item.status !== 'no_duty',
    ).length;
    const critical = itens.filter(
      (item) => item.status === 'critical' || item.status === 'unfit_for_duty',
    ).length;
    const attention = itens.filter((item) => item.status === 'attention').length;
    const notSubmitted = itens.filter((item) => item.status === 'not_submitted').length;
    const scores = itens
      .map((item) => Number(item.score_fadiga || 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    return {
      total,
      submitted,
      critical,
      attention,
      notSubmitted,
      mediaScore: scores.length ? scores.reduce((acc, curr) => acc + curr, 0) / scores.length : 0,
    };
  }, [itens]);

  const taxaRisco = useMemo(() => {
    const total = Number(resumo.total || 0);
    const altoCritico = Number(resumo.attention || 0) + Number(resumo.critical || 0);
    if (!total) return 0;
    return Math.round((altoCritico / total) * 100);
  }, [resumo.attention, resumo.critical, resumo.total]);

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
            <Button variant="secondary" onClick={() => refetch()}>
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Check-ins</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{Number(resumo.submitted || 0)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Score médio</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {Math.round(Number(resumo.mediaScore || 0))}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Atenção + Crítica</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">{taxaRisco}%</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Não preenchida</p>
            <p className="mt-2 text-2xl font-bold text-violet-600">
              {Number(resumo.notSubmitted || 0)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShieldAlert className="h-4 w-4" />
              Lista operacional do dia
            </div>
            {loading ? (
              <div className="py-10 text-center text-sm text-slate-400">Carregando painel...</div>
            ) : itens.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                Sem registros para esta data.
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map((item) => {
                  const status = String(item.status || '');
                  const tone =
                    status === 'critical' || status === 'unfit_for_duty'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : status === 'attention'
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : status === 'not_submitted'
                          ? 'bg-violet-50 border-violet-200 text-violet-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700';
                  const statusLabel =
                    status === 'not_submitted'
                      ? 'Não preenchida'
                      : status === 'attention'
                        ? 'Atenção'
                        : status === 'critical' || status === 'unfit_for_duty'
                          ? 'Crítica'
                          : status === 'normal'
                            ? 'Preenchida'
                            : 'Sem jornada';
                  const sourceLabel =
                    String(item.data_source || 'crew_reported') === 'default_estimate'
                      ? 'Não preenchido pelo tripulante — usando estimativa padrão'
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
                          <p className="text-lg font-bold">{Number(item.score_fadiga || 0)}</p>
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
          {alertItems.length === 0 ? (
            <p className="text-sm text-slate-500">Sem alertas de fadiga diária na data selecionada.</p>
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
