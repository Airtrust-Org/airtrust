import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BellOff, CheckCircle2, ChevronDown, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import { EmptyState } from '@/react-app/components/UI/EmptyState';
import { useFrmsAlertas, useFrmsMutation, type FrmsAlertaRow } from '@/react-app/hooks/useFrms';
import FrmsWorkspaceNav from './components/FrmsWorkspaceNav';

const NIVEIS = ['AVISO', 'ATENCAO', 'CRITICO', 'VIOLACAO'] as const;

const NIVEL_STYLE: Record<string, string> = {
  AVISO: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  ATENCAO:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
  CRITICO:
    'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200',
  VIOLACAO:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
};

function nivelLabel(nivel: string): string {
  if (nivel === 'ATENCAO') return 'ATENÇÃO';
  if (nivel === 'CRITICO') return 'CRÍTICO';
  if (nivel === 'VIOLACAO') return 'VIOLAÇÃO';
  return nivel;
}

function factDate(alert: FrmsAlertaRow): string {
  const raw = alert.data_fato || alert.data_jornada || alert.created_at;
  if (!raw) return 'data não informada';
  const iso = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleDateString('pt-BR');
}

export default function FrmsAlertasPainel() {
  const [searchParams] = useSearchParams();
  const nivelParam = searchParams.get('nivel') || '';
  const tripulanteParam = searchParams.get('tripulante_id') || '';
  const [nivel, setNivel] = useState(
    NIVEIS.includes(nivelParam as (typeof NIVEIS)[number]) ? nivelParam : '',
  );
  const [status, setStatus] = useState<'ativos' | 'resolvidos' | 'todos'>('ativos');
  const { mutate } = useFrmsMutation();

  useEffect(() => {
    if (NIVEIS.includes(nivelParam as (typeof NIVEIS)[number])) setNivel(nivelParam);
  }, [nivelParam]);

  const filtros = useMemo(() => {
    const next: Record<string, string> = { limit: '100', page: '1' };
    if (nivel) next.nivel = nivel;
    if (status === 'ativos') next.resolvido = 'false';
    if (status === 'resolvidos') next.resolvido = 'true';
    if (tripulanteParam) next.tripulante_id = tripulanteParam;
    return next;
  }, [nivel, status, tripulanteParam]);

  const { data, loading, error, refetch } = useFrmsAlertas(filtros);
  const cases: FrmsAlertaRow[] = Array.isArray(data) ? data : [];

  const counts = useMemo(
    () => ({
      total: cases.length,
      criticos: cases.filter((item) => item.nivel === 'CRITICO' || item.nivel === 'VIOLACAO').length,
      atencao: cases.filter((item) => item.nivel === 'ATENCAO').length,
    }),
    [cases],
  );

  const markViewed = useCallback(
    async (id: string) => {
      try {
        await mutate(`/api/frms/alertas/${id}/visualizar`, { method: 'PUT' });
        await refetch();
      } catch {
        toast.error('Não foi possível registrar a visualização do caso.');
      }
    },
    [mutate, refetch],
  );

  const resolveCase = useCallback(
    async (id: string) => {
      try {
        await mutate(`/api/frms/alertas/${id}/resolver`, {
          method: 'PUT',
          body: JSON.stringify({ notas: '' }),
        });
        toast.success('Caso resolvido.');
        await refetch();
      } catch {
        toast.error('Não foi possível resolver o caso.');
      }
    },
    [mutate, refetch],
  );

  return (
    <AppLayout>
      <div className="space-y-5">
        <FrmsWorkspaceNav />

        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">FRMS</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Casos</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Pendências operacionais que precisam ser acompanhadas até o fechamento.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo de casos">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">No filtro</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950 dark:text-white">{loading && !data ? '—' : counts.total}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Crítico / violação</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-red-800 dark:text-red-200">{loading && !data ? '—' : counts.criticos}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Atenção</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-amber-800 dark:text-amber-200">{loading && !data ? '—' : counts.atencao}</p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
          <label className="relative">
            <span className="sr-only">Filtrar por nível</span>
            <select
              value={nivel}
              onChange={(event) => setNivel(event.target.value)}
              className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">Todos os níveis</option>
              {NIVEIS.map((item) => <option key={item} value={item}>{nivelLabel(item)}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </label>

          <div className="inline-flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
            {(['ativos', 'resolvidos', 'todos'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  status === item
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {item === 'ativos' ? 'Ativos' : item === 'resolvidos' ? 'Resolvidos' : 'Todos'}
              </button>
            ))}
          </div>

          {tripulanteParam ? (
            <Link to="/frms/alertas" className="text-xs font-semibold text-primary hover:underline">
              Remover filtro de tripulante
            </Link>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            Não foi possível atualizar os casos. Tente novamente antes de tomar uma decisão operacional.
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          {loading && !data ? (
            <div className="space-y-3 p-4" aria-label="Carregando casos">
              {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />)}
            </div>
          ) : cases.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={<BellOff size={44} className="text-slate-300" />}
                title="Nenhum caso neste filtro"
                description="Não há pendências FRMS correspondentes aos filtros selecionados."
              />
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {cases.map((item) => {
                const name = item.nome_tripulante || `Tripulante #${item.tripulante_id}`;
                const levelClass = NIVEL_STYLE[item.nivel] || NIVEL_STYLE.AVISO;
                return (
                  <article key={item.id} className="p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                      <AlertTriangle className="mt-1 h-5 w-5 flex-none text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${levelClass}`}>{nivelLabel(item.nivel)}</span>
                          <span className="text-xs text-slate-500">{factDate(item)}</span>
                          {item.visualizado ? <span className="text-xs text-slate-400">visualizado</span> : null}
                        </div>
                        <h2 className="mt-2 font-bold text-slate-950 dark:text-white">{name}</h2>
                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{item.mensagem}</p>
                        <p className="mt-2 text-xs text-slate-500">Tipo: {item.tipo_limite || 'não informado'}</p>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:w-64 lg:justify-end">
                        {item.tripulante_id ? (
                          <Link
                            to={`/frms/tripulante/${item.tripulante_id}?origem=casos`}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                          >
                            Ver pessoa
                          </Link>
                        ) : null}
                        {!item.visualizado ? (
                          <button
                            type="button"
                            onClick={() => void markViewed(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                          >
                            <Eye className="h-3.5 w-3.5" /> Marcar visto
                          </button>
                        ) : null}
                        {!item.resolvido ? (
                          <button
                            type="button"
                            onClick={() => void resolveCase(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
