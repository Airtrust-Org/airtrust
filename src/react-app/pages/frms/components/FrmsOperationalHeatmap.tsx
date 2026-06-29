import { useMemo } from 'react';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';

type CellState =
  | 'CRITICO'
  | 'ATENCAO'
  | 'CHECKIN_PEND'
  | 'INCOMPLETO'
  | 'OK_JORNADA'
  | 'SEM_JORNADA'
  | 'SEM_REGISTRO';

interface CellStyle {
  bg: string;
  border: string;
  text: string;
  label: string;
  icon: string;
}

const CELL_STYLES: Record<CellState, CellStyle> = {
  CRITICO: {
    bg: 'bg-red-400',
    border: 'border-red-500',
    text: 'text-white',
    label: 'Crítico',
    icon: '!',
  },
  ATENCAO: {
    bg: 'bg-amber-300',
    border: 'border-amber-400',
    text: 'text-amber-900',
    label: 'Atenção',
    icon: '▲',
  },
  CHECKIN_PEND: {
    bg: 'bg-yellow-100',
    border: 'border-yellow-400',
    text: 'text-yellow-800',
    label: 'Check-in pendente',
    icon: '⋯',
  },
  INCOMPLETO: {
    bg: 'bg-slate-300',
    border: 'border-slate-400',
    text: 'text-slate-700',
    label: 'Dado incompleto',
    icon: '?',
  },
  OK_JORNADA: {
    bg: 'bg-emerald-200',
    border: 'border-emerald-300',
    text: 'text-emerald-800',
    label: 'Jornada registrada',
    icon: '✓',
  },
  SEM_JORNADA: {
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    text: 'text-slate-500',
    label: 'Sem jornada confirmada',
    icon: '·',
  },
  SEM_REGISTRO: {
    bg: 'bg-white',
    border: 'border-slate-100',
    text: 'text-slate-300',
    label: 'Fonte não classificada',
    icon: '',
  },
};

const SEVERITY_ORDER: CellState[] = [
  'CRITICO',
  'ATENCAO',
  'CHECKIN_PEND',
  'INCOMPLETO',
  'OK_JORNADA',
  'SEM_JORNADA',
  'SEM_REGISTRO',
];

function resolveCellState(item: FrmsOperationalSnapshotItem | undefined): CellState {
  if (!item) return 'SEM_REGISTRO';
  if (item.checkin_status === 'PENDENTE' || item.checkin_status === 'AUSENTE') return 'CHECKIN_PEND';
  if (item.snapshot_status === 'CRITICO') return 'CRITICO';
  if (item.snapshot_status === 'ATENCAO') return 'ATENCAO';
  if (item.snapshot_status === 'INCOMPLETO') return 'INCOMPLETO';
  if (item.teve_jornada) return 'OK_JORNADA';
  if (item.checkin_status === 'RECEBIDO' || item.snapshot_status === 'OK') return 'SEM_JORNADA';
  return 'SEM_REGISTRO';
}

function worstSeverityScore(states: CellState[]): number {
  for (let i = 0; i < SEVERITY_ORDER.length; i++) {
    if (states.includes(SEVERITY_ORDER[i]!)) return SEVERITY_ORDER.length - i;
  }
  return 0;
}

function crewHasSignal(states: CellState[]): boolean {
  return states.some((state) => state !== 'SEM_REGISTRO' && state !== 'SEM_JORNADA');
}

interface Props {
  items: FrmsOperationalSnapshotItem[];
  dates: string[];
  selectedCrewId: number | null;
  onSelectCrew: (id: number) => void;
  loading?: boolean;
  maxRows?: number;
  priorityCrewIds?: Set<number>;
}

export default function FrmsOperationalHeatmap({
  items,
  dates,
  selectedCrewId,
  onSelectCrew,
  loading,
  maxRows = 20,
  priorityCrewIds,
}: Props) {
  const byCrewId = useMemo(() => {
    const map = new Map<number, Map<string, FrmsOperationalSnapshotItem>>();
    for (const item of items) {
      let dayMap = map.get(item.funcionario_id);
      if (!dayMap) {
        dayMap = new Map();
        map.set(item.funcionario_id, dayMap);
      }
      dayMap.set(item.data_operacional, item);
    }
    return map;
  }, [items]);

  const crewMeta = useMemo(() => {
    const seen = new Map<
      number,
      { nome: string; funcao: string | null; aeronave: string | null; worstScore: number; hasSignal: boolean }
    >();
    for (const item of items) {
      if (!seen.has(item.funcionario_id)) {
        seen.set(item.funcionario_id, {
          nome: item.nome_guerra || item.nome || `ID ${item.funcionario_id}`,
          funcao: item.funcao,
          aeronave: item.aeronave,
          worstScore: 0,
          hasSignal: false,
        });
      }
    }
    for (const [id, meta] of seen) {
      const dayMap = byCrewId.get(id);
      const states = dates.map((iso) => resolveCellState(dayMap?.get(iso)));
      meta.worstScore = worstSeverityScore(states);
      meta.hasSignal = crewHasSignal(states) || Boolean(priorityCrewIds?.has(id));
    }
    return seen;
  }, [items, byCrewId, dates, priorityCrewIds]);

  const visibleCrewIds = useMemo(() => {
    const relevant = [...crewMeta.entries()]
      .filter(([, meta]) => meta.hasSignal)
      .sort((a, b) => {
        const prioA = priorityCrewIds?.has(a[0]) ? 1 : 0;
        const prioB = priorityCrewIds?.has(b[0]) ? 1 : 0;
        if (prioB !== prioA) return prioB - prioA;
        return b[1].worstScore - a[1].worstScore;
      })
      .map(([id]) => id);
    return relevant.slice(0, maxRows);
  }, [crewMeta, maxRows, priorityCrewIds]);

  const hiddenCount = [...crewMeta.values()].filter((m) => m.hasSignal).length - visibleCrewIds.length;

  const cellW =
    dates.length <= 14
      ? 'w-9 min-w-[36px]'
      : dates.length <= 21
        ? 'w-8 min-w-[32px]'
        : 'w-7 min-w-[28px]';

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        Carregando mapa operacional...
      </div>
    );
  }

  if (visibleCrewIds.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        Nenhum tripulante com sinal operacional no período. Ajuste filtros ou consulte a lista de
        ação acima.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Mapa técnico da quinzena — não é lista de ação</h2>
        <p className="text-xs text-slate-500">
          Exibindo até {maxRows} tripulantes com sinal relevante. Use a lista de ação acima para decidir.
          {hiddenCount > 0 ? ` · ${hiddenCount} ocultos — use filtros para refinar.` : ''}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-max">
          <div className="sticky top-0 z-10 flex border-b border-slate-100 bg-slate-50 px-4 py-2">
            <div className="w-40 shrink-0" />
            {dates.map((iso) => {
              const parts = iso.split('-');
              return (
                <div
                  key={iso}
                  className={`${cellW} text-center text-[11px] font-semibold text-slate-500`}
                >
                  <div>{parts[2]}</div>
                  <div className="text-[9px] font-normal text-slate-400">
                    {parts[1]}/{parts[2]}
                  </div>
                </div>
              );
            })}
          </div>

          {visibleCrewIds.map((crewId) => {
            const meta = crewMeta.get(crewId)!;
            const dayMap = byCrewId.get(crewId);
            const isSelected = crewId === selectedCrewId;

            return (
              <div
                key={crewId}
                className={`flex items-center border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${isSelected ? 'bg-sky-50' : ''}`}
              >
                <button
                  type="button"
                  className="flex w-40 shrink-0 flex-col items-start gap-0.5 px-4 py-2 text-left"
                  onClick={() => onSelectCrew(crewId)}
                >
                  <span
                    className={`truncate text-xs font-semibold ${isSelected ? 'text-sky-700' : 'text-slate-800'}`}
                  >
                    {meta.nome}
                  </span>
                  {(meta.funcao || meta.aeronave) && (
                    <span className="truncate text-[10px] text-slate-400">
                      {[meta.funcao, meta.aeronave].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>

                {dates.map((iso) => {
                  const item = dayMap?.get(iso);
                  const state = resolveCellState(item);
                  const s = CELL_STYLES[state];
                  return (
                    <div
                      key={iso}
                      className={`${cellW} mx-px flex h-8 shrink-0 items-center justify-center rounded border text-[9px] font-bold ${s.bg} ${s.border} ${s.text}`}
                      title={`${meta.nome} — ${iso}\n${s.label}${item?.alertas?.length ? '\nAlertas: ' + item.alertas.join(', ') : ''}`}
                    >
                      {s.icon}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.entries(CELL_STYLES) as [CellState, CellStyle][]).map(([state, s]) => (
            <span key={state} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[8px] font-bold ${s.bg} ${s.border} ${s.text}`}
              >
                {s.icon || ' '}
              </span>
              {s.label}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] italic text-slate-500">
          Célula vazia ou &quot;Fonte não classificada&quot; não indica descanso — requer confirmação
          manual da coordenação.
        </p>
      </div>
    </div>
  );
}
