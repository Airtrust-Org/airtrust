import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import {
  useFrmsOperationalSnapshot,
  type FrmsOperationalSnapshotItem,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';
import FrmsWorkspaceNav from './components/FrmsWorkspaceNav';
import { FrmsSignalChips, FrmsSignalGrid } from './components/FrmsOperationalSignals';
import {
  bucketPriority,
  classifyOperationalItem,
  isOperationallyRelevant,
  operationalConfidence,
  resolveOperationalDataMoment,
  type FrmsDecisionBucket,
} from './frmsOperationalDecision';
import { formatFrmsReason, formatSnapshotSource } from './frmsPresentation';

const BUCKET_STYLE: Record<
  FrmsDecisionBucket,
  { label: string; short: string; className: string; dot: string }
> = {
  BLOQUEIO: {
    label: 'Atenção operacional',
    short: 'Atenção',
    className: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
    dot: 'bg-red-500',
  },
  DECISAO: {
    label: 'Avaliar condição',
    short: 'Avaliar',
    className:
      'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200',
    dot: 'bg-orange-500',
  },
  CONFIRMAR: {
    label: 'Verificar dados',
    short: 'Verificar',
    className:
      'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
    dot: 'bg-amber-400',
  },
  NORMAL: {
    label: 'Sem pendência',
    short: 'Sem pendência',
    className:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
};

function localTodayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isOperationalDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatUpdated(value: string | null): string {
  if (!value) return 'ainda não atualizado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'horário indisponível';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function displayName(item: FrmsOperationalSnapshotItem): string {
  return item.nome_guerra?.trim() || item.nome?.trim() || `Tripulante #${item.tripulante_id}`;
}

function operationalSourceLabel(source: FrmsOperationalSnapshotItem['operational_data_source']): string {
  if (source === 'CONTROLE_VOOS') return 'Controle de Voos';
  if (source === 'CONTROLE_VOOS_COM_FALLBACK_SIGVOOS') return 'Controle de Voos + fallback SIGVOOS';
  if (source === 'SIGVOOS') return 'SIGVOOS (fallback)';
  return 'sem dado de voo';
}

function confidenceGaps(item: FrmsOperationalSnapshotItem, todayIso: string): string[] {
  const gaps: string[] = [];
  const moment = resolveOperationalDataMoment(item, todayIso);

  if (item.escala_source === 'AUSENTE') gaps.push('sem escala canônica');
  if (item.jornada_data_source === 'AUSENTE') {
    gaps.push(moment === 'DIA_EM_ABERTO' ? 'jornada aguardando encerramento' : 'sem jornada');
  }
  else if (/ESTIM/i.test(String(item.jornada_data_source))) gaps.push('jornada estimada');
  if (item.checkin_status !== 'RECEBIDO') gaps.push('sem check-in confirmado');
  if (item.sleep_data_source === 'AUSENTE') gaps.push('sem dado de sono');
  else if (/ESTIM/i.test(String(item.sleep_data_source))) gaps.push('sono estimado');

  return gaps;
}

function formatMinutes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(Math.max(0, value) / 60).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;
}

function dataMomentCopy(moment: ReturnType<typeof resolveOperationalDataMoment>): {
  title: string;
  text: string;
} | null {
  switch (moment) {
    case 'DIA_EM_ABERTO':
      return {
        title: 'Dia em acompanhamento',
        text: 'O check-in apoia a decisão pré-missão. A jornada realizada é confirmada após o encerramento; se não houver voo, a condição de hoje é declarada no próximo check-in.',
      };
    case 'PROGRAMADO':
      return {
        title: 'Atividade planejada',
        text: 'A evidência realizada ainda não é esperada. No dia da operação, confirme o check-in; após o encerramento, a jornada ou atividade fecha o acumulado.',
      };
    case 'FECHAMENTO_RETROSPECTIVO_PENDENTE':
      return {
        title: 'Fechamento retrospectivo pendente',
        text: 'A data já passou. Confirme a jornada na fonte de voo ou registre a atividade sem voo no check-in seguinte para fechar o acumulado.',
      };
    default:
      return null;
  }
}

function MetricCard({
  label,
  value,
  helper,
  loading,
}: {
  label: string;
  value: number;
  helper: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-3xl font-bold tabular-nums text-slate-950 dark:text-white">
        {loading ? '—' : value}
      </div>
      <p className="mt-1 text-xs text-slate-500">{loading ? 'Carregando situação…' : helper}</p>
    </div>
  );
}

function DecisionBadge({ bucket }: { bucket: FrmsDecisionBucket }) {
  const style = BUCKET_STYLE[bucket];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${style.className}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.short}
    </span>
  );
}

function DetailDrawer({
  item,
  onClose,
  todayIso,
}: {
  item: FrmsOperationalSnapshotItem;
  onClose: () => void;
  todayIso: string;
}) {
  const bucket = classifyOperationalItem(item);
  const confidence = operationalConfidence(item);
  const dataMoment = resolveOperationalDataMoment(item, todayIso);
  const momentCopy = dataMomentCopy(dataMoment);
  const dayIsOpen = dataMoment === 'DIA_EM_ABERTO';
  const jornadaDeclaradaNoCheckin =
    item.jornada_data_source === 'AUSENTE' &&
    item.checkin_status === 'RECEBIDO' &&
    Boolean(item.hora_apresentacao);
  const reasons = (item.motivos_principais?.filter(Boolean) || []).map(formatFrmsReason);
  const gaps = confidenceGaps(item, todayIso);
  const decisionIsLimited = confidence === 'BAIXA';
  const date = item.data_operacional;
  const sourceFacts = [
    {
      label: 'Escala',
      value: formatSnapshotSource(item.escala_source),
      missing: item.escala_source === 'AUSENTE',
      missingLabel: 'ausente',
    },
    {
      label: 'Jornada',
      value: formatSnapshotSource(item.jornada_data_source),
      missing: item.jornada_data_source === 'AUSENTE',
      missingLabel: dayIsOpen ? 'aguardando fechamento' : 'ausente',
    },
    {
      label: 'Sono',
      value: formatSnapshotSource(item.sleep_data_source),
      missing: item.sleep_data_source === 'AUSENTE',
      missingLabel: 'ausente',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true">
      <button aria-label="Fechar detalhes" className="flex-1 cursor-default" onClick={onClose} />
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 p-5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div>
            <DecisionBadge bucket={bucket} />
            <h2 className="mt-3 text-xl font-bold text-slate-950 dark:text-white">{displayName(item)}</h2>
            <p className="text-sm text-slate-500">
              {[item.funcao, item.base, item.aeronave].filter(Boolean).join(' · ') || 'Dados funcionais não informados'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {momentCopy ? (
            <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-800 dark:text-blue-200">
                <Clock3 className="h-4 w-4" /> {momentCopy.title}
              </h3>
              <p className="mt-2 leading-relaxed">{momentCopy.text}</p>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Status operacional do dia</h3>
            <FrmsSignalGrid item={item} className="mt-3" />
          </section>

          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {dayIsOpen && decisionIsLimited
                ? 'Confirmações restantes para o fechamento'
                : decisionIsLimited
                  ? 'Pendências que limitam a decisão'
                  : 'Por que exige atenção'}
            </h3>
            {reasons.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-800 dark:text-slate-200">
                {reasons.slice(0, 5).map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-500" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Nenhum motivo adicional foi registrado para este estado.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Ação operacional</h3>
            <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
              {dayIsOpen && bucket === 'CONFIRMAR'
                ? 'Confirmar escala e condição pré-missão; fechar a jornada após a atividade.'
                : item.acao_recomendada_texto ||
                (bucket === 'NORMAL' ? 'Nenhuma ação imediata.' : 'Revisar o caso antes da decisão operacional.')}
            </p>
            {dayIsOpen && decisionIsLimited ? (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                <p className="font-bold">Sem liberação final baseada na jornada</p>
                <p className="mt-1">
                  A ausência de jornada realizada durante o dia é esperada. Antes da missão, confirme a escala e o check-in; após a atividade, confirme a jornada ou a atividade sem voo para atualizar o acumulado.
                </p>
              </div>
            ) : decisionIsLimited ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <p className="font-bold">Decisão não confirmada</p>
                <p className="mt-1">
                  Não confirmar aptidão, liberação ou ausência de restrição com este registro. Primeiro confirme na origem os itens listados acima. Se já houver um caso FRMS aplicável, registre nele o tratamento e a decisão.
                </p>
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Clock3 className="h-4 w-4" /> {jornadaDeclaradaNoCheckin ? 'Horário declarado' : 'Jornada'}
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {item.hora_apresentacao || '—'} → {item.hora_termino || '—'}
              </p>
              {jornadaDeclaradaNoCheckin ? (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                  Informado no check-in; a escala e a jornada ainda precisam ser confirmadas.
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-500">Sono</div>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {item.horas_sono == null ? 'Não informado' : `${item.horas_sono.toFixed(1)} h`}
              </p>
            </div>
          </section>

          {item.fortnight_indicator ? (
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Acumulado já registrado no período</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Voo</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatMinutes(item.fortnight_indicator.horas_voo_periodo_min)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Atividade</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{formatMinutes(item.fortnight_indicator.atividade_frms_periodo_min ?? item.fortnight_indicator.duty_time_periodo_min)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Dias ativos</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{item.fortnight_indicator.dias_atividade_periodo ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Consecutivos</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">{item.fortnight_indicator.dias_consecutivos_com_atividade ?? '—'}</p>
                </div>
              </div>
              {dayIsOpen ? (
                <p className="mt-3 text-xs text-slate-500">
                  A jornada em aberto deste dia ainda não entra nesses totais. Eles refletem somente atividade já registrada no período.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Database className="h-4 w-4" /> Fonte e confiança
              </h3>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  confidence === 'ALTA'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                    : confidence === 'MEDIA'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200'
                }`}
              >
                Confiança {confidence.toLowerCase()}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {sourceFacts.map((fact) => (
                <span
                  key={fact.label}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    fact.missing
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  {fact.label}: {fact.missing ? fact.missingLabel : fact.value}
                </span>
              ))}
            </div>
            {decisionIsLimited ? (
              <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-200">
                Dados insuficientes para confirmar a decisão. Sinais verdes indicam dados favoráveis já apurados, mas não substituem os dados que ainda estão pendentes.
              </p>
            ) : null}
            {gaps.length > 0 ? (
              <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-200">
                Falta: {gaps.join(' · ')}
              </p>
            ) : !decisionIsLimited ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Dados essenciais disponíveis para a decisão.</p>
            ) : null}
            {item.operational_data_source && item.operational_data_source !== 'AUSENTE' ? (
              <p className="mt-1 text-xs text-slate-500">
                Fonte dos dados de voo: {operationalSourceLabel(item.operational_data_source)}
              </p>
            ) : null}
          </section>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Consultas secundárias — abrem outra tela
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                to={`/frms/tripulante/${item.tripulante_id}?origem=operacao&data=${encodeURIComponent(date)}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Abrir histórico (outra tela)
              </Link>
              <Link
                to={`/frms/alertas?tripulante_id=${item.tripulante_id}`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Consultar casos relacionados (outra tela)
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function FrmsFlightDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDate = searchParams.get('data');
  const requestedFuncionarioId = searchParams.get('funcionario_id');
  const legacyControlRoute = searchParams.get('origem') === 'controle-operacional-legado';
  const date = isOperationalDate(requestedDate) ? requestedDate : localTodayIso();
  const todayIso = localTodayIso();
  const [selected, setSelected] = useState<FrmsOperationalSnapshotItem | null>(null);

  useEffect(() => {
    if (requestedDate === date) return;
    const next = new URLSearchParams(searchParams);
    next.set('data', date);
    setSearchParams(next, { replace: true });
  }, [date, requestedDate, searchParams, setSearchParams]);

  const snapshot = useFrmsOperationalSnapshot({
    data_inicio: date,
    data_fim: date,
    include_inconsistencies: true,
  });

  const queue = useMemo(() => {
    return snapshot.data
      .filter(isOperationallyRelevant)
      .map((item) => ({ item, bucket: classifyOperationalItem(item) }))
      .sort((a, b) => {
        const priority = bucketPriority(a.bucket) - bucketPriority(b.bucket);
        if (priority !== 0) return priority;
        return String(a.item.hora_apresentacao || '99:99').localeCompare(String(b.item.hora_apresentacao || '99:99'));
      });
  }, [snapshot.data]);

  useEffect(() => {
    if (!requestedFuncionarioId || selected || snapshot.data.length === 0) return;
    const match = snapshot.data.find(
      (item) => String(item.tripulante_id) === String(requestedFuncionarioId),
    );
    if (match) setSelected(match);
  }, [requestedFuncionarioId, selected, snapshot.data]);

  const counts = useMemo(
    () =>
      queue.reduce(
        (acc, entry) => {
          acc[entry.bucket] += 1;
          return acc;
        },
        { BLOQUEIO: 0, DECISAO: 0, CONFIRMAR: 0, NORMAL: 0 } as Record<FrmsDecisionBucket, number>,
      ),
    [queue],
  );

  const firstLoad = snapshot.loading && snapshot.data.length === 0 && !snapshot.lastUpdatedAt;
  const snapshotUnavailable = Boolean(snapshot.error && snapshot.data.length === 0);

  return (
    <AppLayout>
      <div className="space-y-5">
        <FrmsWorkspaceNav />

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">FRMS</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Operação</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Exceções que exigem decisão, confirmação ou bloqueio. O que está normal fica em segundo plano.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Dia operacional
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams);
                  next.set('data', event.target.value);
                  setSearchParams(next);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void snapshot.refetch()}
              disabled={snapshot.loading}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <RefreshCw className={`h-4 w-4 ${snapshot.loading ? 'animate-spin' : ''}`} />
              Atualizar dados
            </button>
          </div>
        </header>

        {date === todayIso ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
            <span className="font-bold">Leitura do dia em curso.</span>{' '}
            O check-in apoia a decisão antes da missão. A jornada realizada fecha depois da operação; em dia sem voo, a pessoa registra a atividade de hoje no próximo check-in. O acumulado usa somente atividade já registrada.
          </div>
        ) : null}

        {legacyControlRoute ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            Controle Operacional foi consolidado nesta tela de Operação FRMS. Os filtros de data e tripulante da rota anterior foram preservados.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60">
          <span>Fonte: snapshot operacional único</span>
          <span>Atualizado às {formatUpdated(snapshot.lastUpdatedAt)}</span>
          {snapshot.meta?.scope === 'self' ? <span>Escopo: meus dados</span> : <span>Escopo: equipe autorizada</span>}
          {snapshot.error ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              {snapshot.data.length > 0
                ? 'Falha na última atualização — mantendo o último estado válido'
                : `Falha ao carregar a situação FRMS: ${snapshot.error}`}
            </span>
          ) : null}
        </div>

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo operacional">
          <MetricCard label="Atenção" value={counts.BLOQUEIO} helper="situações que requerem atenção antes da decisão operacional" loading={firstLoad || snapshotUnavailable} />
          <MetricCard label="Avaliar" value={counts.DECISAO} helper="situações que merecem análise ou ação da coordenação" loading={firstLoad || snapshotUnavailable} />
          <MetricCard label="Verificar" value={counts.CONFIRMAR} helper="informações pendentes, estimadas ou que precisam ser confirmadas" loading={firstLoad || snapshotUnavailable} />
        </section>
        <p className="text-sm text-slate-500">
          {snapshotUnavailable ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              Situação operacional indisponível — não interpretar como zero pendências.
            </span>
          ) : (
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{firstLoad ? '—' : counts.NORMAL}</span>{' '}
              pessoa(s) sem pendência no recorte atual.
            </>
          )}
        </p>

        {snapshot.unauthorized ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            Você não possui acesso ao escopo solicitado do FRMS.
          </div>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Fila de decisão</h2>
              <p className="text-xs text-slate-500">
                Ordenada por gravidade e horário de apresentação. Abra o registro para ver motivo, dados de origem e ação esperada.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/frms/conceitos"
                className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                Como interpretar
              </Link>
              {!firstLoad ? <span className="text-xs font-semibold text-slate-500">{queue.length} pessoa(s)</span> : null}
            </div>
          </div>

          {firstLoad ? (
            <div className="space-y-3 p-4" aria-label="Carregando situação operacional">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-900" />
              ))}
            </div>
          ) : snapshot.error && snapshot.data.length === 0 ? (
            <div className="p-10 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
              <h3 className="mt-3 font-bold text-slate-900 dark:text-white">Situação FRMS indisponível</h3>
              <p className="mt-1 text-sm text-slate-500">{snapshot.error}</p>
            </div>
          ) : queue.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <h3 className="mt-3 font-bold text-slate-900 dark:text-white">Nenhuma pendência operacional no recorte</h3>
              <p className="mt-1 text-sm text-slate-500">Não há pessoas escaladas, com jornada ou alerta que exijam atenção neste dia.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {queue.map(({ item, bucket }) => {
                const confidence = operationalConfidence(item);
                const dataMoment = resolveOperationalDataMoment(item, todayIso);
                const isOpenDayConfirmation = dataMoment === 'DIA_EM_ABERTO' && bucket === 'CONFIRMAR';
                const reason = isOpenDayConfirmation
                  ? 'Dia em acompanhamento — jornada real será confirmada após a operação.'
                  : item.motivos_principais?.[0] ? formatFrmsReason(item.motivos_principais[0]) :
                    (bucket === 'NORMAL' ? 'Sem pendência operacional identificada.' : 'Revisão operacional necessária.');
                const actionText = isOpenDayConfirmation
                  ? 'Confirmar escala e check-in antes da missão; fechar jornada após a atividade.'
                  : item.acao_recomendada_texto || 'Abrir o registro para avaliar.';

                return (
                  <button
                    key={`${item.tripulante_id}-${item.data_operacional}`}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-900/60 dark:focus:bg-slate-900/60 lg:grid-cols-[130px_minmax(150px,0.9fr)_minmax(260px,1.4fr)_minmax(220px,1.3fr)_160px_24px] lg:items-center"
                  >
                    <div><DecisionBadge bucket={bucket} /></div>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-950 dark:text-white">{displayName(item)}</p>
                      <p className="truncate text-xs text-slate-500">{[item.funcao, item.base, item.aeronave].filter(Boolean).join(' · ') || 'Função/base não informadas'}</p>
                    </div>
                    <FrmsSignalChips item={item} decisionBucket={bucket} />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium text-slate-700 dark:text-slate-200">{reason}</p>
                      <p className="mt-1 text-xs text-slate-500">{actionText}</p>
                    </div>
                    <div className="text-xs text-slate-500">
                      <div>{item.hora_apresentacao ? `Apresentação ${item.hora_apresentacao}` : 'Apresentação —'}</div>
                      <div className="mt-1">Confiança {confidence.toLowerCase()}</div>
                      <div className="mt-1">Fonte: {operationalSourceLabel(item.operational_data_source)}</div>
                    </div>
                    <ChevronRight className="hidden h-4 w-4 text-slate-400 lg:block" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <ShieldAlert className="h-5 w-5 flex-none text-red-500" />
            <div><p className="text-sm font-bold text-slate-900 dark:text-white">Atenção</p><p className="text-xs text-slate-500">Situações que requerem atenção antes da decisão operacional.</p></div>
          </div>
          <div className="flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <AlertTriangle className="h-5 w-5 flex-none text-orange-500" />
            <div><p className="text-sm font-bold text-slate-900 dark:text-white">Avaliar</p><p className="text-xs text-slate-500">Situações que merecem análise ou ação da coordenação.</p></div>
          </div>
          <div className="flex gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <CircleHelp className="h-5 w-5 flex-none text-amber-500" />
            <div><p className="text-sm font-bold text-slate-900 dark:text-white">Verificar</p><p className="text-xs text-slate-500">Informações pendentes, estimadas ou que precisam ser confirmadas.</p></div>
          </div>
        </div>
      </div>

      {selected ? <DetailDrawer item={selected} onClose={() => setSelected(null)} todayIso={todayIso} /> : null}
    </AppLayout>
  );
}
