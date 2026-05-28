/**
 * FrmsHeatmap — Heatmap FRMS (CSS Grid, performático)
 *
 * Eixo Y: tripulantes (ordenados por severidade DESC)
 * Eixo X: dias do período selecionado
 * Células coloridas por compliance HV/jornada ou índice estimado de efetividade
 *
 * Dual-tab: [Compliance Regulatório] | [Índice estimado de efetividade]
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, BarChart3 } from 'lucide-react';
import { useApi } from '@/react-app/hooks/useApi';
import { useFrmsFilters } from './FrmsFilterContext';
import {
  type ConfigLimites,
  getComplianceLabel,
  getComplianceHex,
  getEffectivenessHex,
  getEffectivenessLabel,
  getHeatmapCellColor,
  buildHeatmapLegend,
  getMonthDays,
  monthLabel,
  toDateKeyLocal,
  resolveFrmsComplianceDashboardNivel,
  resolveFrmsDashboardNivelCompleto,
} from '../frmsUtils';

// ── Helpers ──────────────────────────────────────────

function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

// ── Types ──────────────────────────────────

interface HeatmapDayData {
  pct: number;
  pct7d?: number;
  pct28d?: number;
  hv7d: number;
  hv28d: number;
  hvDia: number;
  pctDia: number;
  compliance_source?: 'DIA' | '7D' | '28D' | null;
  teve_jornada?: number;
  effectiveness_pct: number | null;
  effectiveness_nivel: string | null;
}

interface HeatmapTripulante {
  tripulante_id: string;
  nome: string;
  nome_guerra: string | null;
  cargo: string | null;
  dias: Record<string, HeatmapDayData>;
  maxPct: number;
}

interface TooltipData {
  nome: string;
  data: string;
  pct: number;
  pct7d: number;
  pct28d: number;
  pctDia: number;
  complianceSource: 'DIA' | '7D' | '28D' | null;
  hv7d: number;
  hv28d: number;
  hvDia: number;
  x: number;
  y: number;
  isEffectiveness?: boolean;
  effectiveness_pct?: number | null;
  effectiveness_nivel?: string | null;
}

// ── Componente Principal ──────────────────

type ActiveTab = 'compliance' | 'effectiveness';
type ComplianceDayFilter = 'OK' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO';
type EffectivenessDayFilter = 'PLENA' | 'ATENCAO' | 'DEGRADADA' | 'SEVERA';

interface Props {
  onSelectTripulante?: (id: string) => void;
  onSelectDay?: (selection: {
    tripulanteId: string;
    tripulanteNome: string;
    date: string;
    dayData: HeatmapDayData | null;
  }) => void;
  alertNivelByTripulante?: Record<string, string>;
  config?: ConfigLimites;
  allowedTripulanteIds?: string[];
  complianceDayFilter?: ComplianceDayFilter | null;
  effectivenessDayFilter?: EffectivenessDayFilter | null;
}

function resolveComplianceDayBand(
  pct: number | null | undefined,
  config: ConfigLimites,
): ComplianceDayFilter | null {
  if (pct == null) return null;
  return resolveFrmsComplianceDashboardNivel(pct, config);
}

function resolveEffectivenessDayBand(
  pct: number | null | undefined,
  config: ConfigLimites,
): EffectivenessDayFilter | null {
  if (pct == null) return null;
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct >= verde) return 'PLENA';
  if (pct <= vermelho) return 'SEVERA';
  if (pct <= amarelo) return 'DEGRADADA';
  return 'ATENCAO';
}

function resolveComplianceComposite(dayData: HeatmapDayData | undefined): {
  pct: number | null;
  source: 'DIA' | '7D' | '28D' | null;
  pctDia: number;
  pct7d: number;
  pct28d: number;
} {
  if (!dayData) {
    return { pct: null, source: null, pctDia: 0, pct7d: 0, pct28d: 0 };
  }

  const pctDia = Number(dayData.pctDia ?? 0);
  const pct7d = Number(dayData.pct7d ?? dayData.pct ?? 0);
  const pct28d = Number(dayData.pct28d ?? 0);
  const candidates: Array<{ source: 'DIA' | '7D' | '28D'; pct: number }> = [
    { source: '28D', pct: pct28d },
    { source: '7D', pct: pct7d },
    { source: 'DIA', pct: pctDia },
  ];

  let source: 'DIA' | '7D' | '28D' | null = null;
  let pct: number | null = null;
  for (const candidate of candidates) {
    if (pct == null || candidate.pct > pct) {
      pct = candidate.pct;
      source = candidate.source;
    }
  }

  return { pct, source, pctDia, pct7d, pct28d };
}

export default function FrmsHeatmap({
  onSelectTripulante,
  onSelectDay,
  alertNivelByTripulante = {},
  config = null,
  allowedTripulanteIds,
  complianceDayFilter = null,
  effectivenessDayFilter = null,
}: Props) {
  const navigate = useNavigate();
  const { filters, periodoNumDias, isMonthMode } = useFrmsFilters();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('compliance');

  useEffect(() => {
    if (complianceDayFilter) {
      setActiveTab('compliance');
    }
  }, [complianceDayFilter]);

  useEffect(() => {
    if (effectivenessDayFilter) {
      setActiveTab('effectiveness');
    }
  }, [effectivenessDayFilter]);

  const { data: heatmapRaw, loading } = useApi<HeatmapTripulante[]>(
    isMonthMode
      ? `/api/frms/heatmap?mes=${filters.mesReferencia}`
      : `/api/frms/heatmap?periodo=${periodoNumDias}`,
    { requireAuth: false, bypassGetCache: true, staleTime: 2 * 60 * 1000 },
  );

  // Gerar array de datas para colunas
  const datas = useMemo(() => {
    if (isMonthMode) return getMonthDays(filters.mesReferencia);
    const result: string[] = [];
    const hoje = new Date();
    for (let i = periodoNumDias - 1; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      result.push(toDateKeyLocal(d));
    }
    return result;
  }, [filters.mesReferencia, isMonthMode, periodoNumDias]);

  const heatmapData = useMemo(() => {
    const raw = heatmapRaw ?? [];
    const allowedIds = allowedTripulanteIds ? new Set(allowedTripulanteIds) : null;
    return raw.filter((t) => {
      if (allowedIds && !allowedIds.has(t.tripulante_id)) {
        return false;
      }
      // Filtro de busca
      if (filters.busca) {
        const q = filters.busca.toLowerCase();
        const nome = (t.nome_guerra || t.nome).toLowerCase();
        if (!nome.includes(q)) return false;
      }
      // Filtro de status
      if (filters.status.length < 4) {
        const effectivenessValues = datas
          .map((date) => t.dias[date]?.effectiveness_pct ?? null)
          .filter((value): value is number => value != null);
        const worstEffectiveness =
          effectivenessValues.length > 0 ? Math.min(...effectivenessValues) : null;
        const nivel = resolveFrmsDashboardNivelCompleto({
          effectivenessPct: worstEffectiveness,
          maxCompliancePct: t.maxPct,
          alertNivel: alertNivelByTripulante[t.tripulante_id],
          config,
        });
        if (!filters.status.includes(nivel)) return false;
      }
      return true;
    });
  }, [alertNivelByTripulante, allowedTripulanteIds, heatmapRaw, filters, datas, config]);

  // Tooltip
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(
    (e: React.MouseEvent, t: HeatmapTripulante, data: string) => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
      const dayData = t.dias[data];
      const hasJornada = dayData?.teve_jornada === 1;
      const isSemDados =
        !dayData ||
        (!hasJornada && isMonthMode) ||
        (dayData.teve_jornada !== 1 &&
          (dayData.hv7d ?? 0) === 0 &&
          (dayData.hv28d ?? 0) === 0 &&
          (dayData.hvDia ?? 0) === 0 &&
          dayData.effectiveness_pct == null);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      const complianceComposite = resolveComplianceComposite(dayData);
      setTooltip({
        nome: t.nome_guerra || t.nome,
        data,
        pct: isSemDados ? -1 : (complianceComposite.pct ?? 0),
        pct7d: isSemDados ? 0 : complianceComposite.pct7d,
        pct28d: isSemDados ? 0 : complianceComposite.pct28d,
        pctDia: isSemDados ? 0 : complianceComposite.pctDia,
        complianceSource: isSemDados
          ? null
          : (dayData?.compliance_source ?? complianceComposite.source),
        hv7d: isSemDados ? -1 : (dayData?.hv7d ?? 0),
        hv28d: isSemDados ? -1 : (dayData?.hv28d ?? 0),
        hvDia: isSemDados ? -1 : (dayData?.hvDia ?? 0),
        x: rect.left - (containerRect?.left ?? 0) + rect.width / 2,
        y: rect.top - (containerRect?.top ?? 0) - 8,
        isEffectiveness: activeTab === 'effectiveness',
        effectiveness_pct: isSemDados ? null : (dayData?.effectiveness_pct ?? null),
        effectiveness_nivel: dayData?.effectiveness_nivel ?? null,
      });
    },
    [activeTab, isMonthMode],
  );

  const hideTooltip = useCallback(() => {
    tooltipTimeoutRef.current = setTimeout(() => setTooltip(null), 100);
  }, []);

  // Escalabilidade: altura de linha conforme número de tripulantes
  const rowHeight = heatmapData.length <= 20 ? 32 : heatmapData.length <= 40 ? 22 : 20;
  const maxH = heatmapData.length > 40 ? 'max-h-[600px]' : '';

  // Estado vazio
  if (!loading && heatmapData.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900" data-testid="frms-heatmap">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-200">
          Mapa FRMS
        </h3>
        <div className="flex h-40 flex-col items-center justify-center text-slate-400 dark:text-slate-500">
          <BarChart3 className="w-12 h-12 mb-2" />
          <p>Nenhum dado de fadiga para o período selecionado</p>
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
            Novas importações FIRA começam pelo hub central em Configurações &gt; Importações e
            Exportações.
          </p>
        </div>
      </div>
    );
  }

  // Colunas de datas agrupadas — mostrar a cada N dias dependendo do período
  const labelEvery =
    periodoNumDias <= 14 ? 1 : periodoNumDias <= 30 ? 2 : periodoNumDias <= 60 ? 4 : 7;

  return (
    <div
      className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-6"
      data-testid="frms-heatmap"
      ref={containerRef}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
              <Activity className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-800 dark:text-slate-100">
                Mapa FRMS
              </h3>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {isMonthMode ? monthLabel(filters.mesReferencia) : `Últimos ${periodoNumDias} dias`}{' '}
                · {heatmapData.length} tripulantes ordenados por severidade · compliance HV/jornada pela pior
                janela (dia/7d/28d)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs dark:border-slate-700 dark:bg-slate-800">
          <button
            onClick={() => setActiveTab('compliance')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeTab === 'compliance'
                ? 'bg-white text-slate-800 font-semibold shadow-sm dark:bg-slate-950 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100'
            }`}
          >
            Compliance HV/jornada
          </button>
          <button
            onClick={() => setActiveTab('effectiveness')}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              activeTab === 'effectiveness'
                ? 'bg-white text-slate-800 font-semibold shadow-sm dark:bg-slate-950 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100'
            }`}
          >
            Índice de efetividade
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-300">
        {buildHeatmapLegend(activeTab, config).map((s) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-800"
          >
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.color}`} />
            {s.label}
          </span>
        ))}
      </div>

      {loading && (
        <div className="flex h-40 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
          Carregando heatmap...
        </div>
      )}

      {!loading && heatmapData.length > 0 && (
        <div className={`overflow-x-auto ${maxH} overflow-y-auto`}>
          {/* Date headers */}
          <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white/95 pb-1 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
            <div className="w-32 flex-shrink-0" /> {/* spacer for name column */}
            <div className="flex-1 flex">
              {datas.map((d, i) => (
                <div key={d} className="flex-1 min-w-[14px] text-center" style={{ minWidth: 14 }}>
                  {i % labelEvery === 0 && (
                    <span className="whitespace-nowrap text-[9px] font-medium text-slate-400 dark:text-slate-500">
                      {formatDateShort(d)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {heatmapData.map((t) => (
            <div
              key={t.tripulante_id}
              className="group flex items-center border-b border-slate-100/80 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
              style={{ height: rowHeight }}
              data-testid={`frms-heatmap-row-${t.tripulante_id}`}
            >
              {/* Nome */}
              <button
                className="w-32 flex-shrink-0 truncate px-2 text-left text-xs font-medium text-slate-700
                           hover:text-primary hover:underline cursor-pointer dark:text-slate-200"
                onClick={() => {
                  const query = isMonthMode
                    ? `?mes=${encodeURIComponent(filters.mesReferencia)}`
                    : '';
                  navigate(`/frms/tripulante/${t.tripulante_id}${query}`);
                }}
                title={`Ver jornada: ${t.nome}`}
              >
                {t.nome_guerra || t.nome.split(' ').slice(0, 2).join(' ')}
              </button>

              {/* Cells */}
              <div className="flex-1 flex gap-px">
                {datas.map((d) => {
                  const dayData = t.dias[d];
                  const hasJornada = dayData?.teve_jornada === 1;
                  const isSemDados =
                    !dayData ||
                    (!hasJornada && isMonthMode) ||
                    (dayData.teve_jornada !== 1 &&
                      (dayData.hv7d ?? 0) === 0 &&
                      (dayData.hv28d ?? 0) === 0 &&
                      (dayData.hvDia ?? 0) === 0 &&
                      dayData.effectiveness_pct == null);

                  const complianceComposite = resolveComplianceComposite(dayData);
                  const compliancePct = isSemDados ? null : complianceComposite.pct;
                  const effPct = isSemDados ? null : (dayData?.effectiveness_pct ?? null);
                  const complianceBand = resolveComplianceDayBand(compliancePct, config);
                  const effBand = resolveEffectivenessDayBand(effPct, config);
                  const isFilteredOutByCompliance =
                    activeTab === 'compliance' &&
                    complianceDayFilter != null &&
                    complianceBand !== complianceDayFilter;
                  const isFilteredOutByEffectiveness =
                    activeTab === 'effectiveness' &&
                    effectivenessDayFilter != null &&
                    effBand !== effectivenessDayFilter;
                  const isFilteredOut = isFilteredOutByCompliance || isFilteredOutByEffectiveness;

                  const cellPct = activeTab === 'compliance' ? compliancePct : effPct;
                  const cellClass = isFilteredOut
                    ? 'bg-slate-100/70 dark:bg-slate-800/70'
                    : getHeatmapCellColor(cellPct, activeTab, config);

                  return (
                    <div
                      key={d}
                      data-testid={`frms-heatmap-cell-${t.tripulante_id}-${d}`}
                      className={`flex-1 min-w-[14px] rounded-[3px] transition-transform
                                 hover:scale-110 hover:z-10 hover:shadow-sm ${cellClass}`}
                      style={{
                        minWidth: 14,
                        height: rowHeight - 6,
                        cursor: isFilteredOut ? 'default' : 'pointer',
                        opacity: isFilteredOut ? 0.45 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (isFilteredOut) {
                          setTooltip(null);
                          return;
                        }
                        showTooltip(e, t, d);
                      }}
                      onMouseLeave={hideTooltip}
                      onClick={() => {
                        if (isFilteredOut) return;
                        onSelectTripulante?.(t.tripulante_id);
                        onSelectDay?.({
                          tripulanteId: t.tripulante_id,
                          tripulanteNome: t.nome_guerra || t.nome,
                          date: d,
                          dayData: dayData ?? null,
                        });
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
          style={{
            left: Math.min(tooltip.x, (containerRef.current?.clientWidth ?? 600) - 220),
            top: tooltip.y - 120,
            minWidth: 200,
          }}
        >
          <p className="font-semibold text-slate-800 dark:text-slate-100">{tooltip.nome}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{formatDateShort(tooltip.data)}</p>
          <div className="mt-2 space-y-1">
            {tooltip.isEffectiveness ? (
              <>
                <p>
                  Efetividade:{' '}
                  <span
                    className="font-semibold"
                    style={{ color: getEffectivenessHex(tooltip.effectiveness_pct ?? 0, config) }}
                  >
                    {tooltip.effectiveness_pct != null
                      ? `${tooltip.effectiveness_pct.toFixed(1)}% — ${getEffectivenessLabel(tooltip.effectiveness_pct, config)}`
                      : 'Sem dados'}
                  </span>
                </p>
              </>
            ) : (
              <>
                {tooltip.pct < 0 ? (
                  <p className="text-slate-500 dark:text-slate-400">Sem dados</p>
                ) : (
                  <>
                    <p>
                      Compliance HV/jornada (pior janela):{' '}
                      <span
                        className="font-semibold"
                        style={{ color: getComplianceHex(tooltip.pct, config) }}
                      >
                        {tooltip.pct.toFixed(1)}% ({getComplianceLabel(tooltip.pct, config)})
                      </span>
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      Janela crítica:{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {tooltip.complianceSource || '-'}
                      </span>
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      Dia: {tooltip.pctDia.toFixed(1)}% · 7d: {tooltip.pct7d.toFixed(1)}% · 28d:{' '}
                      {tooltip.pct28d.toFixed(1)}%
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">HV últimos 7 dias: {formatMin(tooltip.hv7d)}</p>
                    <p className="text-slate-500 dark:text-slate-400">HV últimos 28 dias: {formatMin(tooltip.hv28d)}</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
