/**
 * lmsService — Camada de acesso direto à API LMS.
 *
 * Funções stateless para uso fora de React hooks (ex: scripts, testes, contextos
 * que não suportam React Query). Os hooks em `useLms.ts` wrappam estas funções
 * para adicionar cache, loading state e invalidação automática.
 */
import apiFetch from '@/react-app/lib/apiFetch';
import type {
  LmsCurso,
  LmsMatricula,
  ScormStateData,
  CreateCursoDTO,
  MatricularDTO,
  MatricularLoteDTO,
  MatriculaStatus,
  CursosFilters,
} from '@/react-app/hooks/useLms';

// ── Helpers internos ──────────────────────────────────────────────────────────

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api/lms${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : {},
    ...init,
  });
  const json = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.data as T;
}

async function reqPaginated<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T[]; total: number }> {
  const res = await apiFetch(`/api/lms${path}`, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : {},
    ...init,
  });
  const json = (await res.json()) as {
    success: boolean;
    data?: T[];
    error?: string;
    pagination?: { total: number };
  };
  if (!res.ok || !json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
  return { data: json.data ?? [], total: json.pagination?.total ?? json.data?.length ?? 0 };
}

// ── Cursos ────────────────────────────────────────────────────────────────────

export const lmsService = {
  // Listar cursos (suporte a filtros)
  listarCursos(filters: CursosFilters = {}): Promise<{ data: LmsCurso[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.publicados != null) params.set('publicados', String(filters.publicados));
    if (filters.categoria) params.set('categoria', filters.categoria);
    if (filters.q) params.set('q', filters.q);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return reqPaginated<LmsCurso>(`/cursos${qs}`);
  },

  // Buscar curso por ID
  buscarCurso(id: number): Promise<LmsCurso> {
    return req<LmsCurso>(`/cursos/${id}`);
  },

  // Criar curso (envia FormData com arquivo SCORM/H5P opcionalmente)
  criarCurso(data: CreateCursoDTO | FormData): Promise<LmsCurso> {
    if (data instanceof FormData) {
      return req<LmsCurso>('/cursos', { method: 'POST', body: data, headers: {} });
    }
    return req<LmsCurso>('/cursos', { method: 'POST', body: JSON.stringify(data) });
  },

  // Atualizar curso
  atualizarCurso(id: number, data: Partial<CreateCursoDTO> | FormData): Promise<LmsCurso> {
    if (data instanceof FormData) {
      return req<LmsCurso>(`/cursos/${id}`, { method: 'PUT', body: data, headers: {} });
    }
    return req<LmsCurso>(`/cursos/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  // Excluir curso (soft delete)
  excluirCurso(id: number): Promise<void> {
    return req<void>(`/cursos/${id}`, { method: 'DELETE' });
  },

  // ── Matrículas ─────────────────────────────────────────────────────────────

  // Minhas matrículas (autenticado)
  minhasMatriculas(): Promise<LmsMatricula[]> {
    return req<LmsMatricula[]>('/matriculas/minhas');
  },

  // Meus treinamentos EAD enriquecidos (dashboard)
  minhasEAD(): Promise<Record<string, unknown>[]> {
    return req<Record<string, unknown>[]>('/matriculas/minhas-ead');
  },

  // Matrículas de um curso específico (admin/gestor)
  matriculasDoCurso(
    cursoId: number,
    params?: { status?: MatriculaStatus; page?: number; limit?: number },
  ): Promise<{ data: LmsMatricula[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return reqPaginated<LmsMatricula>(`/matriculas/curso/${cursoId}${suffix}`);
  },

  // Matricular um funcionário em um curso
  matricular(data: MatricularDTO): Promise<LmsMatricula> {
    return req<LmsMatricula>('/matriculas', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Matricular vários funcionários em lote
  matricularLote(
    data: MatricularLoteDTO,
  ): Promise<{ criadas: number; ignoradas: number; erros: number }> {
    return req<{ criadas: number; ignoradas: number; erros: number }>('/matriculas/lote', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Atualizar status de uma matrícula
  atualizarStatusMatricula(id: number, status: MatriculaStatus): Promise<LmsMatricula> {
    return req<LmsMatricula>(`/matriculas/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Cancelar matrícula
  cancelarMatricula(id: number): Promise<void> {
    return req<void>(`/matriculas/${id}`, { method: 'DELETE' });
  },

  // ── Progresso / SCORM ──────────────────────────────────────────────────────

  // Buscar progresso de uma matrícula
  buscarProgresso(matriculaId: number): Promise<ScormStateData> {
    return req<ScormStateData>(`/scorm/state/${matriculaId}`);
  },

  // Salvar progresso SCORM (commit)
  salvarProgresso(matriculaId: number, data: Record<string, unknown>): Promise<void> {
    return req<void>(`/matriculas/scorm/commit`, {
      method: 'POST',
      body: JSON.stringify({ matricula_id: matriculaId, ...data }),
    });
  },
};

export default lmsService;
