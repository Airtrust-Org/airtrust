import { useState, useEffect, useMemo, useCallback, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { readUserPreference } from '@/react-app/utils/userPreferences';
import { useTablePreferences } from '@/react-app/hooks/useTablePreferences';
import { ALL_STATUS_VALUES, QUALIFICACOES_PREFS_KEY } from '../qualificacoes.constants';
import { createDefaultQualificationHistoryStatusSet } from '@/react-app/lib/qualificationHistoryFilters';
import type { SortConfig } from '@/react-app/utils/types';

export const VALID_TABS = ['historico', 'planejados', 'tipos', 'categorias'] as const;
export const VALID_PLANNED_VIEWS = ['lista', 'calendario', 'turmas'] as const;

type QualificacoesTab = (typeof VALID_TABS)[number];
type PlannedView = (typeof VALID_PLANNED_VIEWS)[number];

function sanitizeHistoricoCategoriaFilter(value: string | undefined): string {
  const normalized = String(value ?? '').trim();
  return /^\d+$/.test(normalized) ? '' : normalized;
}

function normalizeStatuses(value: unknown): string[] {
  if (!Array.isArray(value)) return [...createDefaultQualificationHistoryStatusSet()];
  const valid = new Set<string>(ALL_STATUS_VALUES);
  return Array.from(
    new Set(
      value
        .map((item) =>
          String(item || '')
            .trim()
            .toUpperCase(),
        )
        .filter((item) => valid.has(item)),
    ),
  );
}

function normalizeTab(value: unknown): QualificacoesTab {
  if (value === 'turmas') return 'planejados';
  return VALID_TABS.includes(value as QualificacoesTab) ? (value as QualificacoesTab) : 'historico';
}

function normalizePlannedView(tab: unknown, value: unknown): PlannedView {
  if (tab === 'turmas') return 'turmas';
  return VALID_PLANNED_VIEWS.includes(value as PlannedView) ? (value as PlannedView) : 'lista';
}

function resolveState<T>(next: SetStateAction<T>, current: T): T {
  return typeof next === 'function' ? (next as (value: T) => T)(current) : next;
}

export interface QualificacoesPrefs extends Record<string, unknown> {
  activeTab?: string;
  plannedView?: string;
  limit?: number;
  searchTerm?: string;
  sortColumn?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  aeronaveFilter?: string;
  categoriaFilter?: string;
  statusFiltro?: string[];
  setorFilter?: string[];
  categoriasSetorFilter?: string[];
  historicoCategoriaId?: number | null;
}

export function useQualificacoesFiltros(highlightedHistoricoId: number | null) {
  const [searchParams] = useSearchParams();

  // Migra a preferência local antiga como fallback inicial. A fonte permanente passa a ser
  // usuario_preferencias, isolada por usuário + empresa via useTablePreferences.
  const legacyPrefs = useMemo(
    () => readUserPreference<QualificacoesPrefs>(QUALIFICACOES_PREFS_KEY, {}),
    [],
  );
  const defaultPrefs = useMemo<QualificacoesPrefs>(
    () => ({
      activeTab: normalizeTab(legacyPrefs.activeTab),
      plannedView: normalizePlannedView(legacyPrefs.activeTab, legacyPrefs.plannedView),
      limit: Number(legacyPrefs.limit) > 0 ? Number(legacyPrefs.limit) : 50,
      searchTerm: String(legacyPrefs.searchTerm || ''),
      sortColumn: legacyPrefs.sortColumn ?? 'data_vencimento',
      sortDirection: legacyPrefs.sortDirection ?? 'asc',
      aeronaveFilter: String(legacyPrefs.aeronaveFilter || ''),
      categoriaFilter: sanitizeHistoricoCategoriaFilter(legacyPrefs.categoriaFilter),
      statusFiltro: normalizeStatuses(legacyPrefs.statusFiltro),
      setorFilter: Array.isArray(legacyPrefs.setorFilter)
        ? legacyPrefs.setorFilter.map(String)
        : [],
      categoriasSetorFilter: Array.isArray(legacyPrefs.categoriasSetorFilter)
        ? legacyPrefs.categoriasSetorFilter.map(String)
        : [],
      historicoCategoriaId:
        Number.isInteger(Number(legacyPrefs.historicoCategoriaId)) &&
        Number(legacyPrefs.historicoCategoriaId) > 0
          ? Number(legacyPrefs.historicoCategoriaId)
          : null,
    }),
    [legacyPrefs],
  );
  const {
    preferences,
    setPreferences,
    ready: preferencesReady,
  } = useTablePreferences<QualificacoesPrefs>('table.qualificacoes.historico', defaultPrefs);

  const persistedActiveTab = normalizeTab(preferences.activeTab);
  const activeTab = highlightedHistoricoId ? 'historico' : persistedActiveTab;
  const plannedView = normalizePlannedView(preferences.activeTab, preferences.plannedView);
  const limit = Number(preferences.limit) > 0 ? Number(preferences.limit) : 50;
  const persistedSearchTerm = String(preferences.searchTerm || '');
  const searchTerm = highlightedHistoricoId ? '' : persistedSearchTerm;
  const aeronaveFilter = String(preferences.aeronaveFilter || '');
  const categoriaFilter = sanitizeHistoricoCategoriaFilter(preferences.categoriaFilter);
  const setorFilter = Array.isArray(preferences.setorFilter)
    ? preferences.setorFilter.map(String)
    : [];
  const categoriasSetorFilter = Array.isArray(preferences.categoriasSetorFilter)
    ? preferences.categoriasSetorFilter.map(String)
    : [];
  const persistedStatusFiltro = useMemo(
    () => new Set(normalizeStatuses(preferences.statusFiltro)),
    [preferences.statusFiltro],
  );
  const statusParamValues = useMemo(() => {
    const statusParam = searchParams.get('status');
    if (!statusParam) return null;
    const statusMap: Record<string, string[]> = {
      vencida: ['VENCIDA'],
      vencendo: ['VENCENDO_30'],
      valida: ['VALIDA'],
      planejada: ['PLANEJADA'],
      cancelada: ['CANCELADA'],
    };
    return statusMap[statusParam.toLowerCase()] ?? null;
  }, [searchParams]);
  const statusFiltro = useMemo(() => {
    if (highlightedHistoricoId) return new Set<string>(ALL_STATUS_VALUES);
    if (statusParamValues) return new Set(statusParamValues);
    return persistedStatusFiltro;
  }, [highlightedHistoricoId, persistedStatusFiltro, statusParamValues]);
  const sortConfig = useMemo<SortConfig>(
    () => ({
      column: preferences.sortColumn ?? 'data_vencimento',
      direction: preferences.sortDirection ?? 'asc',
    }),
    [preferences.sortColumn, preferences.sortDirection],
  );
  const historicoCategoriaId =
    Number.isInteger(Number(preferences.historicoCategoriaId)) &&
    Number(preferences.historicoCategoriaId) > 0
      ? Number(preferences.historicoCategoriaId)
      : null;

  const setActiveTab = useCallback(
    (next: SetStateAction<QualificacoesTab>) =>
      setPreferences((current) => ({
        ...current,
        activeTab: resolveState(next, normalizeTab(current.activeTab)),
      })),
    [setPreferences],
  );
  const setPlannedView = useCallback(
    (next: SetStateAction<PlannedView>) =>
      setPreferences((current) => ({
        ...current,
        plannedView: resolveState(
          next,
          normalizePlannedView(current.activeTab, current.plannedView),
        ),
      })),
    [setPreferences],
  );
  const setLimit = useCallback(
    (next: SetStateAction<number>) =>
      setPreferences((current) => ({
        ...current,
        limit: resolveState(next, Number(current.limit) > 0 ? Number(current.limit) : 50),
      })),
    [setPreferences],
  );
  const setSearchTerm = useCallback(
    (next: SetStateAction<string>) =>
      setPreferences((current) => ({
        ...current,
        searchTerm: resolveState(next, String(current.searchTerm || '')),
      })),
    [setPreferences],
  );
  const setSortConfig = useCallback(
    (next: SetStateAction<SortConfig>) =>
      setPreferences((current) => {
        const previous: SortConfig = {
          column: current.sortColumn ?? 'data_vencimento',
          direction: current.sortDirection ?? 'asc',
        };
        const resolved = resolveState(next, previous);
        return { ...current, sortColumn: resolved.column, sortDirection: resolved.direction };
      }),
    [setPreferences],
  );
  const setAeronaveFilter = useCallback(
    (next: SetStateAction<string>) =>
      setPreferences((current) => ({
        ...current,
        aeronaveFilter: resolveState(next, String(current.aeronaveFilter || '')),
      })),
    [setPreferences],
  );
  const setCategoriaFilter = useCallback(
    (next: SetStateAction<string>) =>
      setPreferences((current) => ({
        ...current,
        categoriaFilter: sanitizeHistoricoCategoriaFilter(
          resolveState(next, String(current.categoriaFilter || '')),
        ),
      })),
    [setPreferences],
  );
  const setSetorFilter = useCallback(
    (next: SetStateAction<string[]>) =>
      setPreferences((current) => ({
        ...current,
        setorFilter: resolveState(
          next,
          Array.isArray(current.setorFilter) ? current.setorFilter.map(String) : [],
        ).map(String),
      })),
    [setPreferences],
  );
  const setCategoriasSetorFilter = useCallback(
    (next: SetStateAction<string[]>) =>
      setPreferences((current) => ({
        ...current,
        categoriasSetorFilter: resolveState(
          next,
          Array.isArray(current.categoriasSetorFilter)
            ? current.categoriasSetorFilter.map(String)
            : [],
        ).map(String),
      })),
    [setPreferences],
  );
  const setStatusFiltro = useCallback(
    (next: SetStateAction<Set<string>>) =>
      setPreferences((current) => {
        const previous = new Set(normalizeStatuses(current.statusFiltro));
        const resolved = resolveState(next, previous);
        return { ...current, statusFiltro: normalizeStatuses([...resolved]) };
      }),
    [setPreferences],
  );
  const setHistoricoCategoriaId = useCallback(
    (next: SetStateAction<number | null>) =>
      setPreferences((current) => ({
        ...current,
        historicoCategoriaId: resolveState(
          next,
          Number.isInteger(Number(current.historicoCategoriaId)) &&
            Number(current.historicoCategoriaId) > 0
            ? Number(current.historicoCategoriaId)
            : null,
        ),
      })),
    [setPreferences],
  );

  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const getDefaultHistoricoStatusSet = useCallback(
    () => createDefaultQualificationHistoryStatusSet(),
    [],
  );
  const applySingleStatusFromChip = useCallback(
    (status: string) => {
      setActiveTab('historico');
      setPage(1);
      setStatusFiltro(new Set([status]));
    },
    [setActiveTab, setStatusFiltro],
  );
  const resetStatusFromChip = useCallback(() => {
    setActiveTab('historico');
    setPage(1);
    setStatusFiltro(getDefaultHistoricoStatusSet());
  }, [getDefaultHistoricoStatusSet, setActiveTab, setStatusFiltro]);
  const isOnlyStatusSelected = useCallback(
    (status: string) => statusFiltro.size === 1 && statusFiltro.has(status),
    [statusFiltro],
  );

  const isHistoricoTab = activeTab === 'historico';
  const isPlanejadosTab = activeTab === 'planejados';
  const usesHistoricoDataset = isHistoricoTab;

  const effectiveHistoricoStatusFiltro = useMemo(() => {
    const isAllStatuses =
      statusFiltro.size === ALL_STATUS_VALUES.length &&
      ALL_STATUS_VALUES.every((status) => statusFiltro.has(status));
    return isAllStatuses ? [] : [...statusFiltro];
  }, [statusFiltro]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const viewParam = searchParams.get('view');

    if (tabParam === 'turmas') {
      setActiveTab('planejados');
      setPlannedView('turmas');
    } else if (tabParam === 'planejados') {
      setActiveTab('planejados');
      if (viewParam === 'lista' || viewParam === 'calendario' || viewParam === 'turmas') {
        setPlannedView(viewParam);
      }
    }

    if (highlightedHistoricoId) {
      setPage(1);
      return;
    }

    // `?status=...` é um recorte de navegação (dashboard/deep link), não uma
    // alteração da preferência pessoal. O valor efetivo é derivado acima sem
    // gravar em usuario_preferencias.
    if (statusParamValues) setPage(1);
  }, [
    highlightedHistoricoId,
    searchParams,
    setActiveTab,
    setPlannedView,
    statusParamValues,
  ]);

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
    preferencesReady,
  };
}
