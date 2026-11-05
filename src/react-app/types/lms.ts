/**
 * Tipos do módulo LMS compartilhados entre hooks, serviços e componentes.
 * Vivem em `types/` para que camadas baixas (services, lib, utils) os usem sem
 * depender dos hooks React. `hooks/useLms` os reexporta para os consumidores atuais.
 */

export type ScormVersao = '1.2' | '2004' | null;

export type ScormAssessmentPolicy = 'SCORED' | 'FORMATIVE';

export type TipoConteudo = 'scorm' | 'h5p' | 'video' | 'pdf' | 'pptx';

export type MatriculaStatus =
  'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROVADO' | 'CANCELADO';

export interface LmsCurso {
  id: number;
  empresa_id: number;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  carga_horaria_minutos: number | null;
  conteudo_programatico: string | null;
  observacoes: string | null;
  referencias: string | null;
  carga_horaria_inicial_horas: number | null;
  carga_horaria_recorrente_horas: number | null;
  thumbnail_r2_key: string | null;
  scorm_versao: ScormVersao;
  scorm_package_r2_prefix: string | null;
  scorm_launch_file: string | null;
  scorm_mastery_score: number | null;
  scorm_assessment_policy?: ScormAssessmentPolicy;
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

export interface LmsMatricula {
  id: number;
  empresa_id: number;
  curso_id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  /** 1 quando há conta vinculada ao funcionário neste tenant. */
  aluno_vinculado?: 0 | 1;
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
  /** Player 2.0 persisted SCORM evidence checklist; never a certificate/approval. */
  closure_readiness?: {
    contract_version: 1;
    eligible_for_server_verification: boolean;
    code: string;
    missing: string[];
    last_step_reached: boolean;
    every_slide_verified: boolean;
    terminal_status_verified: boolean;
    assessment_verified: boolean;
    slide_coverage?: { total: number; recorded: number; missing_numbers: number[] } | null;
    /** Evidence reported by Worker for the active package; informational only. */
    study_coverage?: {
      source: 'WRAPPER_LEDGER' | 'PACKAGE_STATE' | null;
      verified: boolean;
      required_total: number;
      recorded: number;
      package_version: string | null;
    } | null;
  } | null;
  completion_diagnostic?: LmsCompletionDiagnostic | null;
  /** Progresso efetivo (resolveLmsEffectiveProgress) — só 100 quando status é CONCLUIDO. Preferir sobre progresso_pct bruto para exibição. */
  progresso_efetivo?: number;
  progresso_bruto?: number;
  completion_state?:
    'COMPLETED' | 'PENDING_FINAL_STEP' | 'IN_PROGRESS' | 'NOT_STARTED' | 'FAILED' | 'CANCELLED';
  completion_reason_code?: string;
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

export interface CreateCursoDTO {
  titulo: string;
  descricao?: string | null;
  categoria?: string | null;
  carga_horaria_minutos?: number | null;
  conteudo_programatico?: string | null;
  observacoes?: string | null;
  referencias?: string | null;
  carga_horaria_inicial_horas?: number | null;
  carga_horaria_recorrente_horas?: number | null;
  qualificacao_tipo_id?: number | null;
  qualificacao_area_id?: number | null;
  gerar_qualificacao_ao_concluir?: 0 | 1;
  scorm_mastery_score?: number;
  scorm_assessment_policy?: ScormAssessmentPolicy;
  scorm_versao?: ScormVersao;
  tipo_conteudo?: TipoConteudo;
  publicado?: 0 | 1;
  setor_ids?: number[];
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

export interface CursosFilters {
  q?: string;
  categoria?: string;
  publicados?: boolean;
  page?: number;
  limit?: number;
  setor_ids?: number[];
}

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
