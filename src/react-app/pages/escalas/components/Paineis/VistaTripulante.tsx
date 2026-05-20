/**
 * UX-05: Vista por Tripulante
 * Individual crew member schedule view, showing a timeline of their events
 * across the month, with CMA status and FRMS score integration.
 */

import { useMemo, useState } from 'react';
import { User, X, Plane, Sofa, Clock, PieChart, Heart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../../hooks/queries/useEscalasQuery';
import { formatDate, formatDateRelative } from '@/react-app/utils/formatDate';
import type { EscalaEvento, EscalaTripulacao } from '../../hooks/queries/useEscalasQuery';
import { parseISO, eachDayOfInterval, format, differenceInDays } from 'date-fns';
import { normalizeTipoCodigo } from '../../constants/tiposEvento';
import { useTiposEventoResolvidos } from '../../hooks/useTiposEventoResolvidos';

interface VistaTripulanteProps {
  escalaId: string;
  mes: number;
  ano: number;
  tripulacoes: EscalaTripulacao[];
  eventos: EscalaEvento[];
  onClose: () => void;
}

export default function VistaTripulante({
  escalaId,
  mes,
  ano,
  tripulacoes,
  eventos,
  onClose,
}: VistaTripulanteProps) {
  const { configMap } = useTiposEventoResolvidos();

  // Get unique pilot list
  const pilotos = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; papel: string }>();
    for (const t of tripulacoes) {
      if (!map.has(t.pic_id)) {
        map.set(t.pic_id, {
          id: t.pic_id,
          nome: t.pic_nome,
          papel: 'PIC',
        });
      }
      if (t.sic_id && !map.has(t.sic_id)) {
        map.set(t.sic_id, {
          id: t.sic_id,
          nome: t.sic_nome ?? '',
          papel: 'SIC',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [tripulacoes]);

  const [selectedPilot, setSelectedPilot] = useState(pilotos[0]?.id ?? '');

  // Filter events for selected pilot
  const eventosPiloto = useMemo(
    () =>
      eventos
        .filter((e) => e.funcionario_id === selectedPilot)
        .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
    [eventos, selectedPilot],
  );

  // Stats
  const stats = useMemo(() => {
    const diasVoo = new Set(
      eventosPiloto.filter((e) => e.tipo_evento === 'voo').map((e) => e.data_inicio.slice(0, 10)),
    ).size;
    const diasFolga = new Set(
      eventosPiloto
        .filter((e) => e.tipo_evento === 'folga' || e.tipo_evento === 'ferias')
        .map((e) => e.data_inicio.slice(0, 10)),
    ).size;
    const pendentes = eventosPiloto.filter((e) => e.status === 'pendente').length;
    const totalDias = new Date(ano, mes, 0).getDate();
    return {
      diasVoo,
      diasFolga,
      pendentes,
      cobertura: Math.round(((diasVoo + diasFolga) / totalDias) * 100),
    };
  }, [eventosPiloto, mes, ano]);

  // FRMS score (INT-03 integration)
  const { data: frmsData } = useQuery<{
    score: number;
    nivel: string;
    total_horas_30d: number;
  }>({
    queryKey: ['frms-score', selectedPilot],
    queryFn: () =>
      fetchApi<{ score: number; nivel: string; total_horas_30d: number }>(
        `/api/escalas/frms-score/${selectedPilot}`,
      ),
    enabled: !!selectedPilot,
    staleTime: 2 * 60 * 1000,
  });

  // Generate timeline
  const diasMes = useMemo(() => {
    const start = new Date(ano, mes - 1, 1);
    const end = new Date(ano, mes, 0);
    return eachDayOfInterval({ start, end });
  }, [mes, ano]);

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, EscalaEvento[]>();
    for (const evt of eventosPiloto) {
      const s = parseISO(evt.data_inicio);
      const e = parseISO(evt.data_fim);
      const days = eachDayOfInterval({ start: s, end: e });
      for (const d of days) {
        const key = format(d, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(evt);
      }
    }
    return map;
  }, [eventosPiloto]);

  const NIVEL_COLORS: Record<string, string> = {
    baixo: 'text-green-600 bg-green-50',
    medio: 'text-amber-600 bg-amber-50',
    alto: 'text-orange-600 bg-orange-50',
    critico: 'text-red-600 bg-red-50',
  };

  return (
    <div className="fixed inset-0 z-modal bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Vista por Tripulante</h2>
              <p className="text-xs text-gray-500">Escala individual detalhada</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Pilot selector */}
        <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-3">
          <label className="text-xs text-gray-500">Tripulante:</label>
          <select
            value={selectedPilot}
            onChange={(e) => setSelectedPilot(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-primary/30 focus:border-blue-500"
          >
            {pilotos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({p.papel})
              </option>
            ))}
          </select>
        </div>

        {/* Stats bar */}
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap border-b border-gray-50">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg text-xs font-medium text-blue-700">
            <Plane className="w-4 h-4" />
            {stats.diasVoo} dias voo
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg text-xs font-medium text-green-700">
            <Sofa className="w-4 h-4" />
            {stats.diasFolga} folgas
          </div>
          {stats.pendentes > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg text-xs font-medium text-amber-700">
              <Clock className="w-4 h-4" />
              {stats.pendentes} pendentes
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg text-xs font-medium text-slate-600">
            <PieChart className="w-4 h-4" />
            {stats.cobertura}% cobertura
          </div>
          {frmsData && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${NIVEL_COLORS[frmsData.nivel] || 'bg-gray-50 text-gray-600'}`}
            >
              <Heart className="w-4 h-4" />
              FRMS: {frmsData.score} ({frmsData.nivel})
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-7 gap-1">
            {/* Day headers */}
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-gray-400 pb-1">
                {d}
              </div>
            ))}
            {/* Offset */}
            {Array.from({ length: diasMes[0]?.getDay() ?? 0 }).map((_, i) => (
              <div key={`e${i}`} className="min-h-[48px]" />
            ))}
            {/* Day cells */}
            {diasMes.map((dia) => {
              const key = format(dia, 'yyyy-MM-dd');
              const dayEvts = eventosPorDia.get(key) || [];
              const isToday = format(new Date(), 'yyyy-MM-dd') === key;
              const isWeekend = dia.getDay() === 0 || dia.getDay() === 6;

              return (
                <div
                  key={key}
                  className={`min-h-[48px] rounded-lg p-1 border transition-colors ${
                    isToday ? 'border-blue-300 bg-blue-50/50' : 'border-gray-100'
                  } ${isWeekend ? 'bg-gray-50/50' : ''}`}
                >
                  <div
                    className={`text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}
                  >
                    {dia.getDate()}
                  </div>
                  {dayEvts.map((evt) => {
                    const configKey = normalizeTipoCodigo(String(evt.tipo_evento || ''));
                    const cfg = configKey ? configMap[configKey] : undefined;
                    const backgroundColor = cfg?.cor || '#6B7280';
                    return (
                      <div
                        key={evt.id}
                        className="text-[9px] px-1 py-0.5 rounded mt-0.5 truncate font-medium"
                        style={{
                          backgroundColor,
                          color: '#FFFFFF',
                        }}
                        title={`${cfg?.label || evt.tipo_evento}${evt.turno ? ' — ' + evt.turno : ''}`}
                      >
                        {cfg?.sigla || evt.tipo_evento.slice(0, 2)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Event list below calendar */}
          {eventosPiloto.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-600 mb-2">Todos os Eventos</h3>
              <div className="space-y-1.5">
                {eventosPiloto.map((evt) => {
                  const configKey = normalizeTipoCodigo(String(evt.tipo_evento || ''));
                  const cfg = configKey ? configMap[configKey] : undefined;
                  return (
                    <div
                      key={evt.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50"
                    >
                      <div
                        className="w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: cfg?.cor || '#6B7280' }}
                      />
                      <span className="text-xs font-medium text-gray-800">
                        {cfg?.label || evt.tipo_evento}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {formatDate(evt.data_inicio)}
                        {evt.data_inicio !== evt.data_fim ? ` → ${formatDate(evt.data_fim)}` : ''}
                      </span>
                      {evt.status === 'pendente' && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                          Pendente
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
