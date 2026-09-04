/**
 * LmsMatriculas — Gestão de matrículas de um curso específico
 * Rota: /lms/matriculas/:cursoId
 * Acesso: ADMIN e GESTOR
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  UserPlus,
  Trash2,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import { BaseModal } from '@/react-app/components/modals/BaseModal';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';
import {
  useLmsCurso,
  useLmsCursos,
  useMatriculasCurso,
  useMatricularLote,
  useCancelarMatricula,
} from '@/react-app/hooks/useLms';
import { useDebounce } from '@/react-app/hooks/useDebounce';
import { useFuncionariosRQ } from '@/react-app/hooks/useFuncionarios';
import type { LmsMatricula, MatriculaStatus } from '@/react-app/hooks/useLms';
import type { Funcionario } from '@/react-app/hooks/useFuncionarios';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import { LmsMetricCard, LmsModuleTabs, LmsSurface, LmsCourseMiniMeta, LmsPageShell } from './lmsUi';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function getMatriculaProgress(
  matricula: Pick<LmsMatricula, 'progresso_pct' | 'progresso_efetivo' | 'status'>,
): number {
  // progresso_efetivo (backend) nunca reporta 100% fora de status CONCLUIDO —
  // preferir sempre que presente; progresso_pct bruto é só fallback legado.
  const value = matricula.progresso_efetivo ?? matricula.progresso_pct;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(100, Math.max(0, Math.round(value)));
  }

  switch (matricula.status) {
    case 'CONCLUIDO':
      return 100;
    case 'EM_ANDAMENTO':
      return 50;
    default:
      return 0;
  }
}

function getDeadlineMeta(dataExpiracao: string | null | undefined) {
  if (!dataExpiracao) return null;

  const dueDate = new Date(dataExpiracao);
  if (Number.isNaN(dueDate.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      label: `Vencido há ${Math.abs(diffDays)}d`,
      className: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
      pulseClassName: '',
      icon: <AlertCircle className="h-3 w-3" />,
    };
  }

  if (diffDays <= 7) {
    return {
      label: `Vence em ${diffDays}d`,
      className: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200',
      pulseClassName: 'animate-pulse',
      icon: <Clock className="h-3 w-3" />,
    };
  }

  if (diffDays <= 30) {
    return {
      label: `Vence em ${diffDays}d`,
      className: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
      pulseClassName: '',
      icon: <Clock className="h-3 w-3" />,
    };
  }

  return {
    label: `Vence em ${diffDays}d`,
    className: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
    pulseClassName: '',
    icon: <Calendar className="h-3 w-3" />,
  };
}

function StatusBadge({ status }: { status: MatriculaStatus }) {
  const map: Record<MatriculaStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    NAO_INICIADO: {
      label: 'Não iniciado',
      cls: 'bg-slate-100 text-slate-600',
      icon: <Clock className="h-3 w-3" />,
    },
    EM_ANDAMENTO: {
      label: 'Em andamento',
      cls: 'bg-amber-100 text-amber-800',
      icon: <Loader2 className="h-3 w-3" />,
    },
    CONCLUIDO: {
      label: 'Concluído',
      cls: 'bg-emerald-100 text-emerald-800',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    REPROVADO: {
      label: 'Reprovado',
      cls: 'bg-rose-100 text-rose-800',
      icon: <XCircle className="h-3 w-3" />,
    },
    CANCELADO: {
      label: 'Cancelado',
      cls: 'bg-slate-100 text-slate-600',
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const s = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500', icon: null };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const fillClassName = pct >= 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 flex-shrink-0 rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${fillClassName}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{pct}%</span>
    </div>
  );
}

function DeadlineBadge({ dataExpiracao }: { dataExpiracao: string | null | undefined }) {
  const meta = getDeadlineMeta(dataExpiracao);

  if (!meta) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.className} ${meta.pulseClassName}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

// ── Modal de matrícula em lote ────────────────────────────────────────────────

interface ModalMatricularProps {
  cursoId: number;
  activeFuncionarioIds: Set<number>;
  onMatriculasChanged: (matriculas: LmsMatricula[]) => Promise<unknown>;
  onClose: () => void;
}

function ModalMatricular({
  cursoId,
  activeFuncionarioIds,
  onMatriculasChanged,
  onClose,
}: ModalMatricularProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [prazo, setPrazo] = useState('');
  const [funcaoFilter, setFuncaoFilter] = useState('');
  const [baseFilter, setBaseFilter] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);

  const {
    data: funcData,
    isLoading: loadingFunc,
    isFetching: fetchingFunc,
  } = useFuncionariosRQ({
    status: 'ativo',
    search: debouncedSearch || undefined,
    limit: 100,
  });
  const matricularLote = useMatricularLote();

  const funcionarios: Funcionario[] = (() => {
    if (!funcData) return [];
    if (Array.isArray(funcData)) return funcData;
    const d = (funcData as { data?: Funcionario[] }).data;
    if (Array.isArray(d)) return d;
    return [];
  })();

  const funcionariosDisponiveis = funcionarios.filter(
    (funcionario) => !activeFuncionarioIds.has(funcionario.id ?? -1),
  );

  const funcaoOptions = Array.from(
    new Set(funcionariosDisponiveis.map((f) => f.funcao).filter(Boolean)),
  ).sort() as string[];

  const baseOptions = Array.from(
    new Set(funcionariosDisponiveis.map((f) => f.base).filter(Boolean)),
  ).sort() as string[];

  const filtered = funcionariosDisponiveis.filter((f) => {
    const q = search.toLowerCase();
    const matchSearch =
      f.nome?.toLowerCase().includes(q) ||
      f.matricula?.toLowerCase().includes(q) ||
      f.cargo?.toLowerCase().includes(q) ||
      f.email?.toLowerCase().includes(q) ||
      f.cpf?.toLowerCase().includes(q) ||
      f.guerra?.toLowerCase().includes(q);
    const matchFuncao = !funcaoFilter || f.funcao === funcaoFilter;
    const matchBase = !baseFilter || f.base === baseFilter;
    return matchSearch && matchFuncao && matchBase;
  });

  const filteredIds = filtered.map((f) => f.id).filter((id): id is number => Number.isFinite(id));
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id));
        return next;
      }
      filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleConfirmar() {
    if (selected.size === 0) {
      toast.error('Selecione ao menos um funcionário');
      return;
    }
    try {
      const result = await matricularLote.mutateAsync({
        funcionario_ids: [...selected],
        curso_id: cursoId,
        data_expiracao: prazo || null,
      });
      const summary = `${result.criadas} matrícula(s) criada(s)${result.ignoradas > 0 ? `, ${result.ignoradas} já existente(s)` : ''}${result.erros > 0 ? `, ${result.erros} erro(s)` : ''}`;
      if (result.erros > 0) {
        toast.warning(summary);
      } else {
        toast.success(summary);
      }
      await onMatriculasChanged(result.matriculas ?? []);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao matricular');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in dark:bg-black/70" onClick={onClose}>
      <div className="flex w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl max-h-[90vh] animate-scale-in dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Matricular Funcionários</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        {/* Prazo */}
        <div className="px-6 pt-4">
          <label
            htmlFor="prazo-conclusao"
            className="block text-xs font-medium text-slate-700 mb-1 dark:text-slate-300"
          >
            Prazo de conclusão (opcional)
          </label>
          <input
            id="prazo-conclusao"
            type="date"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {/* Filtros função e base */}
        <div className="flex gap-2 px-6 pt-3">
          <select
            value={funcaoFilter}
            onChange={(e) => setFuncaoFilter(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            aria-label="Filtrar por função"
          >
            <option value="">Todas as funções</option>
            {funcaoOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={baseFilter}
            onChange={(e) => setBaseFilter(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            aria-label="Filtrar por base"
          >
            <option value="">Todas as bases</option>
            {baseOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* Busca */}
        <div className="px-6 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar por nome, matrícula, email ou CPF..."
              aria-label="Buscar funcionário"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {debouncedSearch
                ? `Resultados para "${debouncedSearch}"`
                : 'Digite um nome para localizar rapidamente o funcionário'}
            </span>
            {fetchingFunc ? (
              <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Buscando...
              </span>
            ) : null}
          </div>
        </div>

        {/* Lista */}
        <div className="px-6 pt-3 pb-2 overflow-y-auto flex-1 min-h-0">
          {activeFuncionarioIds.size > 0 ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              {activeFuncionarioIds.size} funcionário(s) com matrícula ativa já foram ocultados
              desta lista.
            </p>
          ) : null}
          {loadingFunc ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300 dark:text-slate-600" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
              {debouncedSearch
                ? 'Nenhum funcionário encontrado para essa busca'
                : 'Nenhum funcionário disponível para matrícula'}
            </p>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 mb-1 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="rounded"
                />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {allFilteredSelected
                    ? 'Remover seleção visível'
                    : `Selecionar resultados visíveis (${filtered.length})`}
                </span>
              </label>
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {filtered.map((f) => (
                  <label
                    key={f.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${f.nome}`}
                      checked={selected.has(f.id!)}
                      onChange={() => toggle(f.id!)}
                      className="rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate dark:text-slate-200">{f.nome}</div>
                      <div className="text-xs text-slate-400 truncate dark:text-slate-500">
                        {[f.matricula, f.cargo].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 dark:border-slate-800">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {selected.size > 0 ? `${selected.size} selecionado(s)` : 'Nenhum selecionado'}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmar}
              disabled={selected.size === 0 || matricularLote.isPending}
            >
              {matricularLote.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Matricular
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'NAO_INICIADO', label: 'Não iniciado' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUIDO', label: 'Concluído' },
  { value: 'REPROVADO', label: 'Reprovado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

export default function LmsMatriculas() {
  const { cursoId: cursoIdParam } = useParams<{ cursoId: string }>();
  const navigate = useNavigate();
  const cursoId = Number(cursoIdParam);

  const [showModal, setShowModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LmsMatricula | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [optimisticMatriculas, setOptimisticMatriculas] = useState<LmsMatricula[]>([]);

  const { data: cursosRes, isLoading: loadingCursosIndex } = useLmsCursos(
    { limit: 300 },
    { enabled: !cursoIdParam },
  );
  const { data: curso, isLoading: loadingCurso } = useLmsCurso(cursoId);
  const {
    data: matriculasRes,
    isLoading: loadingMat,
    refetch: refetchMatriculas,
  } = useMatriculasCurso(cursoId, {
    status: statusFilter || undefined,
    limit: 500,
  });
  const cancelar = useCancelarMatricula();

  useEffect(() => {
    setOptimisticMatriculas([]);
  }, [cursoId]);

  const todasMatriculas: LmsMatricula[] = (() => {
    const merged = new Map<number, LmsMatricula>();

    optimisticMatriculas.forEach((matricula) => {
      merged.set(matricula.id, matricula);
    });

    (matriculasRes?.data ?? []).forEach((matricula) => {
      merged.set(matricula.id, matricula);
    });

    return Array.from(merged.values()).sort((left, right) => {
      const leftTime = Date.parse(left.data_matricula ?? '');
      const rightTime = Date.parse(right.data_matricula ?? '');

      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return rightTime - leftTime;
      }
      if (Number.isFinite(rightTime)) return 1;
      if (Number.isFinite(leftTime)) return -1;
      return right.id - left.id;
    });
  })();

  const matriculas = search
    ? todasMatriculas.filter((m) =>
        (m.funcionario_nome ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : todasMatriculas;

  async function handleCancelarConfirmado() {
    if (!cancelTarget) return;

    try {
      await cancelar.mutateAsync({ matriculaId: cancelTarget.id, cursoId });
      setOptimisticMatriculas((current) =>
        current.filter((matricula) => matricula.id !== cancelTarget.id),
      );
      toast.success('Matrícula cancelada');
      setCancelTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar');
    }
  }

  async function handleMatriculasChanged(createdMatriculas: LmsMatricula[]) {
    if (createdMatriculas.length > 0) {
      setOptimisticMatriculas((current) => {
        const merged = new Map<number, LmsMatricula>();

        current.forEach((matricula) => {
          merged.set(matricula.id, matricula);
        });

        createdMatriculas.forEach((matricula) => {
          merged.set(matricula.id, matricula);
        });

        return Array.from(merged.values());
      });
    }

    await refetchMatriculas();
  }

  const cancelTargetProgress = cancelTarget ? getMatriculaProgress(cancelTarget) : 0;

  if (!cursoIdParam) {
    const cursos = cursosRes?.data ?? [];

    return (
      <AppLayout>
        <LmsPageShell>
          <PageHeader
            title="Matrículas LMS"
            subtitle="Escolha um curso para abrir a operação de matrículas e acompanhar os alunos vinculados."
            actions={
              <Button variant="secondary" onClick={() => navigate('/lms/cursos')}>
                <ArrowLeft className="h-4 w-4" />
                Voltar ao catálogo
              </Button>
            }
          />

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <LmsModuleTabs canManage />

            <div className="p-5 sm:p-6">
              <LmsSurface
                title="Selecionar curso"
                description="Abra a lista de matrículas a partir do curso que deseja operar agora."
              >
                {loadingCursosIndex ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-3">
                          <div className="h-4 w-36 rounded bg-slate-200 dark:bg-slate-700" />
                          <div className="h-4 w-4 rounded bg-slate-100 dark:bg-slate-700" />
                        </div>
                        <div className="mt-1 h-3 w-20 rounded bg-slate-100 dark:bg-slate-700" />
                        <div className="mt-3 h-3 w-40 rounded bg-slate-100 dark:bg-slate-700" />
                      </div>
                    ))}
                  </div>
                ) : cursos.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Nenhum curso disponível para gestão de matrículas.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {cursos.map((cursoItem) => (
                      <button
                        key={cursoItem.id}
                        type="button"
                        onClick={() => navigate(`/lms/matriculas/${cursoItem.id}`)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{cursoItem.titulo}</p>
                          <Users className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {cursoItem.categoria ?? 'Sem categoria'}
                        </p>
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                          {(cursoItem.total_matriculas ?? 0).toString()} matrícula(s) ·{' '}
                          {(cursoItem.total_concluidos ?? 0).toString()} concluída(s)
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </LmsSurface>
            </div>
          </section>
        </LmsPageShell>
      </AppLayout>
    );
  }

  const isLoading = loadingCurso || loadingMat;

  // Estatísticas rápidas
  const total = todasMatriculas.length;
  const concluidos = todasMatriculas.filter((m) => m.status === 'CONCLUIDO').length;
  const emAndamento = todasMatriculas.filter((m) => m.status === 'EM_ANDAMENTO').length;
  const naoIniciados = todasMatriculas.filter((m) => m.status === 'NAO_INICIADO').length;
  const activeFuncionarioIds = new Set(
    todasMatriculas.map((matricula) => matricula.funcionario_id).filter(Number.isFinite),
  );

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          title={loadingCurso ? 'Carregando matrículas...' : (curso?.titulo ?? 'Matrículas')}
          subtitle={`Gerenciamento de matrículas${curso ? ` · ${total} aluno(s) vinculados` : ''}`}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate('/lms/admin/cursos')}>
                <ArrowLeft className="h-4 w-4" />
                Cursos
              </Button>
              <Button variant="primary" onClick={() => setShowModal(true)}>
                <UserPlus className="h-4 w-4" />
                Matricular Funcionários
              </Button>
            </div>
          }
        />

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <LmsModuleTabs canManage />

          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <h2 className="text-base font-semibold text-slate-950 dark:text-slate-100">
                  Acompanhe distribuição, conclusão e pendências do curso em uma única grade.
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Consulte o estado das matrículas, identifique atrasos e abra novas atribuições sem
                  sair do fluxo do LMS.
                </p>
              </div>
              {curso ? <LmsCourseMiniMeta curso={curso} /> : null}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-4">
          <LmsMetricCard
            title="Total"
            value={total}
            description="Matrículas ativas no curso"
            icon={<Users className="h-5 w-5" />}
            accent="bg-slate-100 text-slate-700"
          />
          <LmsMetricCard
            title="Concluídos"
            value={concluidos}
            description="Treinamentos finalizados"
            icon={<CheckCircle2 className="h-5 w-5" />}
            accent="bg-emerald-100 text-emerald-700"
          />
          <LmsMetricCard
            title="Em andamento"
            value={emAndamento}
            description="Alunos com progresso registrado"
            icon={<Loader2 className="h-5 w-5" />}
            accent="bg-sky-100 text-sky-700"
          />
          <LmsMetricCard
            title="Não iniciados"
            value={naoIniciados}
            description="Aguardando o primeiro acesso"
            icon={<Clock className="h-5 w-5" />}
            accent="bg-amber-100 text-amber-700"
          />
        </div>

        <LmsSurface
          title="Alunos matriculados"
          description="Filtre rapidamente por nome e status para agir sobre a operação do curso."
        >
          <div className="mb-5 flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Buscar por nome..."
                aria-label="Buscar funcionário"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filtrar por status"
                className="h-12 appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-slate-300 dark:text-slate-600" />
              </div>
            ) : matriculas.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <Users className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {statusFilter || search
                    ? 'Nenhuma matrícula encontrada com os filtros'
                    : 'Nenhuma matrícula ainda'}
                </p>
                {!statusFilter && !search && (
                  <Button variant="primary" onClick={() => setShowModal(true)}>
                    <UserPlus className="h-4 w-4" />
                    Matricular primeiro funcionário
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                        Funcionário
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                        Status
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold text-slate-500 md:table-cell">
                        Progresso
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold text-slate-500 lg:table-cell">
                        Nota
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold text-slate-500 lg:table-cell">
                        Início
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold text-slate-500 lg:table-cell">
                        Conclusão
                      </th>
                      <th className="hidden px-4 py-3 text-left text-xs font-semibold text-slate-500 sm:table-cell">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Prazo
                        </span>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {matriculas.map((m) => (
                      <tr key={m.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3">
                          <FuncionarioLink
                            funcionarioId={m.funcionario_id}
                            nome={m.funcionario_nome ?? `ID ${m.funcionario_id}`}
                            className="font-medium text-slate-900 dark:text-slate-100"
                          />
                          <div className="text-xs text-slate-400 dark:text-slate-500">Matrícula #{m.id}</div>
                          <div className="mt-2 md:hidden">
                            <ProgressBar value={getMatriculaProgress(m)} />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={m.status} />
                            <DeadlineBadge dataExpiracao={m.data_expiracao} />
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <ProgressBar value={getMatriculaProgress(m)} />
                        </td>
                        <td className="hidden px-4 py-3 lg:table-cell">
                          {m.score_final != null ? (
                            <span
                              className={`font-medium ${m.score_final >= 70 ? 'text-green-600' : 'text-red-600'}`}
                            >
                              {m.score_final}%
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                          {formatDate(m.data_inicio)}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-slate-500 lg:table-cell">
                          {formatDate(m.data_conclusao)}
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          {m.data_expiracao ? (
                            <div className="space-y-1">
                              <span
                                className={`block text-xs ${
                                  new Date(m.data_expiracao) < new Date()
                                    ? 'font-medium text-red-600'
                                    : 'text-slate-500'
                                }`}
                              >
                                {formatDate(m.data_expiracao)}
                              </span>
                              <DeadlineBadge dataExpiracao={m.data_expiracao} />
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {m.status !== 'CANCELADO' && (
                            <RowActionsMenu
                              label={`Mais ações para a matrícula de ${m.funcionario_nome ?? 'funcionário'}`}
                              actions={[
                                {
                                  label: 'Cancelar matrícula',
                                  destructive: true,
                                  icon: Trash2,
                                  disabled: cancelar.isPending,
                                  onSelect: () => setCancelTarget(m),
                                },
                              ]}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </LmsSurface>

        {showModal && (
          <ModalMatricular
            cursoId={cursoId}
            activeFuncionarioIds={activeFuncionarioIds}
            onMatriculasChanged={handleMatriculasChanged}
            onClose={() => setShowModal(false)}
          />
        )}

        <BaseModal
          isOpen={Boolean(cancelTarget)}
          onClose={() => setCancelTarget(null)}
          title="Cancelar matrícula"
          subtitle="A matrícula será desativada, mas o histórico do aluno continua preservado."
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                Manter matrícula
              </Button>
              <Button
                variant="danger"
                loading={cancelar.isPending}
                onClick={handleCancelarConfirmado}
              >
                Cancelar matrícula
              </Button>
            </>
          }
        >
          {cancelTarget ? (
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  Curso
                </p>
                <p className="mt-1 text-base font-semibold text-slate-900">
                  {curso?.titulo ?? 'Curso LMS'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <p>
                  Funcionário:{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {cancelTarget.funcionario_nome ?? `ID ${cancelTarget.funcionario_id}`}
                  </strong>
                </p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Status atual: {cancelTarget.status.replace(/_/g, ' ')}
                </p>
              </div>

              {cancelTargetProgress > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <p className="font-medium">
                    Este aluno tem {cancelTargetProgress}% de progresso salvo.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-400">
                    Ao cancelar, o progresso será mantido no histórico mas a matrícula ficará
                    inativa.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  Nenhum progresso salvo foi identificado para esta matrícula.
                </div>
              )}
            </div>
          ) : null}
        </BaseModal>
      </LmsPageShell>
    </AppLayout>
  );
}
