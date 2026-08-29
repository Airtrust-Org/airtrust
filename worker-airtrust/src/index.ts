/// <reference types="@cloudflare/workers-types" />

/**
 * AIRTRUST WORKER - Entry Point
 *
 * Worker Cloudflare com Hono v4 + TypeScript
 *
 * Arquitetura:
 * - src/routes/* - Módulos de rotas (funcionarios, qualificacoes, simuladores)
 * - src/middleware/* - Middlewares (cors, logger, error-handler, auth)
 * - src/utils/* - Utilitários (db, security)
 * - src/types/* - Definições TypeScript
 *
 * Endpoints principais:
 * - GET /api/health - Health check
 * - GET /api/funcionarios - Gestão de funcionários
 * - GET /api/qualificacoes - Gestão de qualificações
 * - GET /api/simuladores - Gestão de simuladores e sessões
 *
 * Bindings configurados:
 * - DB: D1 Database (airtrust-db)
 * - BUCKET: R2 Storage (airtrust-files)
 * - JWT_SECRET: Secret para autenticação JWT
 */

import { Hono } from 'hono';
import type { Env, Variables } from './types';
import { resolveAllowedOrigin } from './config/allowed-origins';
import { createWorkerEntrypoint } from './runtime/worker-entrypoint';
import { runApiBootstrap } from './runtime/api-bootstrap';
import { createApiNotFoundHandler } from './runtime/not-found-handler';

// Middlewares
import { cors } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { auth } from './middleware/auth';
import { cacheControl } from './middleware/cache';
import { noCacheMiddleware } from './middleware/no-cache';
import { buildLmsContentSecurityPolicy } from './lib/lms/security-headers';
import { provenanceHeadersMiddleware } from './middleware/provenance';
import { requestIdMiddleware } from './middleware/requestId';
import { rateLimiter, rateLimitPresets } from './middleware/rate-limit';
import { requireRole } from './middleware/rbac';
import { getTenantContext, tenantMiddleware } from './middleware/tenant';
import { domainEventProcessorMiddleware } from './middleware/domainEventProcessor';

// Cron
import { runScheduledJobs } from './cron/scheduled-handler';

// Rotas
import funcionariosRoutes from './routes/funcionarios';
import qualificacoesRoutes from './routes/qualificacoes';
import qualificacoesAlertasRoutes from './routes/qualificacoes-alertas';
import habilitacoesRoutes from './routes/habilitacoes';
import licencasRoutes from './routes/licencas';
import simuladoresRoutes from './routes/simuladores-core';
import horasVooRoutes from './routes/horas-voo';
import pastaVirtualRoutes from './routes/pasta-virtual';
import qualificacoesReclassRoutes from './routes/qualificacoes-reclass';
import qualificacoesCertificadosRoutes from './routes/qualificacoes-certificados';
import qualificacoesCertificadosAdminRoutes from './routes/qualificacoes-certificados-admin';
import validacaoCertificadosRoutes from './routes/certificados/validacao';
import categoriasRoutes from './routes/categorias';
import dashboardRoutes from './routes/dashboard';
import { authRoutes } from './routes/auth';
import { lookup } from './routes/lookup';
import funcoes from './routes/funcoes';
import setores from './routes/setores';
import setoresGestores from './routes/setores-gestores';
import adminOperationalDomainRbac from './routes/admin-operational-domain-rbac';
import meOperationalAccess from './routes/me-operational-access';
import matrizTreinamento from './routes/matriz-treinamento';
import aeronaves from './routes/aeronaves';
import modelosAeronave from './routes/modelos-aeronave';
// FASE 4: Ficha 360°, Compliance e Alertas
import ficha360Routes from './routes/ficha360';
import complianceRoutes from './routes/compliance';
import complianceRecalculateRoutes from './routes/compliance-recalculate';
import complianceRequisitosRoutes from './routes/compliance-requisitos';
import fixRenovadasRoutes from './routes/fix-renovadas';
import auditoriaRoutes from './routes/auditoria';
import alertasRoutes from './routes/alertas';
// Notificações
import notificacoesRoutes from './routes/notificacoes';
import assistenteRoutes from './routes/assistente';
// Importação Inteligente
import importacaoRoutes from './routes/importacao';
// Exportação
import exportacaoRoutes from './routes/exportacao';
// Importação XLSX
import importacaoXlsxRoutes from './routes/importacao-xlsx';
// Backup & Restore
import backupRoutes from './routes/backup';
// Integrações EdApp
import { sigvoosRouter } from './routes/integracoes_sigvoos';
import controleVoosRoutes from './routes/controle-voos';
import controleVoosRdvWorkflowRoutes from './routes/controle-voos-rdv-workflow';
import controleVoosRdvEtapasRoutes from './routes/controle-voos-rdv-etapas';
import controleVoosFrmsContractRoutes from './routes/controle-voos-frms-contract';
import controleVoosFrmsDispatchGateRoutes, {
  controleVoosDispatchGateGuard,
} from './routes/controle-voos-frms-dispatch-gate';
// Multi-Tenant (Empresas)
import { empresasRoutes } from './routes/empresas';
// Assets (R2)
import { assetsRouter } from './routes/assets';
// FRMS (Flight & Rest Management System)
import frmsRoutes from './routes/frms';
import frmsFadigaCheckinRoutes from './routes/frms-fadiga-checkin';
import frmsReadinessRoutes from './routes/frms-readiness';
import frmsOperationalSnapshotRoutes from './routes/frms-operational-snapshot';
import frmsReadAckRoutes from './routes/frms-read-ack';
import frmsOverrideRoutes from './routes/frms-override';
import frmsProjectionRoutes from './routes/frms-projection';
// SGSO — Sistema de Gerenciamento de Segurança Operacional
import sgsoRoutes from './routes/sgso';
import sgsoNextGenRoutes from './routes/sgso-next-gen';
import sgsoKpiRoutes from './routes/sgso-kpi';
import sgsoNextGenExtraRoutes from './routes/sgso-next-gen-extra';
// Hospedagem — Acomodações de tripulantes
import hospedagemRoutes from './routes/hospedagem';
// Escalas (Planejamento de Escala Mensal)
import escalasRoutes from './routes/escalas-core';
// EVD — Escala de Voo Diária (PRC-OPS-009)
import evdRoutes from './routes/escalas-evd';
// Solicitações de Treinamento (PRG-OPS-001)
import solicitacoesRoutes from './routes/solicitacoes-treinamento';
import treinamentosPlanejadosRoutes from './routes/treinamentos-planejados';
import notificacoesConvocacaoRoutes from './routes/notificacoes-convocacao';
// Confirmações de Escala (PRC-OPS-009 §6.3.3 — ciência do tripulante)
import escalasConfirmacoesRoutes from './routes/escalas-confirmacoes';
// FRMS — Fadiga Acumulada
import frmsFadigaAcumuladaRoutes from './routes/frms-fadiga-acumulada';
import preferenciasRoutes from './routes/preferencias';
import { adminUsuariosRoutes } from './routes/admin-usuarios';
import { adminPerfisRoutes } from './routes/admin-perfis';
import adminSimuladoresMatrizExecutorRoutes from './routes/admin-simuladores-matriz-executor';
import adminSimuladoresGuiasRelinkExecutorRoutes from './routes/admin-simuladores-guias-relink-executor';
import adminSimuladoresMatrizRemediationExecutorRoutes from './routes/admin-simuladores-matriz-remediation-executor';
import adminEadCategoryReconciliationRoutes from './routes/admin-ead-category-reconciliation';
import lmsCursosRoutes from './routes/lms-cursos';
import lmsMatriculasRoutes from './routes/lms-matriculas';
import lmsMatriculasMelManutencaoRoutes from './routes/lms-matriculas-mel-manutencao';
import lmsMatriculasCompletionDiagnosticsRoutes from './routes/lms-matriculas-completion-diagnostics';
import lmsAssetsRoutes from './routes/lms-assets';
import lmsProgressoRoutes from './routes/lms-progresso';
import lmsRelatoriosRoutes from './routes/lms-relatorios';
import lmsEdappLegadoRoutes from './routes/lms-edapp-legado';
import { registerPublicRoutes } from './routes/public-routes';
import { registerSystemRoutes } from './routes/system';
import { getReleaseMetadata } from './services/release-metadata';
import './shared/handlers';

// ===== CRIAR APP HONO =====
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ===== MIDDLEWARES GLOBAIS =====

// Applied after downstream handlers so 2xx, errors, and not-found responses
// all identify the exact Worker version that produced them.
app.use('*', provenanceHeadersMiddleware());

// Request ID - PRIMEIRO middleware (rastreamento de requisições)
app.use('*', requestIdMiddleware());

// No-cache middleware para staging (elimina 100% do cache CF)
// Só ativa em env != production
app.use('*', async (c, next) => {
  const env = (c.env as Env).ENVIRONMENT || 'development';
  if (env !== 'production') {
    return noCacheMiddleware()(c, next);
  }
  await next();
});

// Escalas é um fluxo operacional crítico e não pode ficar preso no cache do CDN.
app.use('/api/escalas', noCacheMiddleware());
app.use('/api/escalas/*', noCacheMiddleware());
app.use('/api/qualificacoes/historico', noCacheMiddleware());
app.use('/api/qualificacoes/historico/*', noCacheMiddleware());
app.use('/api/certificados', noCacheMiddleware());
app.use('/api/certificados/*', noCacheMiddleware());
// FRMS, SGSO e EVD são dados operacionais de segurança de voo — nunca servir cache.
app.use('/api/frms', noCacheMiddleware());
app.use('/api/frms/*', noCacheMiddleware());
app.use('/api/sgso', noCacheMiddleware());
app.use('/api/sgso/*', noCacheMiddleware());
app.use('/api/evd', noCacheMiddleware());
app.use('/api/evd/*', noCacheMiddleware());

// Rota catch-all para OPTIONS (preflight CORS) - DEVE VIR ANTES DO CORS
app.all('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    const origin = c.req.header('Origin');
    const resolvedOrigin = resolveAllowedOrigin(origin, c.env.CORS_ORIGINS);
    c.header('Access-Control-Allow-Origin', resolvedOrigin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, X-AirTrust-Bypass-Cache, X-EdApp-Secret, Idempotency-Key, X-Dev-Auth-Bypass, X-Maintenance-Secret, X-AirTrust-Maintenance',
    );
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Max-Age', '86400');
    c.status(204);
    return c.body(null);
  }
  await next();
});

// CORS - Permite requisições do frontend
app.use('*', cors());

// Cache Control - Configura headers de cache apropriados
app.use('*', cacheControl());

// Security Headers - aplicados globalmente antes de qualquer rota responder
app.use('*', async (c, next) => {
  await next();

  const pathname = new URL(c.req.url).pathname;
  const isScormRoute =
    pathname.startsWith('/api/lms/scorm/') || pathname.startsWith('/api/lms/h5p/');

  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (isScormRoute) {
    // SCORM/H5P: política única e restrita às origens oficiais do AirTrust.
    c.header('Content-Security-Policy', buildLmsContentSecurityPolicy());
  } else {
    c.header('X-Frame-Options', 'DENY');
    c.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: https:",
        "font-src 'self' data: https:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self' https: http: ws: wss:",
        "form-action 'self'",
        "manifest-src 'self'",
      ].join('; '),
    );
  }

  if ((c.env.ENVIRONMENT || 'development') === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
});

// Multi-tenant global guard (auth + tenant context), com exclusões explícitas de rotas públicas
app.use('/api/*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;

  const isPublicPath =
    pathname === '/api/health' ||
    pathname === '/api/version' ||
    pathname === '/api/capabilities' ||
    pathname.startsWith('/api/public/') ||
    pathname.startsWith('/api/assets/') ||
    pathname.startsWith('/api/lms/scorm/assets/') ||
    pathname.startsWith('/api/lms/scorm/assets-by-curso/') ||
    pathname.startsWith('/api/lms/scorm/launch/') ||
    pathname.startsWith('/api/lms/scorm/preview/') ||
    pathname.startsWith('/api/lms/h5p/assets/') ||
    pathname.startsWith('/api/lms/pptx/asset/') ||
    pathname.startsWith('/api/certificados/validar') ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/integracoes/edapp/webhook' ||
    pathname === '/api/alertas/whatsapp/status-callback';

  if (isPublicPath) {
    await next();
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return auth()(c as any, async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await tenantMiddleware()(c as any, next);
  });
});

app.use('/api/*', domainEventProcessorMiddleware());

// Logger - Loga todas as requisições
// Usar logger() simples ou detailedLogger() com mais info
// Logging pode ser reativado se necessário para debug fino

// Error Handler - Captura erros não tratados
app.onError(errorHandler);

// ===== ROOT ENDPOINT =====

/**
 * GET /
 * Endpoint raiz - redireciona para /api/health
 */
app.get('/', (c) => {
  return c.json({
    success: true,
    name: 'AirTrust Worker API',
    version: getReleaseMetadata(c.env).version,
    environment: c.env.ENVIRONMENT || 'development',
    endpoints: {
      health: '/api/health',
      version: '/api/version',
      auth: '/api/auth',
      funcionarios: '/api/funcionarios',
      qualificacoes: '/api/qualificacoes',
      licencas: '/api/licencas',
      dashboard: '/api/dashboard',
      ficha360: '/api/funcionarios/:id/ficha-360',
      compliance: '/api/funcionarios/:id/compliance',
      alertas: '/api/alertas/vencimentos',
    },
    documentation: 'https://github.com/fp-daumas/airtrust-v1',
  });
});

// Rotas públicas extraídas do index para reduzir concentração sem alterar contrato.
registerPublicRoutes(app);

// Rotas públicas/sistema extraídas do index para reduzir concentração sem alterar contrato.
registerSystemRoutes(app);

/**
 * POST /api/telemetry/client-error
 * Recebe telemetria de erros do frontend (chunk-load, dynamic import, etc.)
 */
app.post('/api/telemetry/client-error', auth(), async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
    const userId = c.get('userId');
    const empresaId = c.get('empresaId');

    const payload = {
      userId,
      empresaId,
      type: String(body?.type || 'frontend_error'),
      scope: String(body?.scope || 'unknown'),
      moduleKey: String(body?.moduleKey || 'unknown'),
      message: String(body?.message || '').slice(0, 1500),
      path: String(body?.path || c.req.path),
      href: String(body?.href || ''),
      userAgent: c.req.header('User-Agent') || null,
      timestamp: String(body?.timestamp || new Date().toISOString()),
    };

    console.error('[CLIENT_TELEMETRY]', JSON.stringify(payload));

    return c.json({ success: true });
  } catch (error) {
    console.error('[CLIENT_TELEMETRY] payload inválido:', error);
    return c.json({ success: false, error: 'Payload inválido' }, 400);
  }
});

// ===== DOCUMENTAÇÃO OPENAPI =====
import { openApiSpec, getSwaggerHtml } from './utils/openapi';

/**
 * GET /api/docs
 * Swagger UI - Interface visual para explorar a API
 */
app.get('/api/docs', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.html(getSwaggerHtml(`${baseUrl}/api/docs/openapi.json`));
});

/**
 * GET /api/docs/openapi.json
 * Especificação OpenAPI 3.0 em JSON
 */
app.get('/api/docs/openapi.json', (c) => {
  return c.json(openApiSpec);
});

// ===== RATE LIMITING PARA ENDPOINTS SENSÍVEIS =====

// Webhooks: 30 requisições por minuto por IP
app.use('/api/integracoes/edapp/webhook', rateLimiter(rateLimitPresets.webhook));
app.use('/api/alertas/whatsapp/status-callback', rateLimiter(rateLimitPresets.webhook));

// Upload: 10 uploads por minuto por IP
app.use('/api/pasta-virtual/upload', rateLimiter(rateLimitPresets.upload));

// Importação: 5 por 300s (operação pesada)
app.use(
  '/api/importacao/*',
  rateLimiter({ maxRequests: 5, windowSeconds: 300, keyPrefix: 'importacao' }),
);

// ===== MONTAR ROTAS =====

/**
 * Rotas de Autenticação
 * POST /api/auth/login
 * POST /api/auth/refresh
 * POST /api/auth/logout
 * GET  /api/auth/me
 */
app.route('/api/auth', authRoutes);
app.route('/api/admin/usuarios', adminUsuariosRoutes);
app.route('/api/admin/perfis', adminPerfisRoutes);
// Executor controlado da matriz de simuladores AW139/S-76 (empresa_id=6).
// Desabilitado por padrão (ENABLE_SIMULADORES_MATRIZ_EXECUTOR); nunca
// habilitar em produção sem autorização explícita para a execução.
app.use(
  '/api/admin/simuladores-matriz-import/*',
  rateLimiter({ maxRequests: 3, windowSeconds: 60, keyPrefix: 'simuladores-matriz-import' }),
);
app.route('/api/admin/simuladores-matriz-import', adminSimuladoresMatrizExecutorRoutes);
// Executor separado e atômico apenas para os 51 vínculos de guias de
// instrutor (empresa_id=6). Desabilitado por padrão
// (ENABLE_SIMULADORES_GUIA_RELINK_EXECUTOR); coberto pelo mesmo rate limiter
// acima (wildcard /api/admin/simuladores-matriz-import/*).
app.route('/api/admin/simuladores-matriz-import/guias', adminSimuladoresGuiasRelinkExecutorRoutes);
// Executor de remediação compensatória das 5 resoluções LEGACY_EQUIVALENT
// (empresa_id=6). Desabilitado por padrão (ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR);
// nunca habilitar em produção sem autorização explícita para a execução.
app.use(
  '/api/admin/simuladores-matriz-remediation/*',
  rateLimiter({ maxRequests: 3, windowSeconds: 60, keyPrefix: 'simuladores-matriz-remediation' }),
);
app.route(
  '/api/admin/simuladores-matriz-remediation',
  adminSimuladoresMatrizRemediationExecutorRoutes,
);
app.use(
  '/api/admin/ead-category-reconciliation/*',
  rateLimiter({ maxRequests: 3, windowSeconds: 60, keyPrefix: 'ead-category-reconciliation' }),
);
app.route('/api/admin/ead-category-reconciliation', adminEadCategoryReconciliationRoutes);
app.route('/api/preferencias', preferenciasRoutes);

/**
 * Rotas de Funcionários
 * GET    /api/funcionarios
 * GET    /api/funcionarios/:id
 * POST   /api/funcionarios
 * PUT    /api/funcionarios/:id
 * DELETE /api/funcionarios/:id
 */
app.route('/api/funcionarios', funcionariosRoutes);

/**
 * Rotas de Lookup (Funções, Setores, Aeronaves)
 * GET  /api/funcoes
 * POST /api/funcoes
 * DELETE /api/funcoes/:id
 * GET  /api/setores
 * POST /api/setores
 * DELETE /api/setores/:id
 * GET  /api/aeronaves
 * POST /api/aeronaves
 * DELETE /api/aeronaves/:id
 */

// ===== CADASTROS (Funcoes, Setores, Aeronaves) - REGISTRAR ANTES DO LOOKUP =====

/**
 * Funcoes Endpoints (registradas antes do lookup para ter prioridade)
 * GET    /api/funcoes
 * GET    /api/funcoes/:id
 * POST   /api/funcoes
 * PUT    /api/funcoes/:id
 * DELETE /api/funcoes/:id
 */
app.route('/api/funcoes', funcoes);

/**
 * Setores Endpoints (registradas antes do lookup para ter prioridade)
 * GET    /api/setores
 * GET    /api/setores/:id
 * POST   /api/setores
 * PUT    /api/setores/:id
 * DELETE /api/setores/:id
 */
app.route('/api/setores', setores);

/**
 * Setores-Gestores (Many-to-Many Relationship)
 * GET    /api/setores-gestores
 * GET    /api/setores-gestores/:id
 * GET    /api/setores-gestores/por-setor/:setor_id
 * GET    /api/setores-gestores/por-gestor/:gestor_id
 * GET    /api/setores-gestores/do-funcionario/:funcionario_id
 * POST   /api/setores-gestores
 * POST   /api/setores-gestores/bulk-assign/:setor_id
 * PUT    /api/setores-gestores/:id
 * DELETE /api/setores-gestores/:id
 */
app.route('/api/setores-gestores', setoresGestores);
app.route('/api/admin/operational-domain-rbac', adminOperationalDomainRbac);
app.route('/api/me/operational-access', meOperationalAccess);

/**
 * Matriz de Treinamento por Função
 * GET    /api/matriz-treinamento/registros
 * GET    /api/matriz-treinamento/funcoes
 * POST   /api/matriz-treinamento/registros
 * PUT    /api/matriz-treinamento/registros/:id
 * DELETE /api/matriz-treinamento/registros/:id
 * GET    /api/matriz-treinamento/requisitos/:funcionario_id
 * GET    /api/matriz-treinamento/resumo
 */
app.use('/api/matriz-treinamento', noCacheMiddleware());
app.use('/api/matriz-treinamento/*', noCacheMiddleware());
app.route('/api/matriz-treinamento', matrizTreinamento);

/**
 * Aeronaves Endpoints (registradas antes do lookup para ter prioridade)
 * GET    /api/aeronaves
 * GET    /api/aeronaves/:id
 * POST   /api/aeronaves
 * PUT    /api/aeronaves/:id
 * DELETE /api/aeronaves/:id
 */
app.route('/api/aeronaves', aeronaves);

/**
 * Modelos de Aeronaves Endpoints (registradas antes do lookup para ter prioridade)
 * GET    /api/modelos-aeronave
 * GET    /api/modelos-aeronave/:id
 * POST   /api/modelos-aeronave
 * PUT    /api/modelos-aeronave/:id
 * DELETE /api/modelos-aeronave/:id
 */
app.route('/api/modelos-aeronave', modelosAeronave);

// Assets (R2) - DEVE vir antes de rotas montadas em '/api' para evitar interceptação
app.route('/api/assets', assetsRouter);

// ===== LOOKUP ROUTES (generic CRUD lookup) =====

app.route('/api', lookup);

/**
 * Rotas de Qualificações
 * ⚠️ ORDEM CRÍTICA: Rotas específicas ANTES das genéricas!
 * Autenticação configurada individualmente em cada rota
 * GET    /api/qualificacoes/tipos
 * GET    /api/qualificacoes/historico (optionalAuth para leitura)
 * POST   /api/qualificacoes/historico (auth required)
 * PUT    /api/qualificacoes/historico/:id (auth required)
 * DELETE /api/qualificacoes/historico/:id (auth required)
 */
app.route('/api/qualificacoes/alertas', qualificacoesAlertasRoutes);
app.route('/api/notificacoes', notificacoesRoutes);
app.route('/api/assistente', assistenteRoutes);
app.route('/api/qualificacoes', qualificacoesRoutes);

// Fallback para GET /api/qualificacoes (root endpoint)
app.get('/api/qualificacoes', auth(), async (c) => {
  const db = c.env.DB;
  const { empresaId } = getTenantContext(c);
  const limitRaw = c.req.query('limit');
  const limitParsed = parseInt(limitRaw || '50', 10);
  const limitFinal = Math.min(Math.max(limitParsed, 1), 200);

  try {
    const stmt = db.prepare(
      'SELECT id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, observacoes, ativo, created_at, updated_at FROM qualificacoes_tipos WHERE deleted_at IS NULL AND empresa_id = ? ORDER BY categoria, nome LIMIT ?',
    );
    const { results } = await stmt.bind(empresaId, limitFinal).all();
    return c.json({
      success: true,
      data: results || [],
      meta: { count: (results || []).length, limit: limitFinal },
    });
  } catch (err) {
    console.error('[GET_QUALIFICACOES_ERROR]', (err as Error).message);
    return c.json({ success: false, error: 'Falha ao listar qualificações' }, 500);
  }
});

// Rota /api/qualificacoes/ com trailing slash redireciona para a sem trailing
app.get('/api/qualificacoes/', (c) => {
  const url = new URL(c.req.url);
  return c.redirect(`/api/qualificacoes${url.search}`, 301);
});

// Reclassificação manual diversidade
app.route('/api/qualificacoes/reclass', qualificacoesReclassRoutes);

/**
 * Rotas de Categorias de Qualificações
 * GET    /api/categorias
 * POST   /api/categorias
 * PUT    /api/categorias/:id
 * DELETE /api/categorias/:id
 */
app.route('/api/categorias', categoriasRoutes);

/**
 * Rotas de Habilitações (tabela com campos completos: renovações, timezone, etc)
 * GET    /api/habilitacoes
 */
app.route('/api/habilitacoes', habilitacoesRoutes);

/**
 * Rotas de Licenças
 * GET    /api/licencas
 * GET    /api/licencas/:id
 * POST   /api/licencas
 * PUT    /api/licencas/:id
 * DELETE /api/licencas/:id
 */
app.route('/api/licencas', licencasRoutes);

/**
 * Rotas do Dashboard
 * GET    /api/dashboard/geral
 * GET    /api/dashboard/qualificacoes
 * GET    /api/dashboard/licencas
 */
app.route('/api/dashboard', dashboardRoutes);

/**
 * Rotas de Ficha 360° - FASE 4
 * GET    /api/funcionarios/:id/ficha-360
 */
app.route('/api', ficha360Routes);

/**
 * Rotas de Compliance - FASE 4
 * GET    /api/funcionarios/:id/compliance
 * GET    /api/compliance/funcionarios
 * POST   /api/compliance/recalculate
 * GET    /api/compliance/stats
 */
app.route('/api', complianceRoutes);
app.route('/api/compliance', complianceRecalculateRoutes);
app.route('/api/compliance', complianceRequisitosRoutes);

/**
 * Rotas de Alertas - FASE 4
 * GET    /api/alertas/vencimentos
 */
app.route('/api', alertasRoutes);

/**
 * Rotas de Importação (CONSOLIDADAS)
 * POST   /api/importacao/validar-json
 * POST   /api/importacao/executar-json
 * GET    /api/importacao/historico/list
 */
app.route('/api/importacao', importacaoRoutes);

/**
 * Rotas de Exportação
 * GET    /api/exportacao/funcionarios - Exportar funcionários em XLSX
 * GET    /api/exportacao/qualificacoes-historico - Exportar histórico em XLSX
 * GET    /api/exportacao/qualificacoes-tipos - Exportar tipos em XLSX
 */
app.route('/api/exportacao', exportacaoRoutes);

/**
 * Rotas de Importação XLSX
 * POST   /api/importacao-xlsx/funcionarios - Importar funcionários
 * POST   /api/importacao-xlsx/historico - Importar histórico
 * POST   /api/importacao-xlsx/tipos - Importar tipos
 */
app.route('/api/importacao-xlsx', importacaoXlsxRoutes);

/**
 * Integrações EAD externas
 * EdApp foi descontinuado no produto; endpoints antigos permanecem apenas como
 * superfície de compatibilidade (retorno 410) até a ativação de novos provedores.
 */
app.all('/api/integracoes/edapp', (c) => {
  return c.json(
    {
      success: false,
      error:
        'Integração EdApp descontinuada. O EAD agora é nativo no AirTrust. A estrutura de integração externa permanece preparada para futuros provedores.',
      code: 'EDAPP_INTEGRATION_DISABLED',
    },
    410,
  );
});

app.all('/api/integracoes/edapp/*', (c) => {
  return c.json(
    {
      success: false,
      error:
        'Integração EdApp descontinuada. O EAD agora é nativo no AirTrust. A estrutura de integração externa permanece preparada para futuros provedores.',
      code: 'EDAPP_INTEGRATION_DISABLED',
    },
    410,
  );
});

app.route('/api/integracoes/sigvoos', sigvoosRouter);

// Controle de Voos N1 - endpoints operacionais internos
// Guard do gate de despacho FRMS: precisa rodar ANTES do handler real de
// POST /voos/:id/status (montado dentro de controleVoosRoutes) para poder
// bloquear a transicao planejado -> liberado_operacionalmente com 409
// quando houver pendencia. Registrado por path exato, nao por prefixo.
app.use('/api/controle-voos/voos/:id/status', controleVoosDispatchGateGuard());
// Rotas estáticas/específicas do workflow (incluindo /voos/meus) devem ser
// montadas antes do CRUD genérico /voos/:id para evitar captura de "meus" como id.
app.route('/api/controle-voos', controleVoosRdvWorkflowRoutes);
app.route('/api/controle-voos', controleVoosRoutes);
app.route('/api/controle-voos', controleVoosRdvEtapasRoutes);
app.route('/api/controle-voos', controleVoosFrmsContractRoutes);
app.route('/api/controle-voos', controleVoosFrmsDispatchGateRoutes);

/**
 * Rotas de Backup & Restore
 * GET    /api/backup - Lista backups
 * GET    /api/backup/:uuid - Detalhes do backup
 * POST   /api/backup/manual - Cria backup manual
 * POST   /api/backup/:uuid/restore - Restaura backup
 * DELETE /api/backup/:uuid - Remove backup
 */
app.route('/api/backup', backupRoutes);

/**
 * Rotas de Empresas (Multi-Tenant)
 * GET    /api/empresas - Listar empresas
 * GET    /api/empresas/:id - Detalhes de uma empresa
 * POST   /api/empresas - Criar empresa (super-admin)
 * PUT    /api/empresas/:id - Atualizar empresa
 * DELETE /api/empresas/:id - Remover empresa
 * GET    /api/empresas/:id/config - Configurações da empresa
 * PUT    /api/empresas/:id/config - Atualizar configurações
 * GET    /api/empresas/:id/usuarios - Listar usuários da empresa
 * POST   /api/empresas/:id/usuarios - Adicionar usuário à empresa
 * DELETE /api/empresas/:id/usuarios/:usuarioId - Remover usuário
 */
// tenantMiddleware já aplicado dentro do empresasRoutes
app.route('/api/empresas', empresasRoutes);

// FRMS — Gestão de Fadiga e Jornada
app.route('/api/frms', frmsRoutes);
// FRMS — Fadiga Acumulada (sub-módulo)
app.route('/api/frms', frmsFadigaAcumuladaRoutes);
// FRMS — Check-in diário de fadiga + bridge FRAT
app.route('/api/frms', frmsFadigaCheckinRoutes);
// FRMS — Avaliação objetiva de prontidão / vigilância breve
app.route('/api/frms/readiness', frmsReadinessRoutes);
// FRMS — Snapshot operacional diário (read-only)
app.route('/api/frms', frmsOperationalSnapshotRoutes);
// FRMS — D1 read/ack operacional sem mitigação
app.route('/api/frms', frmsReadAckRoutes);
// FRMS — Override operacional temporário em read/ack dedicado
app.route('/api/frms', frmsOverrideRoutes);
// FRMS — Projeção operacional read-only para planejamento
app.route('/api/frms', frmsProjectionRoutes);

// Caderneta de Horas de Voo
app.route('/api/horas-voo', horasVooRoutes);

// Escalas — Planejamento de Escala Mensal
app.route('/api/escalas', escalasRoutes);
// Escalas — Confirmações de ciência (PRC-OPS-009 §6.3.3)
app.route('/api/escalas', escalasConfirmacoesRoutes);

// EVD — Escala de Voo Diária (PRC-OPS-009)
app.route('/api/evd', evdRoutes);

// Solicitações de Treinamento (PRG-OPS-001)
app.route('/api/treinamentos', solicitacoesRoutes);
app.route('/api/treinamentos', treinamentosPlanejadosRoutes);
app.route('/api/notificacoes', notificacoesConvocacaoRoutes);

// LMS — Learning Management System
app.route('/api/lms/cursos', lmsCursosRoutes);
app.route('/api/lms/matriculas', lmsMatriculasCompletionDiagnosticsRoutes);
app.route('/api/lms/matriculas', lmsMatriculasRoutes);
app.route('/api/lms/matriculas/mel-manutencao', lmsMatriculasMelManutencaoRoutes);
app.route('/api/lms', lmsProgressoRoutes);
app.route('/api/lms', lmsAssetsRoutes);
app.route('/api/lms', lmsRelatoriosRoutes);
app.route('/api/lms', lmsEdappLegadoRoutes);

// Hospedagem — Acomodações de tripulantes
app.route('/api/hospedagem', hospedagemRoutes);

// SGSO — Sistema de Gerenciamento de Segurança Operacional
app.route('/api/sgso', sgsoRoutes);
app.route('/api/sgso', sgsoKpiRoutes);
app.route('/api/sgso/next', sgsoNextGenRoutes);
app.route('/api/sgso/next', sgsoNextGenExtraRoutes);

/**
 * Rotas de Templates (endpoint simplificado)
 * GET /api/templates - Lista todos os templates disponíveis
 */
app.get('/api/templates', auth(), async (c) => {
  return c.json(
    {
      success: false,
      error: 'TEMPLATES_ENDPOINT_UNAVAILABLE',
      message:
        'Endpoint legado indisponível; utilize endpoints específicos de templates por módulo',
    },
    503,
  );
});

/**
 * Rotas de Sessões (endpoint simplificado)
 * GET /api/sessoes - Lista todas as sessões
 */
app.get('/api/sessoes', auth(), async (c) => {
  try {
    const db = c.env.DB;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawEmpresaId = (c as any).get('empresaId');
    const empresaId = Number(rawEmpresaId);
    if (!Number.isFinite(empresaId) || empresaId <= 0) {
      return c.json(
        {
          success: false,
          error: 'TENANT_CONTEXT_REQUIRED',
          message: 'Contexto de empresa inválido para listar sessões',
        },
        403,
      );
    }

    const limitRaw = c.req.query('limit') || '50';
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200);
    const offsetRaw = c.req.query('offset') || '0';
    const offset = Math.max(parseInt(offsetRaw, 10) || 0, 0);

    // Tentar query simples sem JOIN
    const result = await db
      .prepare(
        `SELECT id, funcionario_id, modelo_aeronave_id, data_sessao, tipo,
	                status, observacoes, created_at, updated_at
	         FROM sessoes
	         WHERE deleted_at IS NULL
	           AND empresa_id = ?
	         ORDER BY data_sessao DESC, created_at DESC
	         LIMIT ? OFFSET ?`,
      )
      .bind(empresaId, limit, offset)
      .all();

    // Contar total
    const countResult = await db
      .prepare('SELECT COUNT(*) as total FROM sessoes WHERE deleted_at IS NULL AND empresa_id = ?')
      .bind(empresaId)
      .first<{ total: number }>();

    return c.json({
      success: true,
      data: result.results || [],
      total: countResult?.total || 0,
      limit,
      offset,
    });
  } catch (e) {
    console.error('[SESSOES] Erro ao listar:', e);
    return c.json(
      {
        success: false,
        error: 'SESSOES_LIST_FAILED',
        message: 'Erro interno ao listar sessões',
      },
      500,
    );
  }
});

/**
 * Rotas de Correção de Dados
 * POST   /api/qualificacoes-historico/fix-renovadas
 * GET    /api/qualificacoes-historico/fix-renovadas/stats
 * GET    /api/qualificacoes-historico/auditoria
 * POST   /api/qualificacoes-historico/deduplicate
 * GET    /api/qualificacoes-historico/deduplicate/preview
 */
import deduplicateRoutes from './routes/deduplicate';
app.route('/api/qualificacoes-historico/fix-renovadas', fixRenovadasRoutes);
app.route('/api/qualificacoes-historico/auditoria', auditoriaRoutes);
app.route('/api/qualificacoes-historico/deduplicate', deduplicateRoutes);

/**
 * Rotas administrativas não destrutivas.
 * Operações históricas de reset e migrations manuais foram removidas do runtime.
 */
import adminRoutes from './routes/admin';
app.use('/api/admin/*', auth(), requireRole('admin'));
app.route('/api/admin', adminRoutes);

// NOTA: Rotas EdApp já montadas em /api/integracoes/edapp via edappRouter (linha 480)
// Arquivo integracoes/edapp.ts mantido como referência mas não utilizado

/**
 * Alias /api/historico → /api/qualificacoes/historico
 * Mantém compatibilidade com chamadas antigas do frontend
 */
app.get('/api/historico', async (c) => {
  // Extrair query params
  const url = new URL(c.req.url);
  const queryString = url.search;

  // Redirecionar para rota completa preservando query params
  return c.redirect(`/api/qualificacoes/historico${queryString}`, 301);
});

/**
 * Rota de capabilities (flags não sensíveis expostas ao frontend)
 */
app.get('/api/capabilities', (c) => {
  const env = c.env as Env;
  return c.json({
    success: true,
    data: {
      simulador_shared_sessions: env.SIMULATOR_SHARED_SESSIONS_ENABLED === 'true',
    },
  });
});

/**
 * Rotas de Simuladores
 * GET    /api/simuladores
 * GET    /api/simuladores/sessoes
 * POST   /api/simuladores/sessoes
 * PUT    /api/simuladores/sessoes/:id
 * DELETE /api/simuladores/sessoes/:id
 */
app.route('/api/simuladores', simuladoresRoutes);

/**
 * Rotas de Pasta Virtual (R2)
 * POST   /api/pasta-virtual/upload
 * GET    /api/pasta-virtual
 * GET    /api/pasta-virtual/:id
 * GET    /api/pasta-virtual/download/:id
 * GET    /api/pasta-virtual/stream/:id
 * DELETE /api/pasta-virtual/:id
 * DELETE /api/pasta-virtual/delete/:id
 */
app.route('/api/pasta-virtual', pastaVirtualRoutes);

/**
 * Rotas de Certificados de Qualificações
 * GET    /api/certificados/funcionario/:id
 * GET    /api/certificados/historico/:id/certificados
 * POST   /api/certificados/historico/:id/certificados
 * DELETE /api/certificados/historico/:id/certificados/:certId
 */
app.route('/api/certificados', qualificacoesCertificadosRoutes);
app.route('/api/certificados', qualificacoesCertificadosAdminRoutes);

/**
 * Rota PÚBLICA de Validação de Certificados (SEM AUTENTICAÇÃO)
 * GET /api/certificados/validar/:hash - Valida certificado por hash
 */
app.route('/api/certificados/validar', validacaoCertificadosRoutes);

// Treinamentos removido - integrado em qualificações com status

// ===== 404 HANDLER =====

/**
 * Handler para rotas não encontradas
 * Retorna JSON para /api/*, mensagem simples para outras
 */
app.notFound(createApiNotFoundHandler());

// ===== EXPORTS =====

export { app };

/**
 * Handler principal do Worker
 * Recebe todas as requisições HTTP
 */
export default createWorkerEntrypoint(app, {
  onApiRequestBootstrap: runApiBootstrap,
  onScheduled: runScheduledJobs,
});
