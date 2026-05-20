/**
 * FrmsFilterChips — Chips de filtros ativos
 */
import { X } from 'lucide-react';
import { useFrmsFilters } from './FrmsFilterContext';
import { monthLabel } from '../frmsUtils';

const STATUS_LABELS: Record<string, string> = {
  OK: 'Normal',
  ATENCAO: 'Atenção',
  CRITICO: 'Crítico',
  VIOLACAO: 'Violação',
};

export default function FrmsFilterChips() {
  const { filters, removeFilter, setFilter } = useFrmsFilters();
  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  if (filters.modoPainel === 'PLANEJADO') {
    chips.push({
      key: 'modoPainel',
      label: `Planejada: ${monthLabel(filters.mesReferencia)}`,
      onRemove: () => setFilter('modoPainel', 'OPERACIONAL'),
    });
  } else if (filters.periodo !== 30) {
    chips.push({
      key: 'periodo',
      label: typeof filters.periodo === 'number' ? `${filters.periodo} dias` : 'Personalizado',
      onRemove: () => removeFilter('periodo'),
    });
  }

  if (filters.quinzena) {
    chips.push({
      key: 'quinzena',
      label: `Quinzena: ${filters.quinzena}`,
      onRemove: () => removeFilter('quinzena'),
    });
  }

  if (filters.modeloAeronave) {
    chips.push({
      key: 'modeloAeronave',
      label: `Equipamento: ${filters.modeloAeronave}`,
      onRemove: () => removeFilter('modeloAeronave'),
    });
  }

  if (filters.base) {
    chips.push({
      key: 'base',
      label: `Base: ${filters.base}`,
      onRemove: () => removeFilter('base'),
    });
  }

  if (filters.status.length < 4 && filters.status.length > 0) {
    filters.status.forEach((s) => {
      chips.push({
        key: `status-${s}`,
        label: STATUS_LABELS[s] || s,
        onRemove: () =>
          setFilter(
            'status',
            filters.status.filter((st) => st !== s),
          ),
      });
    });
  }

  if (filters.busca) {
    chips.push({
      key: 'busca',
      label: `"${filters.busca}"`,
      onRemove: () => removeFilter('busca'),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Filtros ativos
          </p>
          <p className="text-xs text-slate-500">Remova chips para voltar ao painel completo.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
          >
            {chip.label}
            <button onClick={chip.onRemove} className="transition-colors hover:text-slate-900">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
