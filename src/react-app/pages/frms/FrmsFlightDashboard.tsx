import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  RefreshCw,
  X,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import {
  useFrmsOperationalSnapshot,
  type FrmsOperationalSnapshotItem,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';
import FrmsWorkspaceNav from './components/FrmsWorkspaceNav';
import { FrmsSignalGrid } from './components/FrmsOperationalSignals';
import { FrmsOverview, FrmsScoreMeter, FrmsScoreExplanation, FrmsEvidenceActions, matchesFrmsOverviewFilter, type FrmsOverviewFilter, FRMS_OVERVIEW_FILTER_LABELS } from './components/FrmsVisualTriage';
import {
  bucketPriority,
  classifyOperationalItem,
  isOperationallyRelevant,
  isOutsideFortnightOperationalExtension,
  operationalConfidence,
  resolveFrmsCoordinationGuidance,
  resolveFrmsActionLane,
  resolveOperationalDataMoment,
  type FrmsActionLane,
  type FrmsDecisionBucket,
} from './frmsOperationalDecision';
import { formatFrmsReason, formatSnapshotSource } from './frmsPresentation';
import { frmsBrazilOperationalTodayIso } from './frmsOperationalDate';
import { frmsAttentionFacts, isFrmsRoutineDutyClosurePending } from './frmsEvidenceContext';

const ACTION_LANES: { key: FrmsActionLane; title: string; explanation: string }[] = [
  { key: 'REVISAO', title: 'Revisão operacional', explanation: 'Sinais de atenção ou risco: avaliar antes da decisão.' },
  { key: 'CHECKIN', title: 'Check-in do dia', explanation: 'Avaliação diária ainda não confirmada; conferir antes da atividade.' },
  { key: 'EVIDENCIA', title: 'Confirmar evidência', explanation: 'Dados passados, estimados ou divergentes precisam de conferência.' },
  { key: 'AGUARDAR', title: 'Aguardar a operação', explanation: 'Atividade futura ou encerramento ainda esperado; não é atraso.' },
  { key: 'SEM_ACAO', title: 'Sem ação agora', explanation: 'Nenhuma pendência apontada; não equivale a autorização de voo.' },
];

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

function fortnightSummary(item: FrmsOperationalSnapshotItem): { status: string; activity: string; period: string | null; score: string | null } {
  const indicator = item.fortnight_indicator;
  const period = indicator?.periodo_inicio && indicator?.periodo_fim
    ? `${indicator.periodo_inicio.slice(8, 10)}/${indicator.periodo_inicio.slice(5, 7)} a ${indicator.periodo_fim.slice(8, 10)}/${indicator.periodo_fim.slice(5, 7)}`
    : null;
  const hasSource = indicator != null &&
    ['REAL', 'DERIVADO', 'ESTIMADO'].includes(indicator.fonte_periodo) &&
    indicator.freshness_dado !== 'AUSENTE';
  const completeEvidence = hasSource && indicator.freshness_dado === 'COMPLETO' && indicator.fonte_periodo !== 'ESTIMADO';
  const status = !period || !indicator ? 'Período não confirmado'
    : indicator.status_quinzena === 'CRITICO' ? 'Atenção crítica'
      : indicator.status_quinzena === 'ATENCAO' ? 'Exige atenção'
        : !hasSource ? 'Fonte do período não confirmada'
          : !completeEvidence ? 'Avaliação parcial — confirmar dados'
            : indicator.status_quinzena === 'OK' ? 'Sem alerta no indicador'
              : 'Avaliação incompleta';
  const minutes = indicator?.atividade_frms_periodo_min ?? indicator?.duty_time_periodo_min;
  const activity = indicator && hasSource &&
    minutes != null && Number.isFinite(minutes) && minutes >= 0
    ? `${formatMinutes(minutes)} de atividade registrada${(!completeEvidence || indicator.status_quinzena === 'INCOMPLETO') ? ' (parcial)' : ''}`
    : 'Atividade acumulada não confirmada';
  const score = indicator && completeEvidence && indicator.status_quinzena !== 'INCOMPLETO' &&
    indicator.score_acumulado != null && Number.isFinite(indicator.score_acumulado)
    ? `Índice operacional acumulado: ${indicator.score_acumulado.toFixed(1).replace('.', ',')}/100${indicator.natureza_dado === 'PROJECAO' ? ' (projeção)' : ''}`
    : null;
  return { status, activity, period, score };
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
  const outsideFortnightExtension = isOutsideFortnightOperationalExtension(item);
  const jornadaDeclaradaNoCheckin =
    item.jornada_data_source === 'AUSENTE' &&
    item.checkin_status === 'RECEBIDO' &&
    Boolean(item.hora_apresentacao);
  const reasons = (item.motivos_principais?.filter(Boolean) || []).map(formatFrmsReason);
  const gaps = confidenceGaps(item, todayIso);
  const decisionIsLimited = confidence === 'BAIXA';
  const guidance = resolveFrmsCoordinationGuidance(item, todayIso);
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
          <section aria-label="Síntese para decisão" className={decisionIsLimited
              ? 'rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100'
              : bucket === 'BLOQUEIO' || bucket === 'DECISAO'
                ? 'rounded-xl border-2 border-red-300 bg-red-50 p-4 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100'
                : 'rounded-xl border-2 border-slate-300 bg-slate-50 p-4 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white'}>
            <h3 className="text-xs font-bold uppercase tracking-wide">O que é possível concluir agora?</h3>
            <p className="mt-2 text-lg font-bold">
              {decisionIsLimited
                ? 'Decisão não confirmável com os dados disponíveis'
                : bucket === 'BLOQUEIO' || bucket === 'DECISAO'
                  ? 'Revisão operacional necessária'
                  : bucket === 'CONFIRMAR' ? 'Aguardando confirmação de dados' : 'Sem pendência FRMS identificada'}
            </p>
            <p className="mt-2 line-clamp-2 text-sm" title={guidance.reason}>{guidance.reason}</p>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-semibold">Entenda esta decisão</summary>
              <p className="mt-2 text-sm"><strong>Próxima providência:</strong> {guidance.action}</p>
              {gaps.length > 0 ? <p className="mt-2"><strong>Dados a conferir:</strong> {gaps.join(' · ')}.</p> : null}
              {decisionIsLimited ? <p className="mt-2 font-bold">Indicadores favoráveis abaixo são apenas sinais parciais: não comprovam aptidão nem autorizam liberação.</p> : null}
              <p className="mt-2">Responsável e prazo devem ser definidos pela Coordenação; não foram atribuídos automaticamente.</p>
            </details>
          </section>

          <FrmsScoreExplanation item={item} />
          <FrmsEvidenceActions item={item} todayIso={todayIso} />

          {outsideFortnightExtension ? (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" /> Fora da quinzena ativa
              </h3>
              <p className="mt-2 font-bold">Esta atividade é uma extensão operacional autorizada?</p>
              <p className="mt-1 leading-relaxed">
                O tripulante não está vinculado à quinzena desta data, mas existe escala, jornada ou atividade operacional. Confirme com a coordenação se houve extensão de trabalho; caso contrário, corrija a origem operacional. Um check-in isolado é armazenado, mas não coloca o tripulante nesta fila.
              </p>
            </section>
          ) : null}

          {momentCopy ? (
            <details className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-blue-800 dark:text-blue-200">{momentCopy.title}</summary>
              <p className="mt-2 leading-relaxed">{momentCopy.text}</p>
            </details>
          ) : null}

          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Indicadores de apoio — não substituem a decisão humana</h3>
            <FrmsSignalGrid item={item} className="mt-3" />
          </section>

          <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">Mais motivos e evidências</summary>
            <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
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
          </details>

          <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">Orientação completa</summary>
            <h3 className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Ação operacional</h3>
            <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">
              {guidance.action}
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
          </details>

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
                  Início informado no check-in. Sem voo e sem corte de motor registrado, não existe horário de encerramento automático: a atividade efetivamente realizada precisa ser confirmada. Se houver voo, o término será 30 minutos após o último corte registrado.
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

          <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">Fontes técnicas e justificativas</summary>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
                      ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
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
          </details>

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
  const date = isOperationalDate(requestedDate) ? requestedDate : frmsBrazilOperationalTodayIso();
  const todayIso = frmsBrazilOperationalTodayIso();
  const [selected, setSelected] = useState<FrmsOperationalSnapshotItem | null>(null);
  const [onlyPendingCheckin, setOnlyPendingCheckin] = useState(false);
  const [actionFilter, setActionFilter] = useState<FrmsActionLane | 'TODOS'>('TODOS');
  const [overviewFilter, setOverviewFilter] = useState<FrmsOverviewFilter | null>(null);

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
      .map((item) => ({ item, bucket: classifyOperationalItem(item), lane: resolveFrmsActionLane(item, todayIso) }))
      .sort((a, b) => {
        const laneRank = ACTION_LANES.findIndex((entry) => entry.key === a.lane) - ACTION_LANES.findIndex((entry) => entry.key === b.lane);
        if (laneRank !== 0) return laneRank;
        const priority = bucketPriority(a.bucket) - bucketPriority(b.bucket);
        if (priority !== 0) return priority;
        return String(a.item.hora_apresentacao || '99:99').localeCompare(String(b.item.hora_apresentacao || '99:99'));
      });
  }, [snapshot.data, todayIso]);

  useEffect(() => {
    if (!requestedFuncionarioId || selected || snapshot.data.length === 0) return;
    const match = snapshot.data.find(
      (item) =>
        String(item.tripulante_id) === String(requestedFuncionarioId) &&
        isOperationallyRelevant(item),
    );
    if (match) setSelected(match);
  }, [requestedFuncionarioId, selected, snapshot.data]);

  const visibleQueue = useMemo(() => queue.filter(({ item, lane, bucket }) =>
    overviewFilter
      ? matchesFrmsOverviewFilter(item, bucket, overviewFilter, todayIso)
      : onlyPendingCheckin
        ? resolveFrmsCoordinationGuidance(item, todayIso).requiresCheckin && item.checkin_status !== 'RECEBIDO'
        : actionFilter === 'TODOS' || lane === actionFilter,
  ), [queue, onlyPendingCheckin, actionFilter, overviewFilter, todayIso]);
  const changeOverviewFilter = (next: FrmsOverviewFilter | null) => {
    setOverviewFilter(next);
    setOnlyPendingCheckin(false);
    setActionFilter('TODOS');
  };
  const checkinPendingCount = queue.filter(({ item }) =>
    resolveFrmsCoordinationGuidance(item, todayIso).requiresCheckin &&
    item.checkin_status !== 'RECEBIDO').length;

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

  const laneCounts = queue.reduce((acc, entry) => {
    acc[entry.lane] += 1;
    return acc;
  }, { REVISAO: 0, CHECKIN: 0, EVIDENCIA: 0, AGUARDAR: 0, SEM_ACAO: 0 } as Record<FrmsActionLane, number>);
  const activeLanes = ACTION_LANES.filter((lane) => laneCounts[lane.key] > 0);
  const fortnightPeriods = Array.from(new Set(queue.map(({ item }) => fortnightSummary(item).period).filter(
    (value): value is string => value !== null,
  )));
  const periodLabel = fortnightPeriods.length === 1
    ? fortnightPeriods[0]
    : fortnightPeriods.length > 1 ? 'períodos individuais distintos' : 'período não confirmado';
  const evaluatedFortnightCount = queue.filter(({ item }) => {
    const indicator = item.fortnight_indicator;
    return Boolean(indicator?.periodo_inicio && indicator.periodo_fim &&
      ['REAL', 'DERIVADO'].includes(indicator.fonte_periodo) && indicator.freshness_dado === 'COMPLETO' &&
      (indicator.status_quinzena === 'OK' || indicator.status_quinzena === 'ATENCAO' ||
        indicator.status_quinzena === 'CRITICO'));
  }).length;
  const criticalFortnightCount = queue.filter(({ item }) => item.fortnight_indicator?.status_quinzena === 'CRITICO').length;
  const attentionFortnightCount = queue.filter(({ item }) => item.fortnight_indicator?.status_quinzena === 'ATENCAO').length;
  const usesSigvoos = queue.some(({ item }) => item.operational_data_source === 'SIGVOOS' ||
    item.operational_data_source === 'CONTROLE_VOOS_COM_FALLBACK_SIGVOOS');

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
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Prioridades, evidências e ações por pessoa.</p>
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
          <details className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            <summary className="cursor-pointer font-semibold">Entenda os dados do dia</summary>
            <p className="mt-2"><strong>Leitura do dia em curso.</strong> O check-in apoia a decisão antes da missão. A jornada realizada fecha depois da operação; em dia sem voo, a pessoa registra a atividade de hoje no próximo check-in. O acumulado usa somente atividade já registrada.</p>
          </details>
        ) : null}

        {legacyControlRoute ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            Controle Operacional foi consolidado nesta tela diária. A data inicial e o tripulante do link antigo foram preservados, quando informados. Se o link original usava um intervalo, esta tela exibe apenas o primeiro dia; escolha outra data para consultar os demais.
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/60">
          <span>Fonte: snapshot operacional único</span>
          <span>Snapshot atualizado às {formatUpdated(snapshot.lastUpdatedAt)} (horário do navegador)</span>
          {usesSigvoos ? <span className="font-semibold text-amber-800 dark:text-amber-200">Atualização individual do SIGVOOS não informada neste painel; confirmar na origem se necessário.</span> : null}
          {snapshot.meta?.scope === 'self' ? <span>Escopo: meus dados</span> : <span>Escopo: equipe autorizada</span>}
          {snapshot.error ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              {snapshot.data.length > 0
                ? 'Falha na última atualização — mantendo o último estado válido'
                : `Falha ao carregar a situação FRMS: ${snapshot.error}`}
            </span>
          ) : null}
        </div>

        {!firstLoad && !snapshotUnavailable ? <FrmsOverview queue={queue} checkinPendingCount={checkinPendingCount} activeFilter={overviewFilter} onFilterChange={changeOverviewFilter} todayIso={todayIso} /> : null}

        <section className="space-y-3" aria-label="Resumo operacional">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">O que precisa acontecer agora?</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {firstLoad || snapshotUnavailable ? 'Aguardando dados confiáveis da equipe.' :
                  `${queue.length} pessoa(s) no acompanhamento · ${checkinPendingCount} check-in(s) a receber.`}
              </p>
            </div>
            <button type="button" onClick={() => { setOnlyPendingCheckin(false); setActionFilter('TODOS'); setOverviewFilter(null); }}
              className="text-sm font-semibold text-primary underline-offset-2 hover:underline">Mostrar todas as situações</button>
          </div>
          {firstLoad || snapshotUnavailable ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {snapshotUnavailable ? 'Situação operacional indisponível — não interpretar como zero pendências.' : 'Carregando prioridades e evidências.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2" aria-label="Filtros por providência">
              {activeLanes.map((lane) => (
                <button key={lane.key} type="button" aria-pressed={!overviewFilter && !onlyPendingCheckin && actionFilter === lane.key}
                  title={lane.explanation}
                  onClick={() => { setOverviewFilter(null); setOnlyPendingCheckin(false); setActionFilter(current => current === lane.key ? 'TODOS' : lane.key); }}
                  className={!overviewFilter && !onlyPendingCheckin && actionFilter === lane.key
                    ? 'rounded-lg border border-primary bg-blue-50 px-3 py-2 text-sm font-bold text-slate-900 ring-1 ring-primary dark:bg-blue-950/40 dark:text-white'
                    : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'}>
                  {lane.title}: {laneCounts[lane.key]}
                </button>
              ))}
              {checkinPendingCount > 0 ? (
                <button type="button" aria-pressed={!overviewFilter && onlyPendingCheckin}
                  onClick={() => { setOverviewFilter(null); setOnlyPendingCheckin(current => !current); setActionFilter('TODOS'); }}
                  className={!overviewFilter && onlyPendingCheckin
                    ? 'rounded-lg border border-red-600 bg-red-50 px-3 py-2 text-sm font-bold text-red-900 ring-1 ring-red-600'
                    : 'rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-50'}>
                  Check-ins a receber: {checkinPendingCount}
                </button>
              ) : null}
            </div>
          )}
          {!firstLoad && !snapshotUnavailable ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {[
                counts.BLOQUEIO > 0 ? `${counts.BLOQUEIO} com atenção prioritária` : null,
                counts.DECISAO > 0 ? `${counts.DECISAO} para avaliar` : null,
                counts.CONFIRMAR > 0 ? `${counts.CONFIRMAR} para verificar` : null,
                counts.NORMAL > 0 ? `${counts.NORMAL} sem pendência indicada` : null,
              ].filter(Boolean).join(' · ') || 'Nenhuma pessoa no recorte.'}
              {' '}As filas indicam a próxima ação; não concedem liberação.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50" aria-label="Fadiga acumulada da quinzena">
          <h2 className="text-base font-bold text-slate-950 dark:text-white">Fadiga acumulada — quinzena</h2>
          {firstLoad || snapshotUnavailable ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Período e indicadores ainda não disponíveis; não presumir condição normal.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                Período: {periodLabel}. Avaliação do período disponível para {evaluatedFortnightCount} de {queue.length} pessoa(s).
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                {criticalFortnightCount > 0 ? `${criticalFortnightCount} com atenção crítica · ` : ''}
                {attentionFortnightCount > 0 ? `${attentionFortnightCount} em atenção · ` : ''}
                {queue.length - evaluatedFortnightCount > 0
                  ? `${queue.length - evaluatedFortnightCount} sem avaliação quinzenal completa.`
                  : 'Não há avaliações quinzenais incompletas neste recorte.'}
              </p>
              <details className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                <summary className="cursor-pointer">Como interpretar a quinzena</summary>
                <p className="mt-1">A situação e a atividade acumulada registrada aparecem por pessoa abaixo. O indicador não substitui avaliação individual ou liberação operacional.</p>
              </details>
            </>
          )}
        </section>

        {snapshot.unauthorized ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            Você não possui acesso ao escopo solicitado do FRMS.
          </div>
        ) : null}

        <section id="frms-decision-queue" className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Fila de decisão</h2>
              <p className="text-xs text-slate-500">
                O check-in diário, o motivo e a providência aparecem aqui. Abra a pessoa para ver cálculos, tendências, fontes e histórico.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/frms/conceitos"
                className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                Como interpretar
              </Link>
              {!firstLoad ? <span className="text-xs font-semibold text-slate-500">{visibleQueue.length} de {queue.length} pessoa(s)</span> : null}
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
          ) : visibleQueue.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <h3 className="mt-3 font-bold text-slate-900 dark:text-white">{overviewFilter ? 'Nenhuma pessoa com o filtro ' + FRMS_OVERVIEW_FILTER_LABELS[overviewFilter] : onlyPendingCheckin ? 'Nenhum check-in pendente neste recorte' : actionFilter !== 'TODOS' ? 'Nenhuma pessoa neste grupo' : 'Nenhuma pendência operacional no recorte'}</h3>
              <p className="mt-1 text-sm text-slate-500">{overviewFilter || onlyPendingCheckin || actionFilter !== 'TODOS' ? 'O filtro atual não encontrou registros. Mostre todas as situações para conferir o recorte completo.' : 'Não há pessoas escaladas, com jornada ou alerta que exijam atenção neste dia.'}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-900">
              {visibleQueue.map(({ item, bucket }) => {
                const confidence = operationalConfidence(item);
                const guidance = resolveFrmsCoordinationGuidance(item, todayIso);

                return (
                  <button
                    key={`${item.tripulante_id}-${item.data_operacional}`}
                    type="button"
                    onClick={() => setSelected(item)}
                    className="grid w-full gap-3 border-l-4 border-transparent px-4 py-3 text-left transition-colors hover:border-sky-400 hover:bg-slate-50 focus:border-sky-400 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-900/60 dark:focus:bg-slate-900/60 lg:grid-cols-[minmax(160px,0.95fr)_minmax(170px,1fr)_minmax(190px,1.2fr)_minmax(170px,1.1fr)_20px] lg:items-center"
                  >
                    <div className="min-w-0">
                      <DecisionBadge bucket={bucket} />
                      <p className="mt-2 truncate font-bold text-slate-950 dark:text-white">{displayName(item)}</p>
                      <p className="truncate text-xs text-slate-500">{[item.funcao, item.base, item.aeronave].filter(Boolean).join(' · ') || 'Função/base não informadas'}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Check-in diário</p>
                      <span
                        className={`mt-1 inline-flex rounded-md px-2 py-1 text-xs font-bold ${guidance.checkinComplete
                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                          : guidance.requiresCheckin
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                        aria-label={guidance.checkinComplete
                          ? 'Check-in diário: Recebido — informativo'
                          : `Check-in diário: ${guidance.checkinLabel}`}
                        title={guidance.checkinComplete
                          ? 'Coleta recebida. Não comprova baixa fadiga nem autoriza liberação operacional.'
                          : undefined}
                      >
                        {guidance.checkinLabel}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Fadiga acumulada · quinzena</p>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{fortnightSummary(item).status}</p>
                      <FrmsScoreMeter item={item} compact />
                      {fortnightSummary(item).score ? (
                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{fortnightSummary(item).score}</p>
                      ) : null}
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{fortnightSummary(item).activity}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Por quê?</p>
                      <p className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200" title={guidance.reason}>{guidance.reason}</p>
                      {frmsAttentionFacts(item).length > 0 ?
                        <p className="mt-1 line-clamp-2 text-xs font-semibold text-amber-800 dark:text-amber-200" title={frmsAttentionFacts(item).join(' · ')}>
                          {frmsAttentionFacts(item).slice(0, 2).join(' · ')}
                        </p> : null}
                      <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200" title={'Confiança oficial: ' + confidence.toLowerCase()}>
                        {isFrmsRoutineDutyClosurePending(item, todayIso) ? 'Jornada aguardando fechamento' : 'Dados: confiança ' + confidence.toLowerCase()}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">{item.hora_apresentacao ? `Apresentação ${item.hora_apresentacao}` : 'Apresentação —'}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">O que fazer?</p>
                      <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white" title={guidance.action}>{guidance.action}</p>
                    </div>
                    <ChevronRight className="hidden h-4 w-4 text-slate-400 lg:block" />
                  </button>
                );
              })}
            </div>
          )}
        </section>


      </div>

      {selected ? <DetailDrawer item={selected} onClose={() => setSelected(null)} todayIso={todayIso} /> : null}
    </AppLayout>
  );
}
