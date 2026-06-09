// worker-airtrust/src/routes/integracoes_edapp.ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Env } from '../types';
import { requireRole } from '../middleware/rbac';
import { registrarAuditoria } from '../utils/auditoria';
import { createLogger, toError } from '../utils/logger';
import { getEmpresaIdSafe } from './escalas-shared';
import {
  createEdAppQualificacaoNotification,
  deleteEdAppConfig,
  edappErrorResponse,
  findFuncionarioByEdappUser,
  findQualificacaoByCourse,
  createQualificacao,
  callEdAppAPI,
  getEdAppConfigValue,
  parseEdAppCompletionPayload,
  upsertEdAppConfig,
} from './integracoes-edapp-helpers';
import { reconcileEdAppCourseProgress } from '../services/edapp-course-progress-reconciliation';
import edappEventosRoutes from './integracoes-edapp-eventos';

const edappRouter = new Hono<{ Bindings: Env }>();

edappRouter.use('*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.endsWith('/webhook') || pathname.endsWith('/ping')) {
    await next();
    return;
  }

  return requireRole('admin', 'manager')(c, next);
});

// Teste simples para verificar se o router funciona
edappRouter.get('/ping', (c) => {
  return c.json({ success: true, message: 'pong', timestamp: new Date().toISOString() });
});

// ========================================
// SCHEMAS ZOD
// ========================================

const WebhookSchema = z.object({
  event: z.enum(['CourseCompletedEvent', 'course.completed']),
  data: z.object({
    userId: z.string(),
    courseId: z.string(),
    completedAt: z.string().optional(),
    score: z.number().optional(),
    username: z.string().optional(),
    email: z.string().optional(),
  }),
});

const CreateMapeamentoUsuarioSchema = z.object({
  funcionario_id: z.number(),
  edapp_user_id: z.string(),
  edapp_email: z.string().optional(),
  edapp_username: z.string().optional(),
});

const CreateMapeamentoCursoSchema = z.object({
  edapp_course_id: z.string(),
  edapp_course_name: z.string().optional(),
  edapp_course_code: z.string().optional(),
  qualificacao_codigo: z.string(),
});

const SincronizarEdAppSchema = z.object({
  modified_since: z.string().optional(),
  lookback_hours: z
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .optional(),
  page_size: z.number().int().min(1).max(200).optional(),
  max_pages: z.number().int().min(1).max(100).optional(),
  user_id: z.string().optional(),
  user_external_id: z.string().optional(),
  course_id: z.string().optional(),
  course_external_id: z.string().optional(),
  update_watermark: z.boolean().optional(),
});

edappRouter.post('/webhook', async (c: Context) => {
  const logger = createLogger(c, 'EdApp.webhook');
  try {
    const secret = c.req.header('X-EdApp-Secret');
    if (secret !== c.env.EDAPP_WEBHOOK_SECRET) {
      return edappErrorResponse(c, 401, 'Unauthorized', 'EDAPP_UNAUTHORIZED');
    }

    const body = await c.req.json();
    const parsed = WebhookSchema.parse(body);
    const { event, data } = parsed;

    // Log evento
    const eventoResult = await c.env.DB.prepare(
      `
      INSERT INTO integracoes_edapp_eventos (tipo_evento, edapp_user_id, edapp_course_id, payload_json)
      VALUES (?, ?, ?, ?)
    `,
    )
      .bind(event, data.userId, data.courseId, JSON.stringify(body))
      .run();

    const eventoId = eventoResult.meta.last_row_id;

    // Só processar conclusão
    if (event !== 'CourseCompletedEvent' && event !== 'course.completed') {
      await c.env.DB.prepare(`UPDATE integracoes_edapp_eventos SET processado = 1 WHERE id = ?`)
        .bind(eventoId)
        .run();
      return c.json({ success: true, message: 'Evento ignorado', evento_id: eventoId });
    }

    // Mapear usuário
    const funcionario = await findFuncionarioByEdappUser(c.env.DB, {
      edappUserId: data.userId,
      edappEmail: data.email,
      edappUsername: data.username,
    });
    if (!funcionario?.funcionario_id) {
      await c.env.DB.prepare(
        `
        UPDATE integracoes_edapp_eventos SET erro_ultima = ?, tentativas = tentativas + 1 WHERE id = ?
      `,
      )
        .bind('Usuário não mapeado', eventoId)
        .run();
      return edappErrorResponse(c, 400, 'Usuário não mapeado', 'EDAPP_USER_NOT_MAPPED', {
        evento_id: eventoId,
      });
    }

    // Mapear curso
    const qualificacao = await findQualificacaoByCourse(c.env.DB, {
      courseId: data.courseId,
    });
    if (!qualificacao?.qualificacao_codigo) {
      await c.env.DB.prepare(
        `
        UPDATE integracoes_edapp_eventos SET erro_ultima = ?, tentativas = tentativas + 1 WHERE id = ?
      `,
      )
        .bind('Curso não mapeado', eventoId)
        .run();
      return edappErrorResponse(c, 400, 'Curso não mapeado', 'EDAPP_COURSE_NOT_MAPPED', {
        evento_id: eventoId,
      });
    }

    // Gerar qualificação
    const resultado = await createQualificacao(
      c.env.DB,
      funcionario.funcionario_id,
      qualificacao.qualificacao_codigo,
      `course_id:${data.courseId}`,
      data.completedAt, // Passar data de conclusão do EdApp
    );

    // Marcar processado E atualizar funcionario_id e qualificacao_historico_id
    await c.env.DB.prepare(
      `UPDATE integracoes_edapp_eventos 
       SET processado = 1, 
           funcionario_id = ?,
           qualificacao_historico_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
      .bind(funcionario.funcionario_id, resultado.qualificacao_id, eventoId)
      .run();

    if (resultado.created !== false && resultado.qualificacao_id) {
      // Derivar empresa_id do funcionário mapeado para scoping da notificação
      const funcEmpresa = (await c.env.DB.prepare(
        `SELECT empresa_id FROM funcionarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      )
        .bind(funcionario.funcionario_id)
        .first()) as { empresa_id: number | null } | null;
      await createEdAppQualificacaoNotification(c.env.DB, {
        empresaId: funcEmpresa?.empresa_id ?? null,
        funcionarioId: funcionario.funcionario_id,
        funcionarioNome: funcionario.funcionario_nome,
        qualificacaoCodigo: qualificacao.qualificacao_codigo,
        cursoNome: qualificacao.edapp_course_name,
        qualificacaoHistoricoId: resultado.qualificacao_id,
        dataConclusao: data.completedAt,
        score: data.score,
        courseId: data.courseId,
        renovacao: resultado.renovacao || false,
        origem: 'webhook',
      });
    }

    return c.json({
      success: true,
      data: {
        evento_id: eventoId,
        funcionario_id: funcionario.funcionario_id,
        qualificacao_codigo: qualificacao.qualificacao_codigo,
        qualificacao_id: resultado.qualificacao_id,
        qualificacao_criada: resultado.created !== false,
        qualificacao_duplicada: resultado.duplicate === true,
      },
    });
  } catch (error: any) {
    logger.error('Webhook EdApp erro', toError(error));
    return edappErrorResponse(
      c,
      500,
      error.message || 'Erro interno no webhook EdApp',
      'EDAPP_WEBHOOK_ERROR',
    );
  }
});

// ========================================
// ENDPOINT: CRIAR WEBHOOK NO EDAPP AUTOMATICAMENTE
// POST /api/integracoes/edapp/setup-webhook
// ========================================

edappRouter.post('/setup-webhook', async (c: Context) => {
  const logger = createLogger(c, 'EdApp.setupWebhook');
  try {
    const empresaId = getEmpresaIdSafe(c);
    // Construir URL do webhook (usar URL da API em produção)
    const baseUrl = new URL(c.req.url);
    const webhookUrl = `${baseUrl.protocol}//${baseUrl.host}/api/integracoes/edapp/webhook`;

    // Validar que temos o token
    if (!c.env.EDAPP_API_TOKEN) {
      throw new Error('EDAPP_API_TOKEN não configurado');
    }

    if (!c.env.EDAPP_WEBHOOK_SECRET) {
      throw new Error('EDAPP_WEBHOOK_SECRET não configurado');
    }

    // Criar webhook no EdApp seguindo documentação v2
    // Ref: https://rest.edapp.com/v2/webhooks
    // Campos obrigatórios: WebHookUrl, EventName (case-sensitive)
    const webhookPayload = {
      WebHookUrl: webhookUrl,
      EventName: 'CourseCompletedEvent',
      IsActive: true,
    };

    // Fazer chamada direta para tratar 409 especialmente
    const apiUrl = 'https://rest.edapp.com/v2/webhooks';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.EDAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    const responseText = await response.text();

    // Tratar webhook já existente (409 Conflict)
    if (response.status === 409) {
      // Buscar webhooks existentes
      const listResponse = await fetch('https://rest.edapp.com/v2/webhooks', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${c.env.EDAPP_API_TOKEN}`,
        },
      });
      const webhooks = (await listResponse.json()) as Array<{ id?: string; webHookUrl?: string }>;

      // Encontrar o webhook que corresponde à nossa URL
      const ourWebhook = webhooks.find((w) => w.webHookUrl === webhookUrl);
      if (ourWebhook?.id) {
        await upsertEdAppConfig(c.env.DB, 'webhook_id', String(ourWebhook.id), empresaId);
      }

      return c.json({
        success: true,
        data: {
          webhook_id: ourWebhook?.id || null,
          webhook_url: webhookUrl,
          message: 'Webhook já está configurado no EdApp',
          existing_webhooks: webhooks,
        },
      });
    }

    if (!response.ok) {
      logger.error(`EdApp webhook error [${response.status}]`, undefined, {
        responseText,
      });
      return edappErrorResponse(
        c,
        500,
        `EdApp API Error: ${response.status} - ${responseText}`,
        'EDAPP_WEBHOOK_SETUP_ERROR',
        {
          details: `Error: EdApp API Error: ${response.status} - ${responseText}`,
        },
      );
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    // Salvar ID do webhook - EdApp pode retornar diferentes formatos
    const resultData = result as Record<string, unknown>;
    const webhookId =
      resultData.Id ||
      resultData.id ||
      resultData.WebHookId ||
      resultData.webhookId ||
      (resultData.data as Record<string, unknown> | undefined)?.id ||
      (resultData.data as Record<string, unknown> | undefined)?.Id;

    if (!webhookId) {
      logger.error('Resposta EdApp sem ID reconhecido', undefined, {
        result: JSON.stringify(result, null, 2),
      });
      // Se não houver ID mas a resposta foi OK, retornar sucesso com aviso
      return c.json({
        success: true,
        data: {
          webhook_url: webhookUrl,
          raw_response: result,
          warning: 'Webhook possivelmente criado, mas ID não encontrado na resposta',
        },
      });
    }

    await upsertEdAppConfig(c.env.DB, 'webhook_id', String(webhookId), empresaId);

    return c.json({ success: true, data: { webhook_id: webhookId, webhook_url: webhookUrl } });
  } catch (error: any) {
    logger.error('Erro ao criar webhook', toError(error));
    return edappErrorResponse(c, 500, 'Erro ao criar webhook', 'EDAPP_WEBHOOK_CREATE_ERROR');
  }
});

// ========================================
// ENDPOINT: DELETAR WEBHOOK DO EDAPP
// DELETE /api/integracoes/edapp/webhook-config
// ========================================

edappRouter.delete('/webhook-config', async (c: Context<{ Bindings: Env }>) => {
  const logger = createLogger(c, 'EdApp.deleteWebhook');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const config = await getEdAppConfigValue(c.env.DB, 'webhook_id', empresaId);

    if (!config?.valor) {
      return edappErrorResponse(c, 404, 'Webhook não configurado', 'EDAPP_WEBHOOK_NOT_CONFIGURED');
    }

    await callEdAppAPI(c.env, 'DELETE', `/v2/webhooks/${config.valor}`);

    await deleteEdAppConfig(c.env.DB, 'webhook_id', empresaId);

    return c.json({ success: true, message: 'Webhook removido' });
  } catch (error: any) {
    logger.error('Erro ao deletar webhook', toError(error));
    return edappErrorResponse(
      c,
      500,
      error.message || 'Erro ao deletar webhook',
      'EDAPP_WEBHOOK_DELETE_ERROR',
    );
  }
});

// ========================================
// ENDPOINT: BUSCAR CURSOS DO EDAPP (CATALOG API)
// GET /api/integracoes/edapp/cursos-disponiveis
// ========================================

edappRouter.get('/cursos-disponiveis', async (c: Context) => {
  const logger = createLogger(c, 'EdApp.listCourses');
  try {
    // Try /v2/coursetemplates first (newer endpoint), fallback to /v2/courses
    let cursos: unknown;
    try {
      cursos = await callEdAppAPI(c.env, 'GET', '/v2/coursetemplates');
    } catch {
      cursos = await callEdAppAPI(c.env, 'GET', '/v2/courses');
    }
    return c.json({ success: true, data: cursos });
  } catch (error: any) {
    logger.error('Erro ao buscar cursos', toError(error));
    return edappErrorResponse(
      c,
      500,
      error.message || 'Erro ao buscar cursos',
      'EDAPP_LIST_COURSES_ERROR',
    );
  }
});

// ========================================
// ENDPOINT: BUSCAR USUÁRIOS DO EDAPP (USERS API)
// GET /api/integracoes/edapp/usuarios-disponiveis
// ========================================

edappRouter.get('/usuarios-disponiveis', async (c: Context) => {
  const logger = createLogger(c, 'EdApp.listUsers');
  try {
    // Fetch all pages to get all users (EdApp default page size is 25)
    const allItems: unknown[] = [];
    let page = 1;
    const pageSize = 100;
    let totalCount = 0;
    while (true) {
      const resp = (await callEdAppAPI(
        c.env,
        'GET',
        `/v2/users?pageSize=${pageSize}&page=${page}`,
      )) as { items?: unknown[]; totalCount?: number };
      const items = Array.isArray(resp.items) ? resp.items : [];
      if (page === 1) totalCount = resp.totalCount ?? items.length;
      allItems.push(...items);
      if (items.length < pageSize || allItems.length >= totalCount) break;
      page++;
    }
    const usuarios = { items: allItems, totalCount };
    return c.json({ success: true, data: usuarios });
  } catch (error: any) {
    logger.error('Erro ao buscar usuários', toError(error));
    return edappErrorResponse(
      c,
      500,
      error.message || 'Erro ao buscar usuários',
      'EDAPP_LIST_USERS_ERROR',
    );
  }
});

// ========================================
// CRUD: MAPEAMENTO USUÁRIOS
// ========================================

edappRouter.get('/usuarios', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const rows = await c.env.DB.prepare(
    `
    SELECT 
      ieu.*,
      f.nome as funcionario_nome,
      f.cpf as funcionario_cpf,
      f.matricula
    FROM integracoes_edapp_usuarios ieu
    LEFT JOIN funcionarios f ON ieu.funcionario_id = f.id AND f.empresa_id = ieu.empresa_id
    WHERE ieu.deleted_at IS NULL
      AND ieu.empresa_id = ?
    ORDER BY ieu.created_at DESC
  `,
  )
    .bind(empresaId)
    .all();
  return c.json({ success: true, data: rows.results });
});

edappRouter.post('/usuarios', async (c) => {
  const logger = createLogger(c, 'EdApp.users.create');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json();
    const validated = CreateMapeamentoUsuarioSchema.parse(body);

    const funcionario = await c.env.DB.prepare(
      `SELECT id
         FROM funcionarios
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL`,
    )
      .bind(validated.funcionario_id, empresaId)
      .first<{ id: number }>();

    if (!funcionario?.id) {
      return edappErrorResponse(
        c,
        400,
        'Funcionário não pertence à empresa atual',
        'EDAPP_USER_MAPPING_INVALID_FUNCIONARIO',
      );
    }

    // Verificar se existe usuário deletado com mesmo edapp_user_id
    const usuarioExistente = await c.env.DB.prepare(
      `
      SELECT id, deleted_at, empresa_id FROM integracoes_edapp_usuarios 
      WHERE edapp_user_id = ?
      ORDER BY CASE WHEN empresa_id = ? THEN 0 ELSE 1 END, id DESC
    `,
    )
      .bind(validated.edapp_user_id, empresaId)
      .first<{ id: number; deleted_at: string | null; empresa_id: number | null }>();

    if (usuarioExistente?.empresa_id && usuarioExistente.empresa_id !== empresaId) {
      return edappErrorResponse(
        c,
        400,
        'Usuário EdApp já vinculado a outra empresa',
        'EDAPP_USER_MAPPING_TENANT_CONFLICT',
      );
    }

    if (usuarioExistente) {
      // Usuário existe - fazer UPDATE/UNDELETE
      await c.env.DB.prepare(
        `
        UPDATE integracoes_edapp_usuarios 
        SET funcionario_id = ?,
            edapp_email = ?,
            edapp_username = ?,
            deleted_at = NULL,
            updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?
      `,
      )
        .bind(
          validated.funcionario_id,
          validated.edapp_email || '',
          validated.edapp_username || '',
          usuarioExistente.id,
          empresaId,
        )
        .run();
      await registrarAuditoria({
        db: c.env.DB,
        tabela: 'integracoes_edapp_usuarios',
        acao: 'UPDATE',
        registro_id: usuarioExistente.id,
        usuario_id: String((c as any).get?.('userId') ?? 'system'),
        dados_novos: validated,
      });
      return c.json({ success: true, id: usuarioExistente.id }, 201);
    }

    // Usuário não existe - criar novo
    const result = await c.env.DB.prepare(
      `
      INSERT INTO integracoes_edapp_usuarios (
        funcionario_id, edapp_user_id, edapp_email, edapp_username, empresa_id
      ) VALUES (?, ?, ?, ?, ?)
    `,
    )
      .bind(
        validated.funcionario_id,
        validated.edapp_user_id,
        validated.edapp_email || '',
        validated.edapp_username || '',
        empresaId,
      )
      .run();
    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'integracoes_edapp_usuarios',
      acao: 'INSERT',
      registro_id: result.meta.last_row_id,
      usuario_id: String((c as any).get?.('userId') ?? 'system'),
      dados_novos: validated,
    });
    return c.json({ success: true, id: result.meta.last_row_id }, 201);
  } catch (error: unknown) {
    logger.error('Erro ao criar mapeamento de usuário', toError(error));
    return edappErrorResponse(
      c,
      400,
      error instanceof Error ? error.message : 'Erro ao criar mapeamento de usuário',
      'EDAPP_USER_MAPPING_CREATE_ERROR',
    );
  }
});

edappRouter.delete('/usuarios/:id', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `
    UPDATE integracoes_edapp_usuarios
       SET deleted_at = datetime('now')
     WHERE id = ?
       AND empresa_id = ?
  `,
  )
    .bind(id, empresaId)
    .run();
  await registrarAuditoria({
    db: c.env.DB,
    tabela: 'integracoes_edapp_usuarios',
    acao: 'DELETE',
    registro_id: id,
    usuario_id: String((c as any).get?.('userId') ?? 'system'),
  });
  return c.json({ success: true });
});

// ========================================
// CRUD: MAPEAMENTO CURSOS
// ========================================

edappRouter.get('/cursos', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const rows = await c.env.DB.prepare(
    `
    SELECT *
      FROM integracoes_edapp_cursos
     WHERE deleted_at IS NULL
       AND empresa_id = ?
     ORDER BY created_at DESC
  `,
  )
    .bind(empresaId)
    .all();
  return c.json({ success: true, data: rows.results });
});

edappRouter.post('/cursos', async (c) => {
  const logger = createLogger(c, 'EdApp.courses.create');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const body = await c.req.json();

    const validated = CreateMapeamentoCursoSchema.parse(body);

    // Verificar se existe curso deletado com mesmo ID
    const cursoExistente = await c.env.DB.prepare(
      `
      SELECT id, deleted_at, empresa_id FROM integracoes_edapp_cursos 
      WHERE edapp_course_id = ?
      ORDER BY CASE WHEN empresa_id = ? THEN 0 ELSE 1 END, id DESC
    `,
    )
      .bind(validated.edapp_course_id, empresaId)
      .first<{ id: number; deleted_at: string | null; empresa_id: number | null }>();

    if (cursoExistente?.empresa_id && cursoExistente.empresa_id !== empresaId) {
      return edappErrorResponse(
        c,
        400,
        'Curso EdApp já vinculado a outra empresa',
        'EDAPP_COURSE_MAPPING_TENANT_CONFLICT',
      );
    }

    if (cursoExistente) {
      // Curso existe (deletado ou não) - fazer UPDATE
      await c.env.DB.prepare(
        `
        UPDATE integracoes_edapp_cursos 
        SET edapp_course_name = ?,
            edapp_course_code = ?,
            qualificacao_codigo = ?,
            deleted_at = NULL,
            updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?
      `,
      )
        .bind(
          validated.edapp_course_name || '',
          validated.edapp_course_code || '',
          validated.qualificacao_codigo,
          cursoExistente.id,
          empresaId,
        )
        .run();
      await registrarAuditoria({
        db: c.env.DB,
        tabela: 'integracoes_edapp_cursos',
        acao: 'UPDATE',
        registro_id: cursoExistente.id,
        usuario_id: String((c as any).get?.('userId') ?? 'system'),
        dados_novos: validated,
      });
      return c.json({ success: true, id: cursoExistente.id }, 201);
    }

    // Curso não existe - criar novo
    const result = await c.env.DB.prepare(
      `
      INSERT INTO integracoes_edapp_cursos (
        edapp_course_id, edapp_course_name, edapp_course_code, qualificacao_codigo, empresa_id
      ) VALUES (?, ?, ?, ?, ?)
    `,
    )
      .bind(
        validated.edapp_course_id,
        validated.edapp_course_name || '',
        validated.edapp_course_code || '',
        validated.qualificacao_codigo,
        empresaId,
      )
      .run();
    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'integracoes_edapp_cursos',
      acao: 'INSERT',
      registro_id: result.meta.last_row_id,
      usuario_id: String((c as any).get?.('userId') ?? 'system'),
      dados_novos: validated,
    });
    return c.json({ success: true, id: result.meta.last_row_id }, 201);
  } catch (error: unknown) {
    logger.error('Erro ao criar mapeamento de curso', toError(error));
    return edappErrorResponse(
      c,
      400,
      error instanceof Error ? error.message : 'Erro ao criar mapeamento de curso',
      'EDAPP_COURSE_MAPPING_CREATE_ERROR',
    );
  }
});

// ========================================
// ENDPOINT: DELETE CURSO
// DELETE /api/integracoes/edapp/cursos/:id
// ========================================

edappRouter.delete('/cursos/:id', async (c) => {
  const empresaId = getEmpresaIdSafe(c);
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `
    UPDATE integracoes_edapp_cursos
       SET deleted_at = datetime('now')
     WHERE id = ?
       AND empresa_id = ?
  `,
  )
    .bind(id, empresaId)
    .run();
  await registrarAuditoria({
    db: c.env.DB,
    tabela: 'integracoes_edapp_cursos',
    acao: 'DELETE',
    registro_id: id,
    usuario_id: String((c as any).get?.('userId') ?? 'system'),
  });
  return c.json({ success: true });
});

// ========================================
// ENDPOINT: DASHBOARD STATUS
// GET /api/integracoes/edapp/status
// ========================================

edappRouter.get('/status', async (c) => {
  const logger = createLogger(c, 'EdApp.status');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const webhookConfig = await getEdAppConfigValue(c.env.DB, 'webhook_id', empresaId);

    const statsEventos = await c.env.DB.prepare(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN processado = 1 THEN 1 ELSE 0 END) as processados,
        SUM(CASE WHEN erro_ultima IS NOT NULL THEN 1 ELSE 0 END) as erros,
        MAX(created_at) as ultimo_evento
      FROM integracoes_edapp_eventos
      WHERE deleted_at IS NULL
        AND empresa_id = ?
    `,
    )
      .bind(empresaId)
      .first();

    const statsUsuarios = await c.env.DB.prepare(
      `
      SELECT COUNT(*) as total
        FROM integracoes_edapp_usuarios
       WHERE deleted_at IS NULL
         AND ativo = 1
         AND empresa_id = ?
    `,
    )
      .bind(empresaId)
      .first();

    const statsCursos = await c.env.DB.prepare(
      `
      SELECT COUNT(*) as total
        FROM integracoes_edapp_cursos
       WHERE deleted_at IS NULL
         AND ativo = 1
         AND empresa_id = ?
    `,
    )
      .bind(empresaId)
      .first();

    const analyticsWatermark = await getEdAppConfigValue(
      c.env.DB,
      'analytics_courseprogress_last_completed_at',
      empresaId,
    );
    const analyticsLastRun = await getEdAppConfigValue(
      c.env.DB,
      'analytics_courseprogress_last_run_at',
      empresaId,
    );
    const analyticsLastResult = await getEdAppConfigValue(
      c.env.DB,
      'analytics_courseprogress_last_result_json',
      empresaId,
    );

    let analyticsLastResultParsed: unknown = null;
    try {
      analyticsLastResultParsed = analyticsLastResult?.valor
        ? JSON.parse(analyticsLastResult.valor)
        : null;
    } catch {
      analyticsLastResultParsed = null;
    }

    return c.json({
      success: true,
      data: {
        webhook_configurado: !!webhookConfig,
        webhook_id: webhookConfig?.valor || null,
        webhook_atualizado_em: webhookConfig?.updated_at || null,
        eventos: statsEventos,
        usuarios_mapeados: statsUsuarios?.total || 0,
        cursos_mapeados: statsCursos?.total || 0,
        analytics_sync: {
          last_completed_at: analyticsWatermark?.valor || null,
          last_completed_at_updated_at: analyticsWatermark?.updated_at || null,
          last_run_at: analyticsLastRun?.valor || null,
          last_run_at_updated_at: analyticsLastRun?.updated_at || null,
          last_result: analyticsLastResultParsed,
        },
      },
    });
  } catch (error: unknown) {
    logger.error('Erro ao buscar status do EdApp', toError(error));
    return edappErrorResponse(
      c,
      500,
      error instanceof Error ? error.message : 'Erro ao buscar status do EdApp',
      'EDAPP_STATUS_ERROR',
    );
  }
});

// ========================================
// ENDPOINT: SINCRONIZAR INTEGRAÇÃO
// POST /api/integracoes/edapp/sincronizar
// ========================================

edappRouter.post('/sincronizar', async (c) => {
  const logger = createLogger(c, 'EdApp.sync');
  try {
    const empresaId = getEmpresaIdSafe(c);
    let syncPayload: z.infer<typeof SincronizarEdAppSchema> = {};
    try {
      syncPayload = SincronizarEdAppSchema.parse(await c.req.json());
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        syncPayload = SincronizarEdAppSchema.parse({});
      }
    }

    const resultado = {
      usuarios_orfaos_removidos: 0,
      eventos_corrigidos: 0,
      mapeamentos_validados: 0,
      reconciliacao: null as Awaited<ReturnType<typeof reconcileEdAppCourseProgress>> | null,
      erros: [] as string[],
    };

    // 1. Remover mapeamentos órfãos (funcionários deletados)
    const orfaos = await c.env.DB.prepare(
      `
      UPDATE integracoes_edapp_usuarios 
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE funcionario_id IN (
        SELECT u.funcionario_id 
        FROM integracoes_edapp_usuarios u 
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        WHERE f.id IS NULL AND u.deleted_at IS NULL AND u.empresa_id = ?
      )
      AND deleted_at IS NULL
      AND empresa_id = ?
    `,
    )
      .bind(empresaId, empresaId)
      .run();

    resultado.usuarios_orfaos_removidos = orfaos.meta.changes || 0;

    // 2. Corrigir eventos processados mas sem funcionario_id
    const eventosCorrigir = await c.env.DB.prepare(
      `
      SELECT e.id, e.edapp_user_id, e.edapp_course_id
      FROM integracoes_edapp_eventos e
      WHERE e.processado = 1 
        AND e.funcionario_id IS NULL
        AND e.deleted_at IS NULL
        AND e.empresa_id = ?
      LIMIT 50
    `,
    )
      .bind(empresaId)
      .all();

    for (const evento of eventosCorrigir.results as any[]) {
      try {
        // Buscar funcionário
        const func = await findFuncionarioByEdappUser(c.env.DB, evento.edapp_user_id, empresaId);
        if (func?.funcionario_id) {
          await c.env.DB.prepare(
            `UPDATE integracoes_edapp_eventos 
             SET funcionario_id = ?, updated_at = datetime('now')
             WHERE id = ?`,
          )
            .bind(func.funcionario_id, evento.id)
            .run();
          resultado.eventos_corrigidos++;
        }
      } catch (err: unknown) {
        logger.error('Erro ao corrigir evento EdApp', toError(err), {
          eventoId: String(evento.id),
        });
        resultado.erros.push(
          `Evento ${evento.id}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
        );
      }
    }

    // 3. Validar mapeamentos ativos
    const mapeamentosValidos = await c.env.DB.prepare(
      `
      SELECT COUNT(*) as total
      FROM integracoes_edapp_usuarios u
      INNER JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
      WHERE u.deleted_at IS NULL AND u.ativo = 1 AND u.empresa_id = ?
    `,
    )
      .bind(empresaId)
      .first<{ total: number }>();

    resultado.mapeamentos_validados = mapeamentosValidos?.total || 0;

    resultado.reconciliacao = await reconcileEdAppCourseProgress({
      env: c.env,
      db: c.env.DB,
      trigger: 'manual',
      modifiedSince: syncPayload.modified_since,
      lookbackHours: syncPayload.lookback_hours,
      pageSize: syncPayload.page_size,
      maxPages: syncPayload.max_pages,
      updateWatermark:
        syncPayload.update_watermark ??
        !(
          syncPayload.user_id ||
          syncPayload.user_external_id ||
          syncPayload.course_id ||
          syncPayload.course_external_id
        ),
      userId: syncPayload.user_id,
      userExternalId: syncPayload.user_external_id,
      courseId: syncPayload.course_id,
      courseExternalId: syncPayload.course_external_id,
      empresaId,
    });

    return c.json({
      success: true,
      message: 'Sincronização concluída',
      data: resultado,
    });
  } catch (error: unknown) {
    logger.error('Erro ao sincronizar integração EdApp', toError(error));
    return edappErrorResponse(
      c,
      500,
      error instanceof Error ? error.message : 'Erro ao sincronizar integração EdApp',
      'EDAPP_SYNC_ERROR',
    );
  }
});

// ========================================
// ENDPOINT: PROCESSAR EVENTOS PENDENTES
// POST /api/integracoes/edapp/processar
// ========================================

edappRouter.post('/processar', async (c) => {
  const logger = createLogger(c, 'EdApp.processPending');
  try {
    const empresaId = getEmpresaIdSafe(c);
    const resultado = {
      eventos_processados: 0,
      qualificacoes_criadas: 0,
      qualificacoes_existentes: 0,
      erros: [] as string[],
    };

    // Buscar eventos pendentes (não processados)
    const eventosPendentes = await c.env.DB.prepare(
      `
      SELECT e.id, e.edapp_user_id, e.edapp_course_id, e.payload_json
           , e.tipo_evento
      FROM integracoes_edapp_eventos e
      WHERE e.processado = 0 
        AND e.deleted_at IS NULL
        AND e.empresa_id = ?
        AND e.tipo_evento IN ('CourseCompletedEvent', 'course.completed', 'analytics.courseprogress.completed')
      ORDER BY e.created_at ASC
      LIMIT 100
    `,
    )
      .bind(empresaId)
      .all();

    for (const evento of eventosPendentes.results as any[]) {
      try {
        const payload = parseEdAppCompletionPayload(evento.payload_json || '{}');

        // Mapear usuário
        const funcionario = await findFuncionarioByEdappUser(
          c.env.DB,
          {
            edappUserId: evento.edapp_user_id,
            userExternalId: payload.userExternalId,
          },
          empresaId,
        );
        if (!funcionario?.funcionario_id) {
          resultado.erros.push(`Evento ${evento.id}: Usuário ${evento.edapp_user_id} não mapeado`);
          continue;
        }

        // Mapear curso
        const qualificacao = await findQualificacaoByCourse(
          c.env.DB,
          {
            courseId: evento.edapp_course_id,
            courseExternalId: payload.courseExternalId,
            courseTitle: payload.courseTitle,
          },
          empresaId,
        );
        if (!qualificacao?.qualificacao_codigo) {
          resultado.erros.push(`Evento ${evento.id}: Curso ${evento.edapp_course_id} não mapeado`);
          continue;
        }

        // Extrair data de conclusão
        const completedAt = payload.completedAt || undefined;

        // Gerar qualificação
        const resultadoQual = await createQualificacao(
          c.env.DB,
          funcionario.funcionario_id,
          qualificacao.qualificacao_codigo,
          `course_id:${evento.edapp_course_id}`,
          completedAt,
          empresaId,
        );

        if (resultadoQual.success) {
          // Marcar processado
          await c.env.DB.prepare(
            `UPDATE integracoes_edapp_eventos 
             SET processado = 1, 
                 funcionario_id = ?,
                 qualificacao_historico_id = ?,
                 updated_at = datetime('now')
             WHERE id = ?`,
          )
            .bind(funcionario.funcionario_id, resultadoQual.qualificacao_id, evento.id)
            .run();

          resultado.eventos_processados++;
          if (resultadoQual.created === false) {
            resultado.qualificacoes_existentes++;
          } else if (resultadoQual.qualificacao_id) {
            resultado.qualificacoes_criadas++;
            await createEdAppQualificacaoNotification(c.env.DB, {
              empresaId,
              funcionarioId: funcionario.funcionario_id,
              funcionarioNome: funcionario.funcionario_nome,
              qualificacaoCodigo: qualificacao.qualificacao_codigo,
              cursoNome: qualificacao.edapp_course_name,
              qualificacaoHistoricoId: resultadoQual.qualificacao_id,
              dataConclusao: completedAt,
              courseId: evento.edapp_course_id,
              renovacao: resultadoQual.renovacao,
              origem:
                evento.tipo_evento === 'analytics.courseprogress.completed'
                  ? 'analytics'
                  : 'webhook',
            });
          } else {
            resultado.erros.push(`Evento ${evento.id}: qualificação criada sem ID retornado`);
          }
        } else {
          resultado.erros.push(`Evento ${evento.id}: ${resultadoQual.message}`);
        }
      } catch (err: unknown) {
        logger.error('Erro ao processar evento pendente EdApp', toError(err), {
          eventoId: String(evento.id),
        });
        resultado.erros.push(
          `Evento ${evento.id}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
        );
      }
    }

    return c.json({
      success: true,
      message: `Processamento concluído: ${resultado.eventos_processados} eventos`,
      data: resultado,
    });
  } catch (error: unknown) {
    logger.error('Erro ao processar eventos pendentes do EdApp', toError(error));
    return edappErrorResponse(
      c,
      500,
      error instanceof Error ? error.message : 'Erro ao processar eventos pendentes do EdApp',
      'EDAPP_PROCESS_PENDING_ERROR',
    );
  }
});

// Eventos, conclusões e importar-histórico via sub-router
edappRouter.route('/', edappEventosRoutes);

export { edappRouter };
