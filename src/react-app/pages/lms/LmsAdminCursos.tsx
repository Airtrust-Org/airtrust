import { useMemo, useState } from 'react';
import { useApi } from '@/react-app/hooks/useApi';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  LayoutDashboard,
  PencilLine,
  Play,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import PageHeader from '@/react-app/components/PageHeader';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';
import {
  type LmsCurso,
  type TipoConteudo,
  useDeleteCurso,
  useLmsCursos,
  useLmsEdappLegacySummary,
  useSyncEadCursos,
  useUpdateCurso,
} from '@/react-app/hooks/useLms';
import {
  formatMinutes,
  getMatriculaStatusMeta,
  LmsEmptyState,
  LmsModuleTabs,
  LmsPageShell,
  LmsSummaryTag,
  LmsSurface,
} from './lmsUi';
import {
  getAdminCoursePreviewPath,
  supportsAdminCoursePreview as supportsContentPreview,
} from './lmsAdminPreview';

function impactsCompliance(
  curso: Pick<LmsCurso, 'gerar_qualificacao_ao_concluir' | 'qualificacao_tipo_nome'>,
) {
  return curso.gerar_qualificacao_ao_concluir === 1 && Boolean(curso.qualificacao_tipo_nome);
}

function contentTypeLabel(type: TipoConteudo) {
  switch (type) {
    case 'h5p':
      return 'H5P';
    case 'video':
      return 'Vídeo';
    case 'pdf':
      return 'PDF';
    case 'pptx':
      return 'PowerPoint';
    default:
      return 'SCORM';
  }
}

function completionRate(curso: Pick<LmsCurso, 'total_matriculas' | 'total_concluidos'>) {
  const total = curso.total_matriculas ?? 0;
  const completed = curso.total_concluidos ?? 0;
  if (!total) return 0;
  return Math.round((completed / total) * 100);
}

const adminActionButtonClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900';

export default function LmsAdminCursos() {
  const navigate = useNavigate();
  const syncEad = useSyncEadCursos();
  const updateCurso = useUpdateCurso();
  const deleteCurso = useDeleteCurso();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'published' | 'draft' | 'critical' | 'missing-content'
  >('all');
  const [typeFilter, setTypeFilter] = useState<'all' | TipoConteudo>('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const { data: setoresData } = useApi<{ id: number; nome: string }[]>('/setores');
  const setores = setoresData ?? [];
  const [lastSyncSummary, setLastSyncSummary] = useState<{
    at: string;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);

  const setor_ids = sectorFilter !== 'all' ? [Number(sectorFilter)] : undefined;
  const { data: publishedCoursesResponse, isLoading: loadingPublishedCourses } = useLmsCursos({
    publicados: true,
    limit: 300,
    setor_ids,
  });
  const { data: draftCoursesResponse, isLoading: loadingDraftCourses } = useLmsCursos({
    publicados: false,
    limit: 300,
    setor_ids,
  });
  const { data: legacySummary } = useLmsEdappLegacySummary();

  const courses = useMemo(() => {
    const byId = new Map<number, LmsCurso>();

    for (const curso of publishedCoursesResponse?.data ?? []) {
      byId.set(curso.id, curso);
    }

    for (const curso of draftCoursesResponse?.data ?? []) {
      byId.set(curso.id, curso);
    }

    return [...byId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [draftCoursesResponse?.data, publishedCoursesResponse?.data]);

  const visibleCourses = useMemo(() => {
    return courses.filter((curso) => {
      const matchSearch =
        !search ||
        [
          curso.titulo,
          curso.categoria ?? '',
          curso.descricao ?? '',
          curso.qualificacao_tipo_nome ?? '',
          curso.qualificacao_tipo_codigo ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchType = typeFilter === 'all' || curso.tipo_conteudo === typeFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'published' && curso.publicado === 1) ||
        (statusFilter === 'draft' && curso.publicado === 0) ||
        (statusFilter === 'critical' && impactsCompliance(curso)) ||
        (statusFilter === 'missing-content' && !supportsContentPreview(curso));

      return matchSearch && matchType && matchStatus;
    });
  }, [courses, search, statusFilter, typeFilter]);

  const metrics = useMemo(
    () => ({
      total: courses.length,
      published: courses.filter((curso) => curso.publicado === 1).length,
      critical: courses.filter((curso) => impactsCompliance(curso)).length,
      ready: courses.filter((curso) => supportsContentPreview(curso)).length,
    }),
    [courses],
  );

  const isLoading = loadingPublishedCourses || loadingDraftCourses;

  async function handleSyncEad() {
    try {
      const result = await syncEad.mutateAsync();
      setLastSyncSummary({
        at: new Date().toISOString(),
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
      });
      toast.success(
        `Sincronização concluída: ${result.created} criado(s), ${result.updated} atualizado(s).`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar cursos EAD');
    }
  }

  async function handleTogglePublication(curso: LmsCurso) {
    try {
      await updateCurso.mutateAsync({ id: curso.id, publicado: curso.publicado ? 0 : 1 });
      toast.success(curso.publicado ? 'Curso movido para rascunho.' : 'Curso publicado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar publicação');
    }
  }

  async function handleDelete(curso: LmsCurso) {
    if (!confirm(`Excluir o curso "${curso.titulo}"?`)) return;

    try {
      await deleteCurso.mutateAsync(curso.id);
      toast.success(`Curso ${curso.titulo} removido.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir curso');
    }
  }

  function handleOpen(curso: LmsCurso) {
    navigate(`/lms/cursos/${curso.id}`);
  }

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          className="mb-6"
          title="Configurações LMS"
          subtitle="Central técnica de cursos, publicação, integrações e governança do módulo."
          actions={
            <>
              <Button variant="secondary" onClick={() => navigate('/lms/dashboard')}>
                <LayoutDashboard className="h-4 w-4" />
                Visão geral
              </Button>
              <Button variant="secondary" onClick={() => navigate('/lms/cursos')}>
                <BookOpen className="h-4 w-4" />
                Abrir catálogo
              </Button>
              <Button variant="primary" onClick={() => navigate('/lms/cursos?new=1')}>
                <BookOpen className="h-4 w-4" />+ Novo curso
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSyncEad()}
                loading={syncEad.isPending}
              >
                <BadgeCheck className="h-4 w-4" />
                Sincronizar EAD
              </Button>
              <Button variant="secondary" onClick={() => navigate('/lms/historico-edapp')}>
                <BookOpen className="h-4 w-4" />
                Histórico EdApp
              </Button>
            </>
          }
        />

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <LmsModuleTabs canManage />

          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap gap-2">
              <LmsSummaryTag
                label="Cursos"
                value={metrics.total}
                icon={<BookOpen className="h-4 w-4" />}
                tone="slate"
              />
              <LmsSummaryTag
                label="Publicados"
                value={metrics.published}
                icon={<CheckCircle2 className="h-4 w-4" />}
                tone="emerald"
              />
              <LmsSummaryTag
                label="Impactam compliance"
                value={metrics.critical}
                icon={<AlertTriangle className="h-4 w-4" />}
                tone="amber"
              />
              <LmsSummaryTag
                label="Players prontos"
                value={metrics.ready}
                icon={<Play className="h-4 w-4" />}
                tone="sky"
              />
            </div>

            <div className="mt-6">
              <LmsSurface
                title="Operação de cursos"
                description="Use esta grade para localizar cursos críticos, agir sobre publicação e abrir o fluxo correto de edição, matrículas ou preview."
              >
                <div className="mb-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center dark:border-slate-700 dark:bg-slate-800">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                        Sincronização EAD
                      </p>
                      {lastSyncSummary ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {lastSyncSummary.created} novo(s) · {lastSyncSummary.updated}{' '}
                          atualizado(s)
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Sob demanda
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {lastSyncSummary
                        ? `Última execução em ${new Date(lastSyncSummary.at).toLocaleString('pt-BR')}.`
                        : 'Espelha novos tipos EAD e ajustes pedagógicos para os cursos LMS.'}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => void handleSyncEad()}
                    loading={syncEad.isPending}
                  >
                    <BadgeCheck className="h-4 w-4" />
                    Sincronizar EAD
                  </Button>
                </div>

                <div className="mb-4 grid gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center dark:border-amber-500/30 dark:bg-amber-500/10">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                        Legado EdApp somente leitura
                      </p>
                      {legacySummary ? (
                        <>
                          <span className="inline-flex rounded-full border border-amber-200 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                            {legacySummary.total_importado} registro(s)
                          </span>
                          {legacySummary.total_pendentes_vinculo > 0 ? (
                            <span className="inline-flex rounded-full border border-rose-200 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                              {legacySummary.total_pendentes_vinculo} vínculo(s) pendente(s)
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      {legacySummary
                        ? `${legacySummary.total_funcionarios} funcionário(s), ${legacySummary.total_cursos} curso(s) e ${legacySummary.total_com_qualificacao} registro(s) vinculados a qualificações.`
                        : 'Conclusões importadas permanecem preservadas para auditoria e consulta. A integração e a importação EdApp foram encerradas.'}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => navigate('/lms/historico-edapp')}>
                    <BookOpen className="h-4 w-4" />
                    Abrir histórico
                  </Button>
                </div>

                <div className="mb-5 grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar por curso, categoria ou qualificação"
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>

                  <select
                    value={sectorFilter}
                    onChange={(event) => setSectorFilter(event.target.value)}
                    className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="all">Todos os setores</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(
                        event.target.value as
                          | 'all'
                          | 'published'
                          | 'draft'
                          | 'critical'
                          | 'missing-content',
                      )
                    }
                    className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="all">Todos os estados</option>
                    <option value="published">Publicado</option>
                    <option value="draft">Rascunho</option>
                    <option value="critical">Impacta compliance</option>
                    <option value="missing-content">Sem pacote</option>
                  </select>

                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as 'all' | TipoConteudo)}
                    className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="all">Todos os tipos</option>
                    <option value="scorm">SCORM</option>
                    <option value="h5p">H5P</option>
                    <option value="video">Vídeo</option>
                    <option value="pdf">PDF</option>
                    <option value="pptx">PowerPoint</option>
                  </select>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  {isLoading ? (
                    <div className="overflow-hidden">
                      <div className="grid grid-cols-6 gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                        {[...Array(6)].map((_, i) => (
                          <div
                            key={i}
                            className="h-3 animate-pulse rounded bg-slate-200 dark:bg-slate-700"
                          />
                        ))}
                      </div>
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-6 gap-4 border-b border-slate-50 px-4 py-4 dark:border-slate-800"
                        >
                          {[...Array(6)].map((_, j) => (
                            <div
                              key={j}
                              className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-700"
                              style={{ width: `${55 + Math.sin(i + j) * 20}%` }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : visibleCourses.length === 0 ? (
                    <LmsEmptyState
                      icon={<BookOpen className="h-8 w-8" />}
                      title="Nenhum curso encontrado"
                      description="Ajuste a busca ou os filtros para localizar cursos publicados, rascunhos ou itens que impactam compliance."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          <tr>
                            <th className="px-4 py-3">Curso</th>
                            <th className="px-4 py-3">Qualificação</th>
                            <th className="px-4 py-3">Tipo / Player</th>
                            <th className="px-4 py-3">Alcance</th>
                            <th className="px-4 py-3">Situação</th>
                            <th className="px-4 py-3 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {visibleCourses.map((curso) => {
                            const taxa = completionRate(curso);
                            const statusMeta = getMatriculaStatusMeta(
                              curso.publicado ? 'PUBLICADO' : 'RASCUNHO',
                            );
                            const ready = supportsContentPreview(curso);
                            const critical = impactsCompliance(curso);

                            return (
                              <tr
                                key={curso.id}
                                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                              >
                                <td className="px-4 py-3 align-top">
                                  <div className="min-w-[260px]">
                                    <div className="flex items-start gap-2">
                                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                                        {curso.titulo}
                                      </p>
                                      {critical ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                          <BadgeCheck className="h-3 w-3" />
                                          Crítico
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                      {curso.categoria ?? 'Sem categoria'} ·{' '}
                                      {formatMinutes(curso.carga_horaria_minutos)}
                                    </p>
                                    {curso.setores && curso.setores.length > 0 ? (
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {curso.setores.map((s) => (
                                          <span
                                            key={s.id}
                                            className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                                          >
                                            {s.nome}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                    <p className="mt-2 line-clamp-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                      {curso.descricao ||
                                        'Curso sem descrição operacional resumida.'}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  {curso.qualificacao_tipo_nome ? (
                                    <div className="space-y-1">
                                      {critical ? (
                                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                                          Gera qualificação
                                        </span>
                                      ) : null}
                                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                        {curso.qualificacao_tipo_nome}
                                      </p>
                                      {curso.qualificacao_tipo_codigo ? (
                                        <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                                          Código {curso.qualificacao_tipo_codigo}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                                      Informativo
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="flex min-w-[148px] flex-wrap gap-1.5">
                                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                      {contentTypeLabel(curso.tipo_conteudo)}
                                    </span>
                                    <span
                                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                        ready
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {ready ? 'Player pronto' : 'Sem pacote'}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="min-w-[150px] space-y-2">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      {curso.total_matriculas ?? 0} matrícula(s)
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      {curso.total_concluidos ?? 0} concluído(s)
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-700">
                                        <div
                                          className={`h-1.5 rounded-full ${
                                            taxa >= 80
                                              ? 'bg-emerald-500'
                                              : taxa >= 40
                                                ? 'bg-amber-500'
                                                : 'bg-rose-400'
                                          }`}
                                          style={{ width: `${taxa}%` }}
                                        />
                                      </div>
                                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {taxa}%
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}
                                  >
                                    {statusMeta.label}
                                  </span>
                                  <p className="mt-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                                    Atualizado em{' '}
                                    {new Date(curso.updated_at).toLocaleDateString('pt-BR')}
                                  </p>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      type="button"
                                      title="Abrir detalhes"
                                      aria-label={`Abrir detalhes de ${curso.titulo}`}
                                      onClick={() => handleOpen(curso)}
                                      className={adminActionButtonClass}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                    {getAdminCoursePreviewPath(curso) ? (
                                      <button
                                        type="button"
                                        title="Abrir preview"
                                        aria-label={`Abrir preview de ${curso.titulo}`}
                                        onClick={() => navigate(getAdminCoursePreviewPath(curso)!)}
                                        className={adminActionButtonClass}
                                      >
                                        <Play className="h-4 w-4" />
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      title="Editar no catálogo"
                                      aria-label={`Editar ${curso.titulo} no catálogo`}
                                      onClick={() => navigate(`/lms/cursos?edit=${curso.id}`)}
                                      className={adminActionButtonClass}
                                    >
                                      <PencilLine className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      title={
                                        curso.publicado ? 'Mover para rascunho' : 'Publicar curso'
                                      }
                                      aria-label={
                                        curso.publicado
                                          ? `Mover ${curso.titulo} para rascunho`
                                          : `Publicar ${curso.titulo}`
                                      }
                                      onClick={() => void handleTogglePublication(curso)}
                                      className={adminActionButtonClass}
                                    >
                                      {curso.publicado ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <CheckCircle2 className="h-4 w-4" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      title="Abrir matrículas"
                                      aria-label={`Abrir matrículas de ${curso.titulo}`}
                                      onClick={() => navigate(`/lms/matriculas/${curso.id}`)}
                                      className={adminActionButtonClass}
                                    >
                                      <Users className="h-4 w-4" />
                                    </button>
                                    <RowActionsMenu
                                      label={`Mais ações para o curso ${curso.titulo}`}
                                      actions={[
                                        {
                                          label: 'Excluir curso',
                                          destructive: true,
                                          icon: Trash2,
                                          onSelect: () => handleDelete(curso),
                                        },
                                      ]}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </LmsSurface>
            </div>
          </div>
        </section>
      </LmsPageShell>
    </AppLayout>
  );
}
