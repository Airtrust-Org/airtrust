/**
 * FrmsFilters — Sidebar de filtros do Dashboard FRMS
 */
import { useMemo } from 'react';
import { Search, X, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFrmsFilters, type FrmsFiltersState } from './FrmsFilterContext';
import { monthLabel, shiftMonthKey } from '../frmsUtils';

const PERIODO_OPTIONS: { label: string; value: FrmsFiltersState['periodo'] }[] = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
  { label: '180 dias', value: 180 },
  { label: '365 dias', value: 365 },
];

const MODO_OPTIONS: Array<{ value: FrmsFiltersState['modoPainel']; label: string }> = [
  { value: 'OPERACIONAL', label: 'Período móvel' },
  { value: 'PLANEJADO', label: 'Este mês' },
];

const STATUS_OPTIONS = [
  { value: 'OK', label: 'Normal', color: 'bg-emerald-500' },
  { value: 'ATENCAO', label: 'Atenção', color: 'bg-yellow-500' },
  { value: 'CRITICO', label: 'Crítico', color: 'bg-orange-500' },
  { value: 'VIOLACAO', label: 'Violação', color: 'bg-red-500' },
];

const QUINZENA_OPTIONS: Array<{ value: FrmsFiltersState['quinzena']; label: string }> = [
  { value: '', label: '1ª e 2ª' },
  { value: 'Q1', label: '1ª' },
  { value: 'Q2', label: '2ª' },
];

interface FrmsFiltersProps {
  modelosDisponiveis?: string[];
  basesDisponiveis?: string[];
  tripulantesDisponiveis?: Array<{ id: string; nome: string }>;
}

export default function FrmsFilters({
  modelosDisponiveis = [],
  basesDisponiveis = [],
  tripulantesDisponiveis = [],
}: FrmsFiltersProps) {
  const { filters, setFilter, resetFilters } = useFrmsFilters();
  const modelosLista = useMemo(
    () =>
      Array.from(
        new Set(
          modelosDisponiveis
            .map((modelo) => modelo?.trim())
            .filter((modelo): modelo is string => Boolean(modelo)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [modelosDisponiveis],
  );
  const basesLista = useMemo(
    () =>
      Array.from(
        new Set(
          basesDisponiveis
            .map((base) => base?.trim())
            .filter((base): base is string => Boolean(base)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [basesDisponiveis],
  );

  const toggleStatus = (status: string) => {
    const current = filters.status;
    if (current.includes(status)) {
      if (current.length === 1) return; // keep at least 1
      setFilter(
        'status',
        current.filter((s) => s !== status),
      );
    } else {
      setFilter('status', [...current, status]);
    }
  };

  const hasActiveFilters =
    filters.modoPainel !== 'OPERACIONAL' ||
    filters.periodo !== 30 ||
    filters.base ||
    filters.quinzena ||
    filters.modeloAeronave ||
    filters.status.length !== 4 ||
    filters.busca;

  return (
    <div className="flex flex-col h-full" data-testid="frms-filters">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Filtros</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Refine o painel por período, tripulante, quinzena, equipamento e nível de risco.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
            Visão
          </label>
          <div className="grid grid-cols-2 gap-1">
            {MODO_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter('modoPainel', option.value)}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  filters.modoPainel === option.value
                    ? 'bg-primary text-white shadow-sm shadow-primary/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {/* Busca */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">
            Buscar tripulante
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              data-testid="frms-filtro-nome"
              type="text"
              list="frms-tripulantes-escala"
              value={filters.busca}
              onChange={(e) => setFilter('busca', e.target.value)}
              placeholder="Digite o nome..."
              className="w-full rounded-md border border-slate-200 bg-white pl-8 pr-8 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
            />
            <datalist id="frms-tripulantes-escala">
              {tripulantesDisponiveis.map((tripulante) => (
                <option key={tripulante.id} value={tripulante.nome} />
              ))}
            </datalist>
            {filters.busca && (
              <button
                type="button"
                onClick={() => {
                  setFilter('busca', '');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                aria-label="Limpar busca"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" aria-hidden="true" />
              </button>
            )}
          </div>
        </section>

        {/* Período */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <label
            className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block"
            data-testid="frms-filtro-periodo"
          >
            {filters.modoPainel === 'PLANEJADO' ? 'Mês de referência' : 'Período'}
          </label>
          {filters.modoPainel === 'PLANEJADO' ? (
            <div className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setFilter('mesReferencia', shiftMonthKey(filters.mesReferencia, -1))}
                className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-700 transition-colors"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium text-slate-700">
                {monthLabel(filters.mesReferencia)}
              </span>
              <button
                type="button"
                onClick={() => setFilter('mesReferencia', shiftMonthKey(filters.mesReferencia, 1))}
                className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-700 transition-colors"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {PERIODO_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setFilter('periodo', opt.value)}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors
                    ${
                      filters.periodo === opt.value
                        ? 'bg-primary text-white shadow-sm shadow-primary/30'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Quinzena */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
            Quinzena
          </label>
          <div className="grid grid-cols-3 gap-1">
            {QUINZENA_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setFilter('quinzena', option.value)}
                className={`whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  filters.quinzena === option.value
                    ? 'bg-primary text-white shadow-sm shadow-primary/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
            Base
          </label>
          <select
            data-testid="frms-filtro-base"
            value={filters.base}
            onChange={(e) => setFilter('base', e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
          >
            <option value="">Todas</option>
            {basesLista.map((base) => (
              <option key={base} value={base}>
                {base}
              </option>
            ))}
          </select>
          {basesLista.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">Nenhuma base encontrada na escala do período.</p>
          )}
        </section>

        {/* Equipamento */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
            Tipo de aeronave
          </label>
          <select
            data-testid="frms-filtro-modelo"
            value={filters.modeloAeronave}
            onChange={(e) => setFilter('modeloAeronave', e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
          >
            <option value="">Todas</option>
            {modelosLista.map((modelo) => (
              <option key={modelo} value={modelo}>
                {modelo}
              </option>
            ))}
          </select>
          {modelosLista.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Nenhuma aeronave encontrada no período atual.
            </p>
          )}
        </section>

        {/* Status */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
          <label
            className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block"
            data-testid="frms-filtro-status"
          >
            Status
          </label>
          <div className="space-y-1.5">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="group flex cursor-pointer items-center gap-2 rounded-xl border border-transparent bg-white px-3 py-2 hover:border-slate-200"
              >
                <input
                  type="checkbox"
                  checked={filters.status.includes(opt.value)}
                  onChange={() => toggleStatus(opt.value)}
                  className="rounded border-slate-300 text-primary focus:ring-primary/40"
                />
                <span className={`h-2 w-2 rounded-full ${opt.color}`} />
                <span className="text-sm text-slate-600 group-hover:text-slate-900">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>

      {/* Footer */}
      {hasActiveFilters && (
        <div className="border-t border-slate-200 px-4 py-3">
          <button
            onClick={resetFilters}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Limpar filtros
          </button>
        </div>
      )}
    </div>
  );
}
