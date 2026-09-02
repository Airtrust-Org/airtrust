/**
 * MKT-04: Vista "Minha Escala" — dedicated page for crew members
 * to see their own schedule in a clean, personal view.
 *
 * Route: /escalas/minha-escala
 */

import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LayoutList,
  List,
  CalendarX,
  MapPin,
  Plane,
  PlaneTakeoff,
  GraduationCap,
  Monitor,
  Stethoscope,
  BadgeCheck,
  Briefcase,
  Sofa,
  Hourglass,
  Waves,
  CalendarOff,
  CheckCircle,
  type LucideIcon,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './hooks/queries/useEscalasQuery';
import { formatDate, formatDateShort, formatDateRelative } from '@/react-app/utils/formatDate';
import { useFrmsOperationalSnapshot } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { FortnightCrewSummaryCard } from '@/react-app/pages/frms/components/FortnightOperationalIndicator';

function getTodayLocalIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface MeuEvento {
  id: string;
  tipo_evento: string;
  data_inicio: string;
  data_fim: string;
  turno?: string;
  local?: string;
  aeronave?: string;
  observacoes?: string;
  escala_nome?: string;
  status: 'confirmado' | 'pendente' | 'cancelado';
  gerado_automaticamente: 0 | 1;
}

interface MinhaEscalaResumo {
  id: string;
  nome: string;
  mes: number;
  ano: number;
  status: string;
  total_eventos: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const TIPO_LABELS: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  voo: { label: 'Voo', Icon: Plane, color: 'bg-blue-500' },
  viagem: { label: 'Viagem', Icon: PlaneTakeoff, color: 'bg-indigo-500' },
  treinamento_solo: { label: 'Treinamento Solo', Icon: GraduationCap, color: 'bg-purple-500' },
  treinamento_simulador: {
    label: 'Treinamento Simulador',
    Icon: Monitor,
    color: 'bg-violet-500',
  },
  medico: { label: 'Médico', Icon: Stethoscope, color: 'bg-red-500' },
  cheque: { label: 'Cheque', Icon: BadgeCheck, color: 'bg-orange-500' },
  trabalho: { label: 'Trabalho', Icon: Briefcase, color: 'bg-slate-600' },
  folga: { label: 'Folga', Icon: Sofa, color: 'bg-green-500' },
  standby: { label: 'Standby', Icon: Hourglass, color: 'bg-amber-500' },
  ferias: { label: 'Férias', Icon: Waves, color: 'bg-cyan-500' },
  licenca: { label: 'Licença', Icon: CalendarOff, color: 'bg-gray-500' },
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function MinhaEscalaPage() {
  const { user } = useAuth();
  const now = new Date();
  const [mesAtual, setMesAtual] = useState(now.getMonth() + 1);
  const [anoAtual, setAnoAtual] = useState(now.getFullYear());
  const [viewMode, setViewMode] = useState<'timeline' | 'lista'>('timeline');

  // PWA: request notification permission once on first visit
  // Uses useEffect to ask after mount, non-blocking
  useState(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      // Delay to not interrupt first render
      setTimeout(() => Notification.requestPermission(), 3000);
    }
  });

  // Fetch events for current user in the selected month
  const { data: calendarioData, isLoading } = useQuery<{
    eventos: MeuEvento[];
    escala?: MinhaEscalaResumo;
  }>({
    queryKey: ['minha-escala', mesAtual, anoAtual],
    queryFn: () =>
      fetchApi<{ eventos: MeuEvento[]; escala?: MinhaEscalaResumo }>(
        `/api/escalas/minha-escala?mes=${mesAtual}&ano=${anoAtual}`,
      ),
  });

  const eventos = calendarioData?.eventos ?? [];
  const escala = calendarioData?.escala;
  const todayIso = getTodayLocalIsoDate();
  const myFuncionarioId =
    user?.funcionario_id != null && Number.isFinite(user.funcionario_id)
      ? String(user.funcionario_id)
      : undefined;
  const { data: frmsSnapshotItems, loading: loadingFrmsSnapshot } = useFrmsOperationalSnapshot({
    data_inicio: todayIso,
    data_fim: todayIso,
    funcionario_id: myFuncionarioId,
  });
  const mySnapshotItem = myFuncionarioId
    ? frmsSnapshotItems.find((item) => String(item.funcionario_id) === myFuncionarioId)
    : null;
  const myFortnightIndicator = mySnapshotItem?.fortnight_indicator ?? null;
  const myCheckinPendente = mySnapshotItem?.checkin_status === 'PENDENTE';

  // ── GAP 7: Ciência da escala — PRC-OPS-009 §6.3.3 ──
  const queryClient = useQueryClient();
  const { data: confirmacaoData } = useQuery<{ confirmado: boolean; confirmado_em: string | null }>(
    {
      queryKey: ['minha-escala-confirmacao', escala?.id],
      queryFn: () =>
        fetchApi<{ confirmado: boolean; confirmado_em: string | null }>(
          `/api/escalas/minha-escala/confirmacao-status?escala_id=${escala?.id}`,
        ),
      enabled: !!escala?.id && escala?.status === 'publicada',
    },
  );

  const confirmarMutation = useMutation({
    mutationFn: () =>
      fetchApi<unknown>('/api/escalas/minha-escala/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escala_id: escala?.id }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['minha-escala-confirmacao', escala?.id] });
    },
  });

  // Group events by date
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, MeuEvento[]>();
    for (const evt of eventos) {
      const dia = evt.data_inicio.slice(0, 10);
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia)!.push(evt);
    }
    return map;
  }, [eventos]);

  // Calendar days
  const diasMes = useMemo(() => {
    const first = new Date(anoAtual, mesAtual - 1, 1);
    const last = new Date(anoAtual, mesAtual, 0);
    const days: Date[] = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [mesAtual, anoAtual]);

  // Stats
  const stats = useMemo(() => {
    const tipos = new Map<string, number>();
    for (const evt of eventos) {
      const t = evt.tipo_evento;
      tipos.set(t, (tipos.get(t) || 0) + 1);
    }
    const diasVoo = new Set(
      eventos.filter((e) => e.tipo_evento === 'voo').map((e) => e.data_inicio.slice(0, 10)),
    ).size;
    const diasFolga = new Set(
      eventos.filter((e) => e.tipo_evento === 'folga').map((e) => e.data_inicio.slice(0, 10)),
    ).size;
    return { tipos, diasVoo, diasFolga, total: eventos.length };
  }, [eventos]);

  const prevMonth = () => {
    if (mesAtual <= 1) {
      setMesAtual(12);
      setAnoAtual((a) => a - 1);
    } else setMesAtual((m) => m - 1);
  };
  const nextMonth = () => {
    if (mesAtual >= 12) {
      setMesAtual(1);
      setAnoAtual((a) => a + 1);
    } else setMesAtual((m) => m + 1);
  };

  const isToday = (d: Date) => {
    const t = new Date();
    return (
      d.getFullYear() === t.getFullYear() &&
      d.getMonth() === t.getMonth() &&
      d.getDate() === t.getDate()
    );
  };
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  return (
    <AppLayout>
      <div className="w-full px-4 py-4 space-y-4">
        {/* Header */}
        <PageHeader
          title="Minha Escala"
          subtitle={`${user?.nome ?? 'Tripulante'} — Visão pessoal da escala mensal`}
          icon="calendar_month"
        />

        <FortnightCrewSummaryCard
          indicator={myFortnightIndicator}
          checkinPendente={myCheckinPendente}
          loading={loadingFrmsSnapshot}
          simplified
        />

        {/* Month Navigation */}
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-900">
              {MESES[mesAtual - 1]} {anoAtual}
            </h2>
            {escala && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  escala.status === 'publicada'
                    ? 'bg-emerald-100 text-emerald-700'
                    : escala.status === 'aprovada'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {escala.status === 'publicada'
                  ? 'Publicada'
                  : escala.status === 'aprovada'
                    ? 'Aprovada'
                    : escala.status}
              </span>
            )}
          </div>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xl font-bold text-blue-600">{stats.diasVoo}</p>
            <p className="text-xs text-gray-500 mt-1">Dias de Voo</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xl font-bold text-green-600">{stats.diasFolga}</p>
            <p className="text-xs text-gray-500 mt-1">Dias de Folga</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-xl font-bold text-gray-700">{stats.total}</p>
            <p className="text-xs text-gray-500 mt-1">Total Eventos</p>
          </div>
        </div>

        {/* Confirmação de Ciência — PRC-OPS-009 §6.3.3 */}
        {escala?.status === 'publicada' && (
          <div
            className={`rounded-xl border shadow-sm p-4 flex items-center justify-between ${
              confirmacaoData?.confirmado
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <CheckCircle
                className={`w-5 h-5 ${
                  confirmacaoData?.confirmado ? 'text-emerald-600' : 'text-amber-500'
                }`}
              />
              <div>
                <p
                  className={`text-sm font-medium ${
                    confirmacaoData?.confirmado ? 'text-emerald-800' : 'text-amber-800'
                  }`}
                >
                  {confirmacaoData?.confirmado
                    ? 'Ciência confirmada'
                    : 'Confirme o recebimento da escala'}
                </p>
                {confirmacaoData?.confirmado_em && (
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Confirmado em {new Date(confirmacaoData.confirmado_em).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
            {!confirmacaoData?.confirmado && (
              <button
                onClick={() => confirmarMutation.mutate()}
                disabled={confirmarMutation.isPending}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {confirmarMutation.isPending ? 'Confirmando...' : 'Confirmar Ciência'}
              </button>
            )}
          </div>
        )}

        {/* View Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'timeline'
                ? 'bg-primary text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <LayoutList className="w-4 h-4 inline align-middle mr-1" />
            Calendário
          </button>
          <button
            onClick={() => setViewMode('lista')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'lista'
                ? 'bg-primary text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            <List className="w-4 h-4 inline align-middle mr-1" />
            Lista
          </button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {/* Calendar Grid View */}
        {!isLoading && viewMode === 'timeline' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Days of week header */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
                <div key={d} className="p-2 text-center text-xs font-medium text-gray-400">
                  {d}
                </div>
              ))}
            </div>
            {/* Calendar cells */}
            <div className="grid grid-cols-7">
              {/* Empty cells for offset */}
              {Array.from({ length: diasMes[0]?.getDay() ?? 0 }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="min-h-[60px] border-b border-r border-gray-50 bg-gray-25"
                />
              ))}
              {diasMes.map((dia) => {
                const key = dia.toISOString().slice(0, 10);
                const dayEvents = eventosPorDia.get(key) || [];
                return (
                  <div
                    key={key}
                    className={`min-h-[60px] border-b border-r border-gray-50 p-1 transition-colors ${
                      isToday(dia) ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-200' : ''
                    } ${isWeekend(dia) ? 'bg-gray-50/40' : ''}`}
                  >
                    <div
                      className={`text-right text-xs font-medium ${isToday(dia) ? 'text-blue-600' : 'text-gray-400'}`}
                    >
                      {dia.getDate()}
                    </div>
                    <div className="space-y-0.5 mt-0.5">
                      {dayEvents.slice(0, 3).map((evt) => {
                        const cfg = TIPO_LABELS[evt.tipo_evento] || {
                          label: evt.tipo_evento,
                          icon: 'event',
                          color: 'bg-gray-400',
                        };
                        return (
                          <div
                            key={evt.id}
                            className={`${cfg.color} text-white text-[10px] px-1 py-0.5 rounded truncate leading-tight`}
                            title={`${cfg.label}${evt.local ? ' — ' + evt.local : ''}`}
                          >
                            {cfg.label}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-gray-400 text-center">
                          +{dayEvents.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* List View */}
        {!isLoading && viewMode === 'lista' && (
          <div className="space-y-2">
            {eventos.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-100 p-5 text-center text-gray-400">
                <CalendarX className="w-10 h-10 mb-2 mx-auto text-gray-400" />
                <p>Nenhum evento encontrado para este mês</p>
              </div>
            )}
            {eventos.map((evt) => {
              const cfg = TIPO_LABELS[evt.tipo_evento] || {
                label: evt.tipo_evento,
                Icon: CalendarX,
                color: 'bg-gray-400',
              };
              return (
                <div
                  key={evt.id}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-3"
                >
                  <div
                    className={`${cfg.color} text-white w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`}
                  >
                    {cfg.Icon && <cfg.Icon className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">{cfg.label}</span>
                      {evt.status === 'pendente' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          Pendente
                        </span>
                      )}
                      {evt.gerado_automaticamente === 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                          Auto
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDate(evt.data_inicio)}
                      {evt.data_inicio !== evt.data_fim ? ` — ${formatDate(evt.data_fim)}` : ''}
                      {evt.turno ? ` · ${evt.turno}` : ''}
                    </p>
                    {(evt.local || evt.aeronave) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {evt.local && (
                          <>
                            <MapPin className="w-3 h-3 inline align-middle" /> {evt.local}
                          </>
                        )}
                        {evt.local && evt.aeronave && ' · '}
                        {evt.aeronave && (
                          <>
                            <Plane className="w-3 h-3 inline align-middle" /> {evt.aeronave}
                          </>
                        )}
                      </p>
                    )}
                    {evt.observacoes && (
                      <p className="text-xs text-gray-400 mt-1 italic truncate">
                        {evt.observacoes}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">{formatDateRelative(evt.data_inicio)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}