import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readUserPreference, writeUserPreference } from '@/react-app/utils/userPreferences';
import {
  ALL_STATUS_VALUES,
  QUALIFICACOES_PREFS_KEY,
} from '../qualificacoes.constants';
import type { SortConfig } from '@/react-app/utils/types';

export const VALID_TABS = ['historico', 'planejados', 'tipos', 'categorias'] as const;
export const VALID_PLANNED_VIEWS = ['lista', 'calendario', 'turmas'] as const;

export interface QualificacoesPrefs {
  activeTab?: string;
  plannedView?: string;
  limit?: number;
  searchTerm?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  aeronaveFilter?: string;
  categoriaFilter?: string;
  statusFiltro?: string[];
  setorFilter?: string[];
  categoriasSetorFilter?: string[];
}

export function useQualificacoesFiltros(highlightedHistoricoId: number | null) {
  const [searchParams] = useSearchParams();

  const initialPrefs = useMemo(
    () => readUserPreference<QualificacoesPrefs>(QUALIFICACOES_PREFS_KEY, {}),
    [],
  );

  const rawStoredTab = initialPrefs.activeTab;
  const rawStoredView = initialPrefs.plannedView;

  const migratedTab: (typeof VALID_TABS)[number] =
    rawStoredTab === 'turmas'
      ? 'planejados'
      : VALID_TABS.includes(rawStoredTab as (typeof VALID_TABS)[number])
        ? (rawStoredTab as (typeof VALID_TABS)[number])
        : 'historico';

  const migratedPlannedView: (typeof VALID_PLANNED_VIEWS)[number] =
    rawStoredTab === 'turmas'
      ? 'turmas'
      : VALID_PLANNED_VIEWS.includes(rawStoredView as (typeof VALID_PLANNED_VIEWS)[number])
        ? (rawStoredView as (typeof VALID_PLANNED_VIEWS)[number])
        : 'lista';

  const [activeTab, setActiveTab] = useState<(typeof VALID_TABS)[number]>(migratedTab);
  const [plannedView, setPlannedView] =
    useState<(typeof VALID_PLANNED_VIEWS)[number]>(migratedPlannedView);
  
  const [limit, setLimit] = useState(initialPrefs.limit ?? 50);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: initialPrefs.sortColumn ?? 'data_vencimento',
    direction: initialPrefs.sortDirection ?? 'asc',
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [aeronaveFilter, setAeronaveFilter] = useState(initialPrefs.aeronaveFilter ?? '');
  const [categoriaFilter, setCategoriaFilter] = useState(initialPrefs.categoriaFilter ?? '');
  const [setorFilter, setSetorFilter] = useState<string[]>(initialPrefs.setorFilter ?? []);
  const [categoriasSetorFilter, setCategoriasSetorFilter] = useState<string[]>(
    initialPrefs.categoriasSetorFilter ?? [],
  );

  const [statusFiltro, setStatusFiltro] = useState<Set<string>>(
    new Set(
      highlightedHistoricoId
        ? ALL_STATUS_VALUES
        : ['VALIDA', 'VENCIDA', 'VENCENDO_30', 'PLANEJADA'],
    ),
  );

  const getDefaultHistoricoStatusSet = useCallback(
    () =>
      new Set(
        highlightedHistoricoId
          ? ALL_STATUS_VALUES
          : ['VALIDA', 'VENCIDA', 'VENCENDO_30', 'PLANEJADA'],
      ),
    [highlightedHistoricoId],
  );

  const applySingleStatusFromChip = useCallback((status: string) => {
    setActiveTab('historico');
    setPage(1);
    setStatusFiltro(new Set([status]));
  }, []);

  const resetStatusFromChip = useCallback(() => {
    setActiveTab('historico');
    setPage(1);
    setStatusFiltro(getDefaultHistoricoStatusSet());
  }, [getDefaultHistoricoStatusSet]);

  const isOnlyStatusSelected = useCallback(
    (status: string) => statusFiltro.size === 1 && statusFiltro.has(status),
    [statusFiltro],
  );

  const isHistoricoTab = activeTab === 'historico';
  const isPlanejadosTab = activeTab === 'planejados';
  const usesHistoricoDataset = isHistoricoTab;

  const [historicoCategoriaId, setHistoricoCategoriaId] = useState<number | null>(null);

  useEffect(() => {
    writeUserPreference<QualificacoesPrefs>(QUALIFICACOES_PREFS_KEY, {
      activeTab,
      plannedView,
      limit,
      searchTerm,
      sortColumn: sortConfig.column,
      sortDirection: sortConfig.direction,
      aeronaveFilter,
      categoriaFilter,
      statusFiltro: [...statusFiltro],
      setorFilter,
      categoriasSetorFilter,
    });
  }, [
    activeTab,
    plannedView,
    limit,
    searchTerm,
    sortConfig.column,
    sortConfig.direction,
    aeronaveFilter,
    categoriaFilter,
    statusFiltro,
    setorFilter,
    categoriasSetorFilter,
  ]);

  const effectiveHistoricoStatusFiltro = useMemo(() => [...statusFiltro], [statusFiltro]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const viewParam = searchParams.get('view');

    if (tabParam === 'turmas') {
      setActiveTab('planejados');
      setPlannedView('turmas');
    } else if (tabParam === 'planejados') {
      setActiveTab('planejados');
      if (viewParam === 'lista' || viewParam === 'calendario' || viewParam === 'turmas') {
        setPlannedView(viewParam as any);
      }
    }

    if (highlightedHistoricoId) {
      setActiveTab('historico');
      setPage(1);
      setSearchTerm('');
      setDebouncedSearch('');
      setStatusFiltro(new Set(ALL_STATUS_VALUES));
      return;
    }

    const statusParam = searchParams.get('status');
    if (statusParam) {
      const statusMap: Record<string, string[]> = {
        vencida: ['VENCIDA'],
        vencendo: ['VENCENDO_30'],
        valida: ['VALIDA'],
        planejada: ['PLANEJADA'],
        cancelada: ['CANCELADA'],
      };

      const statusValues = statusMap[statusParam.toLowerCase()];
      if (statusValues) {
        setStatusFiltro(new Set(statusValues));
      }
    }
  }, [highlightedHistoricoId, searchParams]);

  const isDefaultStatusFilter = useMemo(() => {
    const defaultStatusFiltro = getDefaultHistoricoStatusSet();
    return (
      statusFiltro.size === defaultStatusFiltro.size &&
      [...defaultStatusFiltro].every((status) => statusFiltro.has(status))
    );
  }, [getDefaultHistoricoStatusSet, statusFiltro]);

  return {
    activeTab,
    setActiveTab,
    plannedView,
    setPlannedView,
    limit,
    setLimit,
    page,
    setPage,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    setDebouncedSearch,
    sortConfig,
    setSortConfig,
    aeronaveFilter,
    setAeronaveFilter,
    categoriaFilter,
    setCategoriaFilter,
    setorFilter,
    setSetorFilter,
    categoriasSetorFilter,
    setCategoriasSetorFilter,
    statusFiltro,
    setStatusFiltro,
    getDefaultHistoricoStatusSet,
    applySingleStatusFromChip,
    resetStatusFromChip,
    isOnlyStatusSelected,
    isHistoricoTab,
    isPlanejadosTab,
    usesHistoricoDataset,
    historicoCategoriaId,
    setHistoricoCategoriaId,
    effectiveHistoricoStatusFiltro,
    isDefaultStatusFilter,
  };
}
