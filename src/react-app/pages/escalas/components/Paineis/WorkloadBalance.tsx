/**
 * MKT-03: Workload Balance Chart
 * Visualizes pilot workload distribution across the month.
 * Shows a horizontal bar chart for each pilot's flight days, folga days, etc.
 */

import { useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import type { EscalaEvento, EscalaTripulacao } from '../../hooks/queries/useEscalasQuery';

const SEGMENT_COLORS = {
  voo: '#60A5FA',
  treinamento: '#A78BFA',
  outros: '#FBBF24',
  folga: '#6EE7B7',
} as const;

interface WorkloadBalanceProps {
  tripulacoes: EscalaTripulacao[];
  eventos: EscalaEvento[];
  diasNoMes: number;
}

interface PilotWorkload {
  id: string;
  nome: string;
  papel: string;
  diasVoo: number;
  diasFolga: number;
  diasTreinamento: number;
  diasOutros: number;
  totalAtribuido: number;
  percentual: number;
}

export default function WorkloadBalance({ tripulacoes, eventos, diasNoMes }: WorkloadBalanceProps) {
  const workloads = useMemo(() => {
    // Get unique pilots
    const pilotos = new Map<string, { nome: string; papel: string }>();
    for (const t of tripulacoes) {
      if (!pilotos.has(t.pic_id)) pilotos.set(t.pic_id, { nome: t.pic_nome, papel: 'PIC' });
      if (t.sic_id && !pilotos.has(t.sic_id))
        pilotos.set(t.sic_id, { nome: t.sic_nome ?? '', papel: 'SIC' });
    }

    const result: PilotWorkload[] = [];
    for (const [id, info] of pilotos) {
      const evts = eventos.filter((e) => e.funcionario_id === id);
      const diasSet = (tipos: string[]) =>
        new Set(
          evts.filter((e) => tipos.includes(e.tipo_evento)).map((e) => e.data_inicio.slice(0, 10)),
        ).size;

      const diasVoo = diasSet(['voo', 'viagem']);
      const diasFolga = diasSet(['folga', 'ferias', 'licenca']);
      const diasTreinamento = diasSet(['treinamento_solo', 'treinamento_simulador', 'cheque']);
      const diasOutros = diasSet(['medico', 'trabalho', 'standby', 'reaquisi']);
      const totalAtribuido = diasVoo + diasFolga + diasTreinamento + diasOutros;

      result.push({
        id,
        nome: info.nome,
        papel: info.papel,
        diasVoo,
        diasFolga,
        diasTreinamento,
        diasOutros,
        totalAtribuido,
        percentual: diasNoMes > 0 ? Math.round((totalAtribuido / diasNoMes) * 100) : 0,
      });
    }

    return result.sort((a, b) => b.diasVoo - a.diasVoo);
  }, [tripulacoes, eventos, diasNoMes]);

  // Average and deviation
  const avgVoo =
    workloads.length > 0
      ? Math.round(workloads.reduce((s, w) => s + w.diasVoo, 0) / workloads.length)
      : 0;

  const workloadStats = useMemo(() => {
    if (workloads.length === 0) {
      return {
        stdDev: 0,
        minVoo: 0,
        maxVoo: 0,
        recomendacao: 'Sem dados suficientes para recomendação.',
      };
    }

    const mediaExata = workloads.reduce((s, w) => s + w.diasVoo, 0) / workloads.length;
    const variancia =
      workloads.reduce((s, w) => s + Math.pow(w.diasVoo - mediaExata, 2), 0) / workloads.length;
    const stdDev = Math.round(Math.sqrt(variancia) * 10) / 10;
    const minVoo = Math.min(...workloads.map((w) => w.diasVoo));
    const maxVoo = Math.max(...workloads.map((w) => w.diasVoo));
    const amplitude = maxVoo - minVoo;

    let recomendacao = 'Carga equilibrada. Manter distribuição atual.';
    if (stdDev >= 3 || amplitude >= 8) {
      recomendacao =
        'Desequilíbrio alto. Rebalancear voos dos pilotos com maior carga para os com menor carga.';
    } else if (stdDev >= 2 || amplitude >= 5) {
      recomendacao =
        'Desequilíbrio moderado. Ajustar 1-2 voos dos extremos para reduzir concentração.';
    }

    return {
      stdDev,
      minVoo,
      maxVoo,
      recomendacao,
    };
  }, [workloads]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
            <BarChart2 className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Equilíbrio de Carga</h3>
            <p className="text-[11px] text-slate-500">Distribuição mensal por tipo de atribuição</p>
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          <p>Média: {avgVoo}d</p>
          <p>σ: {workloadStats.stdDev}</p>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <p className="text-[11px] font-medium text-slate-700">{workloadStats.recomendacao}</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Faixa atual: {workloadStats.minVoo}d a {workloadStats.maxVoo}d de voo por tripulante.
        </p>
      </div>

      {workloads.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">Sem dados de workload</div>
      ) : (
        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {workloads.map((w) => {
            const deviation = w.diasVoo - avgVoo;
            const deviationColor =
              Math.abs(deviation) >= 3
                ? 'text-rose-600'
                : Math.abs(deviation) >= 2
                  ? 'text-amber-600'
                  : 'text-slate-400';

            return (
              <div key={w.id} className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[140px] truncate text-xs font-medium text-slate-800">
                      {w.nome}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-500">
                      {w.papel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{w.percentual}%</span>
                    {deviation !== 0 && (
                      <span className={`text-[10px] font-medium ${deviationColor}`}>
                        {deviation > 0 ? '+' : ''}
                        {deviation}d
                      </span>
                    )}
                  </div>
                </div>
                {/* Stacked bar */}
                <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                  {w.diasVoo > 0 && (
                    <div
                      className="transition-all"
                      style={{
                        width: `${(w.diasVoo / diasNoMes) * 100}%`,
                        backgroundColor: SEGMENT_COLORS.voo,
                      }}
                      title={`Voo: ${w.diasVoo}d`}
                    />
                  )}
                  {w.diasTreinamento > 0 && (
                    <div
                      className="transition-all"
                      style={{
                        width: `${(w.diasTreinamento / diasNoMes) * 100}%`,
                        backgroundColor: SEGMENT_COLORS.treinamento,
                      }}
                      title={`Treinamento: ${w.diasTreinamento}d`}
                    />
                  )}
                  {w.diasOutros > 0 && (
                    <div
                      className="transition-all"
                      style={{
                        width: `${(w.diasOutros / diasNoMes) * 100}%`,
                        backgroundColor: SEGMENT_COLORS.outros,
                      }}
                      title={`Outros: ${w.diasOutros}d`}
                    />
                  )}
                  {w.diasFolga > 0 && (
                    <div
                      className="transition-all"
                      style={{
                        width: `${(w.diasFolga / diasNoMes) * 100}%`,
                        backgroundColor: SEGMENT_COLORS.folga,
                      }}
                      title={`Folga: ${w.diasFolga}d`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
        {[
          { color: SEGMENT_COLORS.voo, label: 'Voo' },
          { color: SEGMENT_COLORS.treinamento, label: 'Trein.' },
          { color: SEGMENT_COLORS.outros, label: 'Outros' },
          { color: SEGMENT_COLORS.folga, label: 'Folga' },
        ].map((l) => (
          <div
            key={l.label}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
          >
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-[10px] text-slate-500">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
