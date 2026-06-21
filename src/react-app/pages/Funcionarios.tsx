import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Columns2, Plus, Search } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { Button as UIButton } from '@/react-app/components/UI';
import { MultiSelect, type MultiSelectOption } from '@/react-app/components/UI/MultiSelect';
import { ListaFuncionarios } from './funcionarios/ListaFuncionarios';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { API_BASE_URL } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useTablePreferences } from '@/react-app/hooks/useTablePreferences';
import { useSearchParams } from 'react-router-dom';
import ManagerAlertCenter from './funcionarios/ManagerAlertCenter';

interface ModeloAeronave {
  id: number;
  codigo?: string;
  modelo?: string;
  nome?: string;
}

interface Funcao {
  id: number;
  nome: string;
}

interface Setor {
  id: number;
  nome: string;
}

function normalizeRoleLabel(value?: string | null): string {
  return String(value || '').trim();
}

function normalizeAeronaveLabel(value?: string): string {
  if (!value) return '';
  return ['S76', 'SK76'].includes(value.trim().toUpperCase()) ? 'SK76' : value;
}

export default function Funcionarios() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Filtros persistentes (localStorage por usuário) ──
  const FUNCIONARIOS_FILTERS_KEY = '@airtrust/filters-funcionarios';

  interface FuncionariosFilters {
    searchTerm: string;
    statusFilter: string;
    funcaoFilter: string;
    aeronaveFilter: string;
    quinzenaFilter: string;
    setorFilter: string[];
  }

  const defaultFilters = useMemo<FuncionariosFilters>(
    () => ({
      searchTerm: '',
      statusFilter: 'ativos',
      funcaoFilter: '',
      aeronaveFilter: '',
      quinzenaFilter: '',
      setorFilter: [],
    }),
    [],
  );

  const {
    preferences: filters,
    setPreferences: setFilters,
    ready: filtersReady,
  } = useTablePreferences<FuncionariosFilters>('tabela.funcionarios.lista', defaultFilters);

  const migratedLegacyFiltersRef = useRef(false);

  useEffect(() => {
    if (!filtersReady || migratedLegacyFiltersRef.current) return;
    migratedLegacyFiltersRef.current = true;

    try {
      const legacyRaw = localStorage.getItem(FUNCIONARIOS_FILTERS_KEY);
      if (!legacyRaw) return;
      const legacy = JSON.parse(legacyRaw) as Partial<FuncionariosFilters>;
      setFilters((prev) => ({
        ...prev,
        ...legacy,
        setorFilter: Array.isArray(legacy.setorFilter)
          ? legacy.setorFilter
          : legacy.setorFilter
            ? [String(legacy.setorFilter)]
            : prev.setorFilter,
      }));
      localStorage.removeItem(FUNCIONARIOS_FILTERS_KEY);
    } catch (error) {
      console.error('Erro ao migrar filtros legados de funcionários:', error);
    }
  }, [filtersReady, setFilters]);

  // Migrar setorFilter legado (string → string[]) uma vez na montagem
  useEffect(() => {
    if (!Array.isArray(filters.setorFilter)) {
      const normalized: string[] = filters.setorFilter ? [filters.setorFilter] : [];
      setFilters((prev) => ({ ...prev, setorFilter: normalized }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Estabilizar referência (useMemo evita novo [] a cada render)
  const setorFilter: string[] = useMemo(
    () => (Array.isArray(filters.setorFilter) ? filters.setorFilter : []),
    [filters.setorFilter],
  );

  const { searchTerm, statusFilter, funcaoFilter, aeronaveFilter, quinzenaFilter } = filters;

  const updateFilter = useCallback(
    <K extends keyof FuncionariosFilters>(key: K, value: FuncionariosFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [setFilters],
  );

  const [configColunasAberto, setConfigColunasAberto] = useState(false);
  const [showModalNovoFuncionario, setShowModalNovoFuncionario] = useState(false);
  const [modelosAeronave, setModelosAeronave] = useState<ModeloAeronave[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [roleOptionsDiscovered, setRoleOptionsDiscovered] = useState<string[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    ativos: number;
    inativos: number;
    byModelo: Record<string, { cmd: number; cop: number }>;
  } | null>(null);
  const modelosLoadedRef = useRef(false);

  // Setores ordenados para o select múltiplo
  const setoresOrdenados = useMemo(() => {
    return [...setores].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [setores]);

  const setorOptions = useMemo<MultiSelectOption[]>(
    () => setoresOrdenados.map((setor) => ({ value: String(setor.id), label: setor.nome })),
    [setoresOrdenados],
  );

  const funcoesOrdenadas = useMemo(() => {
    const byNome = new Map<string, Funcao>();

    funcoes.forEach((funcao, index) => {
      const nome = normalizeRoleLabel(funcao.nome);
      if (!nome) return;
      byNome.set(nome, { id: funcao.id || index + 1, nome });
    });

    roleOptionsDiscovered.forEach((nome, index) => {
      const normalized = normalizeRoleLabel(nome);
      if (!normalized || byNome.has(normalized)) return;
      byNome.set(normalized, { id: 100000 + index, nome: normalized });
    });

    return Array.from(byNome.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [funcoes, roleOptionsDiscovered]);

  useEffect(() => {
    if (setoresOrdenados.length !== 1) return;
    const onlySetorId = String(setoresOrdenados[0].id);
    if (setorFilter.length === 1 && setorFilter[0] === onlySetorId) return;
    updateFilter('setorFilter', [onlySetorId]);
  }, [setoresOrdenados, setorFilter, updateFilter]);

  const loadModelosAeronave = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/modelos-aeronave`, { headers });
      if (!response.ok) return;
      const data = await response.json();
      const lista = data?.data || data?.modelos || [];
      setModelosAeronave(Array.isArray(lista) ? lista : []);
    } catch (error) {
      console.error('Erro ao carregar modelos de aeronave:', error);
    }
  };

  useEffect(() => {
    if (modelosLoadedRef.current) return;
    modelosLoadedRef.current = true;
    loadModelosAeronave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const loadFuncoes = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${API_BASE_URL}/funcoes`, { headers, cache: 'no-cache' });
        if (!response.ok) return;
        const payload = await response.json();
        const lista = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setFuncoes(lista);
      } catch (error) {
        console.error('Erro ao carregar funções:', error);
      }
    };

    loadFuncoes();
  }, [token]);

  useEffect(() => {
    const loadSetores = async () => {
      try {
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(`${API_BASE_URL}/setores`, { headers, cache: 'no-cache' });
        if (!response.ok) return;
        const payload = await response.json();
        setSetores(Array.isArray(payload?.data) ? payload.data : []);
      } catch (error) {
        console.error('Erro ao carregar setores:', error);
      }
    };
    loadSetores();
  }, [token]);

  useEffect(() => {
    const nextFuncao = searchParams.get('funcao') ?? '';
    if (nextFuncao !== funcaoFilter) {
      updateFilter('funcaoFilter', nextFuncao);
    }
  }, [funcaoFilter, searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (funcaoFilter) nextParams.set('funcao', funcaoFilter);
    else nextParams.delete('funcao');
    setSearchParams(nextParams, { replace: true });
  }, [funcaoFilter, searchParams, setSearchParams]);

  const modelosAeronaveOptions = useMemo(() => {
    const unique = new Map<string, { id: number; label: string }>();

    modelosAeronave.forEach((m) => {
      const preferredLabel = normalizeAeronaveLabel(m.modelo || m.codigo || m.nome || String(m.id));
      if (!preferredLabel) return;
      if (!unique.has(preferredLabel)) {
        unique.set(preferredLabel, { id: m.id, label: preferredLabel });
      }
    });

    return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [modelosAeronave]);

  return (
    <AppLayout>
      {/* Page Header */}
      <PageHeader
        className="mb-8"
        title="Funcionários"
        subtitle="Gerencie dados e registros de funcionários."
        actions={
          <>
            <UIButton onClick={() => setShowModalNovoFuncionario(true)} variant="primary">
              <Plus size={16} />
              <span>Incluir Funcionário</span>
            </UIButton>
          </>
        }
      />

      <ManagerAlertCenter />

      {/* Main content container */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {/* Search + Filters */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por nome, matrícula, CPF..."
                value={searchTerm}
                onChange={(e) => updateFilter('searchTerm', e.target.value)}
                className="w-56 rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => updateFilter('statusFilter', e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white text-slate-900 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>

            <select
              value={funcaoFilter}
              onChange={(e) => updateFilter('funcaoFilter', e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white text-slate-900 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas as Funções/Cargos</option>
              {funcoesOrdenadas.map((funcao) => (
                <option key={funcao.id} value={funcao.nome}>
                  {funcao.nome}
                </option>
              ))}
            </select>

            <select
              value={aeronaveFilter}
              onChange={(e) => updateFilter('aeronaveFilter', e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white text-slate-900 cursor-pointer w-max dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todos os Equipamentos</option>
              {modelosAeronaveOptions.map((m) => (
                <option key={m.id} value={m.label}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              value={quinzenaFilter}
              onChange={(e) => updateFilter('quinzenaFilter', e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white text-slate-900 cursor-pointer w-max dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas as Quinzenas</option>
              <option value="primeira">1ª Quinzena</option>
              <option value="segunda">2ª Quinzena</option>
              <option value="personalizada">Flex</option>
            </select>

            {setoresOrdenados.length === 1 ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                {setoresOrdenados[0].nome}
              </div>
            ) : (
              <MultiSelect
                options={setorOptions}
                selected={setorFilter}
                onChange={(selected) => updateFilter('setorFilter', selected)}
                placeholder="Todos os setores"
                allLabel="Todos os setores"
              />
            )}
            <button
              onClick={() => setConfigColunasAberto((prev) => !prev)}
              className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Columns2 className="w-4 h-4" />
              <span>Configurar colunas</span>
            </button>
          </div>
          {/* Stats chips */}
          {stats && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-[11px]">
              <span className="font-medium text-slate-500">{stats.ativos} ativos</span>
              {['AW139', 'SK76'].map((modelo) => {
                const s = stats.byModelo[modelo];
                if (!s) return null;
                const total = s.cmd + s.cop;
                return (
                  <span key={modelo} className="flex items-center gap-1">
                    <span className="text-slate-300">·</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-semibold',
                        modelo === 'AW139'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-yellow-200 bg-yellow-50 text-yellow-700',
                      )}
                    >
                      {total} {modelo}
                    </span>
                    <span className="text-slate-400">
                      ({s.cmd} CMD · {s.cop} COP)
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <ListaFuncionarios
            termoBusca={searchTerm}
            statusFilter={statusFilter}
            funcaoFilter={funcaoFilter}
            aeronaveFilter={aeronaveFilter}
            quinzenaFilter={quinzenaFilter}
            setorFilter={setorFilter}
            configColunasAberto={configColunasAberto}
            onToggleConfigColunas={() => setConfigColunasAberto((prev) => !prev)}
            onStatsChange={setStats}
            onRoleOptionsDiscover={setRoleOptionsDiscovered}
            showModalNovoFuncionario={showModalNovoFuncionario}
            onCloseModalNovoFuncionario={() => setShowModalNovoFuncionario(false)}
          />
        </div>
      </div>
    </AppLayout>
  );
}
