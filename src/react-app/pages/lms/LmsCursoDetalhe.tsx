import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Eye,
  Play,
  Sparkles,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import { useAuth } from '@/react-app/hooks/useAuth';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useActivateScormPackageVersion, useLmsCurso, useMinhasMatriculas, useMatricularCurso, useRunScormPackageConformance, useScormPackageVersions } from '@/react-app/hooks/useLms';
import type { LmsMatricula, ScormPackageVersionRow } from '@/react-app/hooks/useLms';
import {
  formatMinutes,
  getMatriculaStatusMeta,
  LmsCourseArtwork,
  LmsCourseMiniMeta,
  LmsEmptyState,
  LmsInfoChip,
  LmsPageShell,
  LmsStatPill,
  LmsSurface,
} from './lmsUi';
import { getAdminCoursePreviewPath, supportsAdminCoursePreview } from './lmsAdminPreview';

export default function LmsCursoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isGestor } = usePermissions();
  const funcionarioId = user?.funcionario_id ? Number(user.funcionario_id) : null;

  const { data: curso, isLoading } = useLmsCurso(Number(id));
  const { data: matriculas } = useMinhasMatriculas();
  const matricular = useMatricularCurso();

  const matricula: LmsMatricula | undefined = matriculas?.find((m) => m.curso_id === Number(id));
  const canManage = isAdmin || isGestor;
  const previewPath = canManage ? getAdminCoursePreviewPath(curso) : null;
  const canPreview = Boolean(previewPath);
  const hasContent = supportsAdminCoursePreview(curso);
  const packageVersions = useScormPackageVersions(Number(id), canManage && curso?.tipo_conteudo === 'scorm');
  const runConformance = useRunScormPackageConformance(Number(id));
  const activatePackage = useActivateScormPackageVersion(Number(id));

  const learningGoals = useMemo(() => {
    if (!curso) return [];
    return [
      curso.tipo_conteudo === 'scorm'
        ? 'Concluir o pacote SCORM no player protegido e registrar o progresso automaticamente.'
        : curso.tipo_conteudo === 'h5p'
          ? 'Executar o conteúdo interativo H5P com rastreamento do avanço na trilha.'
          : curso.tipo_conteudo === 'pdf'
            ? 'Ler o material PDF com trilha controlada e registrar a conclusão para compliance.'
            : curso.tipo_conteudo === 'pptx'
              ? 'Percorrer todos os slides da apresentação para concluir o treinamento e gerar a evidência operacional.'
              : 'Consumir o conteúdo publicado e registrar sua evolução na trilha de aprendizagem.',
      curso.scorm_mastery_score
        ? `Alcançar pelo menos ${curso.scorm_mastery_score}% na avaliação para concluir o treinamento.`
        : 'Concluir todos os passos definidos no conteúdo para avançar.',
      curso.gerar_qualificacao_ao_concluir === 1
        ? 'Gerar automaticamente a qualificação vinculada ao finalizar o curso.'
        : 'Salvar o histórico de conclusão no módulo LMS para acompanhamento da empresa.',
    ];
  }, [curso]);

  function navigatePlayer(matriculaId: number, review?: boolean) {
    if (!curso) return;
    const suffix = review ? '?review=1' : '';
    if (curso.tipo_conteudo === 'h5p') {
      navigate(`/lms/player/h5p/${matriculaId}${suffix}`);
    } else if (curso.tipo_conteudo === 'pdf') {
      navigate(`/lms/player/pdf/${matriculaId}${suffix}`);
    } else if (curso.tipo_conteudo === 'pptx') {
      navigate(`/lms/player/pptx/${matriculaId}${suffix}`);
    } else {
      navigate(`/lms/player/${matriculaId}${suffix}`);
    }
  }

  async function handleIniciar() {
    if (!curso) return;

    if (canManage) {
      if (previewPath) {
        navigate(previewPath);
        return;
      }

      navigate(`/lms/matriculas/${curso.id}`);
      return;
    }

    if (matricula && matricula.status !== 'CANCELADO') {
      navigatePlayer(matricula.id, matricula.status === 'CONCLUIDO');
      return;
    }

    if (!funcionarioId) {
      toast.error('Usuário sem vínculo de funcionário para iniciar o curso.');
      return;
    }

    try {
      const nova = await matricular.mutateAsync({
        funcionario_id: funcionarioId,
        curso_id: curso.id,
      });
      navigatePlayer(nova.id);
    } catch {
      // handled by mutation
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <LmsPageShell>
          <div className="space-y-5 animate-pulse">
            <div className="h-10 w-80 rounded-2xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-[320px] rounded-2xl bg-slate-100 dark:bg-slate-800" />
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800" />
              <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        </LmsPageShell>
      </AppLayout>
    );
  }

  if (!curso) {
    return (
      <AppLayout>
        <LmsPageShell>
          <LmsEmptyState
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Curso não encontrado"
            description="O item solicitado não está mais disponível ou foi removido do catálogo atual."
            action={
              <Button variant="secondary" onClick={() => navigate('/lms/cursos')}>
                Voltar ao catálogo
              </Button>
            }
          />
        </LmsPageShell>
      </AppLayout>
    );
  }

  const concluido = matricula?.status === 'CONCLUIDO';
  const enrollmentStatusMeta = matricula
    ? getMatriculaStatusMeta(matricula.status)
    : canManage
      ? null
      : getMatriculaStatusMeta('DISPONIVEL');
  const contextualActionLabel =
    canManage && !matricula
      ? canPreview
        ? 'Abrir preview'
        : 'Ir para gestão'
      : concluido
        ? 'Rever conteúdo'
        : matricula && matricula.status !== 'NAO_INICIADO'
          ? 'Continuar treinamento'
          : 'Iniciar treinamento';

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          title={curso.titulo}
          subtitle={
            canManage
              ? 'Detalhes do curso com acesso direto ao player de teste e à gestão.'
              : 'Detalhe do treinamento com progresso, objetivos e acesso direto ao player.'
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate('/lms/cursos')}>
                <ArrowLeft className="h-4 w-4" />
                Voltar ao catálogo
              </Button>
            </div>
          }
        />

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid gap-0 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="border-b border-slate-200 p-4 xl:border-b-0 xl:border-r dark:border-slate-700">
              <LmsCourseArtwork
                curso={curso}
                progress={matricula ? (matricula.progresso_efetivo ?? matricula.progresso_pct) : undefined}
              />
            </div>

            <div className="flex flex-col p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {enrollmentStatusMeta ? <LmsStatPill status={enrollmentStatusMeta} /> : null}
                {canManage ? (
                  <LmsStatPill
                    status={getMatriculaStatusMeta(curso.publicado ? 'PUBLICADO' : 'RASCUNHO')}
                  />
                ) : null}
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                {curso.titulo}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500 dark:text-slate-400">
                {curso.descricao ||
                  'Treinamento corporativo estruturado para consumo em LMS, com acompanhamento de progresso e status por perfil.'}
              </p>

              <div className="mt-5">
                <LmsCourseMiniMeta curso={curso} />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <LmsInfoChip icon={<Target className="h-3.5 w-3.5" />}>
                  {curso.scorm_versao ? `SCORM ${curso.scorm_versao}` : 'Conteúdo publicado'}
                </LmsInfoChip>
                <LmsInfoChip icon={<Award className="h-3.5 w-3.5" />}>
                  {curso.scorm_mastery_score
                    ? `Meta mínima ${curso.scorm_mastery_score}%`
                    : 'Sem nota mínima definida'}
                </LmsInfoChip>
                <LmsInfoChip icon={<Sparkles className="h-3.5 w-3.5" />}>
                  {curso.gerar_qualificacao_ao_concluir === 1
                    ? 'Gera qualificação ao concluir'
                    : 'Conclusão sem geração automática'}
                </LmsInfoChip>
                {curso.gerar_qualificacao_ao_concluir === 1 && curso.qualificacao_tipo_nome ? (
                  <LmsInfoChip icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                    EAD {curso.qualificacao_tipo_nome}
                    {curso.qualificacao_tipo_codigo ? ` (${curso.qualificacao_tipo_codigo})` : ''}
                  </LmsInfoChip>
                ) : null}
              </div>

              {matricula ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Seu progresso</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {matricula.status === 'CONCLUIDO'
                          ? 'Treinamento concluído e disponível para revisão.'
                          : 'O progresso será retomado do ponto salvo.'}
                      </p>
                    </div>
                    <p className="text-2xl font-semibold text-slate-950 dark:text-slate-100">
                      {matricula.progresso_efetivo ?? matricula.progresso_pct}%
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-slate-950"
                      style={{ width: `${matricula.progresso_efetivo ?? matricula.progresso_pct}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {matricula.score_final != null ? (
                      <span>Nota final {matricula.score_final}%</span>
                    ) : null}
                    <span>
                      {matricula.tentativas} tentativa{matricula.tentativas === 1 ? '' : 's'}
                    </span>
                    {matricula.data_conclusao ? (
                      <span>
                        Concluído em{' '}
                        {new Date(matricula.data_conclusao).toLocaleDateString('pt-BR')}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-3 pt-6">
                {hasContent ? (
                  <Button
                    variant="primary"
                    onClick={() => void handleIniciar()}
                    loading={matricular.isPending}
                  >
                    <Play className="h-4 w-4" />
                    {contextualActionLabel}
                  </Button>
                ) : null}

                {canManage ? (
                  <Button variant="ghost" onClick={() => navigate('/lms/admin/cursos')}>
                    Ir para gestão
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              {!hasContent ? (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  Este curso ainda não possui um pacote válido para execução. Faça o upload do
                  conteúdo antes de disponibilizar o player.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <LmsSurface
            title="Objetivos do treinamento"
            description="O design desta página orienta o usuário para concluir o conteúdo com contexto antes de entrar no player."
          >
            <div className="space-y-3">
              {learningGoals.map((goal) => (
                <div
                  key={goal}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="mt-0.5 rounded-full bg-slate-900 p-1 text-white dark:bg-slate-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{goal}</p>
                </div>
              ))}
            </div>
          </LmsSurface>

          <LmsSurface
            title={canManage ? 'Contexto de operação' : 'Resumo da sua jornada'}
            description={
              canManage
                ? 'Use esta visão para validar o conteúdo antes de publicar e corrigir gaps de configuração.'
                : 'Os blocos abaixo deixam claro o próximo passo esperado para este curso.'
            }
          >
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Disponibilidade</p>
                <p className="mt-1 text-sm text-slate-500">
                  {curso.publicado
                    ? 'Publicado no catálogo atual.'
                    : 'Ainda em rascunho; visível apenas para gestão.'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tipo de conteúdo</p>
                <p className="mt-1 text-sm text-slate-500">
                  {curso.tipo_conteudo === 'scorm'
                    ? 'Executado no player SCORM protegido, com persistência de progresso.'
                    : curso.tipo_conteudo === 'h5p'
                      ? 'Executado via player H5P com eventos xAPI.'
                      : 'Conteúdo em formato de vídeo ou mídia linear.'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Carga horária</p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatMinutes(curso.carga_horaria_minutos)}
                </p>
                {curso.carga_horaria_inicial_horas != null ||
                curso.carga_horaria_recorrente_horas != null ? (
                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                    {curso.carga_horaria_inicial_horas != null
                      ? `Inicial ${curso.carga_horaria_inicial_horas}h`
                      : null}
                    {curso.carga_horaria_inicial_horas != null &&
                    curso.carga_horaria_recorrente_horas != null
                      ? ' · '
                      : ''}
                    {curso.carga_horaria_recorrente_horas != null
                      ? `Recorrente ${curso.carga_horaria_recorrente_horas}h`
                      : null}
                  </p>
                ) : null}
              </div>
            </div>
          </LmsSurface>
        </div>
        {canManage && curso.tipo_conteudo === 'scorm' ? <LmsSurface title="Quality Gate SCORM" description="Candidatos só substituem o pacote ativo após os gates."><div className="space-y-2">{(packageVersions.data?.data ?? []).map((pkg: ScormPackageVersionRow) => <div key={pkg.packageId} className="rounded-lg border p-3 text-sm"><p className="font-medium">{pkg.status} · SHA {String(pkg.packageSha256 ?? '').slice(0, 12)}</p><p>Estático: {pkg.structural?.status ?? '—'} · Runtime: {pkg.runtime?.status ?? pkg.conformance?.status ?? 'PENDENTE'} · Publicável: {pkg.publishable ? 'sim' : 'não'}</p>{(pkg.runtime?.errors ?? pkg.completionManifest?.errors ?? []).map((reason: string) => <p key={reason} className="text-rose-600">{reason}</p>)}<div className="mt-2 flex gap-2"><Button variant="secondary" loading={runConformance.isPending} onClick={() => void runConformance.mutateAsync(pkg.packageId)}>Executar conformance</Button><Button variant="primary" disabled={!pkg.publishable} loading={activatePackage.isPending} onClick={() => void activatePackage.mutateAsync(pkg.packageId)}>Ativar versão</Button></div></div>)}</div></LmsSurface> : null}
        {curso.conteudo_programatico ? (
          <LmsSurface
            title="Conteúdo programático"
            description="Metadados pedagógicos espelhados do tipo EAD para manter curso e qualificação alinhados."
          >
            <div className="whitespace-pre-line text-sm leading-7 text-slate-600 dark:text-slate-400">
              {curso.conteudo_programatico}
            </div>
            {curso.observacoes ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                <p className="font-semibold text-slate-900">Observações</p>
                <p className="mt-2 whitespace-pre-line">{curso.observacoes}</p>
              </div>
            ) : null}
          </LmsSurface>
        ) : null}
      </LmsPageShell>
    </AppLayout>
  );
}
