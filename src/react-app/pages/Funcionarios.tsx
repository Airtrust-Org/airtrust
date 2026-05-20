import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Columns2, Plus, Search } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { Button as UIButton } from '@/react-app/components/UI';
import { ListaFuncionarios } from './funcionarios/ListaFuncionarios';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { API_BASE_URL } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useSearchParams } from 'react-router-dom';

interface ModeloAeronave {
  id: number;
  codigo?: string;
  modelo?: string;
  nome?: string;
}

interface Setor {
  id: number;
  nome: string;
}

type FuncionarioSetorDiscover = {
  setor_id?: number;
  setor?: string;
};

function normalizeAeronaveLabel(value?: string): string {
  if (!value) return '';
  return ['S76', 'SK76'].includes(value.trim().toUpperCase()) ? 'SK76' : value;
}

export default function Funcionarios() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ativos');
  const [funcaoFilter, setFuncaoFilter] = useState(searchParams.get('funcao') ?? '');
  const [aeronaveFilter, setAeronaveFilter] = useState('');
  const [quinzenaFilter, setQuinzenaFilter] = useState('');
  const [setorFilter, setSetorFilter] = useState('');
  const [configColunasAberto, setConfigColunasAberto] = useState(false);
  const [showModalNovoFuncionario, setShowModalNovoFuncionario] = useState(false);
  const [modelosAeronave, setModelosAeronave] = useState<ModeloAeronave[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    ativos: number;
    inativos: number;
    byModelo: Record<string, { cmd: number; cop: number }>;
  } | null>(null);
  const modelosLoadedRef = useRef(false);

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

  const handleSetoresDiscover = useCallback((funcionarios: FuncionarioSetorDiscover[]) => {
    // Extrair setores únicos dos funcionários
    const setoresUnicos = new Map<number, string>();
    funcionarios.forEach((f) => {
      if (f.setor_id && f.setor) {
        setoresUnicos.set(f.setor_id, f.setor);
      }
    });
    // Converter para array e ordenar
    const setoresArray = Array.from(setoresUnicos.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    setSetores((prev) => {
      if (prev.length === setoresArray.length) {
        const unchanged = prev.every(
          (setor, index) =>
            setor.id === setoresArray[index]?.id && setor.nome === setoresArray[index]?.nome,
        );
        if (unchanged) return prev;
      }
      return setoresArray;
    });
  }, []);

  useEffect(() => {
    if (modelosLoadedRef.current) return;
    modelosLoadedRef.current = true;
    loadModelosAeronave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const nextFuncao = searchParams.get('funcao') ?? '';
    if (nextFuncao !== funcaoFilter) {
      setFuncaoFilter(nextFuncao);
    }
  }, [funcaoFilter, searchParams]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (funcaoFilter) nextParams.set('funcao', funcaoFilter);
    else nextParams.delete('funcao');
    setSearchParams(nextParams, { replace: true });
  }, [funcaoFilter, searchParams, setSearchParams]);

  const setoresOrdenados = useMemo(() => {
    return [...setores].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [setores]);

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
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-56 rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white text-slate-900 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>

            <select
              value={funcaoFilter}
              onChange={(e) => setFuncaoFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white text-slate-900 cursor-pointer dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas as Funções</option>
              <option value="Comandante">Comandante</option>
              <option value="Copiloto">Copiloto</option>
            </select>

            <select
              value={aeronaveFilter}
              onChange={(e) => setAeronaveFilter(e.target.value)}
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
              onChange={(e) => setQuinzenaFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white text-slate-900 cursor-pointer w-max dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todas as Quinzenas</option>
              <option value="primeira">1ª Quinzena</option>
              <option value="segunda">2ª Quinzena</option>
              <option value="personalizada">Flex</option>
            </select>

            <select
              value={setorFilter}
              onChange={(e) => setSetorFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary appearance-none bg-white text-slate-900 cursor-pointer w-max dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Todos os Setores</option>
              {setoresOrdenados.map((setor) => (
                <option key={setor.id} value={setor.nome}>
                  {setor.nome}
                </option>
              ))}
            </select>
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
            onSetoresDiscover={handleSetoresDiscover}
            onStatsChange={setStats}
            showModalNovoFuncionario={showModalNovoFuncionario}
            onCloseModalNovoFuncionario={() => setShowModalNovoFuncionario(false)}
          />
        </div>
      </div>
    </AppLayout>
  );
}
