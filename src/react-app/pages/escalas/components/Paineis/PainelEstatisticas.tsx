// src/react-app/pages/escalas/components/Paineis/PainelEstatisticas.tsx

import { useMemo } from 'react';
import { parseISO, differenceInDays } from 'date-fns';
import { EVENTO_CONFIG } from '../EscalaCalendario/GradeGantt';
import type {
  EscalaEvento,
  EscalaTripulacao,
  TipoEvento,
} from '../../hooks/queries/useEscalasQuery';

interface Props {
  eventos: EscalaEvento[];
  tripulacoes: EscalaTripulacao[];
  onClose: () => void;
}

export default function PainelEstatisticas({ eventos, tripulacoes, onClose }: Props) {
  const stats = useMemo(() => {
    const diasPorTipo: Record<string, number> = {};
    let totalDias = 0;

    eventos.forEach((e) => {
      if (e.status === 'cancelado') return;
      const dias = differenceInDays(parseISO(e.data_fim), parseISO(e.data_inicio)) + 1;
      diasPorTipo[e.tipo_evento] = (diasPorTipo[e.tipo_evento] || 0) + dias;
      totalDias += dias;
    });

    const porPadrao: Record<string, number> = {};
    tripulacoes.forEach((t) => {
      const padrao = t.padrao_nome || 'Sem padrão';
      porPadrao[padrao] = (porPadrao[padrao] || 0) + 1;
    });

    const eventosAuto = eventos.filter((e) => e.gerado_automaticamente === 1).length;
    const eventosPendentes = eventos.filter((e) => e.status === 'pendente').length;

    return { diasPorTipo, totalDias, porPadrao, eventosAuto, eventosPendentes };
  }, [eventos, tripulacoes]);

  const tiposOrdenados = Object.entries(stats.diasPorTipo).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Estatísticas</h3>
          <p className="text-[11px] text-slate-500">Leitura rápida da escala selecionada</p>
        </div>
        <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-xl font-bold text-slate-900">{tripulacoes.length}</div>
          <div className="text-[11px] text-slate-500">Tripulações</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-xl font-bold text-slate-900">{eventos.length}</div>
          <div className="text-[11px] text-slate-500">Eventos</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-xl font-bold text-slate-900">{stats.eventosAuto}</div>
          <div className="text-[11px] text-slate-500">Automáticos</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-xl font-bold text-slate-900">{stats.eventosPendentes}</div>
          <div className="text-[11px] text-slate-500">Pendentes</div>
        </div>
      </div>

      {/* Distribuição de dias por tipo */}
      {tiposOrdenados.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Dias por Tipo de Evento
          </h4>
          <div className="space-y-2">
            {tiposOrdenados.map(([tipo, dias]) => {
              const conf = EVENTO_CONFIG[tipo as TipoEvento];
              if (!conf) return null;
              const pct = stats.totalDias > 0 ? (dias / stats.totalDias) * 100 : 0;
              return (
                <div key={tipo}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-slate-600">{conf.label}</span>
                    <span className="text-xs font-semibold text-slate-800">{dias}d</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: conf.cor }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Padrões de escala */}
      {Object.keys(stats.porPadrao).length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Padrões de Escala
          </h4>
          {Object.entries(stats.porPadrao).map(([padrao, count]) => (
            <div
              key={padrao}
              className="flex items-center justify-between border-b border-slate-100 py-2"
            >
              <span className="text-xs text-slate-700">{padrao}</span>
              <span className="text-xs font-bold text-slate-900">
                {count} tripulante{count !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Alertas */}
      {(stats.eventosAuto > 0 || stats.eventosPendentes > 0) && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Atenção
          </h4>
          {stats.eventosAuto > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-semibold text-amber-800">
                {stats.eventosAuto} eventos automáticos
              </div>
              <div className="mt-0.5 text-[11px] text-amber-700">
                Exames CMA gerados pelo sistema
              </div>
            </div>
          )}
          {stats.eventosPendentes > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
              <div className="text-xs font-semibold text-yellow-800">
                {stats.eventosPendentes} eventos pendentes
              </div>
              <div className="mt-0.5 text-[11px] text-yellow-700">Aguardando confirmação</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
