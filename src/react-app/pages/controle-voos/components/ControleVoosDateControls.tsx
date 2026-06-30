import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface ControleVoosDateControlsProps {
  value: string;
  onChange: (next: string) => void;
  onToday: () => void;
  label?: string;
}

function shiftDate(date: string, deltaDays: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

export default function ControleVoosDateControls({
  value,
  onChange,
  onToday,
  label = 'Data operacional',
}: ControleVoosDateControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftDate(value, -1))}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <ChevronLeft className="h-4 w-4" />
        Dia anterior
      </button>
      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        <Calendar className="h-4 w-4 text-slate-400" />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="bg-transparent outline-none"
        />
      </label>
      <button
        type="button"
        onClick={onToday}
        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Hoje
      </button>
      <button
        type="button"
        onClick={() => onChange(shiftDate(value, 1))}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Próximo dia
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
