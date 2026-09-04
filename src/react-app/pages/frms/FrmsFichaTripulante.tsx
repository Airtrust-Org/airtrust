/**
 * FRMS — Ficha Individual do Tripulante (/frms/tripulante/:id)
 *
 * - Cards de acúmulo (HV dia / 15d quinzena / 30d / 365d / FDP)
 * - Tabela mensal detalhada
 * - Histórico de alertas
 * - Botão para lançar jornada
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Calendar, ChevronLeft, ChevronRight, CalendarX, X } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { EmptyState } from '@/react-app/components/UI/EmptyState';
import {
  useFrmsJornadas,
  useFrmsUltimaJornada,
  useFrmsAcumulo,
  useFrmsAlertas,
  useFrmsMutation,
  useFrmsJornadasEffectiveness,
} from '@/react-app/hooks/useFrms';
import type {
  FrmsJornadaRow,
  FrmsAlertaRow,
  FrmsAcumuloRolling,
  FrmsEffectivenessJornadaRow,
} from '@/react-app/hooks/useFrms';
import { toast } from 'sonner';
import FrmsFormJornada from './FrmsFormJornada';
import FrmsEffectivenessPanel from './components/FrmsEffectivenessPanel';
import FrmsDayExplanationPanel from './components/FrmsDayExplanationPanel';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { formatFrmsDate, isTripulanteOperacional } from './frmsUtils';
import { buildJornadaMensalPresentation } from './frmsJornadasMensaisPresentation';
import { useFrmsOperationalSnapshot } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { FortnightConsolidatedPanel } from './components/FortnightOperationalIndicator';
import { FrmsSignalGrid } from './components/FrmsOperationalSignals';

const FrmsEffectivenessTimeline = lazy(() => import('./components/FrmsEffectivenessTimeline'));

function formatMin(min: number | null | undefined): string {
  if (!min) return '00h00';
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = String(h).padStart(2, '0');
  return `${hh}h${String(m).padStart(2, '0')}`;
}

function getMonthRange(mes: string): { dataInicio: string; dataFim: string } | null {
  const matchMes = mes.match(/^(\d{4})-(\d{1,2})$/);
  if (!matchMes) return null;
  const ano = Number(matchMes[1]);
  const mesNum = Number(matchMes[2]);
  if (mesNum < 1 || mesNum > 12) return null;
  const mesPad = String(mesNum).padStart(2, '0');
  const ultimoDia = new Date(ano, mesNum, 0).getDate();
  return {
    dataInicio: `${ano}-${mesPad}-01`,
    dataFim: `${ano}-${mesPad}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

const MONTHS_PT: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function normalizeMonthValue(raw: string): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();

  const isoMatch = value.match(/^(\d{4})-(\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    if (m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, '0')}`;
  }

  const brMatch = value.match(/^(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const m = Number(brMatch[1]);
    const y = Number(brMatch[2]);
    if (m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, '0')}`;
  }

  const extMatch = value.match(/^([a-zçãéôóíú]+)\s+de\s+(\d{4})$/i);
  if (extMatch) {
    const mesNome = extMatch[1]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const y = Number(extMatch[2]);
    const m = MONTHS_PT[mesNome];
    if (m) return `${y}-${String(m).padStart(2, '0')}`;
  }

  return null;
}

function shiftMonth(monthValue: string, delta: number): string {
  const normalized = normalizeMonthValue(monthValue);
  const match = normalized?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthValue;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const base = new Date(ano, mes - 1 + delta, 1);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonthLabel(monthValue: string): string {
  const normalized = normalizeMonthValue(monthValue);
  const match = normalized?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthValue;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const date = new Date(ano, mes - 1, 1);
  const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ProgressBar({
  pct,
  label,
  limiteAvisoPct = 85,
  limiteCriticoPct = 95,
  limiteViolacaoPct = 101,
}: {
  pct: number;
  label: string;
  limiteAvisoPct?: number;
  limiteCriticoPct?: number;
  limiteViolacaoPct?: number;
}) {
  const clamped = Math.min(pct, 120);
  const barColor =
    pct >= limiteViolacaoPct
      ? 'bg-gradient-to-r from-red-500 to-red-600'
      : pct >= limiteCriticoPct
        ? 'bg-gradient-to-r from-red-400 to-orange-500'
        : pct >= limiteAvisoPct
          ? 'bg-gradient-to-r from-amber-400 to-orange-500'
          : 'bg-gradient-to-r from-primary to-emerald-600';
  const textColor =
    pct >= limiteCriticoPct
      ? 'text-red-700'
      : pct >= limiteAvisoPct
        ? 'text-amber-700'
        : 'text-slate-900';

  return (
    <div className="group">
      <div className="flex justify-between text-xs font-semibold text-slate-700 mb-2">
        <span>{label}</span>
        <span className={`font-bold ${textColor}`}>{pct.toFixed(1)}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={120}
        aria-label={`${label}: ${pct.toFixed(1)}%`}
        className="relative h-3 rounded-xl bg-slate-100 overflow-hidden shadow-inner border border-slate-200/50"
      >
        <div
          className={`${barColor} h-full shadow-lg group-hover:shadow-xl transition-all duration-700 motion-safe:transition-all`}
          style={{ width: `${Math.min(clamped, 100)}%` }}
        />
      </div>
    </div>
  );
}

function nivelBadge(nivel: string) {
  // Tratar AVISO como ATENCAO na UI
  const displayNivel = nivel === 'AVISO' ? 'ATENCAO' : nivel;
  const colors: Record<string, string> = {
    AVISO: 'bg-yellow-100 text-yellow-800', // mapeado para Atenção
    ATENCAO: 'bg-yellow-100 text-yellow-800',
    CRITICO: 'bg-orange-100 text-orange-800',
    VIOLACAO: 'bg-red-100 text-red-800',
  };
  const label =
    displayNivel === 'ATENCAO'
      ? 'ATENÇÃO'
      : displayNivel === 'CRITICO'
        ? 'CRÍTICO'
        : displayNivel === 'VIOLACAO'
          ? 'VIOLAÇÃO'
          : displayNivel;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[displayNivel] || 'bg-gray-100 text-gray-700'}`}
    >
      {label}
    </span>
  );
}

const STATUS_LABELS: Record<string, string> = {
  ES: 'Escala',
  TS: 'Treinamento de Solo',
  TV: 'Treinamento de Voo',
  EX: 'Exame de Voo',
  RE: 'Reserva',
  SA: 'Sobreaviso',
  FE: 'Férias',
  FR: 'Folga Regulamentar',
  FS: 'Folga Social',
  AM: 'Atestado Médico',
  DM: 'Dispensa Médica',
  OT: 'Outra',
};

const STATUS_COLORS: Record<string, string> = {
  ES: 'bg-blue-100 text-blue-800',
  FR: 'bg-green-100 text-green-800',
  FE: 'bg-purple-100 text-purple-800',
  STANDBY_BASE: 'bg-orange-100 text-orange-800',
  STANDBY_CASA: 'bg-yellow-100 text-yellow-800',
  TRAINING: 'bg-indigo-100 text-indigo-800',
  POSITIONING: 'bg-cyan-100 text-cyan-800',
};

function getCurrentMonthKeyLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * N-10: destino do botão "Voltar" da ficha individual FRMS.
 *
 * `/frms/tripulante/:id` é uma página independente (header e rota próprios).
 * Quando é aberta a partir da Ficha do Funcionário (`?origem=ficha`), o retorno
 * é para a ficha de origem — mantendo a navegação coerente com o módulo
 * Funcionários. Para qualquer outra origem (operacao, casos, acesso direto por
 * URL) o comportamento canônico do FRMS é preservado: volta para `/frms`.
 */
export function resolveFrmsFichaBack(
  origem: string | null,
  id: string | undefined,
): { target: string; label: string } {
  const funcionarioId = Number(id);
  if (origem === 'ficha' && Number.isFinite(funcionarioId) && funcionarioId > 0) {
    return { target: `/funcionarios/${id}`, label: 'Voltar à ficha' };
  }
  return { target: '/frms', label: 'Voltar' };
}

export default function FrmsFichaTripulante() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { mutate } = useFrmsMutation();
  const [mesAtual, setMesAtual] = useState(() => {
    const queryMonth = normalizeMonthValue(searchParams.get('mes') || '');
    return queryMonth || getCurrentMonthKeyLocal();
  });
  const [page, setPage] = useState(1);
  const [jornadasVersion, setJornadasVersion] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingJornada, setEditingJornada] = useState<FrmsJornadaRow | null>(null);
  const [selectedExplanationDate, setSelectedExplanationDate] = useState<string | null>(null);
  const hojeIso = new Date().toISOString().slice(0, 10);

  const requestedFuncionarioId = Number(id);

  // N-10: "Voltar" sensível à origem (ver resolveFrmsFichaBack).
  const { target: backTarget, label: backLabel } = resolveFrmsFichaBack(
    searchParams.get('origem'),
    id,
  );
  const {
    data: frmsSnapshotItems,
    loading: loadingFrmsSnapshotToday,
    meta: frmsSnapshotMeta,
  } = useFrmsOperationalSnapshot({
    data_inicio: hojeIso,
    data_fim: hojeIso,
    funcionario_id: id,
  });
  const todayFortnightSnapshotItem = frmsSnapshotItems.find(
    (item) => item.funcionario_id === requestedFuncionarioId,
  );
  const shouldExposeFortnightIndicator =
    Number.isFinite(requestedFuncionarioId) &&
    requestedFuncionarioId > 0 &&
    (!frmsSnapshotMeta?.forced_funcionario_id ||
      frmsSnapshotMeta.forced_funcionario_id === requestedFuncionarioId);
  const todayFortnightIndicator = shouldExposeFortnightIndicator
    ? todayFortnightSnapshotItem?.fortnight_indicator ?? null
    : null;
  const fortnightPeriodStart = todayFortnightIndicator?.periodo_inicio || '';
  const fortnightPeriodEnd = todayFortnightIndicator?.periodo_fim || '';
  const shouldLoadFortnightPeriod =
    shouldExposeFortnightIndicator && Boolean(fortnightPeriodStart) && Boolean(fortnightPeriodEnd);
  const {
    data: fortnightPeriodSnapshotItems,
    loading: loadingFortnightPeriodSnapshot,
  } = useFrmsOperationalSnapshot(
    {
      data_inicio: fortnightPeriodStart,
      data_fim: fortnightPeriodEnd,
      funcionario_id: id,
      include_inconsistencies: true,
    },
    { enabled: shouldLoadFortnightPeriod },
  );
  const fullPeriodFortnightSnapshotItem =
    fortnightPeriodSnapshotItems.find(
      (item) =>
        item.funcionario_id === requestedFuncionarioId && item.data_operacional === hojeIso,
    ) ||
    [...fortnightPeriodSnapshotItems]
      .reverse()
      .find((item) => item.funcionario_id === requestedFuncionarioId) ||
    null;
  const fortnightIndicator =
    shouldExposeFortnightIndicator
      ? fullPeriodFortnightSnapshotItem?.fortnight_indicator ?? todayFortnightIndicator
      : null;
  const loadingFrmsSnapshot = loadingFrmsSnapshotToday || (shouldLoadFortnightPeriod && loadingFortnightPeriodSnapshot);

  const { data: recentJornadasRaw } = useFrmsJornadasEffectiveness(id, 7);
  const { data: ultimaJornadaRaw } = useFrmsUltimaJornada(id, { dataFim: hojeIso });
  const recentJornadas = recentJornadasRaw as FrmsEffectivenessJornadaRow[] | null;
  const latestJornada =
    recentJornadas && recentJornadas.length > 0 ? recentJornadas[recentJornadas.length - 1] : null;
  const ultimaJornadaMes =
    ultimaJornadaRaw?.data?.[0]?.data && /^\d{4}-\d{2}-\d{2}$/.test(ultimaJornadaRaw.data[0].data)
      ? ultimaJornadaRaw.data[0].data.slice(0, 7)
      : null;

  const { data: jornadasRaw, loading: loadingJ } = useFrmsJornadas(
    id,
    mesAtual,
    page,
    jornadasVersion,
  );
  const { data: acumuloRaw, loading: loadingA, refetch: refetchA } = useFrmsAcumulo(id, mesAtual);
  const rangeMes = getMonthRange(mesAtual);
  const { data: alertasMesRaw, refetch: refetchAlertasMes } = useFrmsAlertas(
    id && rangeMes
      ? {
          tripulante_id: id,
          data_inicio: rangeMes.dataInicio,
          data_fim: rangeMes.dataFim,
          limit: '500',
        }
      : undefined,
  );

  const paginado = jornadasRaw ?? null;
  const jornadas: FrmsJornadaRow[] = paginado?.data ?? [];
  const acumulo = acumuloRaw as {
    nome?: string;
    rolling: FrmsAcumuloRolling | null;
    mensal: Record<string, number> | null;
    limites: Record<string, number> | null;
  } | null;
  const alertasMes: FrmsAlertaRow[] = (alertasMesRaw as FrmsAlertaRow[] | null) ?? [];
  const rolling = acumulo?.rolling;
  const limites = acumulo?.limites ?? null;
  const limiteAvisoPct = Number(limites?.ALERTA_AVISO_PCT ?? 85);
  const limiteCriticoPct = Number(limites?.ALERTA_CRITICO_PCT ?? 95);
  const limiteViolacaoPct = Number(limites?.ALERTA_VIOLACAO_PCT ?? 101);

  const alertasPorJornada = alertasMes.reduce<Record<string, FrmsAlertaRow[]>>((acc, alerta) => {
    if (!alerta.jornada_id) return acc;
    if (!acc[alerta.jornada_id]) acc[alerta.jornada_id] = [];
    acc[alerta.jornada_id].push(alerta);
    return acc;
  }, {});

  // Nome real do tripulante
  const nomeTrip = acumulo?.nome ?? (id ? `Tripulante #${id}` : 'Tripulante');

  const handleEditar = (j: FrmsJornadaRow) => {
    setEditingJornada(j);
    setShowForm(true);
  };

  const handleNova = () => {
    setEditingJornada(null);
    setShowForm(true);
  };

  // Reset page when month changes
  const handleMesChange = (newMes: string) => {
    const normalized = normalizeMonthValue(newMes);
    if (!normalized) return;
    setMesAtual(normalized);
    setPage(1);
  };

  useEffect(() => {
    const queryMonth = normalizeMonthValue(searchParams.get('mes') || '');
    if (queryMonth && queryMonth !== mesAtual) {
      setMesAtual(queryMonth);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const queryMonth = normalizeMonthValue(searchParams.get('mes') || '');
    if (queryMonth) return;
    if (!ultimaJornadaMes || ultimaJornadaMes === mesAtual) return;
    setMesAtual(ultimaJornadaMes);
    setPage(1);
  }, [mesAtual, searchParams, ultimaJornadaMes]);

  useEffect(() => {
    const current = searchParams.get('mes') || '';
    if (current === mesAtual) return;
    const next = new URLSearchParams(searchParams);
    next.set('mes', mesAtual);
    setSearchParams(next, { replace: true });
  }, [mesAtual, searchParams, setSearchParams]);

  const handleMesAnterior = () => {
    handleMesChange(shiftMonth(mesAtual, -1));
  };

  const handleMesSeguinte = () => {
    handleMesChange(shiftMonth(mesAtual, 1));
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingJornada(null);
    setJornadasVersion((v) => v + 1);
    refetchA();
    refetchAlertasMes();
  };

  const handleExcluir = async (jornada: FrmsJornadaRow) => {
    const data =
      jornada.data.slice(8, 10) + '/' + jornada.data.slice(5, 7) + '/' + jornada.data.slice(0, 4);
    const confirmar = await confirmDialog(
      `Excluir a jornada do dia ${data}? Esta ação não pode ser desfeita.`,
    );
    if (!confirmar) return;

    try {
      await mutate(`/api/frms/jornadas/${jornada.id}`, { method: 'DELETE' });
      toast.success('Jornada excluída com sucesso');
      setJornadasVersion((v) => v + 1);
      refetchA();
      refetchAlertasMes();
    } catch {
      toast.error('Erro ao excluir jornada');
    }
  };

  const handleExcluirMes = async () => {
    if (jornadas.length === 0) return;
    const [ano, mes] = mesAtual.split('-');
    const mesLabel = new Date(Number(ano), Number(mes) - 1, 1).toLocaleString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });

    // Usar window.confirm direto para evitar qualquer problema com confirmDialog
    const confirmar = window.confirm(
      `Apagar TODAS as ${jornadas.length} jornada(s) de ${mesLabel} para ${nomeTrip}?\n\nEsta ação não pode ser desfeita.`,
    );
    if (!confirmar) return;

    // Capturar lista atual antes de qualquer mutação
    const listaParaApagar = [...jornadas];
    let deletedCount = 0;

    for (const jornada of listaParaApagar) {
      try {
        await mutate(`/api/frms/jornadas/${jornada.id}`, { method: 'DELETE' });
        deletedCount += 1;
      } catch {
        // continua tentando as próximas
      }
    }

    if (deletedCount > 0) {
      toast.success(`${deletedCount} jornada(s) de ${mesLabel} apagada(s) com sucesso`);
    } else {
      toast.error('Nenhuma jornada foi apagada. Tente novamente.');
    }

    setPage(1);
    setJornadasVersion((v) => v + 1);
    refetchA();
    refetchAlertasMes();
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Back + Header */}
        <section className="bg-white/80 backdrop-blur-sm border border-slate-200/50 rounded-2xl px-6 py-5 shadow-lg">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={() => navigate(backTarget)}
                className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all shrink-0"
              >
                <ArrowLeft className="h-4 w-4" /> {backLabel}
              </button>
              <div className="min-w-0">
                <h1 className="text-2xl font-black bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent truncate">
                  {nomeTrip}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">Ficha FRMS — Jornadas e Fadiga</p>
              </div>
            </div>
            <button
              onClick={handleNova}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 transition-colors shrink-0"
            >
              <Plus className="h-4 w-4" /> Incluir Jornada
            </button>
          </div>
        </section>

        {todayFortnightSnapshotItem ? (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 px-5 py-4 shadow-sm backdrop-blur-sm">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Status operacional do dia</h2>
            <FrmsSignalGrid
              item={todayFortnightSnapshotItem}
              className="mt-3 sm:grid-cols-4"
            />
          </section>
        ) : null}

        <FortnightConsolidatedPanel
          indicator={fortnightIndicator}
          loading={loadingFrmsSnapshot}
          funcionarioId={requestedFuncionarioId}
          focusDate={hojeIso}
        />

        {/* Non-operational crew warning */}
        {!loadingFrmsSnapshot && todayFortnightSnapshotItem && !isTripulanteOperacional(todayFortnightSnapshotItem.funcao) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Atenção:</strong> Este funcionário não é classificado como tripulante operacional
            (função: {todayFortnightSnapshotItem.funcao || 'não informada'}).
            Os dados de fadiga operacional podem não se aplicar.
          </div>
        )}

        {/* Effectiveness Panel (Painel A) + Compliance Cards (Painel B) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Painel A — Score de Efetividade */}
          {acumulo?.effectiveness ? (
            <div className="lg:col-span-4 xl:col-span-3">
              {latestJornada?.processado_com_bug === 0 && (
                <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  Dados recalculados com a fórmula corrigida de effectiveness FRMS.
                </div>
              )}
              <FrmsEffectivenessPanel
                effectiveness_pct={acumulo.effectiveness.effectiveness_pct}
                effectiveness_nivel={acumulo.effectiveness.effectiveness_nivel}
                componentes={
                  acumulo.effectiveness.effectiveness_componentes as {
                    processo_s: number;
                    processo_c: number;
                    repouso: number;
                    hv: number;
                    duracao: number;
                  } | null
                }
                config={limites}
              />
              {latestJornada?.dia_periodo_embarcado != null &&
                latestJornada.total_dias_periodo != null &&
                latestJornada.total_dias_periodo > 1 && (
                  <div className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-primary px-3 py-1 text-xs font-semibold text-blue-700 mt-2">
                    <Calendar className="w-3 h-3" />
                    <span>
                      Dia {latestJornada.dia_periodo_embarcado} de{' '}
                      {latestJornada.total_dias_periodo} embarcado
                    </span>
                  </div>
                )}
            </div>
          ) : null}

          {/* Painel B — Compliance Regulatório */}
          <div className={`${acumulo?.effectiveness ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-12'}`}>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Compliance Regulatório
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {rolling || acumulo?.mensal ? (
                <>
                  {/* Janela 15 dias — Jornada */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <ProgressBar
                      pct={Math.min(100, acumulo?.mensal?.jornada_fatorizada_pct ?? 0)}
                      label="Jornada 15 dias"
                      limiteAvisoPct={limiteAvisoPct}
                      limiteCriticoPct={limiteCriticoPct}
                      limiteViolacaoPct={limiteViolacaoPct}
                    />
                    <p className="mt-2 text-center text-xs text-gray-500">
                      {formatMin(acumulo?.mensal?.jornada_realizada_min ?? 0)} acumuladas
                    </p>
                  </div>
                  {/* Janela 30 dias — HV */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <ProgressBar
                      pct={rolling?.pct_limite_mes_calendario ?? rolling?.pct_limite_28d ?? 0}
                      label="HV 30 dias"
                      limiteAvisoPct={limiteAvisoPct}
                      limiteCriticoPct={limiteCriticoPct}
                      limiteViolacaoPct={limiteViolacaoPct}
                    />
                    <p className="mt-2 text-center text-xs text-gray-500">
                      {formatMin(rolling?.hv_mes_calendario_min ?? 0)} /{' '}
                      {limites?.HV_MES_HORAS ?? 90}h
                    </p>
                  </div>
                  {/* HV Diária */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <ProgressBar
                      pct={rolling?.pct_limite_dia ?? 0}
                      label="HV Dia"
                      limiteAvisoPct={limiteAvisoPct}
                      limiteCriticoPct={limiteCriticoPct}
                      limiteViolacaoPct={limiteViolacaoPct}
                    />
                    <p className="mt-2 text-center text-xs text-gray-500">
                      {formatMin(rolling?.hv_dia_min ?? 0)} / {limites?.HV_DIARIA_HORAS ?? 8}h
                    </p>
                  </div>
                  {/* Janela 365 dias — Acúmulo */}
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <ProgressBar
                      pct={Math.min(100, acumulo?.mensal?.hv_fatorizada_pct ?? 0)}
                      label="Acúmulo 365 dias"
                      limiteAvisoPct={limiteAvisoPct}
                      limiteCriticoPct={limiteCriticoPct}
                      limiteViolacaoPct={limiteViolacaoPct}
                    />
                    <p className="mt-2 text-center text-xs text-gray-500">
                      {formatMin(acumulo?.mensal?.hv_realizada_min ?? 0)} HV acumuladas
                    </p>
                  </div>
                </>
              ) : (
                <div className="col-span-full rounded-xl border border-gray-200 bg-white p-5 text-center text-gray-400 text-sm">
                  {loadingA ? 'Carregando acúmulo...' : 'Sem dados de acúmulo'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Curva de Efetividade (Modelo Offshore Sleep) */}
        <Suspense fallback={<div className="h-48 rounded-xl border border-gray-200 bg-white" />}>
          <FrmsEffectivenessTimeline
            tripulanteId={id ?? null}
            tripulanteNome={nomeTrip}
            config={limites}
          />
        </Suspense>

        {/* Month selector + Table */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                Jornadas Mensais
              </h3>
              {jornadas.length > 0 && (
                <button
                  type="button"
                  onClick={handleExcluirMes}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  title="Apagar todas as jornadas deste mês"
                >
                  Apagar Jornadas do Mês
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMesAnterior}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                title="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="inline-flex min-w-[160px] items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700">
                {formatMonthLabel(mesAtual)}
              </span>
              <button
                type="button"
                onClick={handleMesSeguinte}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                title="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500">
                    Data
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500">
                    Fonte
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500">
                    Apresentação
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500">
                    Término
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500 text-right">
                    Jornada
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500 text-right">
                    Horas de Voo
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500">
                    Alertas do Dia
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500 text-right">
                    FAT.JORNADA% dia
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500 text-right">
                    FAT.HV% dia
                  </th>
                  <th className="px-4 py-2.5 text-xs font-semibold uppercase text-gray-500 text-center">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingJ ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : jornadas.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12">
                      <EmptyState
                        icon={<CalendarX size={48} className="text-slate-300" />}
                        title="Sem jornadas"
                        description="Nenhuma jornada registrada neste mês"
                      />
                    </td>
                  </tr>
                ) : (
                  jornadas.map((j) => {
                    const presentation = buildJornadaMensalPresentation(j);
                    return (
                    <tr
                      key={j.id}
                      className={`transition-colors hover:bg-gray-50/50 ${
                        presentation.hasIntegrityIssue ? 'bg-rose-50/60' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-gray-700 tabular-nums font-medium">
                        {formatFrmsDate(j.data)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${STATUS_COLORS[j.status] || 'bg-gray-100 text-gray-700'}`}
                          title={j.status === 'ES' ? 'Escala de Serviço' : STATUS_LABELS[j.status] || j.status}
                        >
                          {STATUS_LABELS[j.status] || j.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${presentation.sourceBadgeClass}`}>
                          {presentation.sourceLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 tabular-nums">
                        {j.hora_apresentacao || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 tabular-nums">
                        {j.hora_termino || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">
                        {presentation.operationalJourneyLabel}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{presentation.operationalHvLabel}</span>
                          {presentation.auxiliarySourceLabel ? (
                            <span className="text-xs font-medium text-amber-700">
                              {presentation.auxiliarySourceLabel}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="space-y-1 min-w-[220px]">
                          {!presentation.hasIntegrityIssue &&
                          (alertasPorJornada[j.id] ?? []).length === 0 ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : (
                            <>
                              {presentation.hasIntegrityIssue ? (
                                <div className="flex items-start gap-1.5">
                                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                                    {presentation.integrityLabel}
                                  </span>
                                  <span className="text-xs leading-4 text-rose-700">
                                    {presentation.integrityMessage}
                                  </span>
                                </div>
                              ) : null}
                              {(alertasPorJornada[j.id] ?? []).map((a) => (
                                <div key={a.id} className="flex items-start gap-1.5">
                                  <span>{nivelBadge(a.nivel)}</span>
                                  <span className="text-xs text-gray-600 leading-4">
                                    {a.mensagem
                                      .replace(/Tripulante #\d+/g, nomeTrip)
                                      .replace(
                                        new RegExp(
                                          `^${nomeTrip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:?\\s*`,
                                          'i',
                                        ),
                                        '',
                                      )}
                                  </span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums text-xs ${
                          presentation.hasIntegrityIssue ? 'text-rose-700' : 'text-gray-600'
                        }`}
                      >
                        {presentation.fatJornadaDiaLabel}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right tabular-nums text-xs font-medium ${
                          presentation.hasIntegrityIssue ? 'text-rose-700' : 'text-gray-700'
                        }`}
                      >
                        {presentation.fatHvDiaLabel}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => setSelectedExplanationDate(j.data)}
                            className="text-xs text-slate-700 hover:text-slate-900 font-medium"
                          >
                            Explicar
                          </button>
                          <button
                            onClick={() => handleEditar(j)}
                            className="text-xs text-primary hover:text-blue-800 font-medium"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleExcluir(j)}
                            className="text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {paginado && paginado.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                Página {paginado.pagination.page} de {paginado.pagination.totalPages} (
                {paginado.pagination.total} jornadas)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={paginado.pagination.page <= 1}
                  className="px-3 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={paginado.pagination.page >= paginado.pagination.totalPages}
                  className="px-3 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                >
                  Próxima →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Formulário de Jornada */}
        {showForm && (
          <FrmsFormJornada
            tripulanteId={id!}
            tripulanteNome={nomeTrip}
            jornada={editingJornada}
            onClose={() => {
              setShowForm(false);
              setEditingJornada(null);
            }}
            onSaved={handleSaved}
          />
        )}

        {selectedExplanationDate && id && (
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-[28px] bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Explicação do dia</h3>
                  <p className="text-sm text-slate-500">
                    {nomeTrip} · {selectedExplanationDate.slice(8, 10)}/
                    {selectedExplanationDate.slice(5, 7)}/{selectedExplanationDate.slice(0, 4)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedExplanationDate(null)}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 pb-5">
                <FrmsDayExplanationPanel
                  tripulanteId={id}
                  tripulanteNome={nomeTrip}
                  date={selectedExplanationDate}
                  config={limites}
                  source="ficha"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
