/**
 * useLms — React Query hooks para o módulo LMS nativo
 * Backend: /api/lms/*
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL, fetchWithAuth, getAccessToken } from '@/react-app/config/api';
import { safeLmsResponseErrorText } from '@/react-app/lib/lms-safe-error-response';

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ScormVersao = '1.2' | '2004' | null;
export type TipoConteudo = 'scorm' | 'h5p' | 'video' | 'pdf' | 'pptx';
export type MatriculaStatus =
  | 'NAO_INICIADO'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDO'
  | 'REPROVADO'
  | 'CANCELADO';

export interface LmsCurso {
  id: number;
  empresa_id: number;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  carga_horaria_minutos: number | null;
  conteudo_programatico: string | null;
  observacoes: string | null;
  carga_horaria_inicial_horas: number | null;
  carga_horaria_recorrente_horas: number | null;
  thumbnail_r2_key: string | null;
  scorm_versao: ScormVersao;
  scorm_package_r2_prefix: string | null;
  scorm_launch_file: string | null;
  scorm_mastery_score: number;
  conteudo_arquivo_nome?: string | null;
  qualificacao_tipo_id: number | null;
  qualificacao_tipo_nome?: string | null;
  qualificacao_tipo_codigo?: string | null;
  qualificacao_codigo?: string | null;
  /** Domínio operacional do curso, quando o tenant usa o RBAC por domínio. */
  dominio_codigo?: string | null;
  tipo_conteudo: TipoConteudo;
  gerar_qualificacao_ao_concluir: 0 | 1;
  publicado: 0 | 1;
  ativo: 0 | 1;
  version_tag: string | null;
  pdf_r2_key?: string | null;
  pptx_r2_key?: string | null;
  pptx_slide_count?: number;
  h5p_conteudo_id?: number | null;
  created_at: string;
  updated_at: string;
  total_matriculas?: number;
  total_concluidos?: number;
  setores?: { id: number; nome: string }[];
}

export interface LmsH5pConteudo {
  id: number;
  empresa_id: number;
  titulo: string;
  tipo_h5p: string | null;
  r2_key: string;
  versao: string | null;
  ativo: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface XapiStatement {
  id: number;
  matricula_id: number;
  verb_id: string;
  verb_display: string | null;
  object_id: string;
  result_json: string | null;
  timestamp: string;
  created_at: string;
}

export interface LmsMatricula {
  id: number;
  empresa_id: number;
  curso_id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  status: MatriculaStatus;
  progresso_pct: number;
  score_final: number | null;
  tentativas: number;
  data_matricula: string;
  data_inicio: string | null;
  data_conclusao: string | null;
  data_expiracao: string | null;
  qualificacao_historico_id: number | null;
  observacoes: string | null;
  ultimo_slide?: number | null;
  ultima_pagina?: number | null;
  qualificacao_tipo_id?: number | null;
  qualificacao_tipo_nome?: string | null;
  qualificacao_tipo_codigo?: string | null;
  qualificacao_validade?: number | null;
  // curso fields (join)
  titulo?: string;
  categoria?: string | null;
  carga_horaria_minutos?: number | null;
  thumbnail_r2_key?: string | null;
  tipo_conteudo?: TipoConteudo;
  scorm_versao?: ScormVersao;
  scorm_launch_file?: string | null;
  scorm_package_r2_prefix?: string | null;
  scorm_mastery_score?: number | null;
  gerar_qualificacao_ao_concluir?: 0 | 1;
  publicado?: 0 | 1;
  completion_diagnostic?: LmsCompletionDiagnostic | null;
  /** Progresso efetivo (resolveLmsEffectiveProgress) — só 100 quando status é CONCLUIDO. Preferir sobre progresso_pct bruto para exibição. */
  progresso_efetivo?: number;
  progresso_bruto?: number;
  completion_state?: 'COMPLETED' | 'PENDING_FINAL_STEP' | 'IN_PROGRESS' | 'NOT_STARTED' | 'FAILED' | 'CANCELLED';
  completion_reason_code?: string;
}

export interface LmsProgresso {
  matricula_id: number;
  lesson_status: string | null;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  score_max: number | null;
  score_scaled: number | null;
  session_count: number;
  last_commit_at: string | null;
  suspend_data: string | null;
  cmi_json?: string | null;
  session_time?: string | null;
  total_time?: string | null;
}

export interface LmsCursoDetalhe extends LmsMatricula {
  h5p_conteudo_id?: number | null;
  scorm_progresso: LmsProgresso | null;
}

export interface LmsCompletionDiagnostic {
  status: 'none' | 'accepted' | 'candidate' | 'rejected';
  code:
    | 'SCORM_COMPLETION_ACCEPTED'
    | 'SCORM_COMPLETION_CANDIDATE'
    | 'SCORM_COMPLETION_REJECTED'
    | 'SCORM_FINAL_COMMIT_MISSING'
    | 'SCORM_STATUS_INCONSISTENT'
    | 'SCORM_NONE';
  reasons: string[];
  can_finalize: boolean;
  explicit_completion: boolean;
  explicit_failure: boolean;
  mastery_score: number | null;
  score_pct: number | null;
  progresso_pct: number;
  inferred_progress_pct: number | null;
  location: string | null;
  reached_final_location: boolean;
  final_commit_observed: boolean;
  has_runtime_evidence: boolean;
  commit_event: string | null;
  pending_server_confirmation?: boolean;
  matricula_status?: string | null;
}

export interface LmsAdminStats {
  total_cursos: number;
  cursos_publicados: number;
  total_matriculas: number;
  concluidas: number;
  em_andamento: number;
  qualificacoes_geradas: number;
}

export interface LmsUploadResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateCursoDTO {
  titulo: string;
  descricao?: string | null;
  categoria?: string | null;
  carga_horaria_minutos?: number | null;
  conteudo_programatico?: string | null;
  observacoes?: string | null;
  carga_horaria_inicial_horas?: number | null;
  carga_horaria_recorrente_horas?: number | null;
  qualificacao_tipo_id?: number | null;
  gerar_qualificacao_ao_concluir?: 0 | 1;
  scorm_mastery_score?: number;
  scorm_versao?: ScormVersao;
  tipo_conteudo?: TipoConteudo;
  publicado?: 0 | 1;
  setor_ids?: number[];
}

export interface UpdateCursoDTO extends Partial<CreateCursoDTO> {}

export interface SyncEadCursosDTO {
  total_tipos_ead: number;
  created: number;
  updated: number;
  skipped: number;
  created_courses?: Array<{ id: number; titulo: string; qualificacao_tipo_id: number }>;
  updated_courses?: Array<{ id: number; titulo: string; qualificacao_tipo_id: number }>;
}

export interface LmsEdappLegacySummary {
  total_importado: number;
  total_funcionarios: number;
  total_cursos: number;
  total_pendentes_vinculo: number;
  total_sem_curso_lms: number;
  total_com_qualificacao: number;
  pendentes_importacao: number;
  ultima_importacao_em: string | null;
  ultima_conclusao_em: string | null;
}

export interface ImportLmsEdappLegacyDTO {
  limit?: number;
  reprocessar?: boolean;
}

export interface ImportLmsEdappLegacyResult {
  analisados: number;
  inseridos: number;
  atualizados: number;
  vinculados_lms: number;
  vinculados_qualificacao: number;
  mapeamentos_usuario_atualizados: number;
  mapeamentos_curso_atualizados: number;
  ignorados_sem_funcionario: number;
  pendentes_vinculo: number;
  ignorados_teste: number;
  erros: number;
  exemplos_erros: string[];
  limit_aplicado: number;
  pendentes_importacao_restantes: number;
}

export interface MatricularDTO {
  funcionario_id: number;
  curso_id: number;
  data_expiracao?: string | null;
  observacoes?: string | null;
}

export interface MatricularLoteDTO {
  funcionario_ids: number[];
  curso_id: number;
  data_expiracao?: string | null;
  observacoes?: string | null;
}

export interface MatricularLoteResult {
  criadas: number;
  ignoradas: number;
  erros: number;
  matriculas?: LmsMatricula[];
}

function sanitizeCreateCursoPayload(dto: CreateCursoDTO): CreateCursoDTO {
  return {
    ...dto,
    descricao: dto.descricao === '' ? null : dto.descricao,
    categoria: dto.categoria === '' ? null : dto.categoria,
    conteudo_programatico: dto.conteudo_programatico === '' ? null : dto.conteudo_programatico,
    observacoes: dto.observacoes === '' ? null : dto.observacoes,
    carga_horaria_minutos: dto.carga_horaria_minutos ?? 0,
    carga_horaria_inicial_horas: dto.carga_horaria_inicial_horas ?? null,
    carga_horaria_recorrente_horas: dto.carga_horaria_recorrente_horas ?? null,
    qualificacao_tipo_id: dto.qualificacao_tipo_id ?? null,
    scorm_mastery_score: dto.scorm_mastery_score ?? 70,
    scorm_versao: dto.scorm_versao ?? null,
    setor_ids: dto.setor_ids && dto.setor_ids.length > 0 ? dto.setor_ids : undefined,
  };
}

function sanitizeUpdateCursoPayload(dto: UpdateCursoDTO): UpdateCursoDTO {
  const payload: UpdateCursoDTO = {};

  if ('titulo' in dto) payload.titulo = dto.titulo;
  if ('descricao' in dto) payload.descricao = dto.descricao === '' ? null : dto.descricao;
  if ('categoria' in dto) payload.categoria = dto.categoria === '' ? null : dto.categoria;
  if ('conteudo_programatico' in dto) {
    payload.conteudo_programatico =
      dto.conteudo_programatico === '' ? null : dto.conteudo_programatico;
  }
  if ('observacoes' in dto) {
    payload.observacoes = dto.observacoes === '' ? null : dto.observacoes;
  }
  if ('carga_horaria_minutos' in dto) payload.carga_horaria_minutos = dto.carga_horaria_minutos;
  if ('carga_horaria_inicial_horas' in dto) {
    payload.carga_horaria_inicial_horas = dto.carga_horaria_inicial_horas;
  }
  if ('carga_horaria_recorrente_horas' in dto) {
    payload.carga_horaria_recorrente_horas = dto.carga_horaria_recorrente_horas;
  }
  if ('qualificacao_tipo_id' in dto)
    payload.qualificacao_tipo_id = dto.qualificacao_tipo_id ?? null;
  if ('gerar_qualificacao_ao_concluir' in dto) {
    payload.gerar_qualificacao_ao_concluir = dto.gerar_qualificacao_ao_concluir;
  }
  if ('scorm_mastery_score' in dto) payload.scorm_mastery_score = dto.scorm_mastery_score;
  if ('scorm_versao' in dto) payload.scorm_versao = dto.scorm_versao ?? null;
  if ('tipo_conteudo' in dto) payload.tipo_conteudo = dto.tipo_conteudo;
  if ('publicado' in dto) payload.publicado = dto.publicado;
  if ('setor_ids' in dto)
    payload.setor_ids = dto.setor_ids && dto.setor_ids.length > 0 ? dto.setor_ids : undefined;

  return payload;
}

function resolveUploadError<T>(xhr: XMLHttpRequest): LmsUploadResponse<T> {
  const rawText = xhr.responseText?.trim();
  if (rawText) {
    try {
      const result = JSON.parse(rawText) as LmsUploadResponse<T>;
      return {
        success: false,
        error: safeLmsResponseErrorText(result.error, xhr.status),
        data: result.data,
      };
    } catch {
      return {
        success: false,
        error: safeLmsResponseErrorText(rawText, xhr.status),
      };
    }
  }

  return {
    success: false,
    error: safeLmsResponseErrorText(undefined, xhr.status),
  };
}

function uploadViaXhr<T = unknown>(
  method: 'POST' | 'PUT',
  url: string,
  body: Document | XMLHttpRequestBodyInit | null,
  options?: {
    onProgress?: (pct: number) => void;
    contentType?: string;
  },
): Promise<LmsUploadResponse<T>> {
  return new Promise((resolve) => {
    const token = getAccessToken();
    const xhr = new XMLHttpRequest();
    const requestUrl =
      url.startsWith('/api/') && /^https?:\/\//.test(API_BASE_URL)
        ? `${API_BASE_URL.replace(/\/api$/, '')}${url}`
        : url;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && options?.onProgress) {
        options.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as LmsUploadResponse<T>);
        } catch {
          resolve({ success: false, error: 'Erro ao processar resposta' });
        }
        return;
      }

      resolve(resolveUploadError(xhr));
    };

    xhr.onerror = () => resolve({ success: false, error: 'Erro de rede' });

    xhr.open(method, requestUrl);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    if (options?.contentType) {
      xhr.setRequestHeader('Content-Type', options.contentType);
    }
    xhr.send(body);
  });
}

export async function uploadLmsContent<T = unknown>(
  url: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
): Promise<LmsUploadResponse<T>> {
  return uploadViaXhr('POST', url, formData, { onProgress });
}

export async function uploadLmsBinary<T = unknown>(
  url: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<LmsUploadResponse<T>> {
  return uploadViaXhr('POST', url, file, {
    onProgress,
    contentType: 'application/octet-stream',
  });
}

function unwrapUploadResult<T>(result: LmsUploadResponse<T>): T {
  if (!result.success) {
    throw new Error(result.error ?? 'Erro no upload');
  }
  return result.data as T;
}

// ── API helper ────────────────────────────────────────────────────────────────

async function lmsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`/api/lms${path}`, {
    headers: init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = (await res.json()) as {
    success: boolean;
    data?: T;
    error?: string;
    pagination?: unknown;
  };
  if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.data as T;
}

async function lmsRequestPaginated<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T[]; total: number }> {
  const res = await fetchWithAuth(`/api/lms${path}`, {
    headers: init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...init,
  });
  const json = (await res.json()) as {
    success: boolean;
    data?: T[];
    error?: string;
    pagination?: { total: number; page: number; limit: number };
  };
  if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
  return { data: json.data ?? [], total: json.pagination?.total ?? json.data?.length ?? 0 };
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const lmsKeys = {
  cursos: (filters?: Record<string, unknown>) => ['lms', 'cursos', filters ?? {}] as const,
  curso: (id: number) => ['lms', 'curso', id] as const,
  minhasMatriculas: () => ['lms', 'minhas-matriculas'] as const,
  minhasEAD: () => ['lms', 'minhas-ead'] as const,
  matriculaCurso: (cursoId: number) => ['lms', 'matriculas-curso', cursoId] as const,
  matriculaDetalhe: (id: number) => ['lms', 'matricula-detalhe', id] as const,
  adminStats: () => ['lms-stats'] as const,
  edappLegacySummary: () => ['lms', 'edapp-legacy-summary'] as const,
  scormState: (id: number) => ['lms', 'scorm-state', id] as const,
  xapiStatements: (matriculaId: number) => ['lms', 'xapi-statements', matriculaId] as const,
};

function invalidateCursoCollections(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['lms', 'cursos'], exact: false });
  qc.invalidateQueries({ queryKey: lmsKeys.adminStats() });
}

function invalidateMatriculaCollections(
  qc: ReturnType<typeof useQueryClient>,
  params: {
    cursoId?: number | null;
    matriculaId?: number | null;
    includeScorm?: boolean;
    includeXapi?: boolean;
  },
) {
  if (params.cursoId) {
    qc.invalidateQueries({ queryKey: lmsKeys.curso(params.cursoId) });
    qc.invalidateQueries({ queryKey: lmsKeys.matriculaCurso(params.cursoId) });
  }

  if (params.matriculaId) {
    qc.invalidateQueries({ queryKey: lmsKeys.matriculaDetalhe(params.matriculaId) });
    if (params.includeScorm) {
      qc.invalidateQueries({ queryKey: lmsKeys.scormState(params.matriculaId) });
    }
    if (params.includeXapi) {
      qc.invalidateQueries({ queryKey: lmsKeys.xapiStatements(params.matriculaId) });
    }
  }

  qc.invalidateQueries({ queryKey: lmsKeys.minhasMatriculas() });
  qc.invalidateQueries({ queryKey: lmsKeys.minhasEAD() });
  invalidateCursoCollections(qc);
}

function updateCachedMatriculaProgress(
  qc: ReturnType<typeof useQueryClient>,
  vars: SalvarProgressoDTO,
  result?: SalvarProgressoResult,
) {
  const nextPct = result?.progresso_pct ?? vars.progresso_pct ?? 0;
  const nextSlide = result?.ultimo_slide ?? vars.ultimo_slide;
  const nextPage = result?.ultima_pagina ?? vars.ultima_pagina;
  const nextStatus = result?.status as MatriculaStatus | undefined;

  qc.setQueryData<LmsCursoDetalhe | undefined>(
    lmsKeys.matriculaDetalhe(vars.matriculaId),
    (current) => {
      if (!current) return current;

      return {
        ...current,
        status: nextStatus ?? (current.status === 'NAO_INICIADO' ? 'EM_ANDAMENTO' : current.status),
        progresso_pct: Math.max(Number(current.progresso_pct || 0), Number(nextPct || 0)),
        ultimo_slide: nextSlide ?? current.ultimo_slide ?? null,
        ultima_pagina: nextPage ?? current.ultima_pagina ?? null,
      };
    },
  );

  const patchCollection = <T extends LmsMatricula>(items?: T[]) =>
    items?.map((item) => {
      if (item.id !== vars.matriculaId) return item;

      return {
        ...item,
        status: nextStatus ?? (item.status === 'NAO_INICIADO' ? 'EM_ANDAMENTO' : item.status),
        progresso_pct: Math.max(Number(item.progresso_pct || 0), Number(nextPct || 0)),
        ultimo_slide: nextSlide ?? item.ultimo_slide ?? null,
        ultima_pagina: nextPage ?? item.ultima_pagina ?? null,
      };
    });

  qc.setQueryData<LmsMatricula[] | undefined>(lmsKeys.minhasMatriculas(), patchCollection);
  qc.setQueryData<LmsMatriculaEAD[] | undefined>(lmsKeys.minhasEAD(), patchCollection);
}

function getCachedCursoIdFromMatricula(
  qc: ReturnType<typeof useQueryClient>,
  matriculaId: number,
): number | null {
  const cached = qc.getQueryData<LmsCursoDetalhe>(lmsKeys.matriculaDetalhe(matriculaId));
  return cached?.curso_id ?? null;
}

export function patchCursoThumbnailListCache(
  current: { data: LmsCurso[]; total: number } | undefined,
  cursoId: number,
  patch: { thumbnail_r2_key: string | null; version_tag: string | null },
) {
  if (!current?.data?.length) return current;

  const nextCourses = current.data.map((course) => {
    if (course.id !== cursoId) return course;
    return {
      ...course,
      thumbnail_r2_key: patch.thumbnail_r2_key,
      version_tag: patch.version_tag,
    };
  });

  return { ...current, data: nextCourses };
}

// ── Catálogo (público autenticado) ────────────────────────────────────────────

export interface CursosFilters {
  q?: string;
  categoria?: string;
  publicados?: boolean;
  page?: number;
  limit?: number;
  setor_ids?: number[];
}

export function useLmsCursos(
  filters: CursosFilters = {},
  options: {
    enabled?: boolean;
  } = {},
) {
  return useQuery({
    queryKey: lmsKeys.cursos(filters as Record<string, unknown>),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.categoria) params.set('categoria', filters.categoria);
      if (filters.publicados !== undefined)
        params.set('publicados', filters.publicados ? '1' : '0');
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      if (filters.setor_ids && filters.setor_ids.length > 0)
        params.set('setor_ids', filters.setor_ids.join(','));
      const qs = params.toString();
      return lmsRequestPaginated<LmsCurso>(`/cursos${qs ? '?' + qs : ''}`);
    },
    enabled: options.enabled ?? true,
    staleTime: 15_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export function useLmsCurso(id: number) {
  return useQuery({
    queryKey: lmsKeys.curso(id),
    queryFn: () => lmsRequest<LmsCurso>(`/cursos/${id}`),
    enabled: id > 0,
    staleTime: 60_000,
  });
}

// ── Minhas matrículas (funcionário logado) ────────────────────────────────────

export interface LmsStats {
  cursos_ativos: number;
  total_cursos: number;
  cursos_publicados: number;
  total_alunos: number;
  total_matriculados: number;
  total_matriculas: number;
  concluidas: number;
  em_andamento: number;
  nao_iniciadas: number;
  qualificacoes_geradas: number;
  taxa_conclusao_pct: number;
  top_cursos: {
    id: number;
    titulo: string;
    tipo_conteudo: TipoConteudo;
    total_matriculas: number;
    progresso_medio_pct: number;
    concluidas: number;
    taxa_conclusao_pct: number;
  }[];
  atrasadas: {
    id: number;
    funcionario_id: number;
    curso_id: number;
    progresso_pct: number;
    data_matricula: string;
    curso_titulo: string;
    funcionario_nome: string;
  }[];
  recent_completions: {
    id: number;
    funcionario_id: number;
    funcionario_nome: string;
    curso_id: number;
    curso_titulo: string;
    data_conclusao: string;
  }[];
  featured_courses: {
    id: number;
    titulo: string;
    tipo_conteudo: TipoConteudo;
    categoria: string | null;
    descricao: string | null;
    carga_horaria_minutos: number | null;
    thumbnail_r2_key: string | null;
    publicado: number;
    created_at: string;
    total_matriculas: number;
  }[];
}

export function useLmsStats(enabled = true) {
  return useQuery({
    queryKey: lmsKeys.adminStats(),
    queryFn: () => lmsRequest<LmsStats>('/cursos/stats'),
    enabled,
    staleTime: 60_000,
  });
}

export function useMinhasMatriculas() {
  return useQuery({
    queryKey: lmsKeys.minhasMatriculas(),
    queryFn: () => lmsRequest<LmsMatricula[]>('/matriculas/minhas'),
    staleTime: 30_000,
  });
}

export interface LmsMatriculaEAD extends LmsMatricula {
  data_vencimento_qualificacao: string | null;
  tem_certificado: 0 | 1;
  /** LINKED = Histórico atual vinculado; LINK_PENDING = sem vínculo (nunca exibir Vencido). */
  qualification_link_state?: 'LINKED' | 'LINK_PENDING';
  /** AVAILABLE = certificado pronto; PENDING = concluído mas certificado ainda gerando; NOT_REQUIRED = curso não gera certificado. */
  certificate_state?: 'AVAILABLE' | 'PENDING' | 'NOT_REQUIRED';
  /** Progresso efetivo (resolveLmsEffectiveProgress) — só 100 quando status é CONCLUIDO. Usar para exibição, nunca progresso_pct bruto diretamente. */
  progresso_efetivo?: number;
  progresso_bruto?: number;
  completion_state?: 'COMPLETED' | 'PENDING_FINAL_STEP' | 'IN_PROGRESS' | 'NOT_STARTED' | 'FAILED' | 'CANCELLED';
  completion_reason_code?: string;
}

export function useMinhasEAD() {
  return useQuery({
    queryKey: lmsKeys.minhasEAD(),
    queryFn: () => lmsRequest<LmsMatriculaEAD[]>('/matriculas/minhas-ead'),
    staleTime: 30_000,
  });
}

// ── Detalhe de matrícula ──────────────────────────────────────────────────────

export function useMatriculaDetalhe(id: number) {
  return useQuery({
    queryKey: lmsKeys.matriculaDetalhe(id),
    queryFn: () => lmsRequest<LmsCursoDetalhe>(`/matriculas/${id}`),
    enabled: id > 0,
    staleTime: 10_000,
  });
}

// ── Matrículas por curso (gestão) ─────────────────────────────────────────────

export function useMatriculasCurso(
  cursoId: number,
  opts: { status?: string; page?: number; limit?: number } = {},
) {
  return useQuery({
    queryKey: lmsKeys.matriculaCurso(cursoId),
    queryFn: () => {
      const params = new URLSearchParams();
      if (opts.status) params.set('status', opts.status);
      if (opts.page) params.set('page', String(opts.page));
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      return lmsRequestPaginated<LmsMatricula>(`/matriculas/curso/${cursoId}${qs ? '?' + qs : ''}`);
    },
    enabled: cursoId > 0,
    staleTime: 30_000,
  });
}

// ── Matricular ────────────────────────────────────────────────────────────────

export function useMatricularCurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: MatricularDTO) =>
      lmsRequest<LmsMatricula>('/matriculas', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    onSuccess: (data) => {
      invalidateMatriculaCollections(qc, { cursoId: data.curso_id, matriculaId: data.id });
    },
  });
}

export function useMatricularLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: MatricularLoteDTO) =>
      lmsRequest<MatricularLoteResult>('/matriculas/lote', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    onSuccess: (_data, vars) => {
      invalidateMatriculaCollections(qc, { cursoId: vars.curso_id });
    },
  });
}

export function useCancelarMatricula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matriculaId }: { matriculaId: number; cursoId?: number | null }) =>
      lmsRequest<{ id: number; cancelado: boolean }>(`/matriculas/${matriculaId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, vars) => {
      invalidateMatriculaCollections(qc, {
        cursoId: vars.cursoId ?? getCachedCursoIdFromMatricula(qc, vars.matriculaId),
        matriculaId: vars.matriculaId,
        includeScorm: true,
        includeXapi: true,
      });
    },
  });
}

// ── Admin — CRUD Cursos ───────────────────────────────────────────────────────

export function useCreateCurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCursoDTO) =>
      lmsRequest<LmsCurso>('/cursos', {
        method: 'POST',
        body: JSON.stringify(sanitizeCreateCursoPayload(dto)),
      }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['lms', 'cursos'], exact: false });
    },
    onSuccess: (newCourse) => {
      // Immediately cache the new course for detail views before the list refetch completes
      qc.setQueryData(lmsKeys.curso(newCourse.id), newCourse);
      invalidateCursoCollections(qc);
    },
  });
}

export function useUpdateCurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: UpdateCursoDTO & { id: number }) =>
      lmsRequest<LmsCurso>(`/cursos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(sanitizeUpdateCursoPayload(dto)),
      }),
    onMutate: ({ id }) => {
      // Cancel in-flight list fetches so a stale GET response can't overwrite the
      // optimistic merge that follows in onSuccess.
      // NOTE: cancelQueries is fire-and-forget here — awaiting it is unnecessary
      // and causes a TDZ ("Cannot access 'i' before initialization") in the
      // minified bundle because esbuild transforms async functions into state
      // machines where const declarations can be reordered.
      qc.cancelQueries({ queryKey: ['lms', 'cursos'], exact: false });
      qc.cancelQueries({ queryKey: lmsKeys.curso(id) });
      // Snapshot the individual course so we can roll back on error.
      const previousCurso = qc.getQueryData<LmsCurso>(lmsKeys.curso(id));
      return { previousCurso };
    },
    onError: (_err, vars, context) => {
      if (context?.previousCurso) {
        qc.setQueryData(lmsKeys.curso(vars.id), context.previousCurso);
      }
    },
    onSuccess: (updatedCourse, vars) => {
      // Immediately update the individual course cache with server response
      qc.setQueryData(lmsKeys.curso(vars.id), updatedCourse);

      // Merge into all curso list caches (any filters) so the UI reflects the edit instantly
      qc.setQueriesData<{ data: LmsCurso[]; total: number }>(
        { queryKey: ['lms', 'cursos'], exact: false },
        (current) => {
          if (!current?.data?.length) return current;
          let found = false;
          const data = current.data.map((course) => {
            if (course.id !== updatedCourse.id) return course;
            found = true;
            return { ...course, ...updatedCourse };
          });
          if (!found) return current;
          return { ...current, data };
        },
      );

      // Background reconciliation — mark stale to confirm with server
      invalidateCursoCollections(qc);
    },
  });
}

export function useDeleteCurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => lmsRequest<void>(`/cursos/${id}`, { method: 'DELETE' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['lms', 'cursos'], exact: false });
    },
    onSuccess: (_data, id) => {
      // Remove from individual course cache so stale data is never shown
      qc.removeQueries({ queryKey: lmsKeys.curso(id) });
      // Remove from all list caches immediately so the card disappears
      qc.setQueriesData<{ data: LmsCurso[]; total: number }>(
        { queryKey: ['lms', 'cursos'], exact: false },
        (current) => {
          if (!current?.data?.length) return current;
          const data = current.data.filter((course) => course.id !== id);
          if (data.length === current.data.length) return current;
          return { ...current, data, total: current.total - 1 };
        },
      );
      // Background reconciliation — also refreshes admin stats
      invalidateCursoCollections(qc);
    },
  });
}

export function useSyncEadCursos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => lmsRequest<SyncEadCursosDTO>('/cursos/sync-ead', { method: 'POST' }),
    onSuccess: () => {
      invalidateCursoCollections(qc);
    },
  });
}

export function useLmsEdappLegacySummary(enabled = true) {
  return useQuery({
    queryKey: lmsKeys.edappLegacySummary(),
    queryFn: () => lmsRequest<LmsEdappLegacySummary>('/legado/edapp/resumo'),
    enabled,
    staleTime: 30_000,
  });
}

export function useImportLmsEdappLegacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: ImportLmsEdappLegacyDTO = {}) =>
      lmsRequest<ImportLmsEdappLegacyResult>('/legado/edapp/importar', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lmsKeys.edappLegacySummary() });
    },
  });
}

// ── Upload de pacote SCORM ────────────────────────────────────────────────────

export function useUploadScorm(cursoId: number, skipPurge = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const url = `/api/lms/cursos/${cursoId}/scorm-upload${skipPurge ? '?skip_purge=true' : ''}`;
      return unwrapUploadResult(await uploadLmsContent(url, formData));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lmsKeys.curso(cursoId) });
      qc.invalidateQueries({ queryKey: ['lms', 'cursos'], exact: false });
    },
  });
}

export type ScormPackageVersionRow = {
  packageId: string;
  status: string;
  packageSha256?: string;
  publishable?: boolean;
  structural?: { status?: string };
  runtime?: { status?: string; errors?: string[] };
  conformance?: { status?: string };
  completionManifest?: { errors?: string[] };
};

/** Candidate versions are intentionally separate from the active course. */
export function useScormPackageVersions(cursoId: number, enabled = true) {
  return useQuery({
    queryKey: ['lms', 'cursos', cursoId, 'scorm-package-versions'],
    queryFn: () => lmsRequest<{ data: ScormPackageVersionRow[] }>(`/cursos/${cursoId}/scorm-package-versions`),
    enabled: enabled && cursoId > 0,
  });
}

export function useActivateScormPackageVersion(cursoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) => lmsRequest(`/cursos/${cursoId}/scorm-package-versions/${packageId}/activate`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lmsKeys.curso(cursoId) });
      qc.invalidateQueries({ queryKey: ['lms', 'cursos', cursoId, 'scorm-package-versions'] });
    },
  });
}

export function useRunScormPackageConformance(cursoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (packageId: string) =>
      lmsRequest(`/cursos/${cursoId}/scorm-package-versions/${packageId}/conformance`, {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lms', 'cursos', cursoId, 'scorm-package-versions'] });
    },
  });
}

// ── Stats para admin (calculadas client-side a partir das queries) ─────────────

export function useLmsAdminStats() {
  const cursosQ = useLmsCursos({ limit: 500 });
  return {
    isLoading: cursosQ.isLoading,
    data: cursosQ.data
      ? {
          total_cursos: cursosQ.data.total,
          cursos_publicados: cursosQ.data.data.filter((c) => c.publicado === 1).length,
          cursos_scorm: cursosQ.data.data.filter((c) => c.scorm_launch_file).length,
          categorias: [...new Set(cursosQ.data.data.map((c) => c.categoria).filter(Boolean))],
        }
      : null,
  };
}

// ── Upload H5P ────────────────────────────────────────────────────────────────

export function useUploadH5p(cursoId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('h5p', file);
      const result = await uploadLmsContent(`/api/lms/cursos/${cursoId}/upload/h5p`, formData);
      return unwrapUploadResult(result);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lmsKeys.curso(cursoId) });
      qc.invalidateQueries({ queryKey: ['lms', 'cursos'], exact: false });
    },
  });
}

export function useUploadCursoThumbnail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      cursoId,
      file,
      onProgress,
    }: {
      cursoId: number;
      file: File;
      onProgress?: (pct: number) => void;
    }) => {
      const formData = new FormData();
      formData.append('thumbnail', file);

      return unwrapUploadResult<{ thumbnail_r2_key: string | null; version_tag: string | null }>(
        await uploadLmsContent(`/api/lms/cursos/${cursoId}/thumbnail-upload`, formData, onProgress),
      );
    },
    onMutate: ({ cursoId }) => {
      // Cancel in-flight list fetches so a stale GET can't overwrite the thumbnail patch.
      // NOTE: fire-and-forget — see useUpdateCurso.onMutate for rationale.
      qc.cancelQueries({ queryKey: ['lms', 'cursos'], exact: false });
      qc.cancelQueries({ queryKey: lmsKeys.curso(cursoId) });
      const previousCurso = qc.getQueryData<LmsCurso>(lmsKeys.curso(cursoId));
      return { previousCurso };
    },
    onError: (_err, vars, context) => {
      if (context?.previousCurso) {
        qc.setQueryData(lmsKeys.curso(vars.cursoId), context.previousCurso);
      }
    },
    onSuccess: (uploadResult, vars) => {
      // Update individual course cache so the new capa shows immediately
      qc.setQueryData<LmsCurso | undefined>(
        lmsKeys.curso(vars.cursoId),
        (current) =>
          current
            ? {
                ...current,
                thumbnail_r2_key: uploadResult.thumbnail_r2_key,
                version_tag: uploadResult.version_tag,
              }
            : current,
      );
      // Update all list caches so the card thumbnail refreshes instantly
      qc.setQueriesData<{ data: LmsCurso[]; total: number }>(
        { queryKey: ['lms', 'cursos'], exact: false },
        (current) => patchCursoThumbnailListCache(current, vars.cursoId, uploadResult),
      );
      // Background reconciliation
      invalidateCursoCollections(qc);
    },
  });
}

// ── SCORM state (para retomar) ────────────────────────────────────────────────

export interface ScormStateData {
  matricula_id: number;
  status: string;
  progresso: {
    suspend_data: string | null;
    cmi_json: string | null;
    lesson_status: string | null;
    completion_status: string | null;
    success_status: string | null;
    score_raw: number | null;
    score_max: number | null;
    total_time: string | null;
    session_count: number;
    last_commit_at: string | null;
  } | null;
}

export function useScormState(matriculaId: number) {
  return useQuery({
    queryKey: lmsKeys.scormState(matriculaId),
    queryFn: () => lmsRequest<ScormStateData>(`/scorm/state/${matriculaId}`),
    enabled: matriculaId > 0,
    staleTime: 0, // sempre fresco ao montar o player
  });
}

// ── xAPI statements ───────────────────────────────────────────────────────────

export interface PostXapiStatementDTO {
  matricula_id: number;
  actor: Record<string, unknown>;
  verb: { id: string; display?: Record<string, string> };
  object: { id: string; objectType?: string; definition?: Record<string, unknown> };
  result?: {
    success?: boolean;
    completion?: boolean;
    score?: { raw?: number; max?: number; min?: number; scaled?: number };
    duration?: string;
  };
  context?: Record<string, unknown>;
  timestamp?: string;
}

export interface PostXapiStatementResult {
  statement_id: number;
  matricula_id: number;
  verb_id: string;
  novo_status: string;
  qualificacao_gerada: Record<string, unknown> | null;
}

export interface PostScormCommitDTO {
  matricula_id: number;
  lesson_status?: string | null;
  completion_status?: string | null;
  success_status?: string | null;
  score_raw?: number | null;
  score_max?: number | null;
  score_min?: number | null;
  score_scaled?: number | null;
  session_time?: string | null;
  total_time?: string | null;
  suspend_data?: string | null;
  launch_data?: string | null;
  cmi_json?: string | null;
}

export interface PostScormCommitResult {
  matricula_id: number;
  novo_status: MatriculaStatus;
  progresso_pct: number;
  qualificacao_gerada: Record<string, unknown> | null;
  completion_diagnostic?: LmsCompletionDiagnostic | null;
}

export function usePostXapiStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: PostXapiStatementDTO) =>
      lmsRequest<PostXapiStatementResult>('/xapi/statements', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    onSuccess: (_data, vars) => {
      invalidateMatriculaCollections(qc, {
        cursoId: getCachedCursoIdFromMatricula(qc, vars.matricula_id),
        matriculaId: vars.matricula_id,
        includeXapi: true,
      });
    },
  });
}

export function usePostScormCommit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: PostScormCommitDTO) =>
      lmsRequest<PostScormCommitResult>('/matriculas/scorm/commit', {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    onSuccess: (_data, vars) => {
      invalidateMatriculaCollections(qc, {
        cursoId: getCachedCursoIdFromMatricula(qc, vars.matricula_id),
        matriculaId: vars.matricula_id,
        includeScorm: true,
      });
    },
  });
}

export function useXapiStatements(matriculaId: number) {
  return useQuery({
    queryKey: lmsKeys.xapiStatements(matriculaId),
    queryFn: () => lmsRequest<XapiStatement[]>(`/xapi/statements/${matriculaId}`),
    enabled: matriculaId > 0,
    staleTime: 30_000,
  });
}

// ── Atualizar status de matrícula (admin/gestor) ──────────────────────────────

export function useUpdateMatriculaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      matriculaId,
      status,
      observacoes,
    }: {
      matriculaId: number;
      status: MatriculaStatus;
      observacoes?: string | null;
    }) =>
      lmsRequest<LmsMatricula>(`/matriculas/${matriculaId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, observacoes }),
      }),
    onSuccess: (data, vars) => {
      invalidateMatriculaCollections(qc, {
        cursoId: data.curso_id,
        matriculaId: vars.matriculaId,
        includeScorm: true,
        includeXapi: true,
      });
    },
  });
}

export interface FinalizarMatriculaResult {
  matricula_id: number;
  novo_status: MatriculaStatus;
  progresso_pct: number;
  qualificacao_gerada?: {
    qualificacao_id?: number;
    qualificacao_historico_id?: number;
  } | null;
  completion_diagnostic?: LmsCompletionDiagnostic | null;
}

export function useFinalizarMatricula() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (matriculaId: number) =>
      lmsRequest<FinalizarMatriculaResult>(`/matriculas/${matriculaId}/finalizar`, {
        method: 'POST',
      }),
    onSuccess: (data, matriculaId) => {
      const cachedCursoId = getCachedCursoIdFromMatricula(qc, matriculaId);
      invalidateMatriculaCollections(qc, {
        cursoId: cachedCursoId,
        matriculaId,
        includeScorm: true,
        includeXapi: true,
      });
    },
  });
}

// ── Salvar progresso (PDF / PPTX / H5P / vídeo) ──────────────────────────────

export interface SalvarProgressoDTO {
  matriculaId: number;
  progresso_pct?: number;
  ultimo_slide?: number;
  ultima_pagina?: number;
}

export interface SalvarProgressoResult {
  matricula_id: number;
  status: string;
  progresso_pct: number;
  ultimo_slide: number;
  ultima_pagina: number;
}

export function useSalvarProgresso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matriculaId, ...dto }: SalvarProgressoDTO) =>
      lmsRequest<SalvarProgressoResult>(`/matriculas/${matriculaId}/progresso`, {
        method: 'PATCH',
        body: JSON.stringify(dto),
      }),
    onMutate: async (vars) => {
      updateCachedMatriculaProgress(qc, vars);
    },
    onSuccess: (data, vars) => {
      updateCachedMatriculaProgress(qc, vars, data);
      invalidateMatriculaCollections(qc, { matriculaId: vars.matriculaId });
    },
  });
}

// ── Relatórios de conformidade ────────────────────────────────────────────────

export interface ConformidadePorFuncao {
  funcao: string;
  total_funcionarios: number;
  matriculados: number;
  concluidos: number;
  em_andamento: number;
  nao_iniciados: number;
  reprovados: number;
  taxa_conclusao_pct: number;
}

export interface ExpiracaoMatricula {
  matricula_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcao: string | null;
  base: string | null;
  curso_id: number;
  curso_titulo: string;
  status: string;
  data_expiracao: string;
  progresso_pct: number;
  /** Progresso efetivo (resolveLmsEffectiveProgress) — só 100 quando status é CONCLUIDO. Preferir sobre progresso_pct bruto para exibição. */
  progresso_efetivo: number;
  dias_restantes: number;
}

export interface LmsScormConclusaoInconsistente {
  matricula_id: number;
  funcionario_id: number;
  funcionario_nome: string;
  funcao: string | null;
  curso_id: number;
  curso_titulo: string;
  status: string;
  progresso_pct: number;
  /** Progresso efetivo (resolveLmsEffectiveProgress) — só 100 quando status é CONCLUIDO. Preferir sobre progresso_pct bruto para exibição. */
  progresso_efetivo: number;
  score_pct: number | null;
  mastery_score: number | null;
  location: string | null;
  diagnostic_status: 'none' | 'accepted' | 'candidate' | 'rejected';
  diagnostic_code:
    | 'SCORM_COMPLETION_ACCEPTED'
    | 'SCORM_COMPLETION_CANDIDATE'
    | 'SCORM_COMPLETION_REJECTED'
    | 'SCORM_FINAL_COMMIT_MISSING'
    | 'SCORM_STATUS_INCONSISTENT'
    | 'SCORM_NONE';
  can_finalize: boolean;
  last_commit_at: string | null;
}

export function useLmsConformidade(setorIds?: number[]) {
  const params = new URLSearchParams();
  if (setorIds && setorIds.length > 0) params.set('setor_ids', setorIds.join(','));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return useQuery({
    queryKey: ['lms', 'relatorios', 'conformidade', setorIds ?? []],
    queryFn: () => lmsRequest<ConformidadePorFuncao[]>(`/relatorios/conformidade${qs}`),
  });
}

export function useLmsExpiracoes(dias = 30, setorIds?: number[]) {
  const params = new URLSearchParams({ dias: String(dias) });
  if (setorIds && setorIds.length > 0) params.set('setor_ids', setorIds.join(','));
  return useQuery({
    queryKey: ['lms', 'relatorios', 'expiracoes', dias, setorIds ?? []],
    queryFn: () => lmsRequest<ExpiracaoMatricula[]>(`/relatorios/expiracoes?${params.toString()}`),
  });
}

export function useLmsScormConclusoesInconsistentes(setorIds?: number[]) {
  const params = new URLSearchParams();
  if (setorIds && setorIds.length > 0) params.set('setor_ids', setorIds.join(','));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return useQuery({
    queryKey: ['lms', 'relatorios', 'conclusoes-inconsistentes', setorIds ?? []],
    queryFn: () =>
      lmsRequest<LmsScormConclusaoInconsistente[]>(`/relatorios/conclusoes-inconsistentes${qs}`),
  });
}

// ── Histórico EdApp importado ─────────────────────────────────────────────────

export interface LmsHistoricoEdApp {
  id: number;
  funcionario_id: number | null;
  funcionario_nome: string | null;
  funcionario_matricula: string | null;
  funcionario_funcao: string | null;
  curso_id: number | null;
  curso_titulo: string | null;
  curso_categoria: string | null;
  edapp_course_id: string | null;
  edapp_course_external_id: string | null;
  edapp_user_id: string | null;
  status: string;
  progresso_pct: number | null;
  score_final: number | null;
  qualificacao_codigo: string | null;
  qualificacao_historico_id: number | null;
  data_conclusao: string | null;
  completed_at: string | null;
  funcionario_match_type: string | null;
  curso_match_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface LmsHistoricoEdAppFilters {
  q?: string;
  status?: string;
  funcionario_id?: number;
  page?: number;
  limit?: number;
}

export function useLmsHistoricoEdApp(filters: LmsHistoricoEdAppFilters = {}) {
  return useQuery({
    queryKey: ['lms', 'historico-edapp', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.status) params.set('status', filters.status);
      if (filters.funcionario_id) params.set('funcionario_id', String(filters.funcionario_id));
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));
      const qs = params.toString();
      return lmsRequestPaginated<LmsHistoricoEdApp>(`/legado/edapp/historico${qs ? '?' + qs : ''}`);
    },
    staleTime: 30_000,
  });
}
