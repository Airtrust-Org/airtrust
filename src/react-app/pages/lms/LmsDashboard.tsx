import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Play,
  Plus,
  Users,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import PageHeader from '@/react-app/components/PageHeader';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import { useLmsStats, useMinhasMatriculas } from '@/react-app/hooks/useLms';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import {
  formatMinutes,
  getMatriculaStatusMeta,
  LmsCourseArtwork,
  LmsEmptyState,
  LmsModuleTabs,
  LmsPageShell,
  LmsSummaryTag,
  LmsStatPill,
} from './lmsUi';

function daysSince(date: string | null | undefined) {
  if (!date) return 0;
  const diff = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export default function LmsDashboard() {
  const navigate = useNavigate();
  const { isAdmin, isGestor } = usePermissions();
  const isManager = isAdmin || isGestor;
  const {
    data: stats,
    isLoading: loadingStats,
    isError: hasStatsError,
    error: statsError,
  } = useLmsStats(isManager);
  const { data: matriculas, isLoading: loadingMatriculas } = useMinhasMatriculas();

  const mats = matriculas ?? [];
  const isLoading = isManager ? loadingStats : loadingMatriculas;

  const emAndamento = mats.filter((m) => m.status === 'EM_ANDAMENTO').length;
  const concluidas = mats.filter((m) => m.status === 'CONCLUIDO').length;
  const naoIniciados = mats.filter((m) => m.status === 'NAO_INICIADO').length;

  const currentTraining = useMemo(
    () => mats.filter((m) => m.status !== 'CONCLUIDO' && m.status !== 'CANCELADO').slice(0, 6),
    [mats],
  );

  const atrasadas = mats.filter(
    (m) => m.status === 'EM_ANDAMENTO' && daysSince(m.data_matricula) >= 14 && m.progresso_pct < 10,
  );

  const highlightedCourses = useMemo(() => {
    if (!stats) return [];

    if (stats.top_cursos.length > 0) {
      return stats.top_cursos.map((curso) => ({ ...curso, source: 'performance' as const }));
    }

    return stats.featured_courses.map((curso) => ({ ...curso, source: 'featured' as const }));
  }, [stats]);

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          className="mb-6"
          title={isManager ? 'Visão geral do LMS' : 'Meus treinamentos'}
          subtitle={
            isManager
              ? `${stats?.total_cursos ?? 0} cursos · ${stats?.total_matriculados ?? 0} matrículas · ${stats?.taxa_conclusao_pct ?? 0}% de conclusão`
              : `${emAndamento} em andamento · ${concluidas} concluídos · ${naoIniciados} aguardando início`
          }
          actions={
            isManager ? (
              <>
                <Button variant="secondary" onClick={() => navigate('/lms/relatorios')}>
                  <BarChart3 className="h-4 w-4" />
                  Relatórios
                </Button>
                <Button variant="primary" onClick={() => navigate('/lms/cursos?new=1')}>
                  <Plus className="h-4 w-4" />
                  Novo curso
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => navigate('/lms/cursos')}>
                <BookOpen className="h-4 w-4" />
                Ver catálogo
              </Button>
            )
          }
        />
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <LmsModuleTabs canManage={isManager} />

          {/* Content area */}
          <div className="p-5 sm:p-6">
            {!isLoading ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {isManager ? (
                  <>
                    <LmsSummaryTag
                      label="Cursos publicados"
                      value={stats?.cursos_publicados ?? 0}
                      icon={<BookOpen className="h-4 w-4" />}
                      tone="sky"
                    />
                    <LmsSummaryTag
                      label="Alunos alcançados"
                      value={stats?.total_alunos ?? 0}
                      icon={<Users className="h-4 w-4" />}
                      tone="slate"
                    />
                    <LmsSummaryTag
                      label="Conclusões"
                      value={stats?.concluidas ?? 0}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      tone="emerald"
                    />
                    <LmsSummaryTag
                      label="Taxa de conclusão"
                      value={`${stats?.taxa_conclusao_pct ?? 0}%`}
                      icon={<BarChart3 className="h-4 w-4" />}
                      tone="amber"
                    />
                  </>
                ) : (
                  <>
                    <LmsSummaryTag
                      label="Em andamento"
                      value={emAndamento}
                      icon={<Play className="h-4 w-4" />}
                      tone="amber"
                    />
                    <LmsSummaryTag
                      label="Concluídos"
                      value={concluidas}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                      tone="emerald"
                    />
                    <LmsSummaryTag
                      label="Aguardando início"
                      value={naoIniciados}
                      icon={<GraduationCap className="h-4 w-4" />}
                      tone="slate"
                    />
                  </>
                )}
              </div>
            ) : null}

            {isManager && hasStatsError ? (
              <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Não foi possível carregar a visão geral do LMS.
                {statsError instanceof Error ? ` ${statsError.message}` : ''}
              </div>
            ) : null}

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : isManager && hasStatsError ? (
              <LmsEmptyState
                icon={<AlertTriangle className="h-8 w-8" />}
                title="Visão geral indisponível"
                description="A consulta de métricas falhou. Recarregue a página ou abra Relatórios para validar o endpoint de gestão."
              />
            ) : isManager ? (
              /* Manager: risk alerts + recent completions + top courses */
              <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                  <BookOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-sky-900">
                      Legado EdApp disponível somente para histórico
                    </p>
                    <p className="mt-0.5 text-xs text-sky-800">
                      A integração ativa com EdApp está descontinuada. Os registros anteriores foram
                      preservados para auditoria e compliance.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/lms/legado-edapp')}
                    className="flex-shrink-0 text-xs font-medium text-sky-700 underline hover:text-sky-900"
                  >
                    Abrir histórico
                  </button>
                </div>

                {/* Alert banner if there are stalled enrollments */}
                {(stats?.atrasadas?.length ?? 0) > 0 && (
                  <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-amber-800">
                        {stats!.atrasadas.length} matrícula
                        {stats!.atrasadas.length > 1 ? 's' : ''} sem progresso há mais de 14 dias
                      </p>
                      <p className="mt-0.5 text-xs text-amber-700">
                        {stats!.atrasadas
                          .slice(0, 3)
                          .map((a) => a.funcionario_nome)
                          .join(', ')}
                        {stats!.atrasadas.length > 3
                          ? ` e mais ${stats!.atrasadas.length - 3}`
                          : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/lms/relatorios')}
                      className="flex-shrink-0 text-xs font-medium text-amber-700 underline hover:text-amber-900"
                    >
                      Ver relatório
                    </button>
                  </div>
                )}

                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Recent completions */}
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">
                      Conclusões recentes
                    </h2>
                    {stats?.recent_completions?.length ? (
                      <div className="space-y-2">
                        {stats.recent_completions.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left"
                            onClick={() =>
                              navigate(
                                `/funcionarios/${item.funcionario_id}/ficha?tab=treinamentos`,
                              )
                            }
                          >
                            <div>
                              <FuncionarioLink
                                funcionarioId={item.funcionario_id}
                                nome={item.funcionario_nome}
                                className="text-sm font-medium text-slate-900 hover:text-primary hover:underline"
                                stopPropagation
                              />
                              <p className="text-xs text-slate-500">{item.curso_titulo}</p>
                            </div>
                            <span className="text-xs text-slate-400">
                              {new Date(item.data_conclusao).toLocaleDateString('pt-BR')}
                            </span>
                          </button>
                        ))}
                        <div className="pt-1">
                          <Button variant="ghost" onClick={() => navigate('/lms/relatorios')}>
                            Ver relatório completo
                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-8 text-center">
                        <Users className="h-8 w-8 text-slate-300" />
                        <p className="text-sm text-slate-400">Sem conclusões recentes.</p>
                      </div>
                    )}
                  </div>

                  {/* Top courses */}
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-slate-700">
                      Cursos em destaque
                    </h2>
                    {highlightedCourses.length ? (
                      <div className="space-y-2">
                        {highlightedCourses.slice(0, 5).map((curso) => (
                          <button
                            type="button"
                            key={curso.id}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left"
                            onClick={() => navigate(`/lms/cursos/${curso.id}`)}
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {curso.titulo}
                              </p>
                              {curso.source === 'performance' ? (
                                <span className="flex-shrink-0 text-xs text-slate-400">
                                  {curso.total_matriculas} matriculado
                                  {curso.total_matriculas !== 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="flex-shrink-0 text-xs text-slate-400">
                                  {curso.categoria ?? 'Catálogo'}
                                </span>
                              )}
                            </div>
                            {curso.source === 'performance' ? (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 rounded-full bg-slate-200">
                                  <div
                                    className={`h-1.5 rounded-full ${curso.taxa_conclusao_pct >= 80 ? 'bg-emerald-500' : curso.taxa_conclusao_pct >= 40 ? 'bg-amber-500' : 'bg-rose-400'}`}
                                    style={{
                                      width: `${Math.min(curso.taxa_conclusao_pct, 100)}%`,
                                    }}
                                  />
                                </div>
                                <span
                                  className={`flex-shrink-0 text-xs font-semibold ${curso.taxa_conclusao_pct >= 80 ? 'text-emerald-700' : curso.taxa_conclusao_pct >= 40 ? 'text-amber-700' : 'text-rose-600'}`}
                                >
                                  {curso.taxa_conclusao_pct}%
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span>{formatMinutes(curso.carga_horaria_minutos)}</span>
                                <span>•</span>
                                <span>{curso.total_matriculas} matrícula(s)</span>
                              </div>
                            )}
                          </button>
                        ))}
                        <div className="pt-1">
                          <Button variant="ghost" onClick={() => navigate('/lms/cursos')}>
                            Gerenciar cursos
                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-8 text-center">
                        <BookOpen className="h-8 w-8 text-slate-300" />
                        <p className="text-sm text-slate-400">Nenhum curso publicado ainda.</p>
                        <Button variant="primary" onClick={() => navigate('/lms/cursos')}>
                          <Plus className="h-4 w-4" />
                          Criar primeiro curso
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : currentTraining.length ? (
              /* Learner: active enrollments */
              <div>
                <h2 className="mb-3 text-sm font-semibold text-slate-700">
                  Continue de onde parou
                </h2>
                {atrasadas.length > 0 && (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {atrasadas.length} treinamento{atrasadas.length > 1 ? 's' : ''} sem progresso há
                    mais de 14 dias. Retome agora.
                  </div>
                )}
                <div className="space-y-2">
                  {currentTraining.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          item.tipo_conteudo === 'h5p'
                            ? `/lms/player/h5p/${item.id}`
                            : item.tipo_conteudo === 'pdf'
                              ? `/lms/player/pdf/${item.id}`
                              : item.tipo_conteudo === 'pptx'
                                ? `/lms/player/pptx/${item.id}`
                                : `/lms/player/${item.id}`,
                        )
                      }
                      className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
                    >
                      <div className="flex-shrink-0">
                        <LmsCourseArtwork
                          curso={{
                            titulo: item.titulo ?? 'Curso',
                            tipo_conteudo: item.tipo_conteudo ?? 'scorm',
                            categoria: item.categoria ?? null,
                          }}
                          compact
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <LmsStatPill status={getMatriculaStatusMeta(item.status)} />
                          <span className="text-xs text-slate-400">
                            {formatMinutes(item.carga_horaria_minutos)}
                          </span>
                        </div>
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.titulo ?? `Curso #${item.curso_id}`}
                        </p>
                        <div className="mt-1.5 h-1.5 w-32 rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${item.progresso_pct}%` }}
                          />
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
                {naoIniciados > 0 && (
                  <div className="mt-4">
                    <Button variant="ghost" onClick={() => navigate('/lms/cursos')}>
                      Ver todos os treinamentos
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <LmsEmptyState
                icon={<GraduationCap className="h-8 w-8" />}
                title="Nenhum treinamento ativo"
                description="Explore o catálogo para iniciar sua trilha de aprendizagem."
                action={
                  <Button variant="primary" onClick={() => navigate('/lms/cursos')}>
                    <Play className="h-4 w-4" />
                    Explorar catálogo
                  </Button>
                }
              />
            )}
          </div>
        </section>
      </LmsPageShell>
    </AppLayout>
  );
}
