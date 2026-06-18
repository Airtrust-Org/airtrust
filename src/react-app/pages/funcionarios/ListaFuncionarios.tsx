import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  Edit2,
  Trash2,
  Phone,
  Mail,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
// 🚀 LAZY LOADING: Modal carregado apenas quando necessário
import { lazyWithRetry } from '@/react-app/utils/lazyWithRetry';
const ModalFuncionario = lazyWithRetry(() => import('./ModalFuncionario'), 'ModalFuncionario');
import ConfigurarColunas from './ConfigurarColunas';
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

const COLUNAS_PADRAO: Coluna[] = [
  { id: 'nome', label: 'Nome', visivel: true, ordem: 0 },
  { id: 'guerra', label: 'Guerra', visivel: true, ordem: 1 },
  { id: 'funcao', label: 'Função / Cargo', visivel: true, ordem: 2 },
  { id: 'setor', label: 'Setor', visivel: true, ordem: 3 },
  { id: 'aeronave', label: 'Equipamento', visivel: true, ordem: 4 },
  { id: 'cpf', label: 'CPF', visivel: true, ordem: 5 },
  { id: 'nascimento', label: 'Data Nasc.', visivel: true, ordem: 6 },
  { id: 'licenca', label: 'Licença', visivel: true, ordem: 7 },
  { id: 'codigo_anac', label: 'CANAC', visivel: true, ordem: 8 },
  { id: 'status', label: 'Status', visivel: true, ordem: 9 },
  { id: 'sispat', label: 'SISPAT', visivel: true, ordem: 10 },
  { id: 'prestserv', label: 'PrestServ', visivel: true, ordem: 11 },
  { id: 'matricula', label: 'Matrícula', visivel: true, ordem: 12 },
  { id: 'email', label: 'E-mail', visivel: true, ordem: 13 },
  { id: 'telefone', label: 'Telefone', visivel: true, ordem: 14 },
  { id: 'admissao', label: 'Admissão', visivel: true, ordem: 15 },
];

const tableActionButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900';

const tableActionDangerButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 shadow-sm transition hover:bg-rose-50';

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
  [key: string]: unknown; // permite acesso dinâmico em colunas configuráveis
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
  return String(funcionario?.funcao || funcionario?.cargo || '')
    .trim();
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
// (import duplicado removido)

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
  // Removido estado interno de busca e controle de modal de colunas (controlado pelo parent)
  const [modalAdicionarFiltroAberto, setModalAdicionarFiltroAberto] = useState(false);
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<FuncionarioRow | null>(null);
  const [filtrosAtivos, setFiltrosAtivos] = useState<string[]>([]);
  const [excluindo, setExcluindo] = useState<number | null>(null);
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

  // Carregar configuração de colunas do localStorage na inicialização
  useEffect(() => {
    const saved = localStorage.getItem('funcionarios_colunas_config');
    if (saved) {
      try {
        const parsed: Coluna[] = JSON.parse(saved);
        const normalizada = normalizarColunasConfig(parsed);
        setColunasConfig(normalizada);
        localStorage.setItem('funcionarios_colunas_config', JSON.stringify(normalizada));
      } catch (err) {
        console.error('Erro ao carregar config de colunas:', err);
        setColunasConfig(COLUNAS_PADRAO);
      }
    } else {
      localStorage.setItem('funcionarios_colunas_config', JSON.stringify(COLUNAS_PADRAO));
    }
  }, []);

  // Contador para forçar recarregamento após salvar/excluir
  const [refreshKey, setRefreshKey] = useState(0);
  const lastRequestRef = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const activeRequestIdRef = useRef(0);
  const debouncedTermoBusca = useDebounce(termoBusca, 400);

  // Função reutilizada após exclusão / salvamento
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

  // Resetar paginação para página 1 quando qualquer filtro mudar
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTermoBusca, statusFilter, funcaoFilter, aeronaveFilter, quinzenaFilter, setorFilter]);

  // Fetch principal - com ordenação server-side
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

        // Adicionar filtro de status
        if (statusFilter === 'ativos') {
          params.append('status', 'ativo');
        } else if (statusFilter === 'inativos') {
          params.append('status', 'inativo');
        } else if (statusFilter === 'todos') {
          params.append('status', 'todos');
        }

        // Adicionar filtro de função se existir
        if (funcaoFilter) {
          params.append('funcao', funcaoFilter);
        }

        // Adicionar filtro de aeronave se existir
        if (aeronaveFilter) {
          params.append('aeronave', aeronaveFilter);
        }

        // Adicionar filtro de quinzena se existir
        if (quinzenaFilter) {
          params.append('quinzena', quinzenaFilter);
        }

        // Adicionar filtro de setor(es) se existir
        if (setorFilter && setorFilter.length > 0) {
          setorFilter.forEach((id) => params.append('setor_id', id));
        }

        // Adicionar ordenação se existir
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
            setError(`Falha na API (HTTP ${response.status})`);
          }
          setFuncionarios([]);
          setPagination((prev) => buildEmptyPaginationState(prev));
          return;
        }
        const data = await response.json();
        if (requestId !== activeRequestIdRef.current) return;

        const lista = data.data || data.funcionarios || [];
        setFuncionarios(Array.isArray(lista) ? lista : []);

        // Notificar setores únicos encontrados nos funcionários
        const setoresDiscoverCallback = setoresDiscoverCallbackRef.current;
        if (setoresDiscoverCallback && Array.isArray(lista)) {
          setoresDiscoverCallback(lista);
        }

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
          // Se API antiga sem meta de paginação
          setPagination((prev) => {
            const next = {
              ...prev,
              total: lista.length,
              totalPages: 1,
              hasNext: false,
              hasPrev: false,
            };

            if (
              prev.total === next.total &&
              prev.totalPages === next.totalPages &&
              prev.hasNext === next.hasNext &&
              prev.hasPrev === next.hasPrev
            ) {
              return prev;
            }

            return next;
          });
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

        if ((e as Error)?.name === 'AbortError') {
          return;
        }
        console.error('[FUNCIONARIOS] Erro fetch:', e);
        if (requestId === activeRequestIdRef.current) {
          setError('Erro de rede ao carregar funcionários');
          setFuncionarios([]);
          setPagination((prev) => buildEmptyPaginationState(prev));
        }
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      abortController.abort();
    };
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
      if (sortConfig.direction === 'asc') {
        direction = 'desc';
      } else if (sortConfig.direction === 'desc') {
        direction = null;
      }
    }

    setSortConfig({ column: direction ? column : null, direction });
  };

  const funcionariosFiltradosEOrdenados = useMemo(() => {
    // Ordenação e filtro já são feitos server-side via API
    // Não precisa filtrar novamente aqui, apenas retornar os dados
    return funcionarios;
  }, [funcionarios]);

  const handleAdicionarFiltro = (filtroId: string) => {
    setFiltrosAtivos((prev) => [...prev, filtroId]);
  };

  const handleExcluir = useCallback(
    async (id: number, nome?: string) => {
      if (excluindo === id) {
        return;
      }

      const confirmar = await confirmDialog(
        `Tem certeza que deseja excluir "${nome}"?\n\nEsta ação não pode ser desfeita.`,
      );

      if (!confirmar) return;

      setExcluindo(id); // Marcar como em processo

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
          const novaLista = funcionarios.filter((f) => f.id !== id);
          setFuncionarios(novaLista);

          setTimeout(() => {
            recarregar();
            setExcluindo(null);
          }, 1000);
        } else {
          const errorText = await response.text();
          console.error('Erro do servidor:', errorText);

          let errorMessage = 'Falha na operação';
          try {
            const error = JSON.parse(errorText);

            // Tratamento especial para erro 403 (permissão negada)
            if (response.status === 403) {
              errorMessage =
                error.error ||
                'Você não tem permissão para deletar funcionários. Acesso restrito a administradores.';
            } else {
              errorMessage = error.error || error.message || errorMessage;
            }
          } catch {
            // Se não conseguir fazer parse, usa o texto direto
            if (response.status === 403) {
              errorMessage = 'Permissão negada. Apenas administradores podem deletar funcionários.';
            } else {
              errorMessage = errorText || errorMessage;
            }
          }

          toast.warning(`❌ ${errorMessage}`);
          setExcluindo(null);
        }
      } catch (error) {
        console.error('Erro ao excluir funcionário:', error);
        toast.warning('Erro ao conectar com servidor');
        setExcluindo(null);
      }
    },
    [funcionarios, token, recarregar, excluindo],
  );

  // Função de exportar CSV removida (não utilizada nesta integração de layout)

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
          // Recarregar após salvar (delay para garantir DB commit + cache-bust)
          setTimeout(() => recarregar(), 200);
        } else {
          const errorData = await response.json().catch(() => ({}));
          const msg = errorData?.error || errorData?.message || `Erro ${response.status}`;
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

  // Callback ref para evitar loop quando parent recria função inline
  const statsCallbackRef = useRef(onStatsChange);
  useEffect(() => {
    statsCallbackRef.current = onStatsChange;
  }, [onStatsChange]);
  useEffect(() => {
    const cb = statsCallbackRef.current;
    if (cb) {
      // Usar total da paginação (não apenas da página atual)
      const total = pagination.total;
      // ✅ Usar campo 'status' do backend, não 'ativo'
      const ativos = funcionarios.filter((f) => (f.status || '').toUpperCase() === 'ATIVO').length;
      const inativos = funcionarios.filter(
        (f) => (f.status || '').toUpperCase() !== 'ATIVO',
      ).length;
      const byModelo: Record<string, { cmd: number; cop: number }> = {};
      for (const f of funcionarios) {
        if ((f.status || '').toUpperCase() !== 'ATIVO') continue;
        const modelo = (f.aeronave || '')
          .trim()
          .toUpperCase()
          .replace(/[\s-]+/g, '');
        const modeloKey = modelo.includes('AW139')
          ? 'AW139'
          : modelo.includes('SK76') || modelo.includes('S76')
            ? 'SK76'
            : modelo || 'Outros';
        if (!byModelo[modeloKey]) byModelo[modeloKey] = { cmd: 0, cop: 0 };
        const cargoOuFuncao = resolveFuncionarioRoleLabel(f).toLowerCase();
        if (cargoOuFuncao.includes('comandante')) byModelo[modeloKey].cmd++;
        else if (cargoOuFuncao.includes('copiloto'))
          byModelo[modeloKey].cop++;
      }
      cb({ total, ativos, inativos, byModelo });
    }
  }, [pagination.total, funcionarios]);

  return (
    <div className="flex flex-col space-y-6">
      {/* Tabela */}
      {loading ? (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <SkeletonTable columns={colunasVisiveis.length + 1} rows={10} />
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto max-h-[600px]">
            <table className="w-full min-w-max">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-2 py-3 text-center text-xs font-semibold text-slate-700 uppercase tracking-wider whitespace-nowrap w-32">
                    Ações
                  </th>
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
                        className={`px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider whitespace-nowrap ${
                          isSortable ? 'cursor-pointer hover:bg-slate-100 select-none' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{col.label}</span>
                          {isSortable && (
                            <div className="flex flex-col">
                              {direction === null && (
                                <ArrowUpDown className="w-4 h-4 text-slate-400" />
                              )}
                              {direction === 'asc' && <ArrowUp className="w-4 h-4 text-blue-600" />}
                              {direction === 'desc' && (
                                <ArrowDown className="w-4 h-4 text-blue-600" />
                              )}
                            </div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {funcionariosFiltradosEOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={colunasVisiveis.length + 1} className="py-8">
                      <EmptyState
                        icon={
                          termoBusca ? (
                            <SearchX size={48} className="text-slate-300" />
                          ) : (
                            <Users size={48} className="text-slate-300" />
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
                    <tr key={func.id} className="hover:bg-slate-50 transition">
                      <td className="px-2 py-3 text-sm">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openPasta360(func.id)}
                            className={tableActionButtonClass}
                            title="Pasta 360"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </button>

                          <button
                            onClick={async () => {
                              setFuncionarioSelecionado(func);
                            }}
                            className={tableActionButtonClass}
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleExcluir(func.id, func.nome)}
                            disabled={excluindo === func.id}
                            className={`${
                              excluindo === func.id
                                ? 'inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400'
                                : tableActionDangerButtonClass
                            }`}
                            title={excluindo === func.id ? 'Excluindo...' : 'Excluir'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      {colunasVisiveis.map((col) => {
                        const rawVal = func[col.id] as unknown;
                        let valor = rawVal == null || rawVal === '' ? '-' : String(rawVal);

                        if (col.id === 'email' && func.email) {
                          return (
                            <td key={col.id} className="px-4 py-3 text-sm whitespace-nowrap">
                              <a
                                href={`mailto:${func.email}`}
                                className="text-blue-600 hover:underline flex items-center gap-1"
                                title={`Enviar email para ${func.email}`}
                              >
                                <Mail className="w-3 h-3" />
                                {func.email}
                              </a>
                            </td>
                          );
                        }

                        if (col.id === 'telefone' && func.telefone) {
                          const telefoneNumerico = func.telefone.replace(/\D/g, '');
                          const whatsappLink = `https://wa.me/55${telefoneNumerico}`;
                          return (
                            <td key={col.id} className="px-4 py-3 text-sm whitespace-nowrap">
                              <a
                                href={whatsappLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:underline flex items-center gap-1"
                                title={`Enviar WhatsApp para ${func.telefone}`}
                              >
                                <Phone className="w-3 h-3" />
                                {formatarTelefone(func.telefone)}
                              </a>
                            </td>
                          );
                        }

                        if (col.id === 'cpf' && func.cpf) {
                          valor = formatarCPF(func.cpf);
                        }

                        if (col.id === 'matricula' && func.matricula) {
                          valor = formatarMatricula(func.matricula);
                        }

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
                          const normalizedStatus =
                            rawStatus === 'DESLIGADO' ? 'INATIVO' : rawStatus;
                          const statusColors: Record<string, string> = {
                            ATIVO: 'bg-green-100 text-green-800',
                            INATIVO: 'bg-slate-100 text-slate-800',
                            FERIAS: 'bg-blue-100 text-blue-800',
                            LICENCA: 'bg-yellow-100 text-yellow-800',
                            AFASTADO: 'bg-orange-100 text-orange-800',
                          };
                          const statusLabel: Record<string, string> = {
                            ATIVO: 'Ativo',
                            INATIVO: 'Inativo',
                            FERIAS: 'Férias',
                            LICENCA: 'Licença',
                            AFASTADO: 'Afastado',
                          };
                          const colorClass =
                            statusColors[normalizedStatus] || 'bg-slate-100 text-slate-800';
                          const label = statusLabel[normalizedStatus] || normalizedStatus || '-';

                          return (
                            <td key={col.id} className="px-4 py-3 text-sm whitespace-nowrap">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}
                              >
                                {label}
                              </span>
                            </td>
                          );
                        }

                        if (col.id === 'funcao') {
                          valor = resolveFuncionarioRoleLabel(func) || '-';
                        }

                        return (
                          <td
                            key={col.id}
                            className="px-4 py-3 text-sm text-slate-900 whitespace-nowrap"
                          >
                            {valor}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
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

      {/* Modais */}

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
