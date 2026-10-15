import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, Database, ShieldAlert } from 'lucide-react';
import type { FrmsOperationalSnapshotItem, FrmsFortnightModifier } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  operationalConfidence, resolveFrmsCoordinationGuidance,
  resolveOperationalDataMoment, type FrmsDecisionBucket,
} from '../frmsOperationalDecision';

type Row = { item: FrmsOperationalSnapshotItem; bucket: FrmsDecisionBucket };
const cardBase = 'rounded-xl border px-4 py-3 dark:border-slate-700';

function verifiedIndicator(item: FrmsOperationalSnapshotItem) {
  const f = item.fortnight_indicator;
  return f && f.periodo_inicio && f.periodo_fim && f.freshness_dado === 'COMPLETO' &&
    (f.fonte_periodo === 'REAL' || f.fonte_periodo === 'DERIVADO') &&
    f.status_quinzena !== 'INCOMPLETO' ? f : null;
}

export function FrmsScoreMeter({ item, compact = false }: { item: FrmsOperationalSnapshotItem; compact?: boolean }) {
  const f = verifiedIndicator(item);
  const value = f?.score_acumulado;
  const valid = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  const pct = valid ? Math.max(0, Math.min(100, value)) : 0;
  const tone = f?.status_quinzena === 'CRITICO' ? 'bg-rose-500' : f?.status_quinzena === 'ATENCAO' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div aria-label="Índice acumulado da quinzena" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className={compact ? 'text-[11px] font-semibold text-slate-600 dark:text-slate-300' : 'text-xs font-semibold text-slate-600 dark:text-slate-300'}>
          Índice acumulado
        </span>
        <span className={compact ? 'text-base font-extrabold tabular-nums' : 'text-3xl font-extrabold tabular-nums'}>
          {valid ? value.toFixed(1).replace('.', ',') : '—'}<span className="text-xs font-medium text-slate-500"> /100</span>
        </span>
      </div>
      <div role="meter" aria-label="Escala do índice FRMS" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={valid ? pct : undefined}
        aria-valuetext={valid ? value.toFixed(1) + ' de 100' : 'não confirmado'}
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        {valid ? <div className={'h-full rounded-full ' + tone} style={{ width: pct + '%' }} /> : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>{f?.status_quinzena === 'CRITICO' ? 'Crítico' : f?.status_quinzena === 'ATENCAO' ? 'Atenção' : f?.status_quinzena === 'OK' ? 'Dentro da referência' : 'Dado parcial'}</span>
        {f?.natureza_dado === 'PROJECAO' ? <span>Projeção</span> : null}
      </div>
    </div>
  );
}

export type FrmsOverviewFilter = 'CRITICO' | 'AVALIAR' | 'CHECKIN' | 'CONFIANCA' | 'CONFIRMAR' | 'NORMAL';

export function matchesFrmsOverviewFilter(
  item: FrmsOperationalSnapshotItem,
  bucket: FrmsDecisionBucket,
  filter: FrmsOverviewFilter | null,
  todayIso: string,
): boolean {
  if (!filter) return true;
  if (filter === 'CRITICO') return bucket === 'BLOQUEIO';
  if (filter === 'AVALIAR') return bucket === 'DECISAO';
  if (filter === 'CONFIRMAR') return bucket === 'CONFIRMAR';
  if (filter === 'NORMAL') return bucket === 'NORMAL';
  if (filter === 'CONFIANCA') return operationalConfidence(item) === 'BAIXA';
  const guidance = resolveFrmsCoordinationGuidance(item, todayIso);
  return guidance.requiresCheckin && !guidance.checkinComplete;
}

export const FRMS_OVERVIEW_FILTER_LABELS: Record<FrmsOverviewFilter, string> = {
  CRITICO: 'Crítico',
  AVALIAR: 'Avaliar',
  CHECKIN: 'Check-ins pendentes',
  CONFIANCA: 'Confiança baixa',
  CONFIRMAR: 'Confirmar dados',
  NORMAL: 'Sem pendência',
};

export function FrmsOverview({
  queue, checkinPendingCount, activeFilter, onFilterChange,
}: {
  queue: Row[];
  checkinPendingCount: number;
  activeFilter: FrmsOverviewFilter | null;
  onFilterChange: (filter: FrmsOverviewFilter | null) => void;
}) {
  const critical = queue.filter(r => r.bucket === 'BLOQUEIO').length;
  const attention = queue.filter(r => r.bucket === 'DECISAO').length;
  const confirm = queue.filter(r => r.bucket === 'CONFIRMAR').length;
  const normal = queue.filter(r => r.bucket === 'NORMAL').length;
  const lowConfidence = queue.filter(r => operationalConfidence(r.item) === 'BAIXA').length;
  const buckets = [
    { key: 'CRITICO' as const, name: 'Crítico', value: critical, tone: 'border-rose-200 bg-rose-50 text-rose-800 dark:bg-rose-950/30', icon: ShieldAlert },
    { key: 'AVALIAR' as const, name: 'Avaliar', value: attention, tone: 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/30', icon: AlertTriangle },
    { key: 'CHECKIN' as const, name: 'Check-ins pendentes', value: checkinPendingCount, tone: 'border-orange-200 bg-orange-50 text-orange-900 dark:bg-orange-950/30', icon: Clock3 },
    { key: 'CONFIANCA' as const, name: 'Confiança baixa', value: lowConfidence, tone: 'border-sky-200 bg-sky-50 text-sky-900 dark:bg-sky-950/30', icon: Database },
  ].filter(card => card.value > 0);
  const cols = buckets.length === 1 ? 'lg:grid-cols-1' :
    buckets.length === 2 ? 'lg:grid-cols-2' :
      buckets.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4';
  const segments: { filter: FrmsOverviewFilter; count: number; color: string; label: string }[] = [
    { filter: 'CRITICO', count: critical, color: 'bg-rose-500', label: 'críticos' },
    { filter: 'AVALIAR', count: attention, color: 'bg-amber-500', label: 'para avaliar' },
    { filter: 'CONFIRMAR', count: confirm, color: 'bg-sky-500', label: 'para confirmar' },
    { filter: 'NORMAL', count: normal, color: 'bg-emerald-500', label: 'sem pendência indicada' },
  ].filter(s => s.count > 0);
  const select = (key: FrmsOverviewFilter) => onFilterChange(activeFilter === key ? null : key);
  return (
    <section aria-label="Visão visual da operação" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Panorama operacional</h2>
        <span className="text-xs text-slate-500">{queue.length} pessoa(s) no recorte · Clique nos indicadores para filtrar</span>
      </div>
      {buckets.length > 0 ? (
        <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2 ' + cols}>
          {buckets.map(card => (
            <button
              type="button" key={card.key} aria-pressed={activeFilter === card.key}\n              aria-label={'Filtrar fila: ' + card.name + ' (' + card.value + ')'}
              aria-controls="frms-decision-queue"
              onClick={() => select(card.key)}
              className={cardBase + ' ' + card.tone +
                ' w-full cursor-pointer text-left transition-colors hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ' +
                (activeFilter === card.key ? 'ring-2 ring-blue-600 ring-offset-1' : '')}
              title={'Filtrar fila: ' + card.name}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span className="flex items-center gap-2"><card.icon className="h-4 w-4" />{card.name}</span>
                <span aria-hidden="true" className="text-base">›</span>
              </div>
              <div className="mt-2 text-3xl font-extrabold tabular-nums">{card.value}</div>
              <div className="mt-1 text-[11px] font-semibold">{activeFilter === card.key ? 'Filtro aplicado' : 'Ver pessoas ›'}</div>
            </button>
          ))}
        </div>
      ) : null}
      {queue.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>Distribuição por prioridade · selecione uma faixa</span>
            <span>Risco e confiança são indicadores diferentes</span>
          </div>
          <div role="group" aria-label="Filtrar pela distribuição de prioridades" className="flex h-5 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
            {segments.map(segment => (
              <button
                key={segment.filter} type="button"
                aria-label={'Filtrar ' + segment.count + ' ' + segment.label}
                aria-pressed={activeFilter === segment.filter}
                aria-controls="frms-decision-queue"
                onClick={() => select(segment.filter)}
                className={segment.color + ' h-full min-w-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 ' +
                  (activeFilter === segment.filter ? 'ring-2 ring-inset ring-slate-900 dark:ring-white' : '')}
                style={{ width: (segment.count / queue.length * 100) + '%' }}
                title={'Filtrar ' + segment.label}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {segments.map(segment => (
              <button key={segment.filter} type="button" aria-pressed={activeFilter === segment.filter}
                onClick={() => select(segment.filter)} className="inline-flex items-center gap-1 rounded px-1 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                <i className={'h-2 w-2 rounded-full ' + segment.color} />
                {segment.count} {segment.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {activeFilter ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          <span>Filtro aplicado: <strong>{FRMS_OVERVIEW_FILTER_LABELS[activeFilter]}</strong>. A fila abaixo mostra apenas as pessoas correspondentes.</span>
          <button type="button" onClick={() => onFilterChange(null)} className="font-bold underline underline-offset-2">Limpar filtro</button>
        </div>
      ) : null}
    </section>
  );
}

function ModifierBar({ modifier, max, good }: { modifier: FrmsFortnightModifier; max: number; good: boolean }) {
  const amount = Number.isFinite(modifier.impacto_score) ? modifier.impacto_score : null;
  return <div className="space-y-1">
    <div className="flex justify-between gap-3 text-xs text-slate-700 dark:text-slate-200">
      <span>{modifier.descricao}</span>
      <span className="font-bold tabular-nums">{amount == null ? '—' : (amount > 0 ? '+' : '') + amount.toFixed(1).replace('.', ',') + ' pt'}</span>
    </div>
    {amount != null ? <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className={'h-full rounded-full ' + (good ? 'bg-emerald-500' : 'bg-orange-500')}
        style={{ width: (Math.abs(amount) / max * 100) + '%' }} />
    </div> : null}
  </div>;
}

export function FrmsScoreExplanation({ item }: { item: FrmsOperationalSnapshotItem }) {
  const f = verifiedIndicator(item);
  const aggravants = (f?.agravantes_aplicados || []).filter(p => p?.descricao);
  const attenuators = (f?.atenuadores_aplicados || []).filter(p => p?.descricao);
  const all = [...aggravants, ...attenuators];
  const max = Math.max(1, ...all.map(x => Number.isFinite(x.impacto_score) ? Math.abs(x.impacto_score) : 0));
  const trend = f?.tendencia;
  return <section aria-label="Composição do índice" className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-slate-950 dark:text-white">Composição do índice</h3>
      {trend && trend !== 'INDETERMINADA' ?
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {trend === 'CRESCENTE' ? <ArrowUpRight className="h-4 w-4 text-orange-600" /> : trend === 'REDUZINDO' ? <ArrowDownRight className="h-4 w-4 text-emerald-600" /> : null}
          {trend === 'CRESCENTE' ? 'Tendência crescente' : trend === 'REDUZINDO' ? 'Tendência decrescente' : 'Tendência estável'}
        </span> : null}
    </div>
    <div className="mt-3"><FrmsScoreMeter item={item} /></div>
    {f?.limite_referencia && Number.isFinite(f.limite_referencia.pct_atingido) ? (
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900">
        <div className="flex justify-between gap-2">
          <span>Consumo do limite informado · {f.limite_referencia.tipo.replace(/_/g, ' ')}</span>
          <strong>{f.limite_referencia.pct_atingido.toFixed(1).replace('.', ',')}%</strong>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div className="h-full rounded-full bg-blue-500" style={{ width: Math.max(0, Math.min(100, f.limite_referencia.pct_atingido)) + '%' }} />
        </div>
        <span>{f.limite_referencia.valor_atual} / {f.limite_referencia.valor_limite} (unidade conforme referência do motor)</span>
      </div>
    ) : null}
    {!f ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Composição não confirmada: fonte ou período parcial. Não estimamos pontos.</p>
      : all.length === 0 ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">O motor não forneceu modificadores individuais para este período.</p>
        : <div className="mt-4 space-y-4">
          {aggravants.length > 0 && <div className="space-y-2">
            <p className="text-xs font-bold text-orange-700">Agravantes registrados</p>
            {aggravants.map((m, i) => <ModifierBar key={m.codigo + i} modifier={m} max={max} good={false} />)}
          </div>}
          {attenuators.length > 0 && <div className="space-y-2">
            <p className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Fatores favoráveis / atenuadores</p>
            {attenuators.map((m, i) => <ModifierBar key={m.codigo + i} modifier={m} max={max} good />)}
          </div>}
          <p className="text-[11px] text-slate-500">Impactos em pontos informados pelo motor. Não representam sozinhos a fórmula completa nem garantem aptidão.</p>
        </div>}
  </section>;
}

export function FrmsEvidenceActions({ item, todayIso }: { item: FrmsOperationalSnapshotItem; todayIso: string }) {
  const guidance = resolveFrmsCoordinationGuidance(item, todayIso);
  const confidence = operationalConfidence(item);
  const moment = resolveOperationalDataMoment(item, todayIso);
  const gaps: string[] = [];
  if (guidance.requiresCheckin && !guidance.checkinComplete) gaps.push('Solicitar check-in diário');
  if (item.escala_source === 'AUSENTE') gaps.push('Conferir escala na origem');
  if (item.jornada_data_source === 'AUSENTE') gaps.push(moment === 'DIA_EM_ABERTO' ? 'Conferir jornada após a operação' : 'Confirmar jornada realizada na origem');
  if (item.jornada_data_source === 'INCONSISTENTE') gaps.push('Corrigir divergência de jornada');
  if (item.sleep_data_source === 'AUSENTE') gaps.push('Conferir dado de sono');
  if (item.fatorizacao_status === 'AUSENTE') gaps.push('Verificar fatorização do período');
  if (item.operational_data_source === 'SIGVOOS' || item.operational_data_source === 'CONTROLE_VOOS_COM_FALLBACK_SIGVOOS') gaps.push('Confirmar atualização do SIGVOOS, se relevante');
  const unique = Array.from(new Set(gaps));
  return <section aria-label="Confiança e próximos passos" className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-bold">Dados e próxima ação</h3>
      <span className={'rounded-full px-2.5 py-1 text-xs font-bold ' + (confidence === 'ALTA' ? 'bg-emerald-100 text-emerald-800' : confidence === 'MEDIA' ? 'bg-sky-100 text-sky-800' : 'bg-indigo-100 text-indigo-900')}>
        Confiança {confidence.toLowerCase()}
      </span>
    </div>
    <p className="mt-2 text-xs text-slate-500">Confiança é a completude/confiabilidade da evidência, não um percentual de risco.</p>
    {unique.length ? <ol className="mt-3 space-y-2">
      {unique.slice(0, 5).map((g, i) => <li key={g} className="flex items-center gap-2 text-sm">
        <span className="grid h-6 w-6 flex-none place-content-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">{i + 1}</span>{g}
      </li>)}
    </ol> : <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Sem lacuna adicional identificada nestas fontes.</p>}
    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      Decisão humana: {guidance.action}
    </p>
    <p className="mt-2 text-xs text-slate-500">Responsável e prazo definidos pela Coordenação; o painel não atribui nem libera voo automaticamente.</p>
  </section>;
}
