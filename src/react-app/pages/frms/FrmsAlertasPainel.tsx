import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BellOff, CheckCircle2, ChevronDown, Eye, RefreshCw, X } from 'lucide-react';
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

const NIVEL_LABEL: Record<string, string> = {
  AVISO: 'Acompanhar',
  ATENCAO: 'Verificar',
  CRITICO: 'Avaliar',
  VIOLACAO: 'Atenção',
};

function nivelLabel(nivel: string): string {
  return NIVEL_LABEL[nivel] || nivel;
}

function factDate(alert: FrmsAlertaRow): string {
  const raw = alert.data_fato || alert.data_jornada || alert.created_at;
  if (!raw) return 'data não informada';
  const iso = raw.includes(' ') ? raw.replace(' ', 'T') : raw;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleDateString('pt-BR');
}

function resolvedAt(value: string | null): string | null {
  if (!value) return null;
  const iso = value.includes(' ') ? value.replace(' ', 'T') : value;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

interface FrmsCaseResolutionForm {
  responsavel: string;
  prazo: string;
  acao_mitigacao: string;
  justificativa: string;
  evidencia_referencia: string;
  avaliacao_eficacia: string;
}

const EMPTY_RESOLUTION_FORM: FrmsCaseResolutionForm = {
  responsavel: '',
  prazo: '',
  acao_mitigacao: '',
  justificativa: '',
  evidencia_referencia: '',
  avaliacao_eficacia: '',
};

function parseResolutionRecord(value: string | null): (FrmsCaseResolutionForm & { schema?: string }) | null {
  if (!value || !value.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(value) as Partial<FrmsCaseResolutionForm> & { schema?: string };
    if (parsed.schema !== 'FRMS_CASE_RESOLUTION_V1') return null;
    return {
      responsavel: String(parsed.responsavel || ''),
      prazo: String(parsed.prazo || ''),
      acao_mitigacao: String(parsed.acao_mitigacao || ''),
      justificativa: String(parsed.justificativa || ''),
      evidencia_referencia: String(parsed.evidencia_referencia || ''),
      avaliacao_eficacia: String(parsed.avaliacao_eficacia || ''),
      schema: parsed.schema,
    };
  } catch {
    return null;
  }
}

export default function FrmsAlertasPainel() {
  const [searchParams] = useSearchParams();
  const nivelParam = searchParams.get('nivel') || '';
  const tripulanteParam = searchParams.get('tripulante_id') || '';
  const [nivel, setNivel] = useState(
    NIVEIS.includes(nivelParam as (typeof NIVEIS)[number]) ? nivelParam : '',
  );
  const [status, setStatus] = useState<'ativos' | 'resolvidos' | 'todos'>('ativos');
  const [resolveTarget, setResolveTarget] = useState<FrmsAlertaRow | null>(null);
  const [resolutionForm, setResolutionForm] = useState<FrmsCaseResolutionForm>(EMPTY_RESOLUTION_FORM);
  const [resolving, setResolving] = useState(false);
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
      bloqueio: cases.filter((item) => item.nivel === 'VIOLACAO').length,
      decidir: cases.filter((item) => item.nivel === 'CRITICO').length,
      confirmar: cases.filter((item) => item.nivel === 'ATENCAO').length,
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

  const openResolution = useCallback((item: FrmsAlertaRow) => {
    setResolveTarget(item);
    setResolutionForm(EMPTY_RESOLUTION_FORM);
  }, []);

  const closeResolution = useCallback(() => {
    if (resolving) return;
    setResolveTarget(null);
    setResolutionForm(EMPTY_RESOLUTION_FORM);
  }, [resolving]);

  const updateResolutionField = useCallback(
    (field: keyof FrmsCaseResolutionForm, value: string) => {
      setResolutionForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const resolveCase = useCallback(async () => {
    if (!resolveTarget) return;
    const payload = {
      responsavel: resolutionForm.responsavel.trim(),
      prazo: resolutionForm.prazo,
      acao_mitigacao: resolutionForm.acao_mitigacao.trim(),
      justificativa: resolutionForm.justificativa.trim(),
      evidencia_referencia: resolutionForm.evidencia_referencia.trim() || null,
      avaliacao_eficacia: resolutionForm.avaliacao_eficacia.trim(),
    };
    const completo =
      payload.responsavel.length >= 2 &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.prazo) &&
      payload.acao_mitigacao.length >= 10 &&
      payload.justificativa.length >= 10 &&
      payload.avaliacao_eficacia.length >= 10;
    if (!completo) {
      toast.error('Preencha responsável, prazo, mitigação, justificativa e avaliação de eficácia.');
      return;
    }

    setResolving(true);
    try {
      await mutate(`/api/frms/alertas/${resolveTarget.id}/resolver`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      toast.success('Caso resolvido com trilha de mitigação e eficácia.');
      setResolveTarget(null);
      setResolutionForm(EMPTY_RESOLUTION_FORM);
      await refetch();
    } catch {
      toast.error('Não foi possível resolver o caso.');
    } finally {
      setResolving(false);
    }
  }, [mutate, refetch, resolutionForm, resolveTarget]);

  return (
    <AppLayout>
      <div className="space-y-5">
        <FrmsWorkspaceNav />

        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">FRMS</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Casos</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Backlog acumulado de pendências FRMS. A prioridade visual usa a mesma linguagem da Operação.
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

        <section className="grid gap-3 sm:grid-cols-4" aria-label="Resumo de casos">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">No filtro</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950 dark:text-white">{loading && !data ? '—' : counts.total}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Atenção</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-red-800 dark:text-red-200">{loading && !data ? '—' : counts.bloqueio}</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/60 dark:bg-orange-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">Avaliar</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-orange-800 dark:text-orange-200">{loading && !data ? '—' : counts.decidir}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Verificar</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-amber-800 dark:text-amber-200">{loading && !data ? '—' : counts.confirmar}</p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
          <label className="relative">
            <span className="sr-only">Filtrar por prioridade</span>
            <select
              value={nivel}
              onChange={(event) => setNivel(event.target.value)}
              className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">Todas as prioridades</option>
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
                const resolutionDate = resolvedAt(item.resolvido_em);
                const resolutionRecord = parseResolutionRecord(item.notas_resolucao);
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
                        {item.resolvido ? (
                          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                            <p className="font-semibold text-slate-700 dark:text-slate-200">
                              {`Resolvido${item.resolvido_por ? ` por ${item.resolvido_por}` : ''}${
                                resolutionDate ? ` em ${resolutionDate}` : ''
                              }.`}
                            </p>
                            {resolutionRecord ? (
                              <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                                <div><dt className="font-semibold">Responsável</dt><dd>{resolutionRecord.responsavel}</dd></div>
                                <div><dt className="font-semibold">Prazo</dt><dd>{resolutionRecord.prazo}</dd></div>
                                <div className="sm:col-span-2"><dt className="font-semibold">Mitigação</dt><dd>{resolutionRecord.acao_mitigacao}</dd></div>
                                <div className="sm:col-span-2"><dt className="font-semibold">Justificativa</dt><dd>{resolutionRecord.justificativa}</dd></div>
                                {resolutionRecord.evidencia_referencia ? (
                                  <div className="sm:col-span-2"><dt className="font-semibold">Evidência / referência</dt><dd>{resolutionRecord.evidencia_referencia}</dd></div>
                                ) : null}
                                <div className="sm:col-span-2"><dt className="font-semibold">Avaliação de eficácia</dt><dd>{resolutionRecord.avaliacao_eficacia}</dd></div>
                              </dl>
                            ) : item.notas_resolucao ? (
                              <p className="mt-1">Registro: {item.notas_resolucao}</p>
                            ) : null}
                          </div>
                        ) : null}
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
                            onClick={() => openResolution(item)}
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

      {resolveTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="resolve-case-title">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Confirmar resolução</p>
                <h2 id="resolve-case-title" className="mt-1 text-lg font-bold text-slate-950 dark:text-white">
                  Registrar decisão antes de fechar o caso
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {resolveTarget.nome_tripulante || `Tripulante #${resolveTarget.tripulante_id}`} · {nivelLabel(resolveTarget.nivel)}
                </p>
              </div>
              <button type="button" onClick={closeResolution} disabled={resolving} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800" aria-label="Cancelar resolução">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                Responsável pelo tratamento
                <input
                  autoFocus
                  value={resolutionForm.responsavel}
                  onChange={(event) => updateResolutionField('responsavel', event.target.value)}
                  maxLength={120}
                  placeholder="Nome, função ou equipe responsável"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                Prazo
                <input
                  type="date"
                  value={resolutionForm.prazo}
                  onChange={(event) => updateResolutionField('prazo', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <label className="mt-4 block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Mitigação aplicada
              <textarea
                value={resolutionForm.acao_mitigacao}
                onChange={(event) => updateResolutionField('acao_mitigacao', event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Descreva a ação de mitigação efetivamente aplicada."
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="mt-4 block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Justificativa da decisão
              <textarea
                value={resolutionForm.justificativa}
                onChange={(event) => updateResolutionField('justificativa', event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Explique por que o caso pode ser encerrado após a mitigação."
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Evidência ou referência
              <input
                value={resolutionForm.evidencia_referencia}
                onChange={(event) => updateResolutionField('evidencia_referencia', event.target.value)}
                maxLength={500}
                placeholder="Opcional: ocorrência, FRAT, documento, protocolo ou outra referência."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="mt-4 block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Avaliação de eficácia
              <textarea
                value={resolutionForm.avaliacao_eficacia}
                onChange={(event) => updateResolutionField('avaliacao_eficacia', event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Registre como foi verificado que a mitigação tratou o risco."
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              “Visto” registra ciência. O encerramento exige mitigação e avaliação de eficácia, preservadas na trilha de auditoria.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeResolution} disabled={resolving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void resolveCase()}
                disabled={
                  resolving ||
                  resolutionForm.responsavel.trim().length < 2 ||
                  !/^\d{4}-\d{2}-\d{2}$/.test(resolutionForm.prazo) ||
                  resolutionForm.acao_mitigacao.trim().length < 10 ||
                  resolutionForm.justificativa.trim().length < 10 ||
                  resolutionForm.avaliacao_eficacia.trim().length < 10
                }
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {resolving ? 'Resolvendo…' : 'Confirmar e resolver'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppLayout>
  );
}
