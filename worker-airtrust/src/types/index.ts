/// <reference types="@cloudflare/workers-types" />

import type { PlatformAccessState } from '../lib/rbac/platform-access';

/**
 * TYPES - Definições de tipos globais do Worker
 *
 * Define interfaces para:
 * - Environment bindings (D1, R2, secrets)
 * - Request context
 * - API responses padronizadas
 * - Entidades do domínio
 */

// ===== ENVIRONMENT BINDINGS =====
export interface Env {
  // D1 Database
  DB: D1Database;

  // R2 Storage
  BUCKET: R2Bucket;

  // Cloudflare Workers AI (optional — not injected in test environments)
  AI?: Ai;

  // Secrets (definir via: wrangler secret put <NOME>)
  JWT_SECRET: string;

  // Environment Variables (definidas em wrangler.toml)
  ENVIRONMENT: 'development' | 'staging' | 'production';
  API_URL: string;
  FRONTEND_URL: string;
  DEBUG: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  // Versão / build
  APP_VERSION?: string;
  APP_BUILD_TIME?: string;
  // Cloudflare runtime-provided metadata for the exact Worker version.
  CF_VERSION_METADATA?: WorkerVersionMetadata;
  // Provenance chain (source -> bundle -> manifest), injected by
  // scripts/deploy-staging-worker-safe.sh / .github/workflows/deploy-staging.yml.
  // These describe the pipeline's own build artifact, not a Cloudflare-side
  // cryptographic attestation of runtime content — see getProvenanceChain().
  AIRTRUST_SOURCE_SHA?: string;
  AIRTRUST_SOURCE_TREE?: string;
  AIRTRUST_WORKER_BUNDLE_SHA256?: string;
  AIRTRUST_RELEASE_MANIFEST_SHA256?: string;
  // Legacy Pages/Worker version ID
  CF_DEPLOYMENT_ID?: string;
  // Dev helpers
  ENABLE_DEV_AUTH_BYPASS?: string; // 'true' apenas em development via .dev.vars
  // Executor controlado da importação da matriz de simuladores AW139/S-76
  // (tenant-scoped, empresa_id=6). Disabled by default; never set 'true' in
  // production without explicit, reviewed authorization for that specific run.
  ENABLE_SIMULADORES_MATRIZ_EXECUTOR?: string;
  // Executor separado e atômico apenas para os 51 vínculos de guias de
  // instrutor (tenant-scoped, empresa_id=6). Independente do flag acima —
  // nunca toca matriz, manobras, modelos ou sessões. Disabled by default.
  ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR?: string;
  // Executor de remediação compensatória das 5 resoluções LEGACY_EQUIVALENT
  // da matriz (tenant-scoped, empresa_id=6). Independente dos dois flags
  // acima — nunca toca a resolução original, só cria overlays append-only e
  // versões COMPENSATE. Disabled by default.
  ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR?: string;
  // One-off EAD incident executor. It remains closed unless deliberately
  // enabled for the reviewed execution window.
  ENABLE_EAD_CATEGORY_RECONCILIATION_EXECUTOR?: string;
  USE_INTEGRATED_VIEW?: string; // 'true' habilita uso da view integrada
  USE_QUALIFICACOES_VIEW?: string; // deprecated (view removida); ignorado
  // Migração arquitetural SIGVOOS→Controle de Voos→FRMS (shadow-mode, ver docs/frms-controle-voos-migracao.md)
  // Default seguro (ausente/vazio) = desativado. 'all' = todas as empresas. Ou lista de ids separada por vírgula.
  CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS?: string;
  // eDB shadow runtime. Staging-only in code, explicit tenant allowlist,
  // `all` is invalid and production always fails closed.
  EDB_SHADOW_PILOT_TENANTS?: string;

  // CORS Origins (pode ser string separada por vírgula)
  CORS_ORIGINS?: string;
  // TTL dinâmico para caches voláteis (estatísticas histórico)
  CACHE_TTL_SECONDS?: string;

  // EdApp Integration
  EDAPP_API_TOKEN?: string;
  EDAPP_WEBHOOK_SECRET?: string;

  // Email transacional
  BREVO_API_KEY?: string;
  BREVO_FROM_EMAIL?: string;
  BREVO_FROM_NAME?: string;
  SENDGRID_API_KEY?: string;
  SENDGRID_FROM_EMAIL?: string;
  SMTP_CONFIG_ENCRYPTION_KEY?: string;

  // WhatsApp (gateway genérico)
  WHATSAPP_API_URL?: string;
  WHATSAPP_API_TOKEN?: string;

  // WhatsApp (Twilio fallback)
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WHATSAPP_FROM?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;

  // Cloudflare Browser Rendering API (para conversão HTML→PDF)
  CF_ACCOUNT_ID?: string;
  CF_BROWSER_API_TOKEN?: string;
  // Browser Run binding. It is intentionally separate from the PDF API token:
  // SCORM conformance launches a clean Chromium with no AirTrust credentials.
  SCORM_BROWSER?: unknown;

  // Maintenance routes secret (wrangler secret put MAINTENANCE_SECRET)
  MAINTENANCE_SECRET?: string;
  // Local maintenance is explicitly opt-in and never enabled in remote environments.
  ENABLE_LOCAL_MAINTENANCE?: string;
  // Set exclusively by the local Worker runtime configuration.
  LOCAL_MAINTENANCE_RUNTIME?: string;

  // Gate for historical one-off admin migration endpoints (never set in production/staging)
  // Gate for certificate/admin debug endpoints (never set in production/staging)
  ENABLE_ADMIN_DEBUG_ROUTES?: string;
  // Feature flag for additive shared simulator session backend
  SIMULATOR_SHARED_SESSIONS_ENABLED?: string;
  // Feature flag for guarded Controle de Voos SIGVOOS runtime preview.
  CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED?: string;
  // Feature flag for guarded Controle de Voos SIGVOOS real API read-only preview.
  CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED?: string;
  // Feature flag for guarded Controle de Voos SIGVOOS shadow compare in staging.
  CONTROLE_VOOS_SIGVOOS_SHADOW_COMPARE_ENABLED?: string;
  SIGVOOS_CONFIG_ENCRYPTION_KEY?: string;
  SIGVOOS_REAL_API_BASE_URL?: string;
  SIGVOOS_REAL_API_USERNAME?: string;
  SIGVOOS_REAL_API_PASSWORD?: string;
  SIGVOOS_REAL_API_SYSTEM?: string;
  /** In-memory-only credential override for SIGVOOS shadow ingestion (Fase 1 staging validation).
   * JSON: {"username":"...","password":"...","base_url"?:"...","system"?:"..."}. Staging-only —
   * never read when ENVIRONMENT is production (see sigvoos-shadow-service.ts). Never persisted. */
  SIGVOOS_SHADOW_CREDENTIAL_JSON?: string;
  /** Companion username for the password-only fallback: used only when
   * SIGVOOS_SHADOW_CREDENTIAL_JSON is present but is not valid JSON (i.e.
   * the whole secret value is treated as the password). Staging-only,
   * fail-closed elsewhere (see sigvoos-shadow-service.ts). */
  SIGVOOS_SHADOW_USERNAME?: string;
}

// ===== API RESPONSE TYPES =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  message?: string;
}

export interface PaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats?: {
    total: number;
    validas: number;
    vencendo: number;
    vencidas: number;
    renovadas: number;
  };
  meta?: Record<string, unknown>; // informações adicionais (ex: minimal, materialized)
}

// ===== DOMAIN ENTITIES =====

// Funcionario
export interface Funcionario {
  id: number;
  matricula: string;
  nome: string;
  guerra?: string;
  cpf: string;
  email: string;
  telefone?: string;
  cargo?: string;
  setor?: string;
  funcao?: string;
  aeronave?: string;
  codigo_anac?: string;
  nascimento?: string;
  licenca?: string;
  sispat?: string;
  prestserv?: string;
  admissao?: string;
  ativo: boolean;
  is_instrutor: boolean;
  is_checador: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Qualificacao (tipo/categoria)
export interface QualificacaoTipo {
  id: number;
  nome: string;
  codigo: string;
  categoria: string;
  descricao?: string;
  validade_meses?: number;
  ativo: number | boolean; // 1/0 ou boolean
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Qualificacao Historico (relacionamento funcionário-qualificação)
export interface QualificacaoHistorico {
  id: number;
  funcionario_id: number;
  qualificacao_id: number;
  data_conclusao: string | null;
  data_vencimento: string | null;
  validade_meses?: number | null;
  codigo: string;
  categoria?: string | null;
  numero_certificado?: string | null;
  status: 'VALIDA' | 'VENCIDA' | 'PROXIMA_VENCIMENTO';
  arquivo_url?: string | null;
  observacoes?: string | null;
  nota?: number | null;
  instrutor?: string | null;
  local?: string | null;
  modalidade?: string | null;
  carga_horaria?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Reclass Queue (recuperação diversidade)
export interface QualificacaoReclassQueueItem {
  id: number; // id da fila
  historico_id: number;
  current_codigo: string | null;
  target_tipo_id?: string | null;
  status: 'PENDING' | 'APPLIED' | 'SKIPPED';
  reason?: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (opcionais)
  funcionario_id?: number;
  funcionario_nome?: string;
  data_conclusao?: string | null;
  data_vencimento?: string | null;
  numero_certificado?: string | null;
}

// Categoria de Qualificação
export interface QualificacaoCategoria {
  id: number;
  codigo: string;
  nome: string;
  slug: string;
  descricao?: string;
  cor?: string;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// Habilitacao
export interface Habilitacao {
  id: number;
  funcionario_id: number;
  tipo: string;
  numero?: string;
  data_emissao?: string;
  data_validade?: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// Licenca
export interface Licenca {
  id: number;
  funcionario_id: number;
  tipo: string;
  numero: string;
  data_emissao: string;
  data_validade?: string;
  ativo: boolean;
  arquivo_url?: string;
  created_at: string;
  updated_at: string;
}

// Simulador
export interface Simulador {
  id: number;
  nome: string;
  modelo: string;
  fabricante?: string;
  localizacao?: string;
  ativo: boolean;
  observacoes?: string;
  created_at: string;
  updated_at: string;
}

// Sessao Simulador
export interface SessaoSimulador {
  id: number;
  simulador_id: number;
  instrutor_id?: number;
  data_inicio: string;
  data_fim?: string;
  duracao_minutos?: number;
  tipo: 'TREINAMENTO' | 'AVALIACAO' | 'CHECK';
  status: 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
  observacoes?: string;
  created_at: string;
  updated_at: string;
}

// Participante Sessao
export interface ParticipanteSessao {
  id: number;
  sessao_id: number;
  funcionario_id: number;
  funcao: 'PILOTO' | 'COPILOTO' | 'OBSERVADOR';
  aprovado?: boolean;
  nota?: number;
  observacoes?: string;
  created_at: string;
}

// ===== AUDIT TRAIL =====
export interface AuditLog {
  id: number;
  user_id?: number;
  action: string;
  entity_type: string;
  entity_id?: number;
  old_values?: string; // JSON
  new_values?: string; // JSON
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// ===== HONO APP ENV (use in all route files) =====
/** Tipo unificado para todos os Hono<AppEnv> — propaga Bindings + Variables */
export type AppEnv = { Bindings: Env; Variables: Variables };

// ===== HONO CONTEXT VARIABLES =====
/** Variáveis injetadas pelos middlewares de autenticação/tenant no contexto Hono */
export interface Variables {
  userId: number;
  empresaId: number;
  userEmail: string;
  userRole: string;
  funcionarioId?: number | null;
  platformAccessState?: PlatformAccessState;
  tenantContext: {
    empresaId: number;
    empresaCodigo: string;
    empresaNome: string;
    role: string;
    plano: string;
    permissions: string[];
  };
}

// ===== JWT PAYLOAD =====
export interface JwtPayload {
  sub: number; // user_id
  jti?: string; // JWT ID único — usado para blocklist no logout
  email: string;
  role?: string;
  token_type?: 'access' | 'lms_asset';
  asset_scope?: 'pptx_viewer' | 'course_assets';
  asset_curso_id?: number;
  asset_matricula_id?: number;
  asset_preview?: boolean;
  nome?: string;
  empresa_id?: number; // Multi-tenant: ID da empresa ativa
  empresas?: number[]; // Lista de empresas que o usuário tem acesso
  permissions?: string[]; // Overrides individuais: 'GRANT:permissao' | 'DENY:permissao'
  funcionario_id?: number | null; // Vínculo com funcionario (INSTRUTOR)
  impersonated_by?: number; // ID do admin que está impersonando
  iat: number; // issued at
  exp: number; // expiration
}

// ===== MULTI-TENANT TYPES =====
export interface Empresa {
  id: number;
  nome: string;
  cnpj?: string;
  codigo: string;
  logo_url?: string;
  dominio?: string;
  config?: string; // JSON
  plano: 'basic' | 'pro' | 'enterprise';
  max_funcionarios: number;
  max_storage_mb: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface UsuarioEmpresa {
  id: number;
  usuario_id: number;
  empresa_id: number;
  role: string;
  ativo: boolean;
  data_convite?: string;
  data_aceite?: string;
  created_at: string;
  updated_at: string;
}

// ===== UTILITY TYPES =====

export type Timestamp = string;
export type ID = number;
