/**
 * LmsCatalogo — unified catalog + course management page
 * For regular users: browse, enroll and play courses
 * For managers (admin/gestor): same catalog view + inline create/edit/delete/publish
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileArchive,
  ImagePlus,
  PencilLine,
  Play,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import PageHeader from '@/react-app/components/PageHeader';
import { fetchWithAuth } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useApi } from '@/react-app/hooks/useApi';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import {
  OPERATIONAL_DOMAINS,
  useOperationalAccess,
  type OperationalAction,
  type OperationalDomain,
} from '@/react-app/hooks/useOperationalAccess';
import { useQueryClient } from '@tanstack/react-query';
import {
  type CreateCursoDTO,
  lmsKeys,
  type LmsCurso,
  type LmsMatricula,
  type MatriculaStatus,
  type TipoConteudo,
  useLmsCurso,
  useCreateCurso,
  useDeleteCurso,
  useLmsCursos,
  useMatricularCurso,
  useMinhasMatriculas,
  useSyncEadCursos,
  useUpdateCurso,
  useUploadCursoThumbnail,
} from '@/react-app/hooks/useLms';
import {
  type QualificacaoTipoDTO,
  useQualificacaoTipos,
} from '@/react-app/hooks/useQualificacoesExt';
import { uploadSimpleFile, uploadStructuredLmsPackage } from './lmsContentUpload';
import {
  formatMinutes,
  getTypeMeta,
  getLmsCourseThumbnailUrl,
  useLmsCourseThumbnailUrl,
  getMatriculaStatusMeta,
  getLmsGridCardBorderClasses,
  getLmsActionButtonClasses,
  getLmsActionLabel,
  getLmsProgressBarFillClasses,
  getLmsProgressLabel,
  LmsCourseArtwork,
  LmsCourseMiniMeta,
  LmsEmptyState,
  LmsModuleTabs,
  LmsPageShell,
  LmsStatPill,
} from './lmsUi';
import {
  getAdminCoursePreviewPath,
  supportsAdminCoursePreview as supportsContentPreview,
} from './lmsAdminPreview';

// ── Types & helpers ─────────────────────────────────────────────────────────

type TabId = 'meus' | 'catalogo';

const DEFAULT_CATEGORIES = [
  'EAD',
  'TREINAMENTO EAD',
  'Regulatório',
  'Técnico',
  'Segurança',
  'Operacional',
  'Comportamental',
  'Outro',
];
const EAD_QUALIFICACAO_CATEGORIAS = new Set(['EAD', 'TREINAMENTO EAD']);

export function resolveLmsCatalogRoleView(params: {
  canManage: boolean;
  restrictToEnrolledCourses: boolean;
}) {
  const { canManage, restrictToEnrolledCourses } = params;
  return {
    showAdministrativeFilters: canManage || !restrictToEnrolledCourses,
    title: canManage
      ? 'Catálogo LMS'
      : restrictToEnrolledCourses
        ? 'Meus treinamentos'
        : 'Catálogo de treinamentos',
  };
}

type LmsCourseMutationAction = Extract<OperationalAction, 'update' | 'delete'>;

type LmsCourseMutationAccess = {
  canManage: boolean;
  operationalAccessReady: boolean;
  operationalRbacEnabled: boolean;
  setorIds: number[];
  actions: Partial<Record<OperationalDomain, OperationalAction[]>>;
  cursoDomain: string | null | undefined;
  action: LmsCourseMutationAction;
};

/**
 * Mirrors the server-side course mutation guard for UX only. The API remains
 * authoritative; this prevents the catalog from offering an action that will
 * be rejected after a destructive confirmation.
 */
export function canMutateLmsCourse({
  canManage,
  operationalAccessReady,
  operationalRbacEnabled,
  setorIds,
  actions,
  cursoDomain,
  action,
}: LmsCourseMutationAccess): boolean {
  if (!canManage || !operationalAccessReady) return false;
  if (!operationalRbacEnabled) return true;

  if (cursoDomain == null) {
    // Domain-agnostic courses remain writable only for an active operational
    // manager assignment, matching isDomainAgnosticLmsCurso on the Worker.
    return setorIds.length > 0;
  }

  if (!OPERATIONAL_DOMAINS.includes(cursoDomain as OperationalDomain)) return false;
  return actions[cursoDomain as OperationalDomain]?.includes(action) ?? false;
}

function normCat(v?: string | null) {
  return (v ?? '').trim().toUpperCase();
}
function isEadTipo(item: { categoria?: string | null }) {
  return EAD_QUALIFICACAO_CATEGORIAS.has(normCat(item.categoria));
}
function sameTipoId(a: string | number | null | undefined, b: string | number | null | undefined) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function toNullableText(v?: string | null) {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
}
function resolveMinutes(t?: QualificacaoTipoDTO | null) {
  const h = t?.carga_horaria_recorrente ?? t?.carga_horaria_inicial ?? t?.carga_horaria ?? null;
  if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) return null;
  return Math.max(0, Math.round(h * 60));
}
function isGeneratedEadMirrorCode(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .startsWith('EAD_');
}
function scoreQualificacaoTipoCandidate(tipo: QualificacaoTipoDTO) {
  const hasConteudo = toNullableText(tipo.conteudo_programatico) ? 1 : 0;
  const hasDescricao = toNullableText(tipo.descricao) ? 1 : 0;
  const generatedMirrorPenalty = isGeneratedEadMirrorCode(tipo.codigo) ? 1 : 0;
  return [generatedMirrorPenalty, -hasConteudo, -hasDescricao, Number(tipo.id) || 0] as const;
}
function pickPreferredQualificacaoTipo(tipos: QualificacaoTipoDTO[]) {
  return (
    [...tipos].sort((left, right) => {
      const leftScore = scoreQualificacaoTipoCandidate(left);
      const rightScore = scoreQualificacaoTipoCandidate(right);
      for (let index = 0; index < leftScore.length; index += 1) {
        if (leftScore[index] !== rightScore[index]) {
          return leftScore[index] - rightScore[index];
        }
      }
      return 0;
    })[0] ?? null
  );
}
function applyQualTemplate(
  cur: CreateCursoDTO,
  tipo: QualificacaoTipoDTO,
  overwrite: boolean,
): CreateCursoDTO {
  const n = { ...cur };
  if (overwrite || !n.titulo?.trim()) n.titulo = tipo.nome;
  if (overwrite || !toNullableText(n.descricao)) n.descricao = tipo.descricao ?? '';
  if (overwrite || !toNullableText(n.categoria)) n.categoria = tipo.categoria ?? 'EAD';
  const mins = resolveMinutes(tipo);
  if (overwrite || !n.carga_horaria_minutos || n.carga_horaria_minutos <= 0)
    n.carga_horaria_minutos = mins;
  if (overwrite || !toNullableText(n.conteudo_programatico))
    n.conteudo_programatico = tipo.conteudo_programatico ?? '';
  if (overwrite || !toNullableText(n.observacoes)) n.observacoes = tipo.observacoes ?? '';
  if (overwrite || n.carga_horaria_inicial_horas == null)
    n.carga_horaria_inicial_horas = tipo.carga_horaria_inicial ?? null;
  if (overwrite || n.carga_horaria_recorrente_horas == null)
    n.carga_horaria_recorrente_horas = tipo.carga_horaria_recorrente ?? null;
  n.qualificacao_tipo_id = Number(tipo.id);
  n.gerar_qualificacao_ao_concluir = 1;
  return n;
}

async function fetchFreshQualificacaoTipoById(
  qualificacaoTipoId: string | number,
): Promise<QualificacaoTipoDTO | null> {
  const response = await fetchWithAuth(
    `/api/qualificacoes/tipos/${qualificacaoTipoId}?_t=${Date.now()}`,
  );
  const json = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    data?: unknown;
  } | null;

  if (!response.ok || !json?.success) {
    throw new Error(json?.error || 'Erro ao carregar o tipo de qualificação');
  }

  if (json?.data && !Array.isArray(json.data)) {
    const tipo = json.data as QualificacaoTipoDTO;

    if (!isGeneratedEadMirrorCode(tipo.codigo) && toNullableText(tipo.conteudo_programatico)) {
      return tipo;
    }

    const sameNameResponse = await fetchWithAuth(
      `/api/qualificacoes/tipos?limit=500&_t=${Date.now()}`,
    );
    const sameNameJson = (await sameNameResponse.json().catch(() => null)) as {
      success?: boolean;
      data?: QualificacaoTipoDTO[];
    } | null;

    if (sameNameResponse.ok && sameNameJson?.success && Array.isArray(sameNameJson.data)) {
      const candidates = sameNameJson.data.filter(
        (candidate) =>
          candidate.nome?.trim().toUpperCase() === tipo.nome?.trim().toUpperCase() &&
          isEadTipo(candidate),
      );
      return pickPreferredQualificacaoTipo(candidates) ?? tipo;
    }

    return tipo;
  }

  const tipos = Array.isArray(json.data) ? (json.data as QualificacaoTipoDTO[]) : [];
  return tipos.find((tipo) => sameTipoId(tipo.id, qualificacaoTipoId)) ?? null;
}

function buildInitialForm(initial?: Partial<LmsCurso>): CreateCursoDTO {
  return {
    titulo: initial?.titulo ?? '',
    descricao: initial?.descricao ?? '',
    categoria: initial?.categoria ?? '',
    carga_horaria_minutos: initial?.carga_horaria_minutos ?? null,
    conteudo_programatico: initial?.conteudo_programatico ?? '',
    observacoes: initial?.observacoes ?? '',
    carga_horaria_inicial_horas: initial?.carga_horaria_inicial_horas ?? null,
    carga_horaria_recorrente_horas: initial?.carga_horaria_recorrente_horas ?? null,
    qualificacao_tipo_id: initial?.qualificacao_tipo_id ?? null,
    gerar_qualificacao_ao_concluir: initial?.gerar_qualificacao_ao_concluir ?? 0,
    scorm_mastery_score: initial?.scorm_mastery_score ?? 70,
    scorm_versao: initial?.scorm_versao ?? '1.2',
    tipo_conteudo: initial?.tipo_conteudo ?? 'scorm',
    publicado: initial?.publicado ?? 0,
    setor_ids: initial?.setores?.map((s) => s.id) ?? [],
  };
}
function validateForm(form: CreateCursoDTO) {
  const e: Record<string, string> = {};
  if (!form.titulo?.trim()) e.titulo = 'Informe um título claro para o curso.';
  if (form.gerar_qualificacao_ao_concluir === 1 && !form.qualificacao_tipo_id)
    e.qualificacao_tipo_id = 'Selecione o tipo de qualificação.';
  if ((form.scorm_mastery_score ?? 70) < 0 || (form.scorm_mastery_score ?? 70) > 100)
    e.scorm_mastery_score = 'Nota mínima entre 0 e 100.';
  return e;
}

function getStoredContentLabel(curso?: Partial<LmsCurso>) {
  const storedName = curso?.conteudo_arquivo_nome?.trim();
  if (storedName) return storedName;

  if (curso?.tipo_conteudo === 'pdf') {
    const pdfKey = curso.pdf_r2_key?.trim();
    return pdfKey ? (pdfKey.split('/').pop() ?? pdfKey) : null;
  }

  if (curso?.tipo_conteudo === 'pptx') {
    const pptxKey = curso.pptx_r2_key?.trim();
    return pptxKey ? (pptxKey.split('/').pop() ?? pptxKey) : null;
  }

  if (curso?.tipo_conteudo === 'scorm') {
    return curso.scorm_launch_file?.trim() ? `Arquivo inicial: ${curso.scorm_launch_file}` : null;
  }

  if (curso?.tipo_conteudo === 'h5p') {
    return curso.scorm_package_r2_prefix?.trim() ? 'Pacote H5P salvo no storage' : null;
  }

  return null;
}

function impactsCompliance(
  curso: Pick<
    LmsCurso,
    'gerar_qualificacao_ao_concluir' | 'qualificacao_tipo_id' | 'qualificacao_tipo_nome'
  >,
) {
  return (
    curso.gerar_qualificacao_ao_concluir === 1 &&
    Boolean(curso.qualificacao_tipo_id || curso.qualificacao_tipo_nome)
  );
}

function getEnrollmentProgress(
  matricula?: Pick<LmsMatricula, 'progresso_pct' | 'progresso_efetivo' | 'status'> | null,
) {
  if (!matricula) return 0;
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

function getEnrollmentDeadlineMeta(dataExpiracao?: string | null) {
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
      className: 'border-rose-200 bg-rose-50 text-rose-700',
      pulseClassName: '',
      icon: <AlertCircle className="h-3 w-3" />,
    };
  }

  if (diffDays <= 7) {
    return {
      label: `Vence em ${diffDays}d`,
      className: 'border-orange-200 bg-orange-50 text-orange-700',
      pulseClassName: 'animate-pulse',
      icon: <Clock className="h-3 w-3" />,
    };
  }

  if (diffDays <= 30) {
    return {
      label: `Vence em ${diffDays}d`,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
      pulseClassName: '',
      icon: <Clock className="h-3 w-3" />,
    };
  }

  return {
    label: `Vence em ${diffDays}d`,
    className: 'border-slate-200 bg-slate-50 text-slate-600',
    pulseClassName: '',
    icon: <Clock className="h-3 w-3" />,
  };
}

function mergeCourseIntoCache(qc: ReturnType<typeof useQueryClient>, nextCourse: LmsCurso) {
  qc.setQueryData(lmsKeys.curso(nextCourse.id), nextCourse);
  qc.setQueriesData<{ data: LmsCurso[]; total: number }>(
    { queryKey: ['lms', 'cursos'], exact: false },
    (current) => {
      if (!current?.data?.length) {
        return current;
      }

      let found = false;
      const data = current.data.map((course) => {
        if (course.id !== nextCourse.id) {
          return course;
        }

        found = true;
        return { ...course, ...nextCourse };
      });

      if (!found) {
        return current;
      }

      return { ...current, data };
    },
  );
}

// ── Drawer sub-components ───────────────────────────────────────────────────

const fieldCls =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';
const textareaCls =
  'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

function DrawerSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
      {label}
      {required ? ' *' : ''}
    </label>
  );
}
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-rose-600">{message}</p>;
}

function ContentDropzone({
  file,
  onFileChange,
  accept,
  helper,
  disabled,
}: {
  file: File | null;
  onFileChange: (f: File | null) => void;
  accept: string;
  helper: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function pick(f: File | null) {
    onFileChange(f);
    if (inputRef.current) inputRef.current.value = '';
  }
  return (
    <div
      className={`rounded-2xl border border-dashed p-5 transition ${dragging ? 'border-primary bg-primary/5' : 'border-slate-300 bg-slate-50/70'} ${disabled ? 'opacity-60' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) pick(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-2xl bg-white p-4">
          <UploadCloud className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Arraste o arquivo aqui ou selecione manualmente
          </p>
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        </div>
        <Button
          variant="secondary"
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Selecionar arquivo
        </Button>
      </div>
      {file ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {file.type || 'Arquivo binário'} · {formatFileSize(file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => pick(null)}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ThumbnailDropzone({
  file,
  previewUrl,
  onFileChange,
  disabled,
}: {
  file: File | null;
  previewUrl: string | null;
  onFileChange: (f: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  function pick(f: File | null) {
    onFileChange(f);
    if (inputRef.current) inputRef.current.value = '';
  }
  return (
    <div
      className={`rounded-2xl border border-dashed p-4 transition ${dragging ? 'border-primary bg-primary/5' : 'border-slate-300 bg-slate-50/80'} ${disabled ? 'opacity-60' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) pick(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        disabled={disabled}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr] lg:items-center">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 aspect-[16/9]">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Capa"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.4),_transparent_35%),linear-gradient(135deg,_#0f172a_0%,_#111827_100%)] text-white/80">
              <ImagePlus className="h-8 w-8" />
              <p className="px-6 text-center text-sm font-medium">Adicione uma capa</p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Capa do curso</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">PNG, JPG, WEBP ou GIF até 5 MB.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              {previewUrl ? 'Trocar imagem' : 'Selecionar imagem'}
            </Button>
            {file ? (
              <Button variant="ghost" type="button" disabled={disabled} onClick={() => pick(null)}>
                Limpar
              </Button>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            {file ? `${file.name} · ${formatFileSize(file.size)}` : 'Nenhum arquivo selecionado.'}
          </div>
        </div>
      </div>
    </div>
  );
}

function CourseDrawer({
  initial,
  onClose,
  onPreview,
  onSave,
  isSaving,
  uploadProgress,
  uploadStatus,
  availableSetores,
}: {
  initial?: LmsCurso;
  onClose: () => void;
  onPreview?: () => void;
  onSave: (
    form: CreateCursoDTO,
    assets: { contentFile: File | null; thumbnailFile: File | null; skipPurge: boolean },
  ) => Promise<void>;
  isSaving: boolean;
  uploadProgress: number;
  uploadStatus: string;
  availableSetores: { id: number; nome: string }[];
}) {
  const { tipos: qualTipos } = useQualificacaoTipos(true, 500);
  const { data: latestCourse } = useLmsCurso(initial?.id ?? 0);
  const courseSnapshot = latestCourse ?? initial;
  const storedThumbPreview = useLmsCourseThumbnailUrl(courseSnapshot);
  const [form, setForm] = useState<CreateCursoDTO>(() => buildInitialForm(initial));
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [skipPurge, setSkipPurge] = useState(false);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(storedThumbPreview);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isRefreshingTemplate, setIsRefreshingTemplate] = useState(false);
  const isEditing = Boolean(initial?.id);
  const hasContent = form.tipo_conteudo !== 'video';
  const eadTipos = useMemo(() => qualTipos.filter(isEadTipo), [qualTipos]);
  const curTipo = useMemo(
    () => qualTipos.find((t) => sameTipoId(form.qualificacao_tipo_id, t.id)),
    [form.qualificacao_tipo_id, qualTipos],
  );

  const prevQualTipoIdRef = React.useRef<number | null | undefined>(form.qualificacao_tipo_id);
  useEffect(() => {
    const prev = prevQualTipoIdRef.current;
    prevQualTipoIdRef.current = form.qualificacao_tipo_id;
    if (prev === form.qualificacao_tipo_id) return;
    if (!curTipo?.setores || curTipo.setores.length === 0) return;
    const currentSetorIds = form.setor_ids ?? [];
    if (currentSetorIds.length === 0) {
      const suggested = curTipo.setores
        .map((s) => s.id)
        .filter((id) => availableSetores.some((a) => a.id === id));
      if (suggested.length > 0) {
        setForm((c) => ({ ...c, setor_ids: suggested }));
      }
    }
  }, [form.qualificacao_tipo_id, curTipo, availableSetores]);
  const hasLegacy =
    form.gerar_qualificacao_ao_concluir === 1 && Boolean(curTipo) && !isEadTipo(curTipo!);
  const storedContentLabel = getStoredContentLabel(courseSnapshot);
  const isReplacingExistingContent = Boolean(
    hasContent && contentFile && courseSnapshot && supportsContentPreview(courseSnapshot),
  );
  const availTipos = useMemo(() => {
    if (!curTipo || isEadTipo(curTipo)) return eadTipos;
    return [curTipo, ...eadTipos.filter((t) => !sameTipoId(t.id, curTipo.id))];
  }, [curTipo, eadTipos]);

  useEffect(() => {
    if (!thumbFile) {
      setThumbPreview(storedThumbPreview);
      return;
    }
    const url = URL.createObjectURL(thumbFile);
    setThumbPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [storedThumbPreview, thumbFile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    await onSave(form, { contentFile, thumbnailFile: thumbFile, skipPurge });
  }

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const contentMeta = getTypeMeta(form.tipo_conteudo);
  const publicationMeta = getMatriculaStatusMeta(form.publicado === 1 ? 'PUBLICADO' : 'RASCUNHO');
  const safeClose = () => {
    if (isSaving) return;
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px] animate-fade-in"
      onClick={safeClose}
    >
      <div className="flex min-h-full w-full overflow-y-auto overscroll-y-contain p-3 sm:p-6">
        <div
          className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:my-auto sm:max-h-[calc(100dvh-3rem)] animate-scale-in"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {isEditing ? 'Edição de curso' : 'Novo curso'}
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  {isEditing ? `Refinando ${initial?.titulo}` : 'Criar curso'}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${contentMeta.chipClass}`}
                  >
                    {contentMeta.icon}
                    {contentMeta.label}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${publicationMeta.className}`}
                  >
                    {publicationMeta.label}
                  </span>
                  {form.gerar_qualificacao_ao_concluir === 1 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Gera qualificação
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {courseSnapshot && supportsContentPreview(courseSnapshot) ? (
                  <Button variant="primary" type="button" onClick={onPreview}>
                    <Play className="h-4 w-4" />
                    Abrir player
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={safeClose}
                  disabled={isSaving}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/40"
          >
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.95fr)]">
                <div className="space-y-5">
                  <DrawerSection
                    title="1. Informações básicas"
                    description="Título, contexto, categoria e carga horária."
                  >
                    <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
                      <div className="space-y-2">
                        <FieldLabel label="Título" required />
                        <input
                          value={form.titulo}
                          onChange={(e) => setForm((c) => ({ ...c, titulo: e.target.value }))}
                          className={fieldCls}
                          placeholder="Ex.: CRM, Fatores Humanos"
                        />
                        <FieldError message={errors.titulo} />
                      </div>
                      <div className="space-y-2">
                        <FieldLabel label="Tipo de conteúdo" />
                        <select
                          value={form.tipo_conteudo ?? 'scorm'}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              tipo_conteudo: e.target.value as TipoConteudo,
                              scorm_versao:
                                e.target.value === 'video' ? null : (c.scorm_versao ?? '1.2'),
                            }))
                          }
                          className={fieldCls}
                        >
                          <option value="scorm">SCORM</option>
                          <option value="h5p">H5P</option>
                          <option value="video">Vídeo</option>
                          <option value="pdf">PDF</option>
                          <option value="pptx">PowerPoint (PPTX)</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <FieldLabel label="Descrição" />
                      <textarea
                        rows={4}
                        value={form.descricao ?? ''}
                        onChange={(e) => setForm((c) => ({ ...c, descricao: e.target.value }))}
                        className={textareaCls}
                        placeholder="Objetivo, público-alvo e o que será aprendido."
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <FieldLabel label="Categoria" />
                        <select
                          value={form.categoria ?? ''}
                          onChange={(e) =>
                            setForm((c) => ({ ...c, categoria: e.target.value || null }))
                          }
                          className={fieldCls}
                        >
                          <option value="">Categoria</option>
                          {DEFAULT_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <FieldLabel label="Carga horária (min)" />
                        <input
                          type="number"
                          min={0}
                          value={form.carga_horaria_minutos ?? ''}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              carga_horaria_minutos: e.target.value ? Number(e.target.value) : null,
                            }))
                          }
                          className={fieldCls}
                        />
                      </div>
                      <div className="space-y-2">
                        <FieldLabel label="Versão / nota mínima" />
                        <div className="grid grid-cols-2 gap-3">
                          <select
                            value={form.scorm_versao ?? '1.2'}
                            onChange={(e) =>
                              setForm((c) => ({
                                ...c,
                                scorm_versao: e.target.value as '1.2' | '2004',
                              }))
                            }
                            disabled={form.tipo_conteudo === 'video'}
                            className={`${fieldCls} disabled:bg-slate-100`}
                          >
                            <option value="1.2">SCORM 1.2</option>
                            <option value="2004">SCORM 2004</option>
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={form.scorm_mastery_score ?? 70}
                            onChange={(e) =>
                              setForm((c) => ({
                                ...c,
                                scorm_mastery_score: Number(e.target.value),
                              }))
                            }
                            className={fieldCls}
                          />
                        </div>
                        <FieldError message={errors.scorm_mastery_score} />
                      </div>
                    </div>
                    {availableSetores.length > 0 && (
                      <div className="space-y-2">
                        <FieldLabel label="Setor" />
                        <div className="flex flex-wrap gap-2">
                          {availableSetores.map((s) => {
                            const selected = (form.setor_ids ?? []).includes(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() =>
                                  setForm((c) => {
                                    const ids = c.setor_ids ?? [];
                                    return {
                                      ...c,
                                      setor_ids: selected
                                        ? ids.filter((id) => id !== s.id)
                                        : [...ids, s.id],
                                    };
                                  })
                                }
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition border ${
                                  selected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600'
                                }`}
                              >
                                {s.nome}
                              </button>
                            );
                          })}
                        </div>
                        {curTipo?.setores && curTipo.setores.length > 0 && (
                          <p className="text-xs text-slate-500">
                            Sugestão da qualificação:{' '}
                            {curTipo.setores.map((s) => s.nome).join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </DrawerSection>

                  <DrawerSection
                    title="2. Currículo e equivalência EAD"
                    description="Tipo EAD define a qualificação emitida ao concluir."
                  >
                    {curTipo ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-emerald-950">
                              {curTipo.nome}
                              {curTipo.codigo ? ` (${curTipo.codigo})` : ''}
                            </p>
                            <p className="mt-1 text-sm text-emerald-800">
                              Categoria {curTipo.categoria ?? 'EAD'}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            type="button"
                            disabled={isSaving || isRefreshingTemplate}
                            onClick={async () => {
                              if (!form.qualificacao_tipo_id) {
                                toast.error('Selecione um tipo EAD antes de atualizar os dados.');
                                return;
                              }

                              setIsRefreshingTemplate(true);
                              try {
                                const freshTipo = await fetchFreshQualificacaoTipoById(
                                  form.qualificacao_tipo_id,
                                );
                                const tipoParaCopiar = freshTipo ?? curTipo;

                                if (!tipoParaCopiar) {
                                  toast.error('Tipo EAD não encontrado para atualização.');
                                  return;
                                }

                                setForm((c) => applyQualTemplate(c, tipoParaCopiar, true));
                                toast.success('Dados do tipo EAD atualizados no curso.');
                              } catch (error) {
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : 'Erro ao atualizar dados do tipo EAD',
                                );
                              } finally {
                                setIsRefreshingTemplate(false);
                              }
                            }}
                          >
                            <BadgeCheck className="h-4 w-4" />
                            {isRefreshingTemplate ? 'Atualizando...' : 'Copiar dados'}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2 lg:col-span-2">
                        <FieldLabel label="Conteúdo programático" />
                        <textarea
                          rows={5}
                          value={form.conteudo_programatico ?? ''}
                          onChange={(e) =>
                            setForm((c) => ({ ...c, conteudo_programatico: e.target.value }))
                          }
                          className={textareaCls}
                        />
                      </div>
                      <div className="space-y-2">
                        <FieldLabel label="Carga inicial (h)" />
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          value={form.carga_horaria_inicial_horas ?? ''}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              carga_horaria_inicial_horas: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }))
                          }
                          className={fieldCls}
                        />
                      </div>
                      <div className="space-y-2">
                        <FieldLabel label="Carga recorrente (h)" />
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          value={form.carga_horaria_recorrente_horas ?? ''}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              carga_horaria_recorrente_horas: e.target.value
                                ? Number(e.target.value)
                                : null,
                            }))
                          }
                          className={fieldCls}
                        />
                      </div>
                      <div className="space-y-2 lg:col-span-2">
                        <FieldLabel label="Observações" />
                        <textarea
                          rows={3}
                          value={form.observacoes ?? ''}
                          onChange={(e) => setForm((c) => ({ ...c, observacoes: e.target.value }))}
                          className={textareaCls}
                        />
                      </div>
                    </div>
                  </DrawerSection>

                  {hasContent ? (
                    <DrawerSection
                      title="3. Conteúdo"
                      description="Pacote enviado para armazenamento seguro."
                    >
                      <ContentDropzone
                        file={contentFile}
                        onFileChange={setContentFile}
                        accept={
                          form.tipo_conteudo === 'h5p'
                            ? '.h5p'
                            : form.tipo_conteudo === 'pdf'
                              ? '.pdf'
                              : form.tipo_conteudo === 'pptx'
                                ? '.pptx,.ppt'
                                : '.zip'
                        }
                        helper={
                          form.tipo_conteudo === 'h5p'
                            ? 'Arquivo .h5p.'
                            : form.tipo_conteudo === 'pdf'
                              ? 'PDF até 200 MB.'
                              : form.tipo_conteudo === 'pptx'
                                ? 'PPTX até 200 MB.'
                                : 'Pacote .zip SCORM.'
                        }
                        disabled={isSaving}
                      />
                      {isReplacingExistingContent ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          <p className="font-semibold">Substituindo conteúdo atual</p>
                          <p className="mt-1 text-amber-800">
                            Atual: {storedContentLabel ?? 'conteúdo já publicado'}
                          </p>
                          <p className="mt-1 text-amber-800">Novo envio: {contentFile?.name}</p>
                          {form.tipo_conteudo === 'scorm' || form.tipo_conteudo === 'h5p' ? (
                            <label className="mt-3 flex cursor-pointer items-center gap-2 text-amber-900">
                              <input
                                type="checkbox"
                                checked={skipPurge}
                                onChange={(e) => setSkipPurge(e.target.checked)}
                                className="rounded"
                              />
                              <span className="text-xs">
                                Preservar arquivos existentes no storage (modo merge — use para
                                upload incremental de arquivos grandes)
                              </span>
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                      {courseSnapshot ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                          <div>
                            Estado atual:{' '}
                            {supportsContentPreview(courseSnapshot)
                              ? 'pronto para preview'
                              : 'sem pacote válido'}
                          </div>
                          {storedContentLabel ? (
                            <div className="mt-1 break-all text-xs text-slate-500">
                              Arquivo salvo: {storedContentLabel}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {isSaving ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                            <span>{uploadStatus || 'Processando e enviando conteúdo...'}</span>
                            <span>{Math.max(0, uploadProgress)}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-slate-900 transition-all"
                              style={{ width: `${Math.max(4, uploadProgress)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            Não feche esta janela até a confirmação de conclusão.
                          </p>
                        </div>
                      ) : null}
                    </DrawerSection>
                  ) : null}
                </div>

                <div className="space-y-5">
                  <DrawerSection
                    title="4. Apresentação visual"
                    description="Capa usada no catálogo e nas vitrines internas."
                  >
                    <ThumbnailDropzone
                      file={thumbFile}
                      previewUrl={thumbPreview}
                      onFileChange={setThumbFile}
                      disabled={isSaving}
                    />
                  </DrawerSection>

                  <DrawerSection
                    title="5. Conclusão e publicação"
                    description="Qualificação EAD, status e prontidão do curso."
                  >
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              Gerar qualificação EAD
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              Vincula a um tipo de qualificação EAD.
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={form.gerar_qualificacao_ao_concluir === 1}
                            onChange={(e) =>
                              setForm((c) => ({
                                ...c,
                                gerar_qualificacao_ao_concluir: e.target.checked ? 1 : 0,
                                qualificacao_tipo_id: e.target.checked
                                  ? c.qualificacao_tipo_id
                                  : null,
                              }))
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </div>
                        {form.gerar_qualificacao_ao_concluir === 1 ? (
                          <div className="mt-4 space-y-2">
                            <FieldLabel label="Tipo EAD" required />
                            <select
                              value={form.qualificacao_tipo_id ?? ''}
                              onChange={(e) => {
                                const sel = availTipos.find((t) =>
                                  sameTipoId(t.id, e.target.value),
                                );
                                setForm((c) =>
                                  sel
                                    ? applyQualTemplate(c, sel, false)
                                    : {
                                        ...c,
                                        qualificacao_tipo_id: e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      },
                                );
                              }}
                              className={fieldCls}
                              disabled={availTipos.length === 0}
                            >
                              <option value="">
                                {availTipos.length > 0 ? 'Selecionar tipo EAD' : 'Nenhum tipo EAD'}
                              </option>
                              {availTipos.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.nome}
                                  {t.codigo ? ` (${t.codigo})` : ''}
                                  {!isEadTipo(t) ? ' — legado' : ''}
                                </option>
                              ))}
                            </select>
                            <FieldError message={errors.qualificacao_tipo_id} />
                            {hasLegacy ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                Tipo legado fora da categoria EAD.
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Publicado</p>
                            <p className="mt-1 text-sm text-slate-500">
                              Visível no catálogo de alunos.
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={form.publicado === 1}
                            onChange={(e) =>
                              setForm((c) => ({ ...c, publicado: e.target.checked ? 1 : 0 }))
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                          <LmsStatPill
                            status={getMatriculaStatusMeta(
                              form.publicado === 1 ? 'PUBLICADO' : 'RASCUNHO',
                            )}
                          />
                          <span className="text-sm text-slate-500">
                            {form.publicado === 1
                              ? 'Visível no catálogo.'
                              : 'Rascunho — apenas gestão.'}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                        {supportsContentPreview(courseSnapshot ?? {})
                          ? 'O curso já possui conteúdo publicado e pode ser acessado no player.'
                          : hasContent
                            ? 'Envie o pacote para liberar o player e concluir a configuração operacional.'
                            : 'Este tipo de conteúdo não exige upload de pacote.'}
                      </div>
                    </div>
                  </DrawerSection>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button variant="secondary" type="button" onClick={safeClose} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button variant="primary" type="submit" loading={isSaving}>
                  {isEditing
                    ? isReplacingExistingContent
                      ? 'Substituir conteúdo'
                      : 'Salvar alterações'
                    : 'Criar curso'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Course card ─────────────────────────────────────────────────────────────

function CourseCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="p-4 pb-0">
        <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="flex flex-1 flex-col p-4 pt-3">
        <div>
          <div className="min-h-[2.5rem]">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="mt-2 flex min-h-[1.5rem] gap-1.5">
            <div className="h-5 w-14 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="h-5 w-12 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
        <div className="flex-1" />
        <div className="pt-3 space-y-2">
          <div className="h-9 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );
}

function CourseCard({
  curso,
  matricula,
  canManage,
  canUpdateCourse,
  canDeleteCourse,
  managementRestricted,
  pendingDeleteId,
  deleteLoading,
  onAction,
  onEdit,
  onTogglePublication,
  onStartDelete,
  onCancelDelete,
  onDelete,
}: {
  curso: LmsCurso;
  matricula?: LmsMatricula;
  canManage: boolean;
  canUpdateCourse: boolean;
  canDeleteCourse: boolean;
  managementRestricted: boolean;
  pendingDeleteId: number | null;
  deleteLoading: boolean;
  onAction: (c: LmsCurso) => void;
  onEdit: (c: LmsCurso) => void;
  onTogglePublication: (c: LmsCurso) => void;
  onStartDelete: (id: number) => void;
  onCancelDelete: () => void;
  onDelete: (c: LmsCurso) => void;
}) {
  const navigate = useNavigate();
  const typeMeta = getTypeMeta(curso.tipo_conteudo);
  const previewPath = canManage ? getAdminCoursePreviewPath(curso) : null;
  const enrollmentProgress = getEnrollmentProgress(matricula);
  const deadlineMeta = !canManage ? getEnrollmentDeadlineMeta(matricula?.data_expiracao) : null;
  const statusMeta = canManage
    ? getMatriculaStatusMeta(curso.publicado ? 'PUBLICADO' : 'RASCUNHO')
    : !matricula || matricula.status === 'CANCELADO'
      ? getMatriculaStatusMeta('DISPONIVEL')
      : getMatriculaStatusMeta(matricula.status);
  const actionLabel = canManage
    ? previewPath
      ? 'Abrir preview'
      : 'Abrir detalhes'
    : !matricula || matricula.status === 'CANCELADO'
      ? 'Iniciar'
      : matricula.status === 'CONCLUIDO'
        ? 'Rever'
        : 'Continuar';
  const isDeleting = pendingDeleteId === curso.id;
  const complianceCourse = impactsCompliance(curso);
  const isConcluido = !canManage && matricula?.status === 'CONCLUIDO';
  const isEmAndamento = !canManage && matricula?.status === 'EM_ANDAMENTO';
  const isNaoIniciado =
    !canManage &&
    (!matricula || matricula.status === 'NAO_INICIADO' || matricula.status === 'CANCELADO');

  const gridBorderCls =
    isNaoIniciado || isEmAndamento || isConcluido
      ? getLmsGridCardBorderClasses(matricula?.status ?? 'NAO_INICIADO')
      : complianceCourse
        ? 'border-amber-200'
        : 'border-slate-200';

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg dark:bg-slate-900 dark:shadow-none ${gridBorderCls}`}
    >
      <div className="p-4 pb-0">
        <div className="relative">
          <LmsCourseArtwork
            curso={curso}
            progress={
              !canManage ? (matricula ? getEnrollmentProgress(matricula) : undefined) : undefined
            }
          />
          <div className="pointer-events-none absolute top-2 right-2 z-10">
            <LmsStatPill status={statusMeta} />
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4 pt-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-slate-950 dark:text-slate-100">
            {curso.titulo}
          </h3>
          <div className="mt-2 flex min-h-[1.5rem] flex-wrap gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeMeta.chipClass}`}
            >
              {typeMeta.icon}
              {typeMeta.label}
            </span>
            {curso.categoria ? (
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {curso.categoria}
              </span>
            ) : null}
            {curso.setores && curso.setores.length > 0
              ? curso.setores.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                  >
                    {s.nome}
                  </span>
                ))
              : null}
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {formatMinutes(curso.carga_horaria_minutos)}
            </span>
          </div>
        </div>
        <div className="flex-1">
          {complianceCourse && curso.qualificacao_tipo_nome ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0" />
              Qualificação {curso.qualificacao_tipo_nome}
              {curso.qualificacao_tipo_codigo ? ` (${curso.qualificacao_tipo_codigo})` : ''}
            </div>
          ) : null}
          {!canManage && matricula && matricula.status !== 'CANCELADO' ? (
            <div className="mt-2 space-y-2">
              {deadlineMeta ? (
                <div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${deadlineMeta.className} ${deadlineMeta.pulseClassName}`}
                  >
                    {deadlineMeta.icon}
                    {deadlineMeta.label}
                  </span>
                </div>
              ) : null}
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                <span>Progresso</span>
                <span>{getLmsProgressLabel(matricula.status, enrollmentProgress)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${getLmsProgressBarFillClasses(matricula.status)}`}
                  style={{ width: `${enrollmentProgress}%` }}
                />
              </div>
            </div>
          ) : null}
          {canManage ? (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {curso.total_matriculas ?? 0} matrícula(s)
              </span>
              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {curso.total_concluidos ?? 0} concluído(s)
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 font-semibold ${supportsContentPreview(curso) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200'}`}
              >
                {supportsContentPreview(curso) ? 'Player pronto' : 'Sem pacote'}
              </span>
            </div>
          ) : null}
        </div>
        {isDeleting ? (
          <div className="space-y-3 pt-3">
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              Confirmar exclusão? Conteúdo e vínculos serão removidos.
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onCancelDelete}>
                Cancelar
              </Button>
              <Button variant="danger" loading={deleteLoading} onClick={() => onDelete(curso)}>
                Confirmar
              </Button>
            </div>
          </div>
        ) : (
          <div className="pt-3 space-y-2">
            <div className="flex gap-2">
              {canManage ? (
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    if (previewPath) {
                      navigate(previewPath);
                      return;
                    }
                    onAction(curso);
                  }}
                >
                  <Play className="h-4 w-4" />
                  {actionLabel}
                </Button>
              ) : (
                <button
                  onClick={() => onAction(curso)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${getLmsActionButtonClasses(matricula?.status ?? 'NAO_INICIADO')}`}
                >
                  {isConcluido ? <Eye className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {getLmsActionLabel(matricula?.status ?? 'NAO_INICIADO')}
                </button>
              )}
              <Button variant="secondary" onClick={() => navigate(`/lms/cursos/${curso.id}`)}>
                <Eye className="h-4 w-4" />
              </Button>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-1.5">
                {canUpdateCourse ? (
                  <button
                    type="button"
                    onClick={() => onEdit(curso)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                    Editar
                  </button>
                ) : null}
                {canUpdateCourse ? (
                  <button
                    type="button"
                    onClick={() => onTogglePublication(curso)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {curso.publicado ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        Rascunho
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        Publicar
                      </>
                    )}
                  </button>
                ) : null}
                <Link
                  to={`/lms/matriculas/${curso.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Users className="h-3.5 w-3.5" />
                  Matrículas
                </Link>
                {canDeleteCourse ? (
                  <button
                    type="button"
                    onClick={() => onStartDelete(curso.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {managementRestricted ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Somente leitura: curso fora do seu escopo operacional.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function LmsCatalogo() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, isGestor, isAluno, isInstrutor } = usePermissions();
  const operationalAccess = useOperationalAccess();
  const funcionarioId = user?.funcionario_id ? Number(user.funcionario_id) : null;
  const canManage = isAdmin || isGestor;
  const restrictToEnrolledCourses = isAluno || isInstrutor;
  const roleView = resolveLmsCatalogRoleView({ canManage, restrictToEnrolledCourses });
  const showAdministrativeFilters = roleView.showAdministrativeFilters;

  const [tab, setTab] = useState<TabId>(restrictToEnrolledCourses ? 'meus' : 'catalogo');

  // Gestores também podem atuar como alunos: na aba "Meus cursos" têm acesso ao
  // fluxo de aluno (iniciar/continuar/concluir), mantendo a gestão na aba "Catálogo".
  const gestorStudentMode = isGestor && tab === 'meus';
  const studentMode = restrictToEnrolledCourses || gestorStudentMode;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TipoConteudo>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | MatriculaStatus>('all');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'critical'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const { data: setoresData } = useApi<{ id: number; nome: string }[]>('/setores');
  const setores = setoresData ?? [];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<LmsCurso | undefined>();
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isSavingCourse, setIsSavingCourse] = useState(false);

  const catalogSetor_ids = sectorFilter !== 'all' ? [Number(sectorFilter)] : undefined;
  const { data: publishedCoursesResponse, isLoading: loadingPublishedCourses } = useLmsCursos({
    publicados: true,
    limit: 300,
    setor_ids: catalogSetor_ids,
  });
  const { data: draftCoursesResponse, isLoading: loadingDraftCourses } = useLmsCursos(
    {
      publicados: false,
      limit: 300,
      setor_ids: catalogSetor_ids,
    },
    { enabled: canManage },
  );
  const { data: matriculas, isLoading: loadingMatriculas } = useMinhasMatriculas();
  const matricular = useMatricularCurso();
  const createCurso = useCreateCurso();
  const updateCurso = useUpdateCurso();
  const deleteCurso = useDeleteCurso();
  const syncEad = useSyncEadCursos();
  const uploadThumb = useUploadCursoThumbnail();

  const courses = useMemo(() => {
    if (!canManage) {
      return publishedCoursesResponse?.data ?? [];
    }

    const byId = new Map<number, LmsCurso>();
    for (const curso of publishedCoursesResponse?.data ?? []) {
      byId.set(curso.id, curso);
    }
    for (const curso of draftCoursesResponse?.data ?? []) {
      byId.set(curso.id, curso);
    }

    return [...byId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [canManage, draftCoursesResponse?.data, publishedCoursesResponse?.data]);
  const loadingCourses = canManage
    ? loadingPublishedCourses || loadingDraftCourses
    : loadingPublishedCourses;
  const myMatriculas = matriculas ?? [];
  const matriculasByCurso = new Map(myMatriculas.map((m) => [m.curso_id, m]));
  const enrolledIds = new Set(
    myMatriculas.filter((m) => m.status !== 'CANCELADO').map((m) => m.curso_id),
  );
  const categories = useMemo(
    () => [...new Set(courses.map((c) => c.categoria).filter(Boolean))],
    [courses],
  );

  const editCourseParam = searchParams.get('edit');

  useEffect(() => {
    if (!canManage || !editCourseParam || loadingCourses) return;

    const editCourseId = Number(editCourseParam);
    if (!Number.isFinite(editCourseId) || editCourseId <= 0) return;

    const courseToEdit = courses.find((curso) => curso.id === editCourseId);
    if (!courseToEdit) return;

    setEditingCourse(courseToEdit);
    setDrawerOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('edit');
    setSearchParams(nextParams, { replace: true });
  }, [canManage, courses, editCourseParam, loadingCourses, searchParams, setSearchParams]);

  useEffect(() => {
    if (!canManage || loadingCourses) return;
    if (searchParams.get('new') !== '1') return;

    setEditingCourse(undefined);
    setDrawerOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('new');
    setSearchParams(nextParams, { replace: true });
  }, [canManage, loadingCourses, searchParams, setSearchParams]);

  const visibleCourses = courses.filter((curso) => {
    const mat = matriculasByCurso.get(curso.id);
    const matchTab = restrictToEnrolledCourses
      ? enrolledIds.has(curso.id)
      : tab === 'catalogo' || enrolledIds.has(curso.id);
    const matchSearch =
      !search ||
      [curso.titulo, curso.descricao ?? '', curso.categoria ?? '']
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || curso.tipo_conteudo === typeFilter;
    const matchCat = categoryFilter === 'all' || curso.categoria === categoryFilter;
    const matchCompliance = complianceFilter === 'all' || impactsCompliance(curso);
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'NAO_INICIADO'
        ? !mat || mat.status === 'NAO_INICIADO'
        : mat?.status === statusFilter);
    return matchTab && matchSearch && matchType && matchCat && matchCompliance && matchStatus;
  });

  function navPlayer(curso: LmsCurso, matriculaId: number) {
    if (curso.tipo_conteudo === 'h5p') {
      navigate(`/lms/player/h5p/${matriculaId}`);
      return;
    }
    if (curso.tipo_conteudo === 'pdf') {
      navigate(`/lms/player/pdf/${matriculaId}`);
      return;
    }
    if (curso.tipo_conteudo === 'pptx') {
      navigate(`/lms/player/pptx/${matriculaId}`);
      return;
    }
    navigate(`/lms/player/${matriculaId}`);
  }

  async function handleCardAction(curso: LmsCurso) {
    if (canManage && !studentMode) {
      navigate(`/lms/cursos/${curso.id}`);
      return;
    }
    const mat = matriculasByCurso.get(curso.id);
    if (mat && mat.status !== 'CANCELADO') {
      if (mat.status === 'CONCLUIDO') {
        const base =
          curso.tipo_conteudo === 'h5p'
            ? `/lms/player/h5p/${mat.id}`
            : curso.tipo_conteudo === 'pdf'
              ? `/lms/player/pdf/${mat.id}`
              : curso.tipo_conteudo === 'pptx'
                ? `/lms/player/pptx/${mat.id}`
                : `/lms/player/${mat.id}`;
        navigate(`${base}?review=1`);
        return;
      } else navPlayer(curso, mat.id);
      return;
    }
    if (!funcionarioId) {
      toast.error('Usuário sem vínculo de funcionário.');
      return;
    }
    try {
      const created = await matricular.mutateAsync({
        funcionario_id: funcionarioId,
        curso_id: curso.id,
      });
      navPlayer(curso, created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar treinamento');
    }
  }

  async function handleTogglePub(curso: LmsCurso) {
    try {
      await updateCurso.mutateAsync({ id: curso.id, publicado: curso.publicado ? 0 : 1 });
      toast.success(curso.publicado ? 'Curso movido para rascunho.' : 'Curso publicado.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar publicação');
    }
  }

  async function handleDelete(curso: LmsCurso) {
    try {
      await deleteCurso.mutateAsync(curso.id);
      toast.success(`Curso ${curso.titulo} removido.`);
      setPendingDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover curso');
    }
  }

  async function handleSave(
    form: CreateCursoDTO,
    assets: { contentFile: File | null; thumbnailFile: File | null; skipPurge: boolean },
  ) {
    setUploadProgress(0);
    setUploadStatus('');
    setIsSavingCourse(true);
    try {
      let cursoId: number;
      let nextCourseSnapshot: LmsCurso;
      if (editingCourse) {
        const updated = await updateCurso.mutateAsync({ ...form, id: editingCourse.id });
        cursoId = updated.id;
        nextCourseSnapshot = updated;
      } else {
        const created = await createCurso.mutateAsync(form);
        cursoId = created.id;
        nextCourseSnapshot = created;
      }
      if (assets.thumbnailFile) {
        setUploadStatus('Enviando capa');
        toast.info('Upload da capa em andamento...');
        const thumbResult = await uploadThumb.mutateAsync({
          cursoId,
          file: assets.thumbnailFile,
          onProgress: setUploadProgress,
        });
        nextCourseSnapshot = {
          ...nextCourseSnapshot,
          thumbnail_r2_key: thumbResult.thumbnail_r2_key,
          version_tag: thumbResult.version_tag,
        };
      }
      if (assets.contentFile && form.tipo_conteudo !== 'video') {
        setUploadProgress(5);
        setUploadStatus(
          editingCourse && supportsContentPreview(editingCourse)
            ? 'Substituindo conteúdo atual'
            : 'Preparando pacote',
        );
        toast.info('Upload de conteúdo iniciado. Aguarde a finalização.');
        if (form.tipo_conteudo === 'pdf' || form.tipo_conteudo === 'pptx') {
          const upload = await uploadSimpleFile({
            cursoId,
            tipo: form.tipo_conteudo,
            file: assets.contentFile,
            onProgress: setUploadProgress,
            onStatus: setUploadStatus,
          });

          nextCourseSnapshot = {
            ...nextCourseSnapshot,
            tipo_conteudo: form.tipo_conteudo ?? nextCourseSnapshot.tipo_conteudo,
            conteudo_arquivo_nome: assets.contentFile.name,
            pdf_r2_key:
              form.tipo_conteudo === 'pdf'
                ? upload.r2_key
                : (nextCourseSnapshot.pdf_r2_key ?? null),
            pptx_r2_key:
              form.tipo_conteudo === 'pptx'
                ? upload.r2_key
                : (nextCourseSnapshot.pptx_r2_key ?? null),
            pptx_slide_count:
              form.tipo_conteudo === 'pptx'
                ? (upload.slide_count ?? nextCourseSnapshot.pptx_slide_count)
                : nextCourseSnapshot.pptx_slide_count,
          };
        } else {
          const upload = await uploadStructuredLmsPackage({
            cursoId,
            tipoConteudo: form.tipo_conteudo as 'scorm' | 'h5p',
            file: assets.contentFile,
            skipPurge: assets.skipPurge,
            onProgress: setUploadProgress,
            onStatus: setUploadStatus,
          });

          nextCourseSnapshot = {
            ...nextCourseSnapshot,
            tipo_conteudo: form.tipo_conteudo ?? nextCourseSnapshot.tipo_conteudo,
            conteudo_arquivo_nome: assets.contentFile.name,
            scorm_package_r2_prefix:
              upload.prefix ?? nextCourseSnapshot.scorm_package_r2_prefix ?? null,
            scorm_launch_file:
              form.tipo_conteudo === 'scorm'
                ? (upload.launchFile ?? nextCourseSnapshot.scorm_launch_file ?? null)
                : null,
            scorm_versao:
              form.tipo_conteudo === 'scorm'
                ? (upload.scormVersao ?? nextCourseSnapshot.scorm_versao)
                : nextCourseSnapshot.scorm_versao,
          };
        }
      }
      setUploadProgress(100);
      setUploadStatus('Upload concluído com sucesso.');
      mergeCourseIntoCache(qc, nextCourseSnapshot);
      toast.success(editingCourse ? 'Curso atualizado.' : 'Curso criado.');
      setDrawerOpen(false);
      setEditingCourse(undefined);
      setUploadProgress(0);
      setUploadStatus('');
      // Mutation hooks (useUpdateCurso, useUploadCursoThumbnail, etc.) already
      // update caches and invalidate collections — no extra invalidation needed.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar curso');
      setUploadProgress(0);
      setUploadStatus('');
    } finally {
      setIsSavingCourse(false);
    }
  }

  const statsBar =
    canManage && !studentMode
      ? `${courses.length} cursos · ${courses.filter((c) => c.publicado === 1).length} publicados · ${courses.filter((c) => supportsContentPreview(c)).length} com conteúdo`
      : studentMode
        ? `${enrolledIds.size} curso${enrolledIds.size === 1 ? '' : 's'} matriculado${enrolledIds.size === 1 ? '' : 's'}`
        : `${courses.length} curso${courses.length === 1 ? '' : 's'} disponível${courses.length === 1 ? '' : 'eis'} no catálogo`;

  const managementActions = (
    <>
      <Button
        variant="secondary"
        onClick={() =>
          void syncEad
            .mutateAsync()
            .then((r: { created: number; updated: number }) =>
              toast.success(`${r.created} criado(s), ${r.updated} atualizado(s)`),
            )
            .catch((e: unknown) =>
              toast.error(e instanceof Error ? e.message : 'Erro ao sincronizar'),
            )
        }
        loading={syncEad.isPending}
      >
        <BadgeCheck className="h-4 w-4" />
        Sincronizar EAD
      </Button>
      <Button
        variant="primary"
        onClick={() => {
          setEditingCourse(undefined);
          setDrawerOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
        Novo curso
      </Button>
    </>
  );

  const tabToggle = (
    <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {(
        (restrictToEnrolledCourses
          ? [{ id: 'meus', label: 'Meus cursos' }]
          : [
              { id: 'catalogo', label: 'Catálogo' },
              { id: 'meus', label: 'Meus cursos' },
            ]) as Array<{ id: TabId; label: string }>
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setTab(item.id)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium ${
            tab === item.id
              ? 'bg-primary/10 text-primary'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const gestorModeToggle = (
    <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      {(
        [
          { id: 'catalogo', label: 'Gestão' },
          { id: 'meus', label: 'Aluno' },
        ] as Array<{ id: TabId; label: string }>
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setTab(item.id)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium ${
            tab === item.id
              ? 'bg-primary/10 text-primary'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <AppLayout>
      <LmsPageShell>
        <PageHeader
          className="mb-6"
          title={studentMode && canManage ? 'Meus treinamentos' : roleView.title}
          subtitle={statsBar}
          actions={
            isGestor ? (
              <div className="flex flex-wrap items-center gap-2">
                {gestorModeToggle}
                {tab === 'catalogo' ? managementActions : null}
              </div>
            ) : !canManage ? (
              tabToggle
            ) : (
              managementActions
            )
          }
        />
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <LmsModuleTabs canManage={canManage && !studentMode} />

          {showAdministrativeFilters && !studentMode ? (
            <div className="border-b border-slate-100 bg-slate-50/40 px-5 py-3 sm:px-6 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
                <label className="relative block">
                  <span className="sr-only">Buscar cursos</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por título, categoria ou descrição"
                    aria-label="Buscar cursos por título, categoria ou descrição"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </label>
                <label className="block">
                  <span className="sr-only">Filtrar por setor</span>
                  <select
                    value={sectorFilter}
                    onChange={(e) => setSectorFilter(e.target.value)}
                    aria-label="Filtrar por setor"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">Todos os setores</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="sr-only">Filtrar por tipo de conteúdo</span>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as 'all' | TipoConteudo)}
                    aria-label="Filtrar por tipo de conteúdo"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">Todos os tipos</option>
                    <option value="scorm">SCORM</option>
                    <option value="h5p">H5P</option>
                    <option value="video">Vídeo</option>
                    <option value="pdf">PDF</option>
                    <option value="pptx">PowerPoint</option>
                  </select>
                </label>
                <label className="block">
                  <span className="sr-only">Filtrar por categoria</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filtrar por categoria"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">Todas as categorias</option>
                    {categories.map((c) => (
                      <option key={c ?? 'SEM_CATEGORIA'} value={c ?? ''}>
                        {c || 'Sem categoria'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="sr-only">Filtrar por compliance</span>
                  <select
                    value={complianceFilter}
                    onChange={(e) => setComplianceFilter(e.target.value as 'all' | 'critical')}
                    aria-label="Filtrar por impacto em compliance"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">Todos os cursos</option>
                    <option value="critical">Impactam compliance</option>
                  </select>
                </label>
                <label className="block">
                  <span className="sr-only">Filtrar por status</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'all' | MatriculaStatus)}
                    aria-label="Filtrar por status da matrícula"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">Todos os status</option>
                    {!canManage ? <option value="NAO_INICIADO">Não iniciado</option> : null}
                    <option value="EM_ANDAMENTO">Em andamento</option>
                    <option value="CONCLUIDO">Concluído</option>
                    <option value="REPROVADO">Reprovado</option>
                  </select>
                </label>
              </div>
            </div>
          ) : null}

          {/* Course grid */}
          <div className="p-5 sm:p-6">
            {loadingCourses || loadingMatriculas ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <CourseCardSkeleton key={i} />
                ))}
              </div>
            ) : visibleCourses.length === 0 ? (
              <LmsEmptyState
                icon={<FileArchive className="h-8 w-8" />}
                title={
                  search ||
                  typeFilter !== 'all' ||
                  categoryFilter !== 'all' ||
                  statusFilter !== 'all'
                    ? 'Nenhum curso encontrado com os filtros'
                    : 'Nenhum curso disponível nesta visão'
                }
                description={
                  canManage && !studentMode
                    ? 'Crie um novo curso ou ajuste os filtros.'
                    : 'Aguarde a publicação de novos treinamentos.'
                }
                action={
                  canManage && !studentMode ? (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setEditingCourse(undefined);
                        setDrawerOpen(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Novo curso
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  {visibleCourses.length} curso{visibleCourses.length === 1 ? '' : 's'} nesta visão
                </p>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {visibleCourses.map((curso) => {
                    const courseManagementEnabled = canManage && !studentMode;
                    const canUpdateCourse = canMutateLmsCourse({
                      canManage: courseManagementEnabled,
                      operationalAccessReady: operationalAccess.isReady,
                      operationalRbacEnabled: operationalAccess.enabled,
                      setorIds: operationalAccess.setor_ids,
                      actions: operationalAccess.actions,
                      cursoDomain: curso.dominio_codigo,
                      action: 'update',
                    });
                    const canDeleteCourse = canMutateLmsCourse({
                      canManage: courseManagementEnabled,
                      operationalAccessReady: operationalAccess.isReady,
                      operationalRbacEnabled: operationalAccess.enabled,
                      setorIds: operationalAccess.setor_ids,
                      actions: operationalAccess.actions,
                      cursoDomain: curso.dominio_codigo,
                      action: 'delete',
                    });

                    return (
                      <CourseCard
                        key={curso.id}
                        curso={curso}
                        matricula={matriculasByCurso.get(curso.id)}
                        canManage={courseManagementEnabled}
                        canUpdateCourse={canUpdateCourse}
                        canDeleteCourse={canDeleteCourse}
                        managementRestricted={
                          courseManagementEnabled &&
                          operationalAccess.isReady &&
                          operationalAccess.enabled &&
                          !canUpdateCourse
                        }
                        pendingDeleteId={pendingDeleteId}
                        deleteLoading={deleteCurso.isPending}
                        onAction={handleCardAction}
                        onEdit={(c) => {
                          setEditingCourse(c);
                          setDrawerOpen(true);
                        }}
                        onTogglePublication={handleTogglePub}
                        onStartDelete={setPendingDeleteId}
                        onCancelDelete={() => setPendingDeleteId(null)}
                        onDelete={handleDelete}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </LmsPageShell>

      {drawerOpen ? (
        <CourseDrawer
          initial={editingCourse}
          onClose={() => {
            setDrawerOpen(false);
            setEditingCourse(undefined);
            setUploadProgress(0);
            setUploadStatus('');
          }}
          onPreview={
            editingCourse && getAdminCoursePreviewPath(editingCourse)
              ? () => navigate(getAdminCoursePreviewPath(editingCourse)!)
              : undefined
          }
          onSave={handleSave}
          isSaving={
            isSavingCourse ||
            createCurso.isPending ||
            updateCurso.isPending ||
            uploadThumb.isPending
          }
          uploadProgress={uploadProgress}
          uploadStatus={uploadStatus}
          availableSetores={setores}
        />
      ) : null}
    </AppLayout>
  );
}
