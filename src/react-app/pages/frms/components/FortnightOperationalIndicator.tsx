import { useMemo, useState } from 'react';
import {
  type FrmsFortnightIndicator,
  useFrmsOperationalSnapshot,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  FORTNIGHT_MANAGER_DISCLAIMER,
  FORTNIGHT_NO_DATA_MESSAGE,
  FORTNIGHT_OPERATIONAL_DISCLAIMER,
  FORTNIGHT_STATUS_LABELS,
  buildFortnightCrewOrientation,
  formatFortnightDecisao,
  formatFortnightFreshness,
  formatFortnightMinutes,
  formatFortnightNatureza,
  formatFortnightPeriod,
  formatTopModifiers,
  formatFortnightMitigacao,
  resolveFortnightNotice,
  sourceLabel,
  toneByFortnightSource,
  toneByFortnightStatus,
} from '../fortnightOperationalLabels';
import { buildFortnightTimeline } from '../fortnightOperationalTimeline';

const TIMELINE_STATUS_LABELS: Record<string, string> = {
  OK: 'Ok',
  ATENCAO: 'Atenção',
  CRITICO: 'Crítico',
  INCOMPLETO: 'Incompleto',
};

function formatTimelineCheckin(status: string): string {
  if (status === 'RECEBIDO') return 'Recebido';
  if (status === 'PENDENTE') return 'Pendente';
  if (status === 'AUSENTE') return 'Ausente';
  return 'N/A';
}

function toneByTimelineStatus(status: string): string {
  if (status === 'CRITICO') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'ATENCAO') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'INCOMPLETO') return 'border-slate-200 bg-slate-100 text-slate-700';
  if (status === 'SEM_REGISTRO') return 'border-slate-200 bg-white text-slate-500';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function formatTimelineStatus(status: string): string {
  if (status === 'SEM_REGISTRO') return 'Sem registro';
  return TIMELINE_STATUS_LABELS[status] || status;
}

function formatTimelinePct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(1)}%`;
}

function formatTimelineHighlight(highlights: string[]): string {
  if (highlights.length === 0) return '--';
  return highlights.join(' · ');
}

function FortnightTimelinePanel({
  indicator,
  funcionarioId,
  focusDate,
  enabled,
  title = 'Cenário diário do período',
  compact = false,
}: {
  indicator: FrmsFortnightIndicator | null | undefined;
  funcionarioId?: number | string | null;
  focusDate?: string | null;
  enabled: boolean;
  title?: string;
  compact?: boolean;
}) {
  const hasContext =
    Boolean(indicator?.periodo_inicio) &&
    Boolean(indicator?.periodo_fim) &&
    Number.isFinite(Number(funcionarioId)) &&
    Number(funcionarioId) > 0;

  const { data, loading, error } = useFrmsOperationalSnapshot(
    {
      data_inicio: indicator?.periodo_inicio || '',
      data_fim: indicator?.periodo_fim || '',
      funcionario_id: hasContext ? String(funcionarioId) : undefined,
      include_inconsistencies: true,
    },
    { enabled: enabled && hasContext },
  );

  const timeline = useMemo(() => {
    if (!hasContext || !indicator?.periodo_inicio || !indicator?.periodo_fim) return null;
    return buildFortnightTimeline(data, {
      periodStart: indicator.periodo_inicio,
      periodEnd: indicator.periodo_fim,
      focusDate,
    });
  }, [data, focusDate, hasContext, indicator?.periodo_fim, indicator?.periodo_inicio]);

  if (!enabled || !hasContext) return null;

  return (
    <div className={`space-y-3 rounded-lg border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-[11px] text-slate-500">
            Leitura diária de carga, recuperação e qualidade dos dados em{' '}
            {formatFortnightPeriod(indicator?.periodo_inicio, indicator?.periodo_fim)}.
          </p>
        </div>
        {focusDate ? (
          <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
            Hoje {focusDate.slice(8, 10)}/{focusDate.slice(5, 7)}
          </span>
        ) : null}
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">Carregando cenário diário...</p>
      ) : error ? (
        <p className="text-xs text-rose-700">Não foi possível carregar o cenário diário.</p>
      ) : !timeline || timeline.days.length === 0 ? (
        <p className="text-xs text-slate-500">Sem dados suficientes para montar o período.</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Dias com atividade</p>
              <p className="text-sm font-semibold text-slate-900">{timeline.summary.jornadas_days}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Check-ins recebidos</p>
              <p className="text-sm font-semibold text-slate-900">{timeline.summary.received_checkins}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Check-ins pendentes</p>
              <p className="text-sm font-semibold text-slate-900">{timeline.summary.pending_checkins}</p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[11px] text-emerald-700">Dias com recuperação</p>
              <p className="text-sm font-semibold text-emerald-900">{timeline.summary.recovery_days}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Crítico / atenção</p>
              <p className="text-sm font-semibold text-slate-900">
                {timeline.summary.critical_days} / {timeline.summary.attention_days}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs font-semibold text-slate-800">Padrões do período</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Resumo descritivo dos dados confirmados. Não cria um novo score nem substitui a regra FRMS.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Queda de efetividade</p>
                <p className="text-xs font-semibold text-slate-800">
                  {timeline.summary.max_effectiveness_decline_streak_days >= 2
                    ? `${timeline.summary.max_effectiveness_decline_streak_days} dias seguidos`
                    : 'Sem sequência confirmada'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Sono insuficiente</p>
                <p className="text-xs font-semibold text-slate-800">
                  {timeline.summary.low_sleep_days} dia(s) com alerta canônico
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Sequência de atividade</p>
                <p className="text-xs font-semibold text-slate-800">
                  {(indicator?.dias_consecutivos_com_atividade ?? indicator?.dias_consecutivos_com_jornada) == null
                    ? 'Não confirmada'
                    : `${indicator?.dias_consecutivos_com_atividade ?? indicator?.dias_consecutivos_com_jornada} dia(s) consecutivo(s)`}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Recuperação real</p>
                <p className="text-xs font-semibold text-emerald-800">
                  {timeline.summary.recovery_days} dia(s) registrado(s)
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Sem voo + recuperação</p>
                <p className="text-xs font-semibold text-slate-800">
                  {timeline.summary.no_flight_recovery_days} dia(s)
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left">Dia</th>
                  <th className="px-2 py-2 text-left">Atividade / jornada</th>
                  <th className="px-2 py-2 text-left">Sono / KSS</th>
                  <th className="px-2 py-2 text-left">HV FRMS</th>
                  <th className="px-2 py-2 text-left">Recuperação</th>
                  <th className="px-2 py-2 text-left">Efetividade</th>
                  <th className="px-2 py-2 text-left">Situação / ação</th>
                </tr>
              </thead>
              <tbody>
                {timeline.days.map((day) => {
                  const activity = day.recovery_activity_type
                    ? day.recovery_activity_type.replace(/_/g, ' ')
                    : null;
                  return (
                    <tr
                      key={day.data_operacional}
                      className={`border-t border-slate-200 align-top ${day.is_focus_day ? 'bg-sky-50/60' : ''}`}
                    >
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-900">{day.label}</div>
                        <div className="text-[11px] text-slate-500">Dia {day.day_index}/{day.total_days}</div>
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        {!day.has_snapshot_data ? (
                          <span className="text-slate-500">Sem dado confirmado</span>
                        ) : day.teve_atividade_frms ? (
                          <>
                            <div className="font-medium text-slate-800">
                              {day.atividade_principal === 'SIMULADOR'
                                ? 'Simulador'
                                : day.atividade_principal === 'TREINAMENTO'
                                  ? 'Treinamento'
                                  : day.atividade_principal === 'MISTA'
                                    ? 'Atividade mista'
                                    : 'Voo'}
                              {' · '}
                              {formatFortnightMinutes(day.atividade_min)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {day.hora_apresentacao?.slice(0, 5) || '—'} → {day.hora_termino?.slice(0, 5) || '—'}
                            </div>
                            {day.atividade_rotulos[0] ? (
                              <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-500">
                                {day.atividade_rotulos[0]}
                              </div>
                            ) : null}
                          </>
                        ) : activity ? (
                          <span className="font-medium text-slate-700">{activity}</span>
                        ) : (
                          <span className="text-slate-500">Sem atividade confirmada</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        <div>{day.horas_sono == null ? 'Não informado' : `${Number(day.horas_sono).toFixed(1)} h`}</div>
                        <div className="text-[11px] text-slate-500">KSS {day.kss_score ?? '—'}</div>
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        {day.voo_min > 0 ? (
                          <>
                            <div>{formatFortnightMinutes(day.voo_min)}</div>
                            {day.simulador_min > 0 ? (
                              <div className="text-[11px] text-slate-500">
                                voo {formatFortnightMinutes(day.voo_real_min)} · sim {formatFortnightMinutes(day.simulador_min)}
                              </div>
                            ) : null}
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-2 py-2">
                        {day.recovery_credit_points > 0 ? (
                          <>
                            <div className="font-semibold text-emerald-700">+{day.recovery_credit_points.toFixed(1)} pt</div>
                            <div className="text-[11px] text-slate-500">{activity || day.recovery_state || 'Recuperação'}</div>
                          </>
                        ) : (
                          <div className="text-slate-500">{activity || day.recovery_state || '—'}</div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-semibold text-slate-800">{formatTimelinePct(day.effectiveness_pct)}</div>
                        <div className="text-[11px] text-slate-500">{formatTimelineCheckin(day.checkin_status)}</div>
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneByTimelineStatus(day.snapshot_status)}`}>
                          {formatTimelineStatus(day.snapshot_status)}
                        </span>
                        {day.acao_recomendada_texto ? (
                          <div className="mt-1 max-w-[260px] text-[11px] text-sky-700">{day.acao_recomendada_texto}</div>
                        ) : day.highlights.length > 0 ? (
                          <div className="mt-1 max-w-[260px] text-[11px] text-slate-500">{formatTimelineHighlight(day.highlights)}</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function FortnightOperationalDisclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-[10px] text-slate-500">
        {FORTNIGHT_OPERATIONAL_DISCLAIMER}. {FORTNIGHT_MANAGER_DISCLAIMER}.
      </p>
    );
  }

  return (
      <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-600">
      <p className="font-medium text-slate-700">{FORTNIGHT_OPERATIONAL_DISCLAIMER}</p>
      <p>{FORTNIGHT_MANAGER_DISCLAIMER}</p>
      <p>Não é diagnóstico, não redefine a fórmula regulatória e não encerra a decisão final.</p>
    </div>
  );
}

export function FortnightStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneByFortnightStatus(status)}`}
    >
      {FORTNIGHT_STATUS_LABELS[status] || status}
    </span>
  );
}

function FortnightNaturezaBadge({ natureza }: { natureza: string | null | undefined }) {
  if (!natureza) return null;
  return (
    <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
      {formatFortnightNatureza(natureza)}
    </span>
  );
}

export function FortnightOperationalCore({
  indicator,
}: {
  indicator: FrmsFortnightIndicator | null | undefined;
}) {
  if (!indicator || indicator.fonte_periodo === 'AUSENTE') {
    return <p className="text-xs text-slate-500">{FORTNIGHT_NO_DATA_MESSAGE}</p>;
  }

  return (
    <div className="space-y-2 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-2">
        <FortnightStatusBadge status={indicator.status_quinzena} />
        <FortnightNaturezaBadge natureza={indicator.natureza_dado} />
        <span className="text-[10px] text-slate-500">{formatFortnightFreshness(indicator.freshness_dado)}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-amber-100 bg-amber-50/50 p-2">
          <span className="font-medium text-slate-700">Sinais que exigem atenção:</span>{' '}
          {formatTopModifiers(indicator.agravantes_aplicados)}
        </div>
        <div className="rounded-md border border-emerald-100 bg-emerald-50/50 p-2">
          <span className="font-medium text-slate-700">Fatores favoráveis:</span>{' '}
          {formatTopModifiers(indicator.atenuadores_aplicados)}
        </div>
      </div>
      {indicator.mitigacao_recomendada && indicator.mitigacao_recomendada !== 'SEM_ACAO' ? (
        <p>
          <span className="font-medium text-slate-700">Ação recomendada:</span>{' '}
          {formatFortnightMitigacao(indicator.mitigacao_recomendada)}
        </p>
      ) : null}
      {indicator.decisao && indicator.decisao !== 'INFORMA' ? (
        <p>
          <span className="font-medium text-slate-700">Nível de decisão:</span>{' '}
          {formatFortnightDecisao(indicator.decisao)}
        </p>
      ) : null}
    </div>
  );
}

export function FortnightDetailPanel({
  indicator,
  item,
}: {
  indicator: FrmsFortnightIndicator | null;
  item?: { teve_jornada?: boolean; funcionario_id?: number; data_operacional?: string } | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const notice = resolveFortnightNotice(indicator, item);
  const alerts = indicator?.alertas_quinzena.filter((value) => value?.trim());
  const notes = indicator?.limitation_notes.filter((value) => value?.trim());

  return (
    <details
      className="mt-2 rounded-md border border-slate-200 bg-slate-50/80 p-2"
      onToggle={(event) => setIsOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-[11px] font-medium text-slate-600">
        Ver evolução diária
      </summary>
      <div className="mt-2 space-y-2">
        <FortnightOperationalDisclaimer compact />
        {notice ? (
          <p className={`rounded-md border px-2 py-2 text-xs ${notice.toneClassName}`}>
            {notice.message}
          </p>
        ) : (
          <>
            <FortnightOperationalCore indicator={indicator} />
            <div className="grid gap-x-3 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
              <div>
                <span className="font-medium text-slate-700">Período:</span>{' '}
                {formatFortnightPeriod(indicator?.periodo_inicio, indicator?.periodo_fim)}
              </div>
              <div>
                <span className="font-medium text-slate-700">Jornada no período:</span>{' '}
                {formatFortnightMinutes(indicator?.duty_time_periodo_min)}
              </div>
              <div>
                <span className="font-medium text-slate-700">HV no período:</span>{' '}
                {formatFortnightMinutes(indicator?.horas_voo_periodo_min)}
              </div>
              <div>
                <span className="font-medium text-slate-700">Contexto embarcado:</span>{' '}
                {indicator?.dia_periodo != null && indicator?.total_dias_periodo != null
                  ? `dia ${indicator.dia_periodo}/${indicator.total_dias_periodo}`
                  : 'Não confirmado'}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">Fonte do período:</span>
                <span
                  className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                    toneByFortnightSource(indicator?.fonte_periodo)
                  }`}
                >
                  {sourceLabel(indicator?.fonte_periodo || 'AUSENTE')}
                </span>
              </div>
              <div>
                <span className="font-medium text-slate-700">Setores no período:</span>{' '}
                {indicator?.setores_periodo == null ? 'Não confirmado' : indicator.setores_periodo}
              </div>
              <div>
                <span className="font-medium text-slate-700">SIT periods estimados:</span>{' '}
                {indicator?.sit_periods_estimados == null ? 'Não confirmado' : indicator.sit_periods_estimados}
              </div>
            </div>
            {alerts && alerts.length > 0 ? (
              <div className="text-xs text-slate-600">
                <span className="font-medium text-slate-700">Alertas da quinzena:</span>{' '}
                {alerts.join(' · ')}
              </div>
            ) : null}
            {notes && notes.length > 0 ? (
              <div className="text-xs text-slate-600">
                <span className="font-medium text-slate-700">Observações/limitações:</span>{' '}
                {notes.join(' · ')}
              </div>
            ) : null}
            <FortnightTimelinePanel
              indicator={indicator}
              funcionarioId={item?.funcionario_id}
              focusDate={item?.data_operacional}
              enabled={isOpen}
              compact
            />
          </>
        )}
      </div>
    </details>
  );
}

export function FortnightCrewSummaryCard({
  indicator,
  checkinPendente = false,
  loading = false,
  simplified = false,
}: {
  indicator: FrmsFortnightIndicator | null | undefined;
  checkinPendente?: boolean;
  loading?: boolean;
  simplified?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Carregando fadiga da quinzena...
      </div>
    );
  }

  const orientation = buildFortnightCrewOrientation(indicator, checkinPendente);

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">
          {simplified ? 'Resumo da quinzena' : 'Fadiga da quinzena'}
        </h3>
        <FortnightOperationalDisclaimer compact />
      </div>

      {!indicator || indicator.fonte_periodo === 'AUSENTE' ? (
        <p className="text-sm text-slate-600">{FORTNIGHT_NO_DATA_MESSAGE}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FortnightStatusBadge status={indicator.status_quinzena} />
            {checkinPendente || (indicator.dias_com_checkin_pendente ?? 0) > 0 ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Check-in pendente
              </span>
            ) : null}
          </div>
          <p className="text-sm text-slate-700">{orientation}</p>
        </div>
      )}
    </div>
  );
}

export function FortnightConsolidatedPanel({
  indicator,
  loading = false,
  title = 'Contexto operacional do período',
  funcionarioId,
  focusDate,
}: {
  indicator: FrmsFortnightIndicator | null | undefined;
  loading?: boolean;
  title?: string;
  funcionarioId?: number | string | null;
  focusDate?: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Carregando indicador quinzenal...
      </div>
    );
  }

  const notice = resolveFortnightNotice(indicator ?? null, null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">
          Visão do período embarcado para apoiar a leitura diária de carga, recuperação e pendências.
        </p>
      </div>

      <FortnightOperationalDisclaimer />

      {!indicator || indicator.fonte_periodo === 'AUSENTE' ? (
        <p className="text-sm text-slate-600">{FORTNIGHT_NO_DATA_MESSAGE}</p>
      ) : (
        <>
          {notice ? <p className={`rounded-md border px-3 py-2 text-xs ${notice.toneClassName}`}>{notice.message}</p> : null}
          <FortnightOperationalCore indicator={indicator} />
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">Histórico/estado atual</p>
            <p className="mt-1">
              Período {formatFortnightPeriod(indicator.periodo_inicio, indicator.periodo_fim)}
              {indicator.dia_periodo != null && indicator.total_dias_periodo != null
                ? ` · dia ${indicator.dia_periodo}/${indicator.total_dias_periodo}`
                : ' · contexto embarcado não confirmado'}
            </p>
            <p className="mt-1">
              Jornadas no período: {indicator.jornadas_periodo ?? '--'} · Dias consecutivos:{' '}
              {indicator.dias_consecutivos_com_jornada ?? '--'}
            </p>
          </div>
          <FortnightTimelinePanel
            indicator={indicator}
            funcionarioId={funcionarioId}
            focusDate={focusDate}
            enabled
          />
        </>
      )}
    </div>
  );
}