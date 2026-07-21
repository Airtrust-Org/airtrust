import { Copy, Trash2 } from 'lucide-react';
import type { RdvSaveStatus, RdvTrechoDraft } from '../data/rdvPilotFlow';
import {
  calcConsumoCombustivel,
  calcHorasVoadas,
  parseNumber,
  RDV_SAVE_STATUS_LABELS,
} from '../data/rdvPilotFlow';

type Props = {
  index: number;
  trecho: RdvTrechoDraft;
  readOnly?: boolean;
  saveStatus?: RdvSaveStatus;
  saveError?: string | null;
  onChange: (next: RdvTrechoDraft) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canRemove: boolean;
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

const statusTone: Record<RdvSaveStatus, string> = {
  idle: 'text-slate-400',
  pendente: 'text-amber-600 dark:text-amber-400',
  salvando: 'text-blue-600 dark:text-blue-400',
  salvo: 'text-emerald-600 dark:text-emerald-400',
  erro: 'text-red-600 dark:text-red-400',
};

export default function ControleVoosRdvTrechoCard({
  index,
  trecho,
  readOnly,
  saveStatus = 'idle',
  saveError,
  onChange,
  onDuplicate,
  onRemove,
  canRemove,
}: Props) {
  const horas = calcHorasVoadas(trecho.horario_decolagem, trecho.horario_pouso);
  const consumo = calcConsumoCombustivel(
    parseNumber(trecho.combustivel_decolagem),
    parseNumber(trecho.combustivel_pouso),
  );

  function setField<K extends keyof RdvTrechoDraft>(field: K, value: RdvTrechoDraft[K]) {
    onChange({ ...trecho, [field]: value });
  }

  return (
    <article
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      data-testid={`rdv-trecho-card-${index}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Trecho {index + 1}
            {trecho.id ? (
              <span className="ml-2 text-xs font-normal text-slate-400">#{trecho.id}</span>
            ) : null}
          </h3>
          <span
            className={`text-xs ${statusTone[saveStatus]}`}
            data-testid={`rdv-trecho-status-${index}`}
          >
            {RDV_SAVE_STATUS_LABELS[saveStatus]}
          </span>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDuplicate}
              disabled={!trecho.id}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicar
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={!canRemove}
              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-red-950/30 dark:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remover
            </button>
          </div>
        )}
      </div>

      {saveError ? (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Origem (ICAO)
          </span>
          <input
            value={trecho.origem}
            disabled={readOnly}
            onChange={(e) => setField('origem', e.target.value.toUpperCase())}
            className={inputClass}
            placeholder="SBSP"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Destino (ICAO)
          </span>
          <input
            value={trecho.destino}
            disabled={readOnly}
            onChange={(e) => setField('destino', e.target.value.toUpperCase())}
            className={inputClass}
            placeholder="SBRJ"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pousos</span>
          <input
            type="number"
            min="0"
            step="1"
            value={trecho.numero_pousos}
            disabled={readOnly}
            onChange={(e) => setField('numero_pousos', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Decolagem</span>
          <input
            type="datetime-local"
            value={trecho.horario_decolagem}
            disabled={readOnly}
            onChange={(e) => setField('horario_decolagem', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Pouso</span>
          <input
            type="datetime-local"
            value={trecho.horario_pouso}
            disabled={readOnly}
            onChange={(e) => setField('horario_pouso', e.target.value)}
            className={inputClass}
          />
        </label>
        <div className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Horas (calc.)
          </span>
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 font-mono text-slate-700 dark:border-slate-700 dark:text-slate-200">
            {horas == null ? '—' : `${horas.toFixed(2)} h`}
          </p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Comb. decolagem
          </span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={trecho.combustivel_decolagem}
            disabled={readOnly}
            onChange={(e) => setField('combustivel_decolagem', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Comb. pouso
          </span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={trecho.combustivel_pouso}
            disabled={readOnly}
            onChange={(e) => setField('combustivel_pouso', e.target.value)}
            className={inputClass}
          />
        </label>
        <div className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Consumo (calc.)
          </span>
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 font-mono text-slate-700 dark:border-slate-700 dark:text-slate-200">
            {consumo == null ? '—' : `${consumo}`}
          </p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">POB</span>
          <input
            type="number"
            min="0"
            step="1"
            value={trecho.pob}
            disabled={readOnly}
            onChange={(e) => setField('pob', e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Carga (kg)</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={trecho.carga_kg}
            disabled={readOnly}
            onChange={(e) => setField('carga_kg', e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
    </article>
  );
}
