import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BadgeCheck,
  BookOpen,
  Box,
  Clock3,
  Film,
  FileText,
  GraduationCap,
  Layers,
  Presentation,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type {
  LmsCurso,
  LmsMatricula,
  MatriculaStatus,
  TipoConteudo,
} from '@/react-app/hooks/useLms';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';

type LmsArtworkCourse = Pick<LmsCurso, 'titulo' | 'tipo_conteudo' | 'categoria'> & {
  id?: number;
  thumbnail_r2_key?: string | null;
  version_tag?: string | null;
};

export function formatMinutes(value: number | null | undefined): string {
  if (!value) return 'Sem duração definida';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}min`;
}

export function getTypeMeta(type: TipoConteudo | null | undefined): {
  label: string;
  icon: ReactNode;
  chipClass: string;
  artworkClass: string;
} {
  if (type === 'h5p') {
    return {
      label: 'H5P',
      icon: <Layers className="h-3.5 w-3.5" />,
      chipClass: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
      artworkClass: 'bg-emerald-50 text-emerald-700',
    };
  }

  if (type === 'video') {
    return {
      label: 'Vídeo',
      icon: <Film className="h-3.5 w-3.5" />,
      chipClass: 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300',
      artworkClass: 'bg-fuchsia-50 text-fuchsia-700',
    };
  }

  if (type === 'pdf') {
    return {
      label: 'PDF',
      icon: <FileText className="h-3.5 w-3.5" />,
      chipClass: 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
      artworkClass: 'bg-rose-50 text-rose-700',
    };
  }

  if (type === 'pptx') {
    return {
      label: 'PowerPoint',
      icon: <Presentation className="h-3.5 w-3.5" />,
      chipClass: 'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300',
      artworkClass: 'bg-orange-50 text-orange-700',
    };
  }

  return {
    label: 'SCORM',
    icon: <Box className="h-3.5 w-3.5" />,
    chipClass: 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300',
    artworkClass: 'bg-sky-50 text-sky-700',
  };
}

export const LMS_PRIMARY_BUTTON_CLASS =
  '!border-transparent !bg-primary !text-white !shadow-sm hover:!bg-primary/90 focus:!ring-primary/30';

export const LMS_SECONDARY_BUTTON_CLASS =
  '!border-slate-300 !bg-white !text-slate-700 !shadow-sm hover:!bg-slate-50 focus:!ring-primary/20 dark:!border-slate-700 dark:!bg-slate-900 dark:!text-slate-100 dark:hover:!bg-slate-800';

export const LMS_GHOST_BUTTON_CLASS =
  '!text-slate-700 hover:!bg-slate-100 focus:!ring-primary/20 dark:!text-slate-100 dark:hover:!bg-slate-800';

export function getMatriculaStatusMeta(
  status: MatriculaStatus | 'DISPONIVEL' | 'RASCUNHO' | 'PUBLICADO' | null | undefined,
) {
  switch (status) {
    case 'NAO_INICIADO':
      return { label: 'Não iniciado', className: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' };
    case 'EM_ANDAMENTO':
      return { label: 'Em andamento', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' };
    case 'CONCLUIDO':
      return { label: 'Concluído', className: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
    case 'REPROVADO':
      return { label: 'Reprovado', className: 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300' };
    case 'CANCELADO':
      return { label: 'Cancelado', className: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' };
    case 'RASCUNHO':
      return { label: 'Rascunho', className: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300' };
    case 'PUBLICADO':
      return { label: 'Publicado', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' };
    case 'DISPONIVEL':
      return { label: 'Disponível', className: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300' };
    default:
      return { label: 'Não iniciado', className: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' };
  }
}

// ─── helpers de status visual para cards LMS ──────────────────────────────────

/** Bordas do card conforme status da matrícula (versão linha/lista com border-l-4) */
export function getLmsRowCardBorderClasses(status: string | null | undefined): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'border-amber-300 bg-amber-50/30 border-l-4 border-l-amber-500 dark:border-amber-800 dark:bg-amber-950/15 dark:border-l-amber-600';
    case 'CONCLUIDO':
      return 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40';
    case 'NAO_INICIADO':
    default:
      return 'border-emerald-200 bg-emerald-50/30 border-l-4 border-l-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/15 dark:border-l-emerald-600';
  }
}

/** Bordas do card conforme status da matrícula (versão grid/catálogo com border-t-4) */
export function getLmsGridCardBorderClasses(status: string | null | undefined): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'border-amber-300 border-t-4 border-t-amber-500 bg-amber-50/20 dark:border-amber-800 dark:border-t-amber-600 dark:bg-amber-950/10';
    case 'CONCLUIDO':
      return 'border-slate-200 dark:border-slate-700';
    case 'NAO_INICIADO':
    default:
      return 'border-emerald-200 border-t-4 border-t-emerald-400 bg-emerald-50/10 dark:border-emerald-800 dark:border-t-emerald-600 dark:bg-emerald-950/10';
  }
}

/** Classes do botão de ação principal conforme status */
export function getLmsActionButtonClasses(status: string | null | undefined): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm';
    case 'CONCLUIDO':
      return 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';
    case 'NAO_INICIADO':
    default:
      return 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm';
  }
}

/** Label do botão de ação principal conforme status */
export function getLmsActionLabel(status: string | null | undefined): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'Continuar';
    case 'CONCLUIDO':
      return 'Rever';
    case 'NAO_INICIADO':
    default:
      return 'Iniciar';
  }
}

/** Classes da barra de progresso conforme status */
export function getLmsProgressBarFillClasses(status: string | null | undefined): string {
  switch (status) {
    case 'EM_ANDAMENTO':
      return 'bg-amber-500';
    case 'CONCLUIDO':
      return 'bg-slate-400';
    default:
      return 'bg-slate-300';
  }
}

/** Label de progresso conforme status */
export function getLmsProgressLabel(status: string | null | undefined, progressoPct: number): string {
  if (status === 'CONCLUIDO') {
    return `Concluído ${progressoPct}%`;
  }
  return `${progressoPct}%`;
}

export function LmsPageShell({ children }: { children: ReactNode }) {
  return <div className="w-full space-y-5 lg:space-y-6">{children}</div>;
}

const summaryToneClasses = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300',
  emerald:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
} as const;

const summaryIconToneClasses = {
  slate: 'bg-white/90 text-slate-700 dark:bg-slate-900 dark:text-slate-200',
  sky: 'bg-white/90 text-sky-700 dark:bg-slate-900 dark:text-sky-300',
  emerald: 'bg-white/90 text-emerald-700 dark:bg-slate-900 dark:text-emerald-300',
  amber: 'bg-white/90 text-amber-700 dark:bg-slate-900 dark:text-amber-300',
  rose: 'bg-white/90 text-rose-700 dark:bg-slate-900 dark:text-rose-300',
} as const;

export function LmsSummaryTag({
  label,
  value,
  icon,
  tone = 'slate',
}: {
  label: string;
  value: number | string;
  icon?: ReactNode;
  tone?: keyof typeof summaryToneClasses;
}) {
  return (
    <div
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 ${summaryToneClasses[tone]}`}
    >
      {icon ? (
        <span
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${summaryIconToneClasses[tone]}`}
        >
          {icon}
        </span>
      ) : null}
      <span className="truncate text-xs font-medium leading-none">{label}</span>
      <span className="whitespace-nowrap text-xs font-semibold leading-none text-slate-900 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

export function getLmsCourseThumbnailUrl(curso: {
  id?: number;
  thumbnail_r2_key?: string | null;
  version_tag?: string | null;
}) {
  if (!curso.id || !curso.thumbnail_r2_key) return null;

  const version = curso.version_tag ? `?v=${encodeURIComponent(curso.version_tag)}` : '';
  return `${API_BASE_URL}/lms/course-assets/${curso.id}/thumbnail${version}`;
}

export function useLmsCourseThumbnailUrl(
  curso:
    | {
        id?: number;
        thumbnail_r2_key?: string | null;
        version_tag?: string | null;
      }
    | null
    | undefined,
) {
  const assetUrl = curso ? getLmsCourseThumbnailUrl(curso) : null;
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!assetUrl) {
      setThumbnailUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setThumbnailUrl(null);

    void fetchWithAuth(assetUrl, {
      headers: { 'X-AirTrust-Bypass-Cache': '1' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setThumbnailUrl(objectUrl);
          return;
        }
        URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) {
          setThumbnailUrl(null);
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [assetUrl]);

  return thumbnailUrl;
}

export function LmsModuleTabs({ canManage }: { canManage: boolean }) {
  const location = useLocation();
  const items = [
    { label: 'Visão Geral', to: '/lms/dashboard', visible: true },
    { label: 'Catálogo', to: '/lms/cursos', visible: true },
    { label: 'Legado EdApp', to: '/lms/legado-edapp', visible: canManage },
    { label: 'Configurações', to: '/lms/admin/cursos', visible: canManage },
    { label: 'Relatórios', to: '/lms/relatorios', visible: canManage },
  ].filter((item) => item.visible);

  return (
    <div className="border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
      <div className="flex overflow-x-auto" role="tablist">
        {items.map((item) => {
          const active =
            location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center whitespace-nowrap border-b-2 px-4 py-4 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary text-primary dark:text-blue-200'
                  : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function LmsCourseArtwork({
  curso,
  progress,
  compact = false,
}: {
  curso: LmsArtworkCourse;
  progress?: number;
  compact?: boolean;
}) {
  const meta = getTypeMeta(curso.tipo_conteudo);
  const thumbnailUrl = useLmsCourseThumbnailUrl(curso);
  const titleClass = thumbnailUrl ? 'text-white' : 'text-slate-950';
  const descriptionClass = thumbnailUrl ? 'text-white/78' : 'text-slate-500';

  return (
    <div
      className={`relative overflow-hidden border border-slate-200 ${compact ? 'h-14 w-14 rounded-xl' : 'aspect-[16/9] w-full rounded-xl'} bg-slate-950`}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={curso.titulo}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.42),_transparent_34%),linear-gradient(140deg,_#0f172a_0%,_#111827_46%,_#1e3a8a_100%)]" />
      )}
      <div
        className={`absolute inset-0 ${thumbnailUrl ? 'bg-gradient-to-t from-slate-950/60 via-slate-950/15 to-transparent' : 'bg-gradient-to-br from-white/0 via-white/0 to-sky-400/10'}`}
      />

      <div
        className={`relative flex h-full w-full ${compact ? 'items-center justify-center p-2' : 'items-start justify-between p-3'}`}
      >
        {compact ? (
          <>
            {thumbnailUrl ? (
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 to-transparent" />
            ) : null}
            <div
              className={`relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 ${thumbnailUrl ? 'bg-white/14 text-white backdrop-blur-sm' : meta.artworkClass}`}
            >
              <GraduationCap className="h-5 w-5" />
            </div>
          </>
        ) : null}
      </div>
      {typeof progress === 'number' ? (
        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-100">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function LmsInfoChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {icon}
      {children}
    </span>
  );
}

export function LmsMetricCard({
  title,
  value,
  description,
  icon,
  accent,
}: {
  title: string;
  value: number | string;
  description: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">{value}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <div className={`rounded-xl p-3 ${accent}`}>{icon}</div>
      </div>
    </div>
  );
}

export function LmsStatPill({
  label,
  status,
}: {
  label?: string;
  status: ReturnType<typeof getMatriculaStatusMeta>;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
    >
      {label ?? status.label}
    </span>
  );
}

export function LmsEnrollmentMeta({
  matricula,
}: {
  matricula?: Pick<LmsMatricula, 'status' | 'progresso_pct' | 'progresso_efetivo'> & {
    carga_horaria_minutos?: number | null;
  };
}) {
  const status = matricula?.status
    ? getMatriculaStatusMeta(matricula.status)
    : getMatriculaStatusMeta('DISPONIVEL');
  const displayProgress = matricula?.progresso_efetivo ?? matricula?.progresso_pct;
  return (
    <div className="flex items-center gap-2">
      <LmsStatPill status={status} />
      {typeof displayProgress === 'number' && matricula?.status !== 'NAO_INICIADO' ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          <TrendingUp className="h-3.5 w-3.5" />
          {displayProgress}%
        </span>
      ) : null}
      <LmsInfoChip icon={<Clock3 className="h-3.5 w-3.5" />}>
        {formatMinutes(matricula?.carga_horaria_minutos)}
      </LmsInfoChip>
    </div>
  );
}

export function LmsEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-400 dark:bg-slate-800 dark:text-slate-500">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LmsSurface({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function LmsCourseMiniMeta({
  curso,
}: {
  curso: Pick<
    LmsCurso,
    | 'tipo_conteudo'
    | 'categoria'
    | 'carga_horaria_minutos'
    | 'carga_horaria_inicial_horas'
    | 'carga_horaria_recorrente_horas'
    | 'gerar_qualificacao_ao_concluir'
    | 'qualificacao_tipo_nome'
    | 'qualificacao_tipo_codigo'
  >;
}) {
  const type = getTypeMeta(curso.tipo_conteudo);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${type.chipClass}`}
      >
        {type.icon}
        {type.label}
      </span>
      {curso.categoria ? (
        <LmsInfoChip icon={<BookOpen className="h-3.5 w-3.5" />}>{curso.categoria}</LmsInfoChip>
      ) : null}
      <LmsInfoChip icon={<Clock3 className="h-3.5 w-3.5" />}>
        {formatMinutes(curso.carga_horaria_minutos)}
      </LmsInfoChip>
      {curso.carga_horaria_inicial_horas != null ? (
        <LmsInfoChip icon={<Clock3 className="h-3.5 w-3.5" />}>
          Inicial {curso.carga_horaria_inicial_horas}h
        </LmsInfoChip>
      ) : null}
      {curso.carga_horaria_recorrente_horas != null ? (
        <LmsInfoChip icon={<Clock3 className="h-3.5 w-3.5" />}>
          Recorrente {curso.carga_horaria_recorrente_horas}h
        </LmsInfoChip>
      ) : null}
      {curso.gerar_qualificacao_ao_concluir === 1 && curso.qualificacao_tipo_nome ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <BadgeCheck className="h-3.5 w-3.5" />
          EAD {curso.qualificacao_tipo_nome}
          {curso.qualificacao_tipo_codigo ? ` (${curso.qualificacao_tipo_codigo})` : ''}
        </span>
      ) : null}
    </div>
  );
}
