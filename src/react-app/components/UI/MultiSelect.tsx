import { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  className?: string;
}

/**
 * Multi-select dropdown com checkboxes.
 * Permite selecionar múltiplas opções com busca interna.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Selecionar...',
  allLabel = 'Todos',
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  // Foca input ao abrir
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, search]);

  const allSelected = selected.length === options.length && options.length > 0;
  const noneSelected = selected.length === 0;

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.value));
    }
  };

  const displayLabel = noneSelected
    ? placeholder
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label || selected[0]
      : `${selected.length} selecionados`;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex items-center gap-2 rounded-md border px-3 py-2 pr-8 text-sm',
          'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary',
          'appearance-none cursor-pointer w-max',
          'bg-white text-slate-900',
          'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
          noneSelected
            ? 'border-slate-300 text-slate-400'
            : 'border-primary/50 text-slate-900 font-medium',
        )}
      >
        <span className="truncate max-w-[180px]">{displayLabel}</span>
        {!noneSelected && (
          <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
            {selected.length}
          </span>
        )}
        <ChevronDown
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {/* Search */}
          <div className="flex items-center border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 text-sm bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 dark:text-slate-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
                aria-label="Limpar busca"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Select All */}
          <div className="border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="font-medium">{allLabel}</span>
            </label>
          </div>

          {/* Options */}
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">Nenhum resultado</p>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm',
                      'hover:bg-slate-50 dark:hover:bg-slate-800',
                      isSelected && 'bg-primary/5',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(opt.value)}
                      className="rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span
                      className={cn(
                        'flex-1',
                        isSelected
                          ? 'text-slate-900 font-medium dark:text-slate-100'
                          : 'text-slate-600 dark:text-slate-400',
                      )}
                    >
                      {opt.label}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
