import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, ShieldAlert } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import { useFrmsFadigaPainel, useFrmsFadigaAnalytics } from '@/react-app/hooks/useFrms';

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
  const { data: painelData, loading, refetch } = useFrmsFadigaPainel(data);
  const { data: analyticsData } = useFrmsFadigaAnalytics(30);

  const resumo = painelData?.resumo || {};
  const itens = painelData?.itens || [];

  const taxaRisco = useMemo(() => {
    const total = Number(resumo.total_checkins || 0);
    const altoCritico = Number(resumo.alto || 0) + Number(resumo.critico || 0);
    if (!total) return 0;
    return Math.round((altoCritico / total) * 100);
  }, [resumo.alto, resumo.critico, resumo.total_checkins]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="Painel de Fadiga"
          subtitle="Visão do gestor de risco diário, tendência e priorização operacional"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => navigate('/frms/checkin')}>
                Abrir Check-in
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
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {Number(resumo.total_checkins || 0)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Score médio</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {Math.round(Number(resumo.media_score || 0))}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Alto + Crítico</p>
            <p className="mt-2 text-2xl font-bold text-amber-600">{taxaRisco}%</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Críticos</p>
            <p className="mt-2 text-2xl font-bold text-red-600">{Number(resumo.critico || 0)}</p>
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
                Sem check-ins para esta data.
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map((item) => {
                  const nivel = item.nivel_fadiga;
                  const tone =
                    nivel === 'CRITICO'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : nivel === 'ALTO'
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : nivel === 'MODERADO'
                          ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700';
                  return (
                    <div key={item.id} className={`rounded-xl border px-3 py-3 ${tone}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            <Link
                              to={`/frms/tripulante/${encodeURIComponent(String(item.funcionario_id || ''))}`}
                              className="text-sm font-semibold hover:underline"
                            >
                              {item.funcionario_nome || `#${item.funcionario_id}`}
                            </Link>
                          </p>
                          <p className="text-xs opacity-80">
                            {item.status_operacional} • KSS {item.kss_score} • Sono{' '}
                            {item.horas_sono}h
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{item.score_fadiga}</p>
                          <p className="text-[11px] uppercase tracking-wide">{item.nivel_fadiga}</p>
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
                    <span className="font-semibold">
                      {Math.round(Number(row.media_score || 0))}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {Number(row.alto_critico || 0)} alto/crítico • {Number(row.requer_frat || 0)}{' '}
                    revisão FRAT
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
