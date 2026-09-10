/// <reference types="@cloudflare/workers-types" />

/**
 * AIRTRUST WORKER - Entry Point
 *
 * Cloudflare Worker com Hono v4.
 */

import { Hono } from 'hono';
import type { Env, Variables } from './types';
import { resolveAllowedOrigin } from './config/allowed-origins';
import { createWorkerEntrypoint } from './runtime/worker-entrypoint';
import { runApiBootstrap } from './runtime/api-bootstrap';
import { createApiNotFoundHandler } from './runtime/not-found-handler';

import { cors } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { auth } from './middleware/auth';
import { cacheControl } from './middleware/cache';
import { noCacheMiddleware } from './middleware/no-cache';
import { buildLmsContentSecurityPolicy } from './lib/lms/security-headers';
import { provenanceHeadersMiddleware } from './middleware/provenance';
import { requestIdMiddleware } from './middleware/requestId';
import { rateLimiter, rateLimitPresets, tenantAwareKeyExtractor } from './middleware/rate-limit';
import { requireRole } from './middleware/rbac';
import { getTenantContext, tenantMiddleware } from './middleware/tenant';
import { domainEventProcessorMiddleware } from './middleware/domainEventProcessor';
import { runScheduledJobs } from './cron/scheduled-handler';

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
import ficha360Routes from './routes/ficha360';
import complianceRoutes from './routes/compliance';
import complianceRecalculateRoutes from './routes/compliance-recalculate';
import complianceRequisitosRoutes from './routes/compliance-requisitos';
import fixRenovadasRoutes from './routes/fix-renovadas';
import auditoriaRoutes from './routes/auditoria';
import alertasRoutes from './routes/alertas';
import notificacoesRoutes from './routes/notificacoes';
import assistenteRoutes from './routes/assistente';
import importacaoRoutes from './routes/importacao';
import exportacaoRoutes from './routes/exportacao';
import importacaoXlsxRoutes from './routes/importacao-xlsx';
import backupRoutes from './routes/backup';
import { sigvoosRouter } from './routes/integracoes_sigvoos';
import controleVoosRoutes from './routes/controle-voos';
import controleVoosRdvWorkflowRoutes from './routes/controle-voos-rdv-workflow';
import controleVoosRdvEtapasRoutes from './routes/controle-voos-rdv-etapas';
import controleVoosPilotOfflineRoutes from './routes/controle-voos-pilot-offline';
import controleVoosPilotSelfCreateRoutes from './routes/controle-voos-pilot-self-create';
import controleVoosFrmsContractRoutes from './routes/controle-voos-frms-contract';
import controleVoosFrmsDispatchGateRoutes, { controleVoosDispatchGateGuard } from './routes/controle-voos-frms-dispatch-gate';
import { empresasRoutes } from './routes/empresas';
import { assetsRouter } from './routes/assets';
import frmsRoutes from './routes/frms';
import frmsFadigaCheckinRoutes from './routes/frms-fadiga-checkin';
import frmsReadinessRoutes from './routes/frms-readiness';
import frmsOperationalSnapshotRoutes from './routes/frms-operational-snapshot';
import frmsReadAckRoutes from './routes/frms-read-ack';
import frmsOverrideRoutes from './routes/frms-override';
import frmsProjectionRoutes from './routes/frms-projection';
import sgsoRoutes from './routes/sgso';
import sgsoNextGenRoutes from './routes/sgso-next-gen';
import sgsoKpiRoutes from './routes/sgso-kpi';
import sgsoNextGenExtraRoutes from './routes/sgso-next-gen-extra';
import hospedagemRoutes from './routes/hospedagem';
import escalasRoutes from './routes/escalas-core';
import evdRoutes from './routes/escalas-evd';
import solicitacoesRoutes from './routes/solicitacoes-treinamento';
import treinamentosPlanejadosRoutes from './routes/treinamentos-planejados';
import notificacoesConvocacaoRoutes from './routes/notificacoes-convocacao';
import escalasConfirmacoesRoutes from './routes/escalas-confirmacoes';
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

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', provenanceHeadersMiddleware());
app.use('*', requestIdMiddleware());
app.use('*', async (c, next) => {
  const env = (c.env as Env).ENVIRONMENT || 'development';
  if (env !== 'production') return noCacheMiddleware()(c, next);
  await next();
});
app.use('/api/escalas', noCacheMiddleware());
app.use('/api/escalas/*', noCacheMiddleware());
app.use('/api/qualificacoes/historico', noCacheMiddleware());
app.use('/api/qualificacoes/historico/*', noCacheMiddleware());
app.use('/api/certificados', noCacheMiddleware());
app.use('/api/certificados/*', noCacheMiddleware());
app.use('/api/frms', noCacheMiddleware());
app.use('/api/frms/*', noCacheMiddleware());
app.use('/api/sgso', noCacheMiddleware());
app.use('/api/sgso/*', noCacheMiddleware());
app.use('/api/evd', noCacheMiddleware());
app.use('/api/evd/*', noCacheMiddleware());

app.all('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') {
    const origin = c.req.header('Origin');
    const resolvedOrigin = resolveAllowedOrigin(origin, c.env.CORS_ORIGINS);
    c.header('Access-Control-Allow-Origin', resolvedOrigin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, X-AirTrust-Bypass-Cache, X-EdApp-Secret, Idempotency-Key, X-Dev-Auth-Bypass, X-Maintenance-Secret, X-AirTrust-Maintenance');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Max-Age', '86400');
    c.status(204);
    return c.body(null);
  }
  await next();
});

app.use('*', cors());
app.use('*', cacheControl());
app.use('*', async (c, next) => {
  await next();
  const pathname = new URL(c.req.url).pathname;
  const isScormRoute = pathname.startsWith('/api/lms/scorm/') || pathname.startsWith('/api/lms/h5p/');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isScormRoute) {
    c.header('Content-Security-Policy', buildLmsContentSecurityPolicy());
  } else {
    c.header('X-Frame-Options', 'DENY');
    c.header('Content-Security-Policy', ["default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "object-src 'none'", "img-src 'self' data: https:", "font-src 'self' data: https:", "style-src 'self' 'unsafe-inline'", "script-src 'self'", "connect-src 'self' https: http: ws: wss:", "form-action 'self'", "manifest-src 'self'"].join('; '));
  }
  if ((c.env.ENVIRONMENT || 'development') === 'production') c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
});

app.use('/api/*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  const isPublicPath =
    pathname === '/api/health' || pathname === '/api/version' || pathname === '/api/capabilities' ||
    pathname.startsWith('/api/public/') || pathname.startsWith('/api/assets/') ||
    pathname.startsWith('/api/lms/scorm/assets/') || pathname.startsWith('/api/lms/scorm/assets-by-curso/') ||
    pathname.startsWith('/api/lms/scorm/launch/') || pathname.startsWith('/api/lms/scorm/preview/') ||
    pathname.startsWith('/api/lms/h5p/assets/') || pathname.startsWith('/api/lms/pptx/asset/') ||
    pathname === '/api/certificados/validar' || pathname.startsWith('/api/certificados/validar/') ||
    pathname.startsWith('/api/auth/') || pathname === '/api/integracoes/edapp/webhook' ||
    pathname === '/api/alertas/whatsapp/status-callback';
  if (isPublicPath) { await next(); return; }
  return auth()(c as never, async () => { await tenantMiddleware()(c as never, next); });
});

app.use('/api/*', domainEventProcessorMiddleware());
app.onError(errorHandler);

app.get('/', (c) => c.json({
  success: true,
  name: 'AirTrust Worker API',
  version: getReleaseMetadata(c.env).version,
  environment: c.env.ENVIRONMENT || 'development',
  endpoints: { health: '/api/health', version: '/api/version', auth: '/api/auth', funcionarios: '/api/funcionarios', qualificacoes: '/api/qualificacoes', licencas: '/api/licencas', dashboard: '/api/dashboard' },
  documentation: 'https://github.com/fp-daumas/airtrust-v1',
}));

registerPublicRoutes(app);
registerSystemRoutes(app);

app.post('/api/telemetry/client-error', auth(), async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();
    console.error('[CLIENT_TELEMETRY]', JSON.stringify({ userId: c.get('userId'), empresaId: c.get('empresaId'), type: String(body?.type || 'frontend_error'), scope: String(body?.scope || 'unknown'), moduleKey: String(body?.moduleKey || 'unknown'), message: String(body?.message || '').slice(0, 1500), path: String(body?.path || c.req.path), href: String(body?.href || ''), userAgent: c.req.header('User-Agent') || null, timestamp: String(body?.timestamp || new Date().toISOString()) }));
    return c.json({ success: true });
  } catch (error) {
    console.error('[CLIENT_TELEMETRY] payload inválido:', error);
    return c.json({ success: false, error: 'Payload inválido' }, 400);
  }
});

import { openApiSpec, getSwaggerHtml } from './utils/openapi';
app.get('/api/docs', (c) => c.html(getSwaggerHtml(`${new URL(c.req.url).origin}/api/docs/openapi.json`)));
app.get('/api/docs/openapi.json', (c) => c.json(openApiSpec));

app.use('/api/integracoes/edapp/webhook', rateLimiter(rateLimitPresets.webhook));
app.use('/api/alertas/whatsapp/status-callback', rateLimiter(rateLimitPresets.webhook));
app.use('/api/pasta-virtual/upload', rateLimiter(rateLimitPresets.upload));
app.use('/api/importacao/*', rateLimiter({ maxRequests: 5, windowSeconds: 300, keyPrefix: 'importacao', keyExtractor: tenantAwareKeyExtractor }));

app.route('/api/auth', authRoutes);
app.route('/api/admin/usuarios', adminUsuariosRoutes);
app.route('/api/admin/perfis', adminPerfisRoutes);
app.use('/api/admin/simuladores-matriz-import/*', rateLimiter({ maxRequests: 3, windowSeconds: 60, keyPrefix: 'simuladores-matriz-import', keyExtractor: tenantAwareKeyExtractor }));
app.route('/api/admin/simuladores-matriz-import', adminSimuladoresMatrizExecutorRoutes);
app.route('/api/admin/simuladores-matriz-import/guias', adminSimuladoresGuiasRelinkExecutorRoutes);
app.use('/api/admin/simuladores-matriz-remediation/*', rateLimiter({ maxRequests: 3, windowSeconds: 60, keyPrefix: 'simuladores-matriz-remediation', keyExtractor: tenantAwareKeyExtractor }));
app.route('/api/admin/simuladores-matriz-remediation', adminSimuladoresMatrizRemediationExecutorRoutes);
app.use('/api/admin/ead-category-reconciliation/*', rateLimiter({ maxRequests: 3, windowSeconds: 60, keyPrefix: 'ead-category-reconciliation', keyExtractor: tenantAwareKeyExtractor }));
app.route('/api/admin/ead-category-reconciliation', adminEadCategoryReconciliationRoutes);
app.route('/api/preferencias', preferenciasRoutes);
app.route('/api/funcionarios', funcionariosRoutes);
app.route('/api/funcoes', funcoes);
app.route('/api/setores', setores);
app.route('/api/setores-gestores', setoresGestores);
app.route('/api/admin/operational-domain-rbac', adminOperationalDomainRbac);
app.route('/api/me/operational-access', meOperationalAccess);
app.use('/api/matriz-treinamento', noCacheMiddleware());
app.use('/api/matriz-treinamento/*', noCacheMiddleware());
app.route('/api/matriz-treinamento', matrizTreinamento);
app.route('/api/aeronaves', aeronaves);
app.route('/api/modelos-aeronave', modelosAeronave);
app.route('/api/assets', assetsRouter);
app.route('/api', lookup);
app.route('/api/qualificacoes/alertas', qualificacoesAlertasRoutes);
app.route('/api/notificacoes', notificacoesRoutes);
app.route('/api/assistente', assistenteRoutes);
app.route('/api/qualificacoes', qualificacoesRoutes);
app.get('/api/qualificacoes', auth(), async (c) => {
  const db = c.env.DB;
  const { empresaId } = getTenantContext(c);
  const limitFinal = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10), 1), 200);
  try {
    const { results } = await db.prepare('SELECT id, tipo, codigo, nome, descricao, categoria, carga_horaria, validade, observacoes, ativo, created_at, updated_at FROM qualificacoes_tipos WHERE deleted_at IS NULL AND empresa_id = ? ORDER BY categoria, nome LIMIT ?').bind(empresaId, limitFinal).all();
    return c.json({ success: true, data: results || [], meta: { count: (results || []).length, limit: limitFinal } });
  } catch (err) {
    console.error('[GET_QUALIFICACOES_ERROR]', (err as Error).message);
    return c.json({ success: false, error: 'Falha ao listar qualificações' }, 500);
  }
});
app.get('/api/qualificacoes/', (c) => c.redirect(`/api/qualificacoes${new URL(c.req.url).search}`, 301));
app.route('/api/qualificacoes/reclass', qualificacoesReclassRoutes);
app.route('/api/categorias', categoriasRoutes);
app.route('/api/habilitacoes', habilitacoesRoutes);
app.route('/api/licencas', licencasRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api', ficha360Routes);
app.route('/api', complianceRoutes);
app.route('/api/compliance', complianceRecalculateRoutes);
app.route('/api/compliance', complianceRequisitosRoutes);
app.route('/api', alertasRoutes);
app.route('/api/importacao', importacaoRoutes);
app.route('/api/exportacao', exportacaoRoutes);
app.route('/api/importacao-xlsx', importacaoXlsxRoutes);
app.all('/api/integracoes/edapp', (c) => c.json({ success: false, error: 'Integração EdApp descontinuada. O EAD agora é nativo no AirTrust.' }, 410));
app.all('/api/integracoes/edapp/*', (c) => c.json({ success: false, error: 'Integração EdApp descontinuada. O EAD agora é nativo no AirTrust.' }, 410));
app.route('/api/integracoes/sigvoos', sigvoosRouter);

app.use('/api/controle-voos/voos/:id/status', controleVoosDispatchGateGuard());
app.route('/api/controle-voos', controleVoosRdvWorkflowRoutes);
app.route('/api/controle-voos', controleVoosPilotSelfCreateRoutes);
app.route('/api/controle-voos', controleVoosPilotOfflineRoutes);
app.route('/api/controle-voos', controleVoosRoutes);
app.route('/api/controle-voos', controleVoosRdvEtapasRoutes);
app.route('/api/controle-voos', controleVoosFrmsContractRoutes);
app.route('/api/controle-voos', controleVoosFrmsDispatchGateRoutes);

app.route('/api/backup', backupRoutes);
app.route('/api/empresas', empresasRoutes);
app.route('/api/frms', frmsRoutes);
app.route('/api/frms', frmsFadigaAcumuladaRoutes);
app.route('/api/frms', frmsFadigaCheckinRoutes);
app.route('/api/frms/readiness', frmsReadinessRoutes);
app.route('/api/frms', frmsOperationalSnapshotRoutes);
app.route('/api/frms', frmsReadAckRoutes);
app.route('/api/frms', frmsOverrideRoutes);
app.route('/api/frms', frmsProjectionRoutes);
app.route('/api/horas-voo', horasVooRoutes);
app.route('/api/escalas', escalasRoutes);
app.route('/api/escalas', escalasConfirmacoesRoutes);
app.route('/api/evd', evdRoutes);
app.route('/api/treinamentos', solicitacoesRoutes);
app.route('/api/treinamentos', treinamentosPlanejadosRoutes);
app.route('/api/notificacoes', notificacoesConvocacaoRoutes);
app.route('/api/lms/cursos', lmsCursosRoutes);
app.route('/api/lms/matriculas', lmsMatriculasCompletionDiagnosticsRoutes);
app.route('/api/lms/matriculas', lmsMatriculasRoutes);
app.route('/api/lms/matriculas/mel-manutencao', lmsMatriculasMelManutencaoRoutes);
app.route('/api/lms', lmsProgressoRoutes);
app.route('/api/lms', lmsAssetsRoutes);
app.route('/api/lms', lmsRelatoriosRoutes);
app.route('/api/lms', lmsEdappLegadoRoutes);
app.route('/api/hospedagem', hospedagemRoutes);
app.route('/api/sgso', sgsoRoutes);
app.route('/api/sgso', sgsoKpiRoutes);
app.route('/api/sgso/next', sgsoNextGenRoutes);
app.route('/api/sgso/next', sgsoNextGenExtraRoutes);

app.get('/api/templates', auth(), async (c) => c.json({ success: false, error: 'TEMPLATES_ENDPOINT_UNAVAILABLE', message: 'Endpoint legado indisponível; utilize endpoints específicos de templates por módulo' }, 503));
app.get('/api/sessoes', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = Number(c.get('empresaId'));
    if (!Number.isFinite(empresaId) || empresaId <= 0) return c.json({ success: false, error: 'TENANT_CONTEXT_REQUIRED', message: 'Contexto de empresa inválido para listar sessões' }, 403);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0);
    const result = await db.prepare(`SELECT id, funcionario_id, modelo_aeronave_id, data_sessao, tipo, status, observacoes, created_at, updated_at FROM sessoes WHERE deleted_at IS NULL AND empresa_id = ? ORDER BY data_sessao DESC, created_at DESC LIMIT ? OFFSET ?`).bind(empresaId, limit, offset).all();
    const countResult = await db.prepare('SELECT COUNT(*) as total FROM sessoes WHERE deleted_at IS NULL AND empresa_id = ?').bind(empresaId).first<{ total: number }>();
    return c.json({ success: true, data: result.results || [], total: countResult?.total || 0, limit, offset });
  } catch (e) {
    console.error('[SESSOES] Erro ao listar:', e);
    return c.json({ success: false, error: 'SESSOES_LIST_FAILED', message: 'Erro interno ao listar sessões' }, 500);
  }
});

import deduplicateRoutes from './routes/deduplicate';
app.route('/api/qualificacoes-historico/fix-renovadas', fixRenovadasRoutes);
app.route('/api/qualificacoes-historico/auditoria', auditoriaRoutes);
app.route('/api/qualificacoes-historico/deduplicate', deduplicateRoutes);
import adminRoutes from './routes/admin';
app.use('/api/admin/*', auth(), requireRole('admin'));
app.route('/api/admin', adminRoutes);
app.get('/api/historico', (c) => c.redirect(`/api/qualificacoes/historico${new URL(c.req.url).search}`, 301));
app.get('/api/capabilities', (c) => c.json({ success: true, data: { simulador_shared_sessions: (c.env as Env).SIMULATOR_SHARED_SESSIONS_ENABLED === 'true' } }));
app.route('/api/simuladores', simuladoresRoutes);
app.route('/api/pasta-virtual', pastaVirtualRoutes);
app.route('/api/certificados', qualificacoesCertificadosRoutes);
app.route('/api/certificados', qualificacoesCertificadosAdminRoutes);
app.route('/api/certificados/validar', validacaoCertificadosRoutes);
app.notFound(createApiNotFoundHandler());

export { app };
export default createWorkerEntrypoint(app, { onApiRequestBootstrap: runApiBootstrap, onScheduled: runScheduledJobs });
