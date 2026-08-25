import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { getMonthRange, toMonthKey, getQuinzenasDoMes, getQuinzenaDateRange, type QuinzenaRange } from '../frmsUtils';

export interface FrmsFiltersState {
  modoPainel: 'OPERACIONAL' | 'PLANEJADO';
  periodo: 7 | 30 | 60 | 90 | 180 | 365 | 'month' | 'custom';
  periodoInicio?: string;
  periodoFim?: string;
  mesReferencia: string;
  base: string; // '' = todas
  quinzena: '' | 'Q1' | 'Q2';
  modeloAeronave: string;
  status: string[]; // ['OK','ATENCAO','CRITICO','VIOLACAO']
  busca: string;
  selectedTripulanteId?: string;
}

const DEFAULT_FILTERS: FrmsFiltersState = {
  modoPainel: 'OPERACIONAL',
  periodo: 30,
  mesReferencia: toMonthKey(new Date()),
  base: '',
  quinzena: '',
  modeloAeronave: '',
  status: ['OK', 'ATENCAO', 'CRITICO', 'VIOLACAO'],
  busca: '',
};

const STORAGE_KEY = 'frms-filters-v6';
const VALID_COMPLIANCE_STATUS = ['OK', 'ATENCAO', 'CRITICO', 'VIOLACAO'] as const;

function sanitizeStatusList(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map((item) => String(item)) : [];
  const valid = list.filter((item): item is (typeof VALID_COMPLIANCE_STATUS)[number] =>
    (VALID_COMPLIANCE_STATUS as readonly string[]).includes(item),
  );
  if (valid.length === 0) return [...VALID_COMPLIANCE_STATUS];
  return Array.from(new Set(valid));
}

function loadFromStorage(): FrmsFiltersState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = { ...DEFAULT_FILTERS, ...JSON.parse(raw) } as FrmsFiltersState;
      return {
        ...parsed,
        status: sanitizeStatusList(parsed.status),
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FILTERS };
}

function saveToStorage(state: FrmsFiltersState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

interface FrmsFilterContextValue {
  filters: FrmsFiltersState;
  setFilter: <K extends keyof FrmsFiltersState>(key: K, value: FrmsFiltersState[K]) => void;
  resetFilters: () => void;
  removeFilter: (key: keyof FrmsFiltersState) => void;
  periodoNumDias: number;
  isMonthMode: boolean;
  quinzenasDoMes: { q1: QuinzenaRange; q2: QuinzenaRange };
  quinzenaAtiva: QuinzenaRange | null;
}

const FrmsFilterContext = createContext<FrmsFilterContextValue | null>(null);

export function FrmsFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FrmsFiltersState>(loadFromStorage);

  useEffect(() => {
    saveToStorage(filters);
  }, [filters]);

  const setFilter = useCallback(
    <K extends keyof FrmsFiltersState>(key: K, value: FrmsFiltersState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  const removeFilter = useCallback((key: keyof FrmsFiltersState) => {
    setFilters((prev) => ({
      ...prev,
      [key]: DEFAULT_FILTERS[key as keyof typeof DEFAULT_FILTERS],
    }));
  }, []);

  const isMonthMode = filters.modoPainel === 'PLANEJADO';
  const periodoNumDias = isMonthMode
    ? getMonthRange(filters.mesReferencia).daysInMonth
    : typeof filters.periodo === 'number'
      ? filters.periodo
      : 30;

  const quinzenasDoMes = getQuinzenasDoMes(filters.mesReferencia);
  const quinzenaAtiva = filters.quinzena
    ? getQuinzenaDateRange(filters.mesReferencia, filters.quinzena)
    : null;

  return (
    <FrmsFilterContext.Provider
      value={{ filters, setFilter, resetFilters, removeFilter, periodoNumDias, isMonthMode, quinzenasDoMes, quinzenaAtiva }}
    >
      {children}
    </FrmsFilterContext.Provider>
  );
}

export function useFrmsFilters() {
  const ctx = useContext(FrmsFilterContext);
  if (!ctx) throw new Error('useFrmsFilters must be used inside FrmsFilterProvider');
  return ctx;
}
