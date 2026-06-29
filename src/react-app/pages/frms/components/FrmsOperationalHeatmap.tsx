import { useMemo } from 'react';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';

// ── Estado de célula ──────────────────────────────────────────────────────────
//
// O backend não distingue "folga regulatória" de "ausência de dado" — ambos
// aparecem como linhas sem snapshot ou com has_snapshot_data=false.
// Os 7 estados abaixo usam somente o que o snapshot realmente informa.

type CellState =
  | 'CRITICO'       // snapshot_status = CRITICO
  | 'ATENCAO'       // snapshot_status = ATENCAO
  | 'CHECKIN_PEND'  // checkin_status = PENDENTE ou AUSENTE (exige ação imediata)
  | 'INCOMPLETO'    // snapshot_status = INCOMPLETO
  | 'OK_JORNADA'    // OK + teve_jornada=true
  | 'SEM_JORNADA'   // has_snapshot (check-in ou fonte), mas sem jornada FRMS
  | 'SEM_REGISTRO'; // nenhum dado para este dia

interface CellStyle {
  bg: string;
  border: string;
  text: string;
  label: string;
  icon: string;
}

const CELL_STYLES: Record<CellState, CellStyle> = {
  CRITICO:      { bg: 'bg-red-400',     border: 'border-red-500',              text: 'text-white',       label: 'Crítico',          icon: '!' },
  ATENCAO:      { bg: 'bg-amber-300',   border: 'border-amber-400',            text: 'text-amber-900',   label: 'Atenção',          icon: '▲' },
  CHECKIN_PEND: { bg: 'bg-yellow-100',  border: 'border-yellow-400',           text: 'text-yellow-800',  label: 'Check-in pendente',icon: '⋯' },
  INCOMPLETO:   { bg: 'bg-slate-300',   border: 'border-slate-400',            text: 'text-slate-700',   label: 'Incompleto',       icon: '?' },
  OK_JORNADA:   { bg: 'bg-emerald-200', border: 'border-emerald-300',          text: 'text-emerald-800', label: 'OK — jornada',     icon: '✓' },
  SEM_JORNADA:  { bg: 'bg-slate-50',    border: 'border-slate-200',            text: 'text-slate-400',   label: 'Sem jornada FRMS', icon: '·' },
  SEM_REGISTRO: { bg: 'bg-white',       border: 'border-slate-100',            text: 'text-slate-200',   label: 'Sem registro',     icon: '' },
};

const SEVERITY_ORDER: CellState[] = [
  'CRITICO', 'ATENCAO', 'CHECKIN_PEND', 'INCOMPLETO', 'OK_JORNADA', 'SEM_JORNADA', 'SEM_REGISTRO',
];

function resolveCellState(item: FrmsOperationalSnapshotItem | undefined): CellState {
  if (!item) return 'SEM_REGISTRO';
  if (item.checkin_status === 'PENDENTE' || item.checkin_status === 'AUSENTE') return 'CHECKIN_PEND';
  if (item.snapshot_status === 'CRITICO') return 'CRITICO';
  if (item.snapshot_status === 'ATENCAO') return 'ATENCAO';
  if (item.snapshot_status === 'INCOMPLETO') return 'INCOMPLETO';
  if (item.teve_jornada) return 'OK_JORNADA';
  return 'SEM_JORNADA';
}

function worstSeverityScore(states: CellState[]): number {
  for (let i = 0; i < SEVERITY_ORDER.length; i++) {
    if (states.includes(SEVERITY_ORDER[i]!)) return SEVERITY_ORDER.length - i;
  }
  return 0;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  items: FrmsOperationalSnapshotItem[];
  dates: string[]; // ISO YYYY-MM-DD em ordem
  selectedCrewId: number | null;
  onSelectCrew: (id: number) => void;
  loading?: boolean;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function FrmsOperationalHeatmap({ items, dates, selectedCrewId, onSelectCrew, loading }: Props) {
  const byCrewId = useMemo(() => {
    const map = new Map<number, Map<string, FrmsOperationalSnapshotItem>>();
    for (const item of items) {
      let dayMap = map.get(item.funcionario_id);
      if (!dayMap) { dayMap = new Map(); map.set(item.funcionario_id, dayMap); }
      dayMap.set(item.data_operacional, item);
    }
    return map;
  }, [items]);

  const crewMeta = useMemo(() => {
    const seen = new Map<number, {
      nome: string; funcao: string | null; aeronave: string | null; worstScore: number;
    }>();
    for (const item of items) {
      if (!seen.has(item.funcionario_id)) {
        seen.set(item.funcionario_id, {
          nome: item.nome_guerra || item.nome || `ID ${item.funcionario_id}`,
          funcao: item.funcao,
          aeronave: item.aeronave,
          worstScore: 0,
        });
      }
    }
    for (const [id, meta] of seen) {
      const dayMap = byCrewId.get(id);
      const states = dates.map((iso) => resolveCellState(dayMap?.get(iso)));
      meta.worstScore = worstSeverityScore(states);
    }
    return seen;
  }, [items, byCrewId, dates]);

  const sortedCrewIds = useMemo(
    () => [...crewMeta.entries()].sort((a, b) => b[1].worstScore - a[1].worstScore).map(([id]) => id),
    [crewMeta],
  );

  const cellW =
    dates.length <= 14 ? 'w-7 min-w-[28px]' :
    dates.length <= 21 ? 'w-6 min-w-[24px]' :
    dates.length <= 31 ? 'w-5 min-w-[20px]' :
    'w-4 min-w-[16px]';

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        Carregando heatmap operacional...
      </div>
    );
  }

  if (sortedCrewIds.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        Nenhum dado operacional para o período. Ajuste o intervalo de datas.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Heatmap operacional</h2>
        <p className="text-xs text-slate-500">
          Clique no nome para ver o acumulado individual. Ordenado por severidade.
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Cabeçalho de datas */}
          <div className="flex border-b border-slate-100 bg-slate-50 px-4 py-1">
            <div className="w-36 shrink-0" />
            {dates.map((iso) => {
              const parts = iso.split('-');
              return (
                <div key={iso} className={`${cellW} text-center text-[10px] font-medium text-slate-400`}>
                  {parts[2]}/{parts[1]}
                </div>
              );
            })}
          </div>

          {sortedCrewIds.map((crewId) => {
            const meta = crewMeta.get(crewId)!;
            const dayMap = byCrewId.get(crewId);
            const isSelected = crewId === selectedCrewId;

            return (
              <div
                key={crewId}
                className={`flex items-center border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/60 ${isSelected ? 'bg-sky-50' : ''}`}
              >
                <button
                  className="flex w-36 shrink-0 flex-col items-start gap-0.5 px-4 py-2 text-left"
                  onClick={() => onSelectCrew(crewId)}
                  title="Ver acumulado"
                >
                  <span className={`truncate text-xs font-semibold ${isSelected ? 'text-sky-700' : 'text-slate-800'}`}>
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
                      className={`${cellW} mx-px flex h-7 shrink-0 items-center justify-center rounded border text-[9px] font-bold ${s.bg} ${s.border} ${s.text}`}
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

      {/* Legenda sempre visível */}
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.entries(CELL_STYLES) as [CellState, CellStyle][]).map(([state, s]) => (
            <span key={state} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[8px] font-bold ${s.bg} ${s.border} ${s.text}`}>
                {s.icon || ' '}
              </span>
              {s.label}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] italic text-slate-400">
          "Sem registro" inclui descanso, folga e dado não recebido — o sistema não distingue sem jornada lançada.
        </p>
      </div>
    </div>
  );
}
