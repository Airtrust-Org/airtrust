import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { safeFrontendApiResponseErrorMessage } from '@/react-app/lib/api-contract';
import { useAuth } from '@/react-app/hooks/useAuth';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  Edit2,
  Trash2,
  MoreHorizontal,
  Phone,
  Mail,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
const ModalFuncionario = lazyWithRetry(() => import('./ModalFuncionario'), 'ModalFuncionario');
import ConfigurarColunas, {
  DEFAULT_COLUNAS as COLUNAS_PADRAO,
  FUNCIONARIOS_COLUNAS_STORAGE_KEY,
} from './ConfigurarColunas';
import AdicionarFiltro from './AdicionarFiltro';
import { SkeletonTable } from '@/react-app/components/UI/Skeleton';
import { EmptyState } from '@/react-app/components/UI/EmptyState';
import { Users, SearchX } from 'lucide-react';
import { Pagination } from '../../../components/shared/Pagination';
import { formatarDataExibicao } from '../../utils/dateUtils';
import { formatarCPF, formatarTelefone, formatarMatricula } from '../../utils/formatters';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { buildPasta360Url } from '@/react-app/utils/pasta360';

interface Coluna {
  id: string;
  label: string;
  visivel: boolean;
  ordem: number;
}

const tableActionButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';

function normalizarColunasConfig(configSalva: Coluna[]): Coluna[] {
  const byId = new Map(configSalva.map((col) => [col.id, col]));

  return COLUNAS_PADRAO.map((colPadrao) => {
    const salva = byId.get(colPadrao.id);
    return {
      id: colPadrao.id,
      label: colPadrao.label,
      visivel: salva?.visivel ?? colPadrao.visivel,
      ordem: typeof salva?.ordem === 'number' ? salva.ordem : colPadrao.ordem,
    };
  }).sort((a, b) => a.ordem - b.ordem);
}

type SortDirection = 'asc' | 'desc' | null;
type SortableColumn =
  | 'nome'
  | 'guerra'
  | 'funcao'
  | 'setor'
  | 'aeronave'
  | 'cpf'
  | 'nascimento'
  | 'licenca'
  | 'codigo_anac'
  | 'status'
  | 'sispat'
  | 'prestserv'
  | 'matricula'
  | 'email'
  | 'telefone'
  | 'admissao';

interface SortConfig {
  column: SortableColumn | null;
  direction: SortDirection;
}

type SetorDiscoverRow = {
  setor_id?: number;
  setor?: string;
  [key: string]: unknown;
};

interface ListaFuncionariosProps {
  termoBusca: string;
  statusFilter: string;
  funcaoFilter?: string;
  aeronaveFilter?: string;
  quinzenaFilter?: string;
  setorFilter?: string[];
  configColunasAberto: boolean;
  onToggleConfigColunas: () => void;
  onStatsChange?: (stats: {
    total: number;
    ativos: number;
    inativos: number;
    byModelo: Record<string, { cmd: number; cop: number }>;
  }) => void;
  onSetoresDiscover?: (funcionarios: SetorDiscoverRow[]) => void;
  onRoleOptionsDiscover?: (roleOptions: string[]) => void;
  showModalNovoFuncionario?: boolean;
  onCloseModalNovoFuncionario?: () => void;
}

interface FuncionarioRow {
  id: number;
  nome?: string;
  status?: string;
  guerra?: string;
  funcao?: string;
  cargo?: string;
  setor?: string;
  aeronave?: string;
  cpf?: string;
  nascimento?: string;
  licenca?: string;
  codigo_anac?: string;
  sispat?: string;
  prestserv?: string;
  matricula?: string;
  email?: string;
  telefone?: string;
  admissao?: string;
  [key: string]: unknown;
}

function buildEmptyPaginationState(previous: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}) {
  return {
    ...previous,
    page: 1,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  };
}

export function resolveFuncionarioRoleLabel(
  funcionario: Pick<FuncionarioRow, 'funcao' | 'cargo'> | null | undefined,
): string {
  return String(funcionario?.funcao || funcionario?.cargo || '').trim();
}

export function extractFuncionarioRoleOptions(
  funcionarios: Array<Pick<FuncionarioRow, 'funcao' | 'cargo'>>,
): string[] {
  return Array.from(
    new Set(
      funcionarios
        .map((funcionario) => resolveFuncionarioRoleLabel(funcionario))
        .filter((value) => value.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function ListaFuncionarios({
  termoBusca,
  statusFilter,
  funcaoFilter,
  aeronaveFilter,
  quinzenaFilter,
  setorFilter,
  configColunasAberto,
  onToggleConfigColunas,
  onStatsChange,
  onSetoresDiscover,
  onRoleOptionsDiscover,
  showModalNovoFuncionario = false,
  onCloseModalNovoFuncionario,
}: ListaFuncionariosProps) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [funcionarios, setFuncionarios] = useState<FuncionarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [modalAdicionarFiltroAberto, setModalAdicionarFiltroAberto] = useState(false);
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<FuncionarioRow | null>(null);
  const [filtrosAtivos, setFiltrosAtivos] = useState<string[]>([]);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [menuAcoes, setMenuAcoes] = useState<{
    funcionario: FuncionarioRow;
    top: number;
    right: number;
  } | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: null,
    direction: null,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });

  const [colunasConfig, setColunasConfig] = useState<Coluna[]>(COLUNAS_PADRAO);

  useEffect(() => {
    const saved = localStorage.getItem(FUNCIONARIOS_COLUNAS_STORAGE_KEY);
    if (saved) {
      try {
        const parsed: Coluna[] = JSON.parse(saved);
        const normalizada = normalizarColunasConfig(parsed);
        setColunasConfig(normalizada);
        localStorage.setItem(FUNCIONARIOS_COLUNAS_STORAGE_KEY, JSON.stringify(normalizada));
      } catch (err) {
        console.error('Erro ao carregar config de colunas:', err);
        setColunasConfig(COLUNAS_PADRAO);
      }
    } else {
      localStorage.setItem(FUNCIONARIOS_COLUNAS_STORAGE_KEY, JSON.stringify(COLUNAS_PADRAO));
    }
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);
  const lastRequestRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const activeRequestIdRef = useRef(0);
  const debouncedTermoBusca = useDebounce(termoBusca, 400);

  const recarregar = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const openPasta360 = useCallback(
    (funcionarioId: number | string | null | undefined) => {
      const pasta360Url = buildPasta360Url(funcionarioId, {
        tab: 'pasta',
        origem: 'lista-funcionarios',
      });
      if (!pasta360Url) {
        toast.error('Não foi possível abrir a Pasta 360: funcionário inválido.');
        return;
      }
      navigate(pasta360Url);
    },
    [navigate],
  );

  const setoresDiscoverCallbackRef = useRef(onSetoresDiscover);
  useEffect(() => {
    setoresDiscoverCallbackRef.current = onSetoresDiscover;
  }, [onSetoresDiscover]);

  const roleOptionsDiscoverCallbackRef = useRef(onRoleOptionsDiscover);
  useEffect(() => {
    roleOptionsDiscoverCallbackRef.current = onRoleOptionsDiscover;
  }, [onRoleOptionsDiscover]);

  const prevFiltersKeyRef = useRef('');
  useEffect(() => {
    const key = [
      debouncedTermoBusca,
      statusFilter,
      funcaoFilter,
      aeronaveFilter,
      quinzenaFilter,
      (setorFilter || []).join(','),
    ]
      .map((v) => v ?? '')
      .join('|');
    if (prevFiltersKeyRef.current && key !== prevFiltersKeyRef.current) {
      setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
    }
    prevFiltersKeyRef.current = key;
  }, [debouncedTermoBusca, statusFilter, funcaoFilter, aeronaveFilter, quinzenaFilter, setorFilter]);

  useEffect(() => {
    const abortController = new AbortController();
    const requestId = ++activeRequestIdRef.current;
    let didTimeout = false;

    const requestKey = JSON.stringify({
      page: pagination.page,
      limit: pagination.limit,
      termoBusca: debouncedTermoBusca,
      statusFilter,
      funcaoFilter: funcaoFilter || '',
      aeronaveFilter: aeronaveFilter || '',
      quinzenaFilter: quinzenaFilter || '',
      setorFilter: (setorFilter || []).join(','),
      token: token || '',
      sortColumn: sortConfig.column || '',
      sortDirection: sortConfig.direction || '',
      refreshKey,
    });

    const now = Date.now();
    if (lastRequestRef.current.key === requestKey && now - lastRequestRef.current.at < 200) {
      return () => {
        abortController.abort();
      };
    }
    lastRequestRef.current = { key: requestKey, at: now };

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        const params = new URLSearchParams({
          page: String(pagination.page),
          limit: String(pagination.limit),
          search: debouncedTermoBusca || '',
        });

        if (statusFilter === 'ativos') {
          params.append('status', 'ativo');
        } else if (statusFilter === 'inativos') {
          params.append('status', 'inativo');
        } else if (statusFilter === 'todos') {
          params.append('status', 'todos');
        }

        if (funcaoFilter) params.append('funcao', funcaoFilter);
        if (aeronaveFilter) params.append('aeronave', aeronaveFilter);
        if (quinzenaFilter) params.append('quinzena', quinzenaFilter);
        if (setorFilter && setorFilter.length > 0) {
          setorFilter.forEach((id) => params.append('setor_id', id));
        }
        if (sortConfig.column && sortConfig.direction) {
          params.append('orderBy', sortConfig.column);
          params.append('order', sortConfig.direction.toUpperCase());
        }

        const url = `${API_BASE_URL}/funcionarios?${params.toString()}`;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const timeoutId = window.setTimeout(() => {
          didTimeout = true;
          abortController.abort();
        }, 15000);

        const response = await fetch(url, {
          headers,
          cache: 'no-cache',
          signal: abortController.signal,
        });

        window.clearTimeout(timeoutId);
        if (requestId !== activeRequestIdRef.current) return;

        if (!response.ok) {
          if (response.status === 401) {
            setError('Não autorizado. Faça login novamente.');
          } else {
            setError('Não foi possível carregar os funcionários. Tente novamente.');
          }
          setFuncionarios([]);
          setPagination((prev) => buildEmptyPaginationState(prev));
          return;
        }

        const data = await response.json();
        if (requestId !== activeRequestIdRef.current) return;

        const lista = data.data || data.funcionarios || [];
        setFuncionarios(Array.isArray(lista) ? lista : []);

        const setoresDiscoverCallback = setoresDiscoverCallbackRef.current;
        if (setoresDiscoverCallback && Array.isArray(lista)) setoresDiscoverCallback(lista);

        const roleOptionsDiscoverCallback = roleOptionsDiscoverCallbackRef.current;
        if (roleOptionsDiscoverCallback && Array.isArray(lista)) {
          roleOptionsDiscoverCallback(extractFuncionarioRoleOptions(lista));
        }

        if (data.pagination) {
          setPagination((prev) => {
            const next = {
              ...prev,
              page: Number(data.pagination.page) || prev.page,
              limit: Number(data.pagination.limit) || prev.limit,
              total: Number(data.pagination.total) || lista.length,
              totalPages: Number(data.pagination.totalPages) || 1,
              hasNext: Boolean(data.pagination.hasNext),
              hasPrev: Boolean(data.pagination.hasPrev),
            };
            if (
              prev.page === next.page &&
              prev.limit === next.limit &&
              prev.total === next.total &&
              prev.totalPages === next.totalPages &&
              prev.hasNext === next.hasNext &&
              prev.hasPrev === next.hasPrev
            ) {
              return prev;
            }
            return next;
          });
        } else {
          setPagination((prev) => ({
            ...prev,
            total: lista.length,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          }));
        }
      } catch (e) {
        if (didTimeout) {
          if (requestId === activeRequestIdRef.current) {
            setError('Tempo limite ao carregar funcionários. Tente novamente.');
            setFuncionarios([]);
            setPagination((prev) => buildEmptyPaginationState(prev));
          }
          return;
        }
        if ((e as Error)?.name === 'AbortError') return;
        console.error('[FUNCIONARIOS] Erro fetch:', e);
        if (requestId === activeRequestIdRef.current) {
          setError('Erro de rede ao carregar funcionários. Tente novamente.');
          setFuncionarios([]);
          setPagination((prev) => buildEmptyPaginationState(prev));
        }
      } finally {
        if (requestId === activeRequestIdRef.current) setLoading(false);
      }
    };

    void fetchData();
    return () => abortController.abort();
  }, [
    pagination.page,
    pagination.limit,
    debouncedTermoBusca,
    statusFilter,
    funcaoFilter,
    aeronaveFilter,
    quinzenaFilter,
    setorFilter,
    token,
    sortConfig,
    refreshKey,
  ]);

  const colunasVisiveis = useMemo(
    () => colunasConfig.filter((col) => col.visivel).sort((a, b) => a.ordem - b.ordem),
    [colunasConfig],
  );

  const handleSort = (column: SortableColumn) => {
    let direction: SortDirection = 'asc';
    if (sortConfig.column === column) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') direction = null;
    }
    setSortConfig({ column: direction ? column : null, direction });
  };

  const funcionariosFiltradosEOrdenados = useMemo(() => funcionarios, [funcionarios]);

  const handleAdicionarFiltro = (filtroId: string) => {
    setFiltrosAtivos((prev) => [...prev, filtroId]);
  };

  const handleExcluir = useCallback(
    async (id: number, nome?: string) => {
      if (excluindo === id) return;

      const confirmar = await confirmDialog(
        `Excluir o funcionário "${nome || 'selecionado'}"?\n\nEsta ação é permanente e não pode ser desfeita.`,
        { title: 'Confirmar exclusão', confirmText: 'Excluir funcionário', cancelText: 'Cancelar' },
      );
      if (!confirmar) return;

      setExcluindo(id);
      try {
        const response = await fetch(`${API_BASE_URL}/funcionarios/${id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          cache: 'no-cache',
        });

        if (response.ok) {
          setFuncionarios((current) => current.filter((f) => f.id !== id));
          setTimeout(() => {
            recarregar();
            setExcluindo(null);
          }, 1000);
          return;
        }

        const errorData = await response.json().catch(() => null);
        const backendMessage =
          typeof errorData?.error === 'string'
            ? errorData.error
            : typeof errorData?.message === 'string'
              ? errorData.message
              : undefined;
        const errorMessage =
          response.status === 403
            ? 'Você não tem permissão para excluir funcionários.'
            : safeFrontendApiResponseErrorMessage(backendMessage, response.status);
        toast.warning(errorMessage);
        setExcluindo(null);
      } catch (error) {
        console.error('Erro ao excluir funcionário:', error);
        toast.warning('Erro de rede ao excluir funcionário. Tente novamente.');
        setExcluindo(null);
      }
    },
    [token, recarregar, excluindo],
  );

  const handleSalvarFuncionario = useCallback(
    async (dados: Partial<FuncionarioRow> & { id?: number }) => {
      try {
        const url = dados.id
          ? `${API_BASE_URL}/funcionarios/${dados.id}`
          : `${API_BASE_URL}/funcionarios`;

        const response = await fetch(url, {
          method: dados.id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(dados),
          cache: 'no-cache',
        });

        if (response.ok) {
          toast.success(
            dados.id ? 'Funcionário atualizado com sucesso!' : 'Funcionário criado com sucesso!',
          );
          onCloseModalNovoFuncionario?.();
          setFuncionarioSelecionado(null);
          setTimeout(() => recarregar(), 200);
        } else {
          const errorData = await response.json().catch(() => ({}));
          const backendMessage =
            typeof errorData?.error === 'string'
              ? errorData.error
              : typeof errorData?.message === 'string'
                ? errorData.message
                : undefined;
          const msg = safeFrontendApiResponseErrorMessage(backendMessage, response.status);
          console.error('[SAVE ERROR]', errorData);
          toast.error(`Erro ao salvar funcionário: ${msg}`);
        }
      } catch (error) {
        console.error('[SAVE EXCEPTION]', error);
        toast.error('Erro de rede ao salvar funcionário. Verifique sua conexão.');
      }
    },
    [token, recarregar, onCloseModalNovoFuncionario],
  );

  const statsCallbackRef = useRef(onStatsChange);
  useEffect(() => {
    statsCallbackRef.current = onStatsChange;
  }, [onStatsChange]);
  useEffect(() => {
    const cb = statsCallbackRef.current;
    if (!cb) return;

    const total = pagination.total;
    const ativos = funcionarios.filter((f) => (f.status || '').toUpperCase() === 'ATIVO').length;
    const inativos = funcionarios.filter((f) => (f.status || '').toUpperCase() !== 'ATIVO').length;
    const byModelo: Record<string, { cmd: number; cop: number }> = {};
    for (const f of funcionarios) {
      if ((f.status || '').toUpperCase() !== 'ATIVO') continue;
      const modelo = (f.aeronave || '').trim().toUpperCase().replace(/[\s-]+/g, '');
      const modeloKey = modelo.includes('AW139')
        ? 'AW139'
        : modelo.includes('SK76') || modelo.includes('S76')
          ? 'SK76'
          : modelo || 'Outros';
      if (!byModelo[modeloKey]) byModelo[modeloKey] = { cmd: 0, cop: 0 };
      const cargoOuFuncao = resolveFuncionarioRoleLabel(f).toLowerCase();
      if (cargoOuFuncao.includes('comandante')) byModelo[modeloKey].cmd++;
      else if (cargoOuFuncao.includes('copiloto')) byModelo[modeloKey].cop++;
    }
    cb({ total, ativos, inativos, byModelo });
  }, [pagination.total, funcionarios]);

  return (
    <div className="flex flex-col space-y-6">
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <SkeletonTable columns={colunasVisiveis.length + 1} rows={10} />
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
          <div className="max-h-[600px] overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-max">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  {colunasVisiveis.map((col) => {
                    const isSortable = [
                      'nome',
                      'guerra',
                      'funcao',
                      'setor',
                      'aeronave',
                      'cpf',
                      'nascimento',
                      'licenca',
                      'codigo_anac',
                      'status',
                      'sispat',
                      'prestserv',
                      'matricula',
                      'email',
                      'telefone',
                      'admissao',
                    ].includes(col.id);
                    const isActive = sortConfig.column === col.id;
                    const direction = isActive ? sortConfig.direction : null;

                    return (
                      <th
                        key={col.id}
                        onClick={() => isSortable && handleSort(col.id as SortableColumn)}
                        className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 ${
                          isSortable ? 'cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{col.label}</span>
                          {isSortable && (
                            <div className="flex flex-col">
                              {direction === null && <ArrowUpDown className="h-4 w-4 text-slate-400" />}
                              {direction === 'asc' && <ArrowUp className="h-4 w-4 text-blue-600" />}
                              {direction === 'desc' && <ArrowDown className="h-4 w-4 text-blue-600" />}
                            </div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="w-32 whitespace-nowrap px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {funcionariosFiltradosEOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={colunasVisiveis.length + 1} className="py-8">
                      <EmptyState
                        icon={
                          termoBusca ? (
                            <SearchX size={48} className="text-slate-300 dark:text-slate-600" />
                          ) : (
                            <Users size={48} className="text-slate-300 dark:text-slate-600" />
                          )
                        }
                        title={termoBusca ? 'Nenhum resultado' : 'Nenhum funcionário cadastrado'}
                        description={
                          termoBusca
                            ? `Não encontramos funcionários para "${termoBusca}"`
                            : 'Ainda não há funcionários cadastrados no sistema.'
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  funcionariosFiltradosEOrdenados.map((func) => (
                    <tr key={func.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      {colunasVisiveis.map((col) => {
                        const rawVal = func[col.id] as unknown;
                        let valor = rawVal == null || rawVal === '' ? '-' : String(rawVal);

                        if (col.id === 'email' && func.email) {
                          return (
                            <td key={col.id} className="whitespace-nowrap px-4 py-3 text-sm">
                              <a
                                href={`mailto:${func.email}`}
                                className="flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                                title="Enviar e-mail"
                              >
                                <Mail className="h-3 w-3" />
                                {func.email}
                              </a>
                            </td>
                          );
                        }

                        if (col.id === 'telefone' && func.telefone) {
                          const telefoneNumerico = func.telefone.replace(/\D/g, '');
                          const whatsappLink = `https://wa.me/55${telefoneNumerico}`;
                          return (
                            <td key={col.id} className="whitespace-nowrap px-4 py-3 text-sm">
                              <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-green-700 hover:underline dark:text-green-400"
                                title="Abrir contato no WhatsApp"
                              >
                                <Phone className="h-3 w-3" />
                                {formatarTelefone(func.telefone)}
                              </a>
                            </td>
                          );
                        }

                        if (col.id === 'cpf' && func.cpf) valor = formatarCPF(func.cpf);
                        if (col.id === 'matricula' && func.matricula) valor = formatarMatricula(func.matricula);
                        if (col.id === 'nascimento' && func.nascimento) {
                          valor = formatarDataExibicao(func.nascimento) || '-';
                        }
                        if (col.id === 'admissao' && func.admissao) {
                          valor = formatarDataExibicao(func.admissao) || '-';
                        }

                        if (col.id === 'status') {
                          const rawStatus = (
                            func.status ||
                            (func.ativo === 1 ? 'ATIVO' : func.ativo === 0 ? 'INATIVO' : '')
                          )
                            .toString()
                            .toUpperCase();
                          const normalizedStatus = rawStatus === 'DESLIGADO' ? 'INATIVO' : rawStatus;
                          const statusColors: Record<string, string> = {
                            ATIVO: 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
                            INATIVO: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
                            FERIAS: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
                            LICENCA: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300',
                            AFASTADO: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300',
                          };
                          const statusLabel: Record<string, string> = {
                            ATIVO: 'Ativo',
                            INATIVO: 'Inativo',
                            FERIAS: 'Férias',
                            LICENCA: 'Licença',
                            AFASTADO: 'Afastado',
                          };
                          const colorClass = statusColors[normalizedStatus] || statusColors.INATIVO;
                          const label = statusLabel[normalizedStatus] || normalizedStatus || '-';

                          return (
                            <td key={col.id} className="whitespace-nowrap px-4 py-3 text-sm">
                              <span className={`rounded-full px-2 py-1 text-xs font-medium ${colorClass}`}>
                                {label}
                              </span>
                            </td>
                          );
                        }

                        if (col.id === 'funcao') valor = resolveFuncionarioRoleLabel(func) || '-';

                        return (
                          <td
                            key={col.id}
                            className="whitespace-nowrap px-4 py-3 text-sm text-slate-900 dark:text-slate-100"
                          >
                            {valor}
                          </td>
                        );
                      })}

                      <td className="px-2 py-3 text-sm">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openPasta360(func.id)}
                            className={tableActionButtonClass}
                            aria-label={`Abrir perfil de ${func.nome || 'funcionário'}`}
                            title="Abrir perfil"
                          >
                            <FolderOpen className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setMenuAcoes(null);
                              setFuncionarioSelecionado(func);
                            }}
                            className={tableActionButtonClass}
                            aria-label={`Editar ${func.nome || 'funcionário'}`}
                            title="Editar funcionário"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>

                          <button
                            type="button"
                            onClick={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              const sameFuncionario = menuAcoes?.funcionario.id === func.id;
                              if (sameFuncionario) {
                                setMenuAcoes(null);
                                return;
                              }
                              setMenuAcoes({
                                funcionario: func,
                                top: Math.min(rect.bottom + 4, window.innerHeight - 108),
                                right: Math.max(8, window.innerWidth - rect.right),
                              });
                            }}
                            className={tableActionButtonClass}
                            aria-label={`Mais ações para ${func.nome || 'funcionário'}`}
                            aria-expanded={menuAcoes?.funcionario.id === func.id}
                            aria-haspopup="menu"
                            title="Mais ações"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
            hasNext={pagination.hasNext}
            hasPrev={pagination.hasPrev}
            total={pagination.total}
            limit={pagination.limit}
            limitOptions={[50, 100]}
            onLimitChange={(limit) =>
              setPagination((prev) => ({
                ...prev,
                page: 1,
                limit,
              }))
            }
          />
        </>
      )}

      {(showModalNovoFuncionario || funcionarioSelecionado) && (
        <Suspense fallback={null}>
          <ModalFuncionario
            aberto={showModalNovoFuncionario || !!funcionarioSelecionado}
            funcionario={funcionarioSelecionado}
            onFechar={() => {
              onCloseModalNovoFuncionario?.();
              setFuncionarioSelecionado(null);
            }}
            onSalvar={handleSalvarFuncionario}
          />
        </Suspense>
      )}

      {menuAcoes &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[90] cursor-default bg-transparent"
              aria-label="Fechar menu de ações"
              onClick={() => setMenuAcoes(null)}
            />
            <div
              role="menu"
              aria-label={`Ações para ${menuAcoes.funcionario.nome || 'funcionário'}`}
              className="fixed z-[100] w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
              style={{ top: menuAcoes.top, right: menuAcoes.right }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const funcionario = menuAcoes.funcionario;
                  setMenuAcoes(null);
                  setFuncionarioSelecionado(funcionario);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Edit2 className="h-4 w-4" />
                Editar
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const funcionario = menuAcoes.funcionario;
                  setMenuAcoes(null);
                  void handleExcluir(funcionario.id, funcionario.nome);
                }}
                disabled={excluindo === menuAcoes.funcionario.id}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4" />
                {excluindo === menuAcoes.funcionario.id ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </>,
          document.body,
        )}

      {configColunasAberto && (
        <ConfigurarColunas
          onClose={onToggleConfigColunas}
          onSalvar={(novaConfig: Coluna[]) => {
            const normalizada = normalizarColunasConfig(novaConfig);
            setColunasConfig(normalizada);
          }}
        />
      )}

      {modalAdicionarFiltroAberto && (
        <AdicionarFiltro
          onClose={() => setModalAdicionarFiltroAberto(false)}
          filtrosAtivos={filtrosAtivos}
          onAdicionar={handleAdicionarFiltro}
        />
      )}
    </div>
  );
}