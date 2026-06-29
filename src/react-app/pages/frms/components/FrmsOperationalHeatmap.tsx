import { useMemo, useRef, useState, useCallback } from 'react';
import type { FrmsOperationalSnapshotItem, FrmsOperationalSnapshotStatus } from '@/react-app/hooks/useFrmsOperationalSnapshot';

interface CrewRow {
  funcionarioId: number;
  displayName: string;
  funcao: string | null;
  days: Map<string, FrmsOperationalSnapshotItem>;
  worstSeverity: number;
}

interface TooltipInfo {
  x: number;
  y: number;
  nome: string;
  date: string;
  item: FrmsOperationalSnapshotItem | null;
}

function statusSeverity(status: FrmsOperationalSnapshotStatus | undefined): number {
  if (status === 'CRITICO') return 3;
  if (status === 'ATENCAO') return 2;
  if (status === 'INCOMPLETO') return 1;
  if (status === 'OK') return 0;
  return -1;
}

function cellBg(status: FrmsOperationalSnapshotStatus | null): string {
  if (status === 'CRITICO') return 'bg-red-400 hover:bg-red-500';
  if (status === 'ATENCAO') return 'bg-amber-300 hover:bg-amber-400';
  if (status === 'INCOMPLETO') return 'bg-slate-300 hover:bg-slate-400';
  if (status === 'OK') return 'bg-emerald-300 hover:bg-emerald-400';
  return 'bg-slate-100 hover:bg-slate-200';
}

function checkinIcon(status: string | undefined): string {
  if (status === 'RECEBIDO') return '✓';
  if (status === 'PENDENTE') return '!';
  if (status === 'AUSENTE') return '✗';
  return '';
}

function formatDateShort(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

function formatMinAsHours(min: number | null): string {
  if (min == null || !Number.isFinite(min)) return '--';
  return `${(min / 60).toFixed(1)}h`;
}

interface Props {
  items: FrmsOperationalSnapshotItem[];
  dates: string[];
  loading: boolean;
  selectedCrewId: number | null;
  onSelectCrew: (id: number) => void;
}

export default function FrmsOperationalHeatmap({ items, dates, loading, selectedCrewId, onSelectCrew }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const crewRows = useMemo<CrewRow[]>(() => {
    const crewMap = new Map<number, CrewRow>();
    for (const item of items) {
      const existing = crewMap.get(item.funcionario_id);
      const sev = statusSeverity(item.snapshot_status);
      if (existing) {
        existing.days.set(item.data_operacional, item);
        if (sev > existing.worstSeverity) existing.worstSeverity = sev;
      } else {
        crewMap.set(item.funcionario_id, {
          funcionarioId: item.funcionario_id,
          displayName: item.nome_guerra || item.nome || `ID ${item.funcionario_id}`,
          funcao: item.funcao,
          days: new Map([[item.data_operacional, item]]),
          worstSeverity: sev,
        });
      }
    }
    return [...crewMap.values()].sort((a, b) => {
      const diff = b.worstSeverity - a.worstSeverity;
      if (diff !== 0) return diff;
      return a.displayName.localeCompare(b.displayName, 'pt-BR');
    });
  }, [items]);

  const cellW = dates.length <= 14 ? 28 : dates.length <= 21 ? 22 : dates.length <= 31 ? 18 : 14;
  const rowH = crewRows.length <= 25 ? 32 : 26;
  const labelEvery = dates.length <= 14 ? 1 : dates.length <= 21 ? 2 : 3;

  const showTooltip = useCallback((e: React.MouseEvent, crew: CrewRow, date: string) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    const item = crew.days.get(date) ?? null;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    setTooltip({
      x: rect.left - (containerRect?.left ?? 0) + rect.width / 2,
      y: rect.top - (containerRect?.top ?? 0) - 8,
      nome: crew.displayName,
      date,
      item,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimerRef.current = setTimeout(() => setTooltip(null), 120);
  }, []);

  if (!loading && crewRows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Nenhum dado operacional para o período. Ajuste o intervalo de datas.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Quinzena por tripulante</h2>
          <p className="text-xs text-slate-500">
            {crewRows.length} tripulantes · {dates.length} dias · ordenados por severidade. Clique para ver o acumulado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
          {[
            { label: 'OK', cls: 'bg-emerald-300' },
            { label: 'Atenção', cls: 'bg-amber-300' },
            { label: 'Crítico', cls: 'bg-red-400' },
            { label: 'Incompleto', cls: 'bg-slate-300' },
            { label: 'Sem dado', cls: 'bg-slate-100 border border-slate-200' },
          ].map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-sm ${s.cls}`} />
              {s.label}
            </span>
          ))}
          <span className="text-slate-400">· ✓ check-in recebido · ! pendente · ✗ ausente</span>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-400">Carregando heatmap operacional...</div>
      ) : (
        <div className={`overflow-x-auto ${crewRows.length > 30 ? 'max-h-[560px] overflow-y-auto' : ''}`}>
          <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white/95 pb-1 backdrop-blur">
            <div className="w-36 flex-shrink-0" />
            <div className="flex flex-1">
              {dates.map((d, i) => (
                <div key={d} style={{ width: cellW, flexShrink: 0 }} className="text-center">
                  {i % labelEvery === 0 && (
                    <span className="whitespace-nowrap text-[9px] font-medium text-slate-400">
                      {formatDateShort(d)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {crewRows.map((crew) => {
            const isSelected = crew.funcionarioId === selectedCrewId;
            return (
              <div
                key={crew.funcionarioId}
                className={`flex items-center border-b border-slate-100 transition-colors ${
                  isSelected ? 'bg-sky-50' : 'hover:bg-slate-50/60'
                }`}
                style={{ height: rowH }}
              >
                <button
                  className="w-36 flex-shrink-0 truncate px-2 text-left text-xs font-medium text-slate-700 hover:text-blue-600 hover:underline"
                  onClick={() => onSelectCrew(crew.funcionarioId)}
                  title={`Ver acumulado: ${crew.displayName}${crew.funcao ? ` (${crew.funcao})` : ''}`}
                >
                  {crew.displayName}
                </button>
                <div className="flex flex-1 gap-px">
                  {dates.map((d) => {
                    const item = crew.days.get(d);
                    const status = item?.snapshot_status ?? null;
                    const icon = checkinIcon(item?.checkin_status);
                    const isEstimated =
                      item &&
                      (item.sleep_data_source === 'ESTIMADO' ||
                        item.jornada_data_source === 'ESTIMADO' ||
                        item.jornada_data_source === 'INCONSISTENTE');
                    return (
                      <div
                        key={d}
                        style={{ width: cellW, flexShrink: 0, height: rowH - 6 }}
                        className={`relative cursor-pointer rounded-[3px] transition-transform hover:z-10 hover:scale-110 ${cellBg(status)}`}
                        onMouseEnter={(e) => showTooltip(e, crew, d)}
                        onMouseLeave={hideTooltip}
                        onClick={() => onSelectCrew(crew.funcionarioId)}
                      >
                        {icon && (
                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/80 select-none">
                            {icon}
                          </span>
                        )}
                        {isEstimated && (
                          <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-600 opacity-80" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 min-w-[190px] rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg"
          style={{
            left: Math.min(tooltip.x, (containerRef.current?.clientWidth ?? 600) - 210),
            top: Math.max(4, tooltip.y - 160),
          }}
        >
          <p className="font-semibold text-slate-800">{tooltip.nome}</p>
          <p className="mb-1 text-slate-400">{formatDateShort(tooltip.date)}</p>
          {!tooltip.item ? (
            <p className="text-slate-500">Sem dado operacional neste dia</p>
          ) : (
            <div className="space-y-0.5 text-slate-600">
              <p>
                Status:{' '}
                <span className="font-medium text-slate-800">{tooltip.item.snapshot_status}</span>
              </p>
              <p>
                Check-in: <span className="font-medium">{tooltip.item.checkin_status}</span>
              </p>
              <p>
                Sono:{' '}
                <span className="font-medium">
                  {tooltip.item.horas_sono != null ? `${tooltip.item.horas_sono.toFixed(1)}h` : '--'}
                </span>{' '}
                · KSS: <span className="font-medium">{tooltip.item.kss_score ?? '--'}</span>
              </p>
              <p>
                Efetividade estimada:{' '}
                <span className="font-medium">
                  {tooltip.item.effectiveness_pct != null
                    ? `${tooltip.item.effectiveness_pct.toFixed(1)}%`
                    : '--'}
                </span>
              </p>
              <p>
                Jornada:{' '}
                <span className="font-medium">
                  {formatMinAsHours(tooltip.item.duracao_jornada_minutos)}
                </span>
              </p>
              {tooltip.item.alertas.length > 0 && (
                <p className="text-rose-600">⚠ {tooltip.item.alertas.slice(0, 2).join(' · ')}</p>
              )}
              <p className="text-[10px] text-slate-400">
                Sono {tooltip.item.sleep_data_source} · Jornada {tooltip.item.jornada_data_source}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
