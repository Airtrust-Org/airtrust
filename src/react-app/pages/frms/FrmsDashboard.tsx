/**
 * FRMS — Dashboard Principal (Fase 4 Offshore Sleep Model)
 *
 * Layout 3 zonas:
 *   1. Sidebar de filtros (fixo, esquerda)
 *   2. Header fixo com botões sempre visíveis
 *   3. Conteúdo scrollável: cards + heatmap + timeline + tabela
 */
import { useState, useMemo, useCallback, useRef, useEffect, Suspense, lazy } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Bell,
  ClipboardCheck,
  CalendarRange,
  Plus,
  Settings,
  TrendingUp,
  Menu,
  Upload,
  X,
  BookOpen,
  Users,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import { useApi } from '@/react-app/hooks/useApi';
import {
  useFrmsFrota,
  useFrmsAlertas,
  useFrmsAlertasCount,
  useFrmsConfiguracoes,
  useFrmsJornadasEffectiveness,
} from '@/react-app/hooks/useFrms';
import type {
  FrmsFrotaRow,
  FrmsAlertaRow,
  FrmsEffectivenessJornadaRow,
} from '@/react-app/hooks/useFrms';
import { useFrmsOperationalSnapshot } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import FrmsFormJornada from './FrmsFormJornada';
import { FrmsFilterProvider, useFrmsFilters } from './components/FrmsFilterContext';
import FrmsFilters from './components/FrmsFilters';
import FrmsFilterChips from './components/FrmsFilterChips';
import FrmsMetricCards from './components/FrmsMetricCards';
import FrmsHeatmap from './components/FrmsHeatmap';
import FrmsTripulantesTable from './components/FrmsTripulantesTable';
import FrmsJornadaEffectivenessCard from './components/FrmsJornadaEffectivenessCard';
import FrmsDayExplanationPanel from './components/FrmsDayExplanationPanel';
import FrmsSourcePolicyBanner from './components/FrmsSourcePolicyBanner';
import FrmsOperationalActionList from './components/FrmsOperationalActionList';
import { FrmsCoordQueuePanel } from './components/FrmsCoordQueuePanel';
import FrmsIogpAuditPanel from './components/FrmsIogpAuditPanel';
import FrmsWorkspaceNav from './components/FrmsWorkspaceNav';
import {
  getMonthRange,
  getMonthDays,
  getRollingRange,
  monthLabel,
  getFrmsNivelWeight,
  resolveFrmsComplianceDashboardNivel,
  resolveFrmsDashboardNivelCompleto,
  toDateKeyLocal,
} from './frmsUtils';
import { applyFrmsFrotaFilters, extractModelTokens } from './frmsFilterUtils';
import {
  formatFortnightPeriodShort,
} from './fortnightOperationalLabels';
import { buildFortnightOperationalSummary } from './fortnightOperationalSummary';

const FrmsEffectivenessTimeline = lazy(() => import('./components/FrmsEffectivenessTimeline'));

// ── Helpers ────────────────────────────────────────────

// ── TripulantePickerModal ──────────────────────────

interface FuncRow {
  id: number;
  nome: string;
  cargo?: string;
  funcao?: string;
}

type EffectivenessCardKey = 'PLENA' | 'ATENCAO' | 'DEGRADADA' | 'SEVERA';
type ComplianceCardKey = 'OK' | 'ATENCAO' | 'CRITICO' | 'VIOLACAO';

interface DashboardHeatmapDayData {
  pct?: number;
  hv7d?: number;
  hv28d?: number;
  hvDia?: number;
  pctDia?: number;
  teve_jornada?: number;
  effectiveness_pct?: number | null;
  effectiveness_nivel?: string | null;
}

interface DashboardHeatmapTripulante {
  tripulante_id: string;
  dias: Record<string, DashboardHeatmapDayData>;
}

function getTodayLocalIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Nao confirmado';
  return `${value.toFixed(1)}%`;
}

function resolveEffectivenessCardKey(
  pct: number | null | undefined,
  config: Record<string, number> | null,
): EffectivenessCardKey | null {
  if (pct == null) return null;
  const verde = config?.EFFECTIV_VERDE_MIN ?? 90;
  const amarelo = config?.EFFECTIV_AMARELO_MAX ?? 77;
  const vermelho = config?.EFFECTIV_VERMELHO_MAX ?? 65;
  if (pct >= verde) return 'PLENA';
  if (pct <= vermelho) return 'SEVERA';
  if (pct <= amarelo) return 'DEGRADADA';
  return 'ATENCAO';
}

function resolveComplianceCardKey(
  pct: number | null | undefined,
  config: Record<string, number> | null,
): ComplianceCardKey | null {
  if (pct == null) return null;
  return resolveFrmsComplianceDashboardNivel(pct, config);
}

function TripulantePickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (id: string, nome: string) => void;
  onClose: () => void;
}) {
  const [busca, setBusca] = useState('');
  const { data: funcRaw, loading } = useApi<{ data: FuncRow[] }>(
    '/api/funcionarios?limit=200&page=1&status=ativos&orderBy=nome&order=ASC',
  );
  const funcionariosRaw = Array.isArray(funcRaw?.data) ? funcRaw.data : [];
  const funcionarios: FuncRow[] = funcionariosRaw.filter((f: FuncRow) => {
    if (!f.funcao) return true;
    const fn = f.funcao.toUpperCase().trim();
    return (
      fn === 'PILOTO' ||
      fn === 'COPILOTO' ||
      fn === 'COMANDANTE' ||
      fn.includes('PILOT') ||
      fn.includes('COPIL') ||
      fn.includes('COMAND')
    );
  });

  const filtered = useMemo(() => {
    if (!busca.trim()) return funcionarios;
    const q = busca.toLowerCase();
    return funcionarios.filter((f) => f.nome.toLowerCase().includes(q));
  }, [funcionarios, busca]);

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-lg dark:bg-slate-900">
        <div className="flex items-center justify-between border-b px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Lançar Jornada</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Selecione o tripulante</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <X className="h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 pt-4 pb-2">
          <input
            autoFocus
            type="text"
            placeholder="Buscar por nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Nenhum resultado</div>
          ) : (
            filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => onSelect(String(f.id), f.nome)}
                className="flex w-full items-center gap-3 rounded-md px-4 py-3 text-left transition-colors hover:bg-primary/5 dark:hover:bg-primary/10"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {f.nome.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{f.nome}</p>
                  {f.cargo && <p className="truncate text-xs text-slate-400 dark:text-slate-500">{f.cargo}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Content (dentro do FrmsFilterProvider) ──

function DashboardContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const analysisView = searchParams.get('vista') === 'analise';
  const { filters, setFilter, periodoNumDias, isMonthMode, quinzenasDoMes, quinzenaAtiva } = useFrmsFilters();
  const operationalSnapshotDate = useMemo(() => getTodayLocalIsoDate(), []);
  const [showPicker, setShowPicker] = useState(false);
  const [jornadaTripulante, setJornadaTripulante] = useState<{ id: string; nome: string } | null>(
    null,
  );
  const [selectedTripulanteId, setSelectedTripulanteId] = useState<string | undefined>();
  const [selectedHeatmapDay, setSelectedHeatmapDay] = useState<{
    tripulanteId: string;
    tripulanteNome: string;
    date: string;
  } | null>(null);
  const [complianceDayFilter, setComplianceDayFilter] = useState<ComplianceCardKey | null>(null);
  const [effectivenessDayFilter, setEffectivenessDayFilter] = useState<EffectivenessCardKey | null>(
    null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mapLens, setMapLens] = useState<'compliance' | 'fatigue' | 'effectiveness'>('compliance');
  const timelineRef = useRef<HTMLDivElement>(null);

  // Scroll to timeline when tripulante is selected
  useEffect(() => {
    if (selectedTripulanteId && typeof timelineRef.current?.scrollIntoView === 'function') {
      timelineRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedTripulanteId]);

  // Queries
  const periodoAlertas = useMemo(() => {
    return isMonthMode ? getMonthRange(filters.mesReferencia) : getRollingRange(periodoNumDias);
  }, [filters.mesReferencia, isMonthMode, periodoNumDias]);

  const {
    data: frotaRaw,
    loading: loadingFrota,
    refetch: refetchFrota,
  } = useFrmsFrota(
    isMonthMode ? filters.mesReferencia : undefined,
    isMonthMode ? undefined : periodoNumDias,
    isMonthMode ? filters.quinzena : undefined,
  );
  const { data: alertasRaw, refetch: refetchAlertas } = useFrmsAlertas({
    resolvido: 'false',
    data_inicio: periodoAlertas.start,
    data_fim: periodoAlertas.end,
    limit: '200',
  });
  const { data: countData, refetch: refetchCount } = useFrmsAlertasCount();
  const { data: configData } = useFrmsConfiguracoes();
  const frmsConfig = (configData as { limites?: Record<string, number> } | null)?.limites ?? null;
  const { data: heatmapRawForStats } = useApi<DashboardHeatmapTripulante[]>(
    isMonthMode
      ? `/api/frms/heatmap?mes=${filters.mesReferencia}`
      : `/api/frms/heatmap?periodo=${periodoNumDias}`,
    { requireAuth: false, bypassGetCache: true, staleTime: 2 * 60 * 1000 },
  );

  const frota: FrmsFrotaRow[] = useMemo(
    () => (frotaRaw as FrmsFrotaRow[] | null) ?? [],
    [frotaRaw],
  );
  const alertas: FrmsAlertaRow[] = useMemo(
    () => (alertasRaw as FrmsAlertaRow[] | null) ?? [],
    [alertasRaw],
  );
  const alertCount = (countData as { count: number } | null)?.count ?? 0;

  const alertNivelMap = useMemo(() => {
    const alertNivelMap = new Map<string, string>();
    alertas.forEach((a) => {
      const current = alertNivelMap.get(a.tripulante_id) ?? 'OK';
      if (getFrmsNivelWeight(a.nivel) > getFrmsNivelWeight(current)) {
        alertNivelMap.set(a.tripulante_id, a.nivel);
      }
    });
    return alertNivelMap;
  }, [alertas]);

  const alertNivelByTripulante = useMemo(() => Object.fromEntries(alertNivelMap), [alertNivelMap]);

  const frotaComDadosNoPeriodo = useMemo(() => {
    if (!isMonthMode) return frota;
    return frota.filter((item) => Number(item.hv_mes_min || 0) > 0);
  }, [frota, isMonthMode]);

  const filteredFrota = useMemo(
    () =>
      applyFrmsFrotaFilters(frotaComDadosNoPeriodo, filters, {
        alertNivelByTripulante,
        config: frmsConfig,
        applyQuinzenaClientFilter: !isMonthMode,
      }),
    [alertNivelByTripulante, filters, frotaComDadosNoPeriodo, frmsConfig, isMonthMode],
  );

  const filteredTripulanteIds = useMemo(
    () => filteredFrota.map((item) => String(item.tripulante_id)),
    [filteredFrota],
  );
  const filteredTripulanteIdSet = useMemo(
    () => new Set(filteredTripulanteIds),
    [filteredTripulanteIds],
  );

  const {
    data: operationalSnapshotData,
    loading: loadingOperationalSnapshot,
    error: operationalSnapshotError,
  } = useFrmsOperationalSnapshot({
    data_inicio: operationalSnapshotDate,
    data_fim: operationalSnapshotDate,
    include_inconsistencies: true,
  });

  const visibleOperationalSnapshot = useMemo(
    () =>
      operationalSnapshotData.filter((item) =>
        filteredTripulanteIdSet.has(String(item.funcionario_id)),
      ),
    [filteredTripulanteIdSet, operationalSnapshotData],
  );

  const fortnightSummary = useMemo(
    () =>
      buildFortnightOperationalSummary(visibleOperationalSnapshot, operationalSnapshotDate),
    [operationalSnapshotDate, visibleOperationalSnapshot],
  );

  const actionRequiredCount = useMemo(
    () =>
      fortnightSummary.attentionItems.filter(
        (item) =>
          item.actionGroup === 'critical' ||
          item.actionGroup === 'attention' ||
          item.actionGroup === 'checkin',
      ).length,
    [fortnightSummary.attentionItems],
  );

  const fortnightLabel = useMemo(
    () => formatFortnightPeriodShort(fortnightSummary.periodStart, fortnightSummary.periodEnd),
    [fortnightSummary.periodEnd, fortnightSummary.periodStart],
  );

  const heatmapDates = useMemo(() => {
    if (isMonthMode) return getMonthDays(filters.mesReferencia);
    const result: string[] = [];
    const today = new Date();
    for (let i = periodoNumDias - 1; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      result.push(toDateKeyLocal(d));
    }
    return result;
  }, [filters.mesReferencia, isMonthMode, periodoNumDias]);

  const effectivenessByDayStats = useMemo(() => {
    const counts = {
      plena: 0,
      atencao: 0,
      degradada: 0,
      severa: 0,
      semDados: 0,
    };

    const rows = (heatmapRawForStats as DashboardHeatmapTripulante[] | null) ?? [];
    if (!rows.length) return counts;

    const allowed = new Set(filteredTripulanteIds);
    rows.forEach((trip) => {
      if (!allowed.has(String(trip.tripulante_id))) return;

      heatmapDates.forEach((date) => {
        const day = trip.dias?.[date];
        const hasJornada = day?.teve_jornada === 1;
        const isSemDados =
          !day ||
          (!hasJornada && isMonthMode) ||
          (day.teve_jornada !== 1 &&
            (day.hv7d ?? 0) === 0 &&
            (day.hv28d ?? 0) === 0 &&
            (day.hvDia ?? 0) === 0 &&
            day.effectiveness_pct == null);

        if (isSemDados) {
          counts.semDados += 1;
          return;
        }

        const bucket = resolveEffectivenessCardKey(day.effectiveness_pct ?? null, frmsConfig);
        if (bucket === 'PLENA') counts.plena += 1;
        else if (bucket === 'ATENCAO') counts.atencao += 1;
        else if (bucket === 'DEGRADADA') counts.degradada += 1;
        else if (bucket === 'SEVERA') counts.severa += 1;
      });
    });

    return counts;
  }, [filteredTripulanteIds, frmsConfig, heatmapDates, heatmapRawForStats, isMonthMode]);

  const complianceByDayStats = useMemo(() => {
    const counts = {
      ok: 0,
      atencao: 0,
      critico: 0,
      violacao: 0,
    };

    const rows = (heatmapRawForStats as DashboardHeatmapTripulante[] | null) ?? [];
    if (!rows.length) return counts;

    const allowed = new Set(filteredTripulanteIds);
    rows.forEach((trip) => {
      if (!allowed.has(String(trip.tripulante_id))) return;

      heatmapDates.forEach((date) => {
        const day = trip.dias?.[date];
        const hasJornada = day?.teve_jornada === 1;
        const isSemDados =
          !day ||
          (!hasJornada && isMonthMode) ||
          (day.teve_jornada !== 1 &&
            (day.hv7d ?? 0) === 0 &&
            (day.hv28d ?? 0) === 0 &&
            (day.hvDia ?? 0) === 0 &&
            day.effectiveness_pct == null);

        if (isSemDados) return;

        const bucket = resolveComplianceCardKey(day.pct ?? null, frmsConfig);
        if (bucket === 'OK') counts.ok += 1;
        else if (bucket === 'ATENCAO') counts.atencao += 1;
        else if (bucket === 'CRITICO') counts.critico += 1;
        else if (bucket === 'VIOLACAO') counts.violacao += 1;
      });
    });

    return counts;
  }, [filteredTripulanteIds, frmsConfig, heatmapDates, heatmapRawForStats, isMonthMode]);

  const modelosDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(
          frota
            .flatMap((item) => extractModelTokens(item.aeronave_modelo))
            .filter((modelo): modelo is string => Boolean(modelo)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [frota],
  );
  const basesDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(
          frota
            .map((item) => item.base?.trim())
            .filter((base): base is string => Boolean(base)),
        ),
      ).sort((left, right) => left.localeCompare(right, 'pt-BR')),
    [frota],
  );
  const tripulantesDisponiveis = useMemo(
    () =>
      frota
        .map((item) => ({
          id: String(item.tripulante_id),
          nome: item.nome_guerra || item.nome,
        }))
        .filter((item) => item.nome)
        .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR')),
    [frota],
  );
  const rankingCritico = useMemo(
    () =>
      [...filteredFrota].sort((left, right) => {
        const leftWeight = getFrmsNivelWeight(
          resolveFrmsDashboardNivelCompleto({
            effectivenessPct: left.effectiveness_pct ?? null,
            maxCompliancePct: Math.max(left.pct_mes, left.pct_7d, left.pct_dia, left.pct_365d),
            alertNivel: alertNivelByTripulante[left.tripulante_id],
            config: frmsConfig,
          }),
        );
        const rightWeight = getFrmsNivelWeight(
          resolveFrmsDashboardNivelCompleto({
            effectivenessPct: right.effectiveness_pct ?? null,
            maxCompliancePct: Math.max(right.pct_mes, right.pct_7d, right.pct_dia, right.pct_365d),
            alertNivel: alertNivelByTripulante[right.tripulante_id],
            config: frmsConfig,
          }),
        );
        return rightWeight - leftWeight;
      }),
    [alertNivelByTripulante, filteredFrota, frmsConfig],
  );

  useEffect(() => {
    if (selectedTripulanteId) return;
    const worst = rankingCritico[0];
    if (!worst) return;
    setSelectedTripulanteId(String(worst.tripulante_id));
  }, [rankingCritico, selectedTripulanteId]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: filteredFrota.length,
      compliance: {
        ok: complianceByDayStats.ok,
        atencao: complianceByDayStats.atencao,
        critico: complianceByDayStats.critico,
        violacao: complianceByDayStats.violacao,
      },
      effectiveness: {
        plena: effectivenessByDayStats.plena,
        atencao: effectivenessByDayStats.atencao,
        degradada: effectivenessByDayStats.degradada,
        severa: effectivenessByDayStats.severa,
        semDados: effectivenessByDayStats.semDados,
      },
    };
  }, [complianceByDayStats, effectivenessByDayStats, filteredFrota.length]);

  const iogpRealMetrics = useMemo(() => {
    if (!filteredFrota || filteredFrota.length === 0) {
      return {
        maxHvDiaMin: null,
        maxHv7dMin: null,
        maxHv28dMin: null,
        maxHvMesMin: null,
        maxHv365dMin: null,
        avgEffectivenessPct: null,
        effectivenessNivel: null,
        totalSetores: null,
        totalPousos: null,
      };
    }

    let maxDia: number | null = null;
    let max7d: number | null = null;
    let max28d: number | null = null;
    let maxMes: number | null = null;
    let max365d: number | null = null;
    let sumEff = 0;
    let countEff = 0;
    let sumSetores = 0;
    let sumPousos = 0;
    let hasDemand = false;

    for (const item of filteredFrota) {
      if (item.hv_dia_min != null && Number.isFinite(item.hv_dia_min) && item.hv_dia_min > 0) {
        maxDia = maxDia == null ? item.hv_dia_min : Math.max(maxDia, item.hv_dia_min);
      }
      if (item.hv_7d_min != null && Number.isFinite(item.hv_7d_min) && item.hv_7d_min > 0) {
        max7d = max7d == null ? item.hv_7d_min : Math.max(max7d, item.hv_7d_min);
      }
      if (item.hv_28d_min != null && Number.isFinite(item.hv_28d_min) && item.hv_28d_min > 0) {
        max28d = max28d == null ? item.hv_28d_min : Math.max(max28d, item.hv_28d_min);
      }
      if (item.hv_mes_min != null && Number.isFinite(item.hv_mes_min) && item.hv_mes_min > 0) {
        maxMes = maxMes == null ? item.hv_mes_min : Math.max(maxMes, item.hv_mes_min);
      }
      if (item.hv_365d_min != null && Number.isFinite(item.hv_365d_min) && item.hv_365d_min > 0) {
        max365d = max365d == null ? item.hv_365d_min : Math.max(max365d, item.hv_365d_min);
      }
      if (item.effectiveness_pct != null && Number.isFinite(item.effectiveness_pct)) {
        sumEff += item.effectiveness_pct;
        countEff++;
      }
      if (item.total_setores != null && Number.isFinite(item.total_setores) && item.total_setores > 0) {
        sumSetores += item.total_setores;
        hasDemand = true;
      }
      if (item.total_pousos != null && Number.isFinite(item.total_pousos) && item.total_pousos > 0) {
        sumPousos += item.total_pousos;
        hasDemand = true;
      }
    }

    const avgEff = countEff > 0 ? sumEff / countEff : null;
    let effNivel: string | null = null;
    if (avgEff != null) {
      if (avgEff >= 90) effNivel = 'PLENA';
      else if (avgEff >= 77.5) effNivel = 'ATENÇÃO';
      else if (avgEff >= 70) effNivel = 'DEGRADADA';
      else effNivel = 'SEVERA';
    }

    const isDemo = filteredFrota.some(
      (item) =>
        item.nome?.startsWith('QA') ||
        item.nome_guerra?.startsWith('QA')
    );

    return {
      maxHvDiaMin: maxDia,
      maxHv7dMin: max7d,
      maxHv28dMin: max28d,
      maxHvMesMin: maxMes,
      maxHv365dMin: max365d,
      avgEffectivenessPct: avgEff,
      effectivenessNivel: effNivel,
      totalSetores: hasDemand ? sumSetores : null,
      totalPousos: hasDemand ? sumPousos : null,
      isDemo,
    };
  }, [filteredFrota]);

  const handlePickTripulante = useCallback((id: string, nome: string) => {
    setShowPicker(false);
    setJornadaTripulante({ id, nome });
  }, []);

  const handleJornadaSaved = useCallback(() => {
    setJornadaTripulante(null);
    refetchFrota();
    refetchAlertas();
    refetchCount();
  }, [refetchFrota, refetchAlertas, refetchCount]);

  const selectedTripulante = useMemo(
    () => filteredFrota.find((f) => String(f.tripulante_id) === selectedTripulanteId) ?? null,
    [filteredFrota, selectedTripulanteId],
  );

  const timelinePeriodo = useMemo(() => {
    if (isMonthMode) {
      const monthRange = getMonthRange(filters.mesReferencia);
      return {
        dias: monthRange.daysInMonth,
        inicio: monthRange.start,
        fim: monthRange.end,
        label: monthLabel(filters.mesReferencia),
      };
    }
    return {
      dias: periodoNumDias,
      inicio: undefined,
      fim: undefined,
      label: `Últimos ${periodoNumDias} dias`,
    };
  }, [filters.mesReferencia, isMonthMode, periodoNumDias]);

  const selectedRange = useMemo(
    () =>
      timelinePeriodo.inicio && timelinePeriodo.fim
        ? { inicio: timelinePeriodo.inicio, fim: timelinePeriodo.fim }
        : undefined,
    [timelinePeriodo.fim, timelinePeriodo.inicio],
  );

  const { data: selectedTripJornadasRaw, loading: loadingSelectedTripJornadas } =
    useFrmsJornadasEffectiveness(selectedTripulanteId, timelinePeriodo.dias, selectedRange);

  const selectedTripJornadas = useMemo(
    () => (selectedTripJornadasRaw as FrmsEffectivenessJornadaRow[] | null) ?? [],
    [selectedTripJornadasRaw],
  );

  const selectedDayJornada = useMemo(() => {
    if (!selectedHeatmapDay || !selectedTripulanteId) return null;
    if (selectedHeatmapDay.tripulanteId !== selectedTripulanteId) return null;
    return (
      selectedTripJornadas.find((j) => j.data_apresentacao === selectedHeatmapDay.date) ?? null
    );
  }, [selectedHeatmapDay, selectedTripJornadas, selectedTripulanteId]);

  const selectedNextDayJornada = useMemo(() => {
    if (!selectedDayJornada) return null;
    const selectedIndex = selectedTripJornadas.findIndex((j) => j.id === selectedDayJornada.id);
    if (selectedIndex < 0) return null;
    return selectedTripJornadas[selectedIndex + 1] ?? null;
  }, [selectedDayJornada, selectedTripJornadas]);

  return (
    <div
      className="-mx-4 -mt-4 -mb-4 flex overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.08),_transparent_26%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.14),_transparent_28%),linear-gradient(180deg,#020617_0%,#0b1120_100%)] sm:-mx-6 sm:-mt-6 sm:-mb-6 md:-mx-8 lg:-mx-10 xl:-mx-12"
      style={{ height: 'calc(100vh - var(--header-height, 48px))' }}
    >
      {/* ZONA 1: Sidebar — desktop fixo, mobile drawer */}
      <aside className="hidden w-64 flex-shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 lg:flex">
        <FrmsFilters
          modelosDisponiveis={modelosDisponiveis}
          basesDisponiveis={basesDisponiveis}
          tripulantesDisponiveis={tripulantesDisponiveis}
        />
      </aside>

      {/* Mobile drawer overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-sidebar lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex h-full w-72 flex-col overflow-y-auto bg-white shadow-xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filtros</span>
              <button onClick={() => setSidebarOpen(false)} aria-label="Fechar filtros">
                <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>
            <FrmsFilters
          modelosDisponiveis={modelosDisponiveis}
          basesDisponiveis={basesDisponiveis}
          tripulantesDisponiveis={tripulantesDisponiveis}
        />
          </aside>
        </div>
      )}

      {/* ZONA 2 + 3: Main content */}
      <main className="flex-1 flex min-w-0 flex-col overflow-hidden" id="main-content">
        <a href="#frms-action-list" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">
          Pular para conteúdo principal
        </a>
        {/* Header fixo — botões SEMPRE visíveis */}
        <header className="flex-shrink-0 border-b border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:px-6">
          <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <button
                className="mt-0.5 rounded-md p-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden focus:outline-none focus:ring-2 focus:ring-primary/40"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir filtros"
              >
                <Menu className="h-5 w-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
              </button>

              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
                  {analysisView ? 'Análise & Evidência' : 'Gestão FRMS'}
                </h1>
                <div className="mt-2">
                  <FrmsWorkspaceNav />
                </div>
                <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                  Painel de decisão operacional — quem exige ação, por quê e onde ver evidência
                </p>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                    <CalendarRange className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    {isMonthMode
                      ? `Mensal · ${monthLabel(filters.mesReferencia)}`
                      : `Últimos ${periodoNumDias} dias`}
                  </span>
                  {isMonthMode && (
                    <>
                      <button
                        type="button"
                        onClick={() => setFilter('quinzena', filters.quinzena === 'Q1' ? '' : 'Q1')}
                        aria-label={`Quinzena 1: ${quinzenasDoMes?.q1?.label ?? '1–15'}`}
                        aria-pressed={filters.quinzena === 'Q1'}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                          filters.quinzena === 'Q1'
                            ? 'border-teal-300 bg-teal-50 text-teal-700 font-semibold'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        {quinzenasDoMes?.q1?.label ?? 'Q1: 1–15'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilter('quinzena', filters.quinzena === 'Q2' ? '' : 'Q2')}
                        aria-label={`Quinzena 2: ${quinzenasDoMes?.q2?.label ?? '16–31'}`}
                        aria-pressed={filters.quinzena === 'Q2'}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                          filters.quinzena === 'Q2'
                            ? 'border-teal-300 bg-teal-50 text-teal-700 font-semibold'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        {quinzenasDoMes?.q2?.label ?? 'Q2: 16–31'}
                      </button>
                    </>
                  )}
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                    <Users className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    {stats.total} tripulantes monitorados
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
                    <Bell className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                    {alertCount} alertas abertos
                  </span>
                  {selectedTripulante && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300">
                      <Activity className="h-3.5 w-3.5" />
                      Em foco: {selectedTripulante.nome_guerra || selectedTripulante.nome}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/frms/importacao/fira')}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-inset dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Upload className="h-4 w-4" />
                  <span>Importar FIRAs</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-inset"
                >
                  <Plus className="h-4 w-4" />
                  <span>Incluir Jornada</span>
                </button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/frms/alertas')}
                  className="relative"
                  title="Alertas abertos"
                >
                  <Bell className="h-4 w-4" />
                  {alertCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                      {alertCount > 99 ? '99+' : alertCount}
                    </span>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/frms/relatorios')}
                  className="hidden sm:flex"
                  title="Relatórios"
                >
                  <TrendingUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/frms/configuracoes')}
                  className="hidden sm:flex"
                  title="Configurações"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => navigate('/frms/checkin')}
                  className="inline-flex gap-2.5 px-4"
                  title="Fadiga diária"
                >
                  <ClipboardCheck className="h-4 w-4 shrink-0" />
                  <span>Fadiga Diária</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/frms/controle-operacional')}
                  className="hidden sm:inline-flex gap-2.5 px-4"
                  title="Controle operacional"
                >
                  <Activity className="h-4 w-4 shrink-0" />
                  <span>Controle Operacional</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/frms/conceitos')}
                  className="hidden sm:inline-flex gap-2.5 px-4"
                  title="Como funciona o FRMS"
                  aria-label="Conceitos e cálculo"
                >
                  <BookOpen className="h-4 w-4 shrink-0" />
                  <span>Como funciona o FRMS</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 p-4 sm:p-6">
            <FrmsFilterChips />
            <FrmsSourcePolicyBanner />

            <FrmsCoordQueuePanel
              items={visibleOperationalSnapshot}
              loading={loadingOperationalSnapshot}
              onSelectCrew={(id) => setSelectedTripulanteId(String(id))}
            />

            <FrmsIogpAuditPanel
              hasOperationalData={filteredFrota.length > 0}
              totalTripulantes={filteredFrota.length}
              totalJornadas={stats.compliance.ok + stats.compliance.atencao + stats.compliance.critico + stats.compliance.violacao}
              maxHvDiaMin={iogpRealMetrics.maxHvDiaMin}
              maxHv7dMin={iogpRealMetrics.maxHv7dMin}
              maxHv28dMin={iogpRealMetrics.maxHv28dMin}
              maxHvMesMin={iogpRealMetrics.maxHvMesMin}
              maxHv365dMin={iogpRealMetrics.maxHv365dMin}
              avgEffectivenessPct={iogpRealMetrics.avgEffectivenessPct}
              effectivenessNivel={iogpRealMetrics.effectivenessNivel}
              totalSetores={iogpRealMetrics.totalSetores}
              totalPousos={iogpRealMetrics.totalPousos}
              isDemo={iogpRealMetrics.isDemo}
            />

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" id="frms-action-list" aria-label="Painel de ação operacional">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {isMonthMode
                      ? `Quinzena operacional · ${monthLabel(filters.mesReferencia)}`
                      : 'Recorte operacional'}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-950">
                    {filters.quinzena
                      ? quinzenaAtiva?.label ?? `Quinzena: ${fortnightLabel}`
                      : `Q1 ${quinzenasDoMes?.q1?.label ?? '1–15'}  ·  Q2 ${quinzenasDoMes?.q2?.label ?? '16–31'}`}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {loadingOperationalSnapshot
                      ? 'Carregando recorte operacional...'
                      : actionRequiredCount > 0
                        ? `${actionRequiredCount} tripulante(s) exigem ação ou confirmação`
                        : 'Nenhuma ação imediata — confira fontes e check-ins abaixo'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/frms/controle-operacional?data=${operationalSnapshotDate}`)}
                >
                  <Activity className="mr-2 h-4 w-4" />
                  Controle operacional
                </Button>
              </div>

              {!loadingOperationalSnapshot && !operationalSnapshotError && (
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {fortnightSummary.criticalCount > 0 && (
                    <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 font-medium text-red-800">
                      {fortnightSummary.criticalCount} crítico(s)
                    </span>
                  )}
                  {fortnightSummary.criticalCheckinsCount + fortnightSummary.estimatedOrIncompleteCount >
                    0 && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                      {fortnightSummary.criticalCheckinsCount} check-in ·{' '}
                      {fortnightSummary.estimatedOrIncompleteCount} fonte incompleta
                    </span>
                  )}
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                    Tendência geral: {fortnightSummary.generalTrendLabel}
                  </span>
                </div>
              )}

              <div className="mt-4">
                <FrmsOperationalActionList
                  summary={fortnightSummary}
                  loading={loadingOperationalSnapshot}
                  maxItemsPerGroup={8}
                  hideHeader
                />
              </div>
            </section>

            <details className="rounded-2xl border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-2xl" aria-expanded="false">
                Detalhes técnicos — compliance, fadiga, efetividade e mapa
              </summary>
              <div className="space-y-4 border-t border-slate-100 p-4">
            <section className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
                {(
                  [
                    ['compliance', 'Compliance legal'],
                    ['fatigue', 'Fadiga / check-in'],
                    ['effectiveness', 'Efetividade estimada'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setMapLens(key);
                      setComplianceDayFilter(null);
                      setEffectivenessDayFilter(null);
                    }}
                    aria-pressed={mapLens === key}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      mapLens === key
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {mapLens === 'compliance' &&
                  'Compliance legal (HV/jornada). Separado de fadiga/check-in e efetividade.'}
                {mapLens === 'fatigue' &&
                  'Fadiga e check-in subjetivo. Não confundir com compliance ou efetividade.'}
                {mapLens === 'effectiveness' &&
                  'Prontidão estimada — apoio humano, não diagnóstico médico.'}
              </p>
              {mapLens === 'fatigue' && (
                <p className="mt-2 text-xs text-slate-600">
                  {fortnightSummary.estimatedOrIncompleteCount > 0
                    ? `${fortnightSummary.estimatedOrIncompleteCount} tripulante(s) com fonte incompleta ou estimada no recorte.`
                    : 'Fonte confirmada no recorte operacional visível.'}
                </p>
              )}
            </section>

            {rankingCritico.length > 0 && (
              <section
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                aria-label="Ranking automático dos tripulantes mais críticos"
              >
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Ranking automático — casos mais críticos
                </h2>
                <ol className="mt-3 space-y-2">
                  {rankingCritico.slice(0, 8).map((item, index) => (
                    <li key={item.tripulante_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedTripulanteId(String(item.tripulante_id))}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                          selectedTripulanteId === String(item.tripulante_id)
                            ? 'border-teal-300 bg-teal-50 text-teal-900'
                            : 'border-slate-200 bg-slate-50 hover:bg-white'
                        }`}
                      >
                        <span>
                          {index + 1}. {item.nome_guerra || item.nome}
                        </span>
                        <span className="text-xs text-slate-500">{item.base || item.aeronave_modelo || '—'}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {(mapLens === 'compliance' || mapLens === 'effectiveness') && (
            <FrmsMetricCards
              complianceCards={
                mapLens === 'compliance'
                  ? [
                      { key: 'OK', total: stats.compliance.ok },
                      { key: 'ATENCAO', total: stats.compliance.atencao },
                      { key: 'CRITICO', total: stats.compliance.critico },
                      { key: 'VIOLACAO', total: stats.compliance.violacao },
                    ]
                  : []
              }
              effectivenessCards={
                mapLens === 'effectiveness'
                  ? [
                      { key: 'PLENA', total: stats.effectiveness.plena },
                      { key: 'ATENCAO', total: stats.effectiveness.atencao },
                      { key: 'DEGRADADA', total: stats.effectiveness.degradada },
                      { key: 'SEVERA', total: stats.effectiveness.severa },
                    ]
                  : []
              }
              effectivenessSemDados={mapLens === 'effectiveness' ? stats.effectiveness.semDados : 0}
              activeComplianceKey={complianceDayFilter}
              onComplianceToggle={(key) => {
                setComplianceDayFilter((prev) => (prev === key ? null : key));
                setEffectivenessDayFilter(null);
              }}
              activeEffectivenessKey={effectivenessDayFilter}
              onEffectivenessToggle={(key) => {
                setEffectivenessDayFilter((prev) => (prev === key ? null : key));
                setComplianceDayFilter(null);
              }}
            />
            )}

            <details className="rounded-2xl border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-2xl">
                Mapa técnico da quinzena — apoio à evidência
              </summary>
              <div className="border-t border-slate-100 p-2">
            <FrmsHeatmap
              onSelectTripulante={(id) => {
                setSelectedTripulanteId(id);
                setSelectedHeatmapDay((prev) => {
                  if (prev && prev.tripulanteId !== id) return null;
                  return prev;
                });
              }}
              onSelectDay={({ tripulanteId, tripulanteNome, date }) => {
                setSelectedTripulanteId(tripulanteId);
                setSelectedHeatmapDay({ tripulanteId, tripulanteNome, date });
              }}
              alertNivelByTripulante={alertNivelByTripulante}
              config={frmsConfig}
              allowedTripulanteIds={filteredTripulanteIds}
              complianceDayFilter={complianceDayFilter}
              effectivenessDayFilter={effectivenessDayFilter}
            />
              </div>
            </details>

            {/* Row 2: Curva de Efetividade — visível só quando tripulante selecionado */}
            {selectedTripulanteId && (
              <div ref={timelineRef}>
                <Suspense
                  fallback={
                    <div className="h-48 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
                  }
                >
                  <FrmsEffectivenessTimeline
                    tripulanteId={selectedTripulanteId}
                    tripulanteNome={
                      filteredFrota.find((f) => String(f.tripulante_id) === selectedTripulanteId)
                        ?.nome_guerra ??
                      filteredFrota.find((f) => String(f.tripulante_id) === selectedTripulanteId)
                        ?.nome
                    }
                    config={frmsConfig}
                    mapPeriodoDias={timelinePeriodo.dias}
                    mapPeriodoInicio={timelinePeriodo.inicio}
                    mapPeriodoFim={timelinePeriodo.fim}
                    mapPeriodoLabel={timelinePeriodo.label}
                  />
                </Suspense>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-200">
                      Dia selecionado no mapa
                    </h3>
                    {selectedHeatmapDay ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {selectedHeatmapDay.date.slice(8, 10)}/{selectedHeatmapDay.date.slice(5, 7)}
                        {' · '}
                        {selectedHeatmapDay.tripulanteNome}
                      </span>
                    ) : null}
                  </div>

                  {!selectedHeatmapDay ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Clique em um dia no mapa técnico para abrir o detalhe da jornada.
                    </p>
                  ) : loadingSelectedTripJornadas ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Carregando jornada do dia selecionado...
                    </p>
                  ) : selectedDayJornada ? (
                    <>
                      <FrmsJornadaEffectivenessCard
                        jornada={selectedDayJornada}
                        nextJornada={selectedNextDayJornada}
                        config={frmsConfig}
                      />
                      <FrmsDayExplanationPanel
                        tripulanteId={selectedHeatmapDay.tripulanteId}
                        tripulanteNome={selectedHeatmapDay.tripulanteNome}
                        date={selectedHeatmapDay.date}
                        config={frmsConfig}
                        source="dashboard"
                      />
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Sem jornada registrada para esse dia no período selecionado.
                    </p>
                  )}
                </div>
              </div>
            )}

            <FrmsTripulantesTable
              frota={filteredFrota}
              loading={loadingFrota}
              alertNivelByTripulante={alertNivelByTripulante}
              config={frmsConfig}
            />
              </div>
            </details>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showPicker && (
        <TripulantePickerModal
          onSelect={handlePickTripulante}
          onClose={() => setShowPicker(false)}
        />
      )}
      {jornadaTripulante && (
        <FrmsFormJornada
          tripulanteId={jornadaTripulante.id}
          tripulanteNome={jornadaTripulante.nome}
          jornada={null}
          onClose={() => setJornadaTripulante(null)}
          onSaved={handleJornadaSaved}
        />
      )}
    </div>
  );
}

// ── Export ────────────────────────────────

export default function FrmsDashboard() {
  return (
    <AppLayout>
      <FrmsFilterProvider>
        <DashboardContent />
      </FrmsFilterProvider>
    </AppLayout>
  );
}
