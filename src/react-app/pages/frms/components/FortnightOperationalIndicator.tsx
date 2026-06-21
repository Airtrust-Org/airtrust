import type { FrmsFortnightIndicator } from '@/react-app/hooks/useFrmsOperationalSnapshot';
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
  formatFortnightScore,
  formatFortnightTendencia,
  formatTopModifiers,
  formatFortnightMitigacao,
  resolveFortnightNotice,
  sourceLabel,
  toneByFortnightSource,
  toneByFortnightStatus,
} from '../fortnightOperationalLabels';

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
      <p>Não é homologação, evidência regulatória ou diagnóstico fisiológico.</p>
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
        <span className="text-[10px] text-slate-500">
          {formatFortnightFreshness(indicator.freshness_dado)}
        </span>
      </div>

      <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
        <div>
          <span className="font-medium text-slate-700">Score acumulado:</span>{' '}
          {formatFortnightScore(indicator.score_acumulado)}
        </div>
        <div>
          <span className="font-medium text-slate-700">Tendência:</span>{' '}
          {formatFortnightTendencia(indicator.tendencia)}
        </div>
        <div>
          <span className="font-medium text-slate-700">Agravantes:</span>{' '}
          {formatTopModifiers(indicator.agravantes_aplicados)}
        </div>
        <div>
          <span className="font-medium text-slate-700">Atenuadores:</span>{' '}
          {formatTopModifiers(indicator.atenuadores_aplicados)}
        </div>
      </div>

      {indicator.explicacao_operacional?.trim() ? (
        <p>
          <span className="font-medium text-slate-700">Explicação:</span>{' '}
          {indicator.explicacao_operacional}
        </p>
      ) : null}

      {indicator.mitigacao_recomendada && indicator.mitigacao_recomendada !== 'SEM_ACAO' ? (
        <p>
          <span className="font-medium text-slate-700">Mitigação sugerida:</span>{' '}
          {formatFortnightMitigacao(indicator.mitigacao_recomendada)}
        </p>
      ) : null}

      {indicator.decisao && indicator.decisao !== 'INFORMA' ? (
        <p>
          <span className="font-medium text-slate-700">Decisão operacional:</span>{' '}
          {formatFortnightDecisao(indicator.decisao)}
        </p>
      ) : null}

      {indicator.limite_referencia ? (
        <p className="text-[10px] text-slate-500">
          Referência de limite ({indicator.limite_referencia.tipo.replace(/_/g, ' ').toLowerCase()}
          ): {Math.round(indicator.limite_referencia.pct_atingido)}% — indicador operacional, não
          avaliação regulatória.
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
  item?: { teve_jornada?: boolean } | null;
}) {
  const notice = resolveFortnightNotice(indicator, item);
  const alerts = indicator?.alertas_quinzena.filter((value) => value?.trim());
  const notes = indicator?.limitation_notes.filter((value) => value?.trim());

  return (
    <details className="mt-2 rounded-md border border-slate-200 bg-slate-50/80 p-2">
      <summary className="cursor-pointer text-[11px] font-medium text-slate-600">
        Detalhes da quinzena
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
}: {
  indicator: FrmsFortnightIndicator | null | undefined;
  checkinPendente?: boolean;
  loading?: boolean;
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
        <h3 className="text-sm font-semibold text-slate-900">Fadiga da quinzena</h3>
        <FortnightOperationalDisclaimer compact />
      </div>

      {!indicator || indicator.fonte_periodo === 'AUSENTE' ? (
        <p className="text-sm text-slate-600">{FORTNIGHT_NO_DATA_MESSAGE}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FortnightStatusBadge status={indicator.status_quinzena} />
            <span className="text-xs text-slate-600">
              Tendência: {formatFortnightTendencia(indicator.tendencia)}
            </span>
            {checkinPendente || (indicator.dias_com_checkin_pendente ?? 0) > 0 ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Check-in pendente
              </span>
            ) : null}
          </div>
          {indicator.score_acumulado != null ? (
            <p className="text-sm text-slate-700">
              Score acumulado: <span className="font-semibold">{formatFortnightScore(indicator.score_acumulado)}</span>
            </p>
          ) : null}
          <p className="text-sm text-slate-700">{orientation}</p>
        </div>
      )}
    </div>
  );
}

export function FortnightConsolidatedPanel({
  indicator,
  loading = false,
  title = 'Fadiga operacional da quinzena',
}: {
  indicator: FrmsFortnightIndicator | null | undefined;
  loading?: boolean;
  title?: string;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Carregando indicador quinzenal...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
        <p className="mt-1 text-xs text-slate-500">
          Visão operacional estimada — separada de limites legais/regulatórios.
        </p>
      </div>

      <FortnightOperationalDisclaimer />

      {!indicator || indicator.fonte_periodo === 'AUSENTE' ? (
        <p className="text-sm text-slate-600">{FORTNIGHT_NO_DATA_MESSAGE}</p>
      ) : (
        <>
          <FortnightOperationalCore indicator={indicator} />
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">Histórico/estado atual</p>
            <p className="mt-1">
              Período {formatFortnightPeriod(indicator.periodo_inicio, indicator.periodo_fim)}
              {indicator.dia_periodo != null && indicator.total_dias_periodo != null
                ? ` · dia ${indicator.dia_periodo}/${indicator.total_dias_periodo}`
                : ''}
            </p>
            <p className="mt-1">
              Jornadas no período: {indicator.jornadas_periodo ?? '--'} · Dias consecutivos:{' '}
              {indicator.dias_consecutivos_com_jornada ?? '--'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
