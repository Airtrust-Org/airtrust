/**
 * EMPRESAS ROUTES - Multi-Tenant Management
 *
 * Endpoints para gerenciamento de empresas (multi-tenant)
 * Apenas super-admins podem criar/editar empresas
 *
 * @module routes/empresas
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { AppError } from '../utils/errors';
import {
  getTenantContext,
  isPlatformAdminContext,
  requireTenantRole,
  tenantMiddleware,
} from '../middleware/tenant';
import { generateRefreshToken } from '../utils/security';
import { registrarAuditoria } from '../utils/auditoria';
import { createLogger, toError } from '../utils/logger';
import { buildLegacyAuditoriaActor, buildLegacyAuditPayload } from '../lib/audit/context';
import empresasUsuariosRoutes from './empresas-usuarios';

const empresasRoutes = new Hono<{ Bindings: Env }>();

// Aplicar auth + tenantMiddleware em TODAS as rotas deste router
empresasRoutes.use('*', auth());
empresasRoutes.use('*', tenantMiddleware());

// ============================================
// SCHEMAS DE VALIDAÇÃO
// ============================================

const CreateEmpresaSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  cnpj: z.string().optional(),
  codigo: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[a-z0-9_-]+$/, 'Código deve ser alfanumérico (lowercase)'),
  logo_url: z.string().optional(), // ✅ Aceita caminhos relativos como /api/assets/logos/...
  plano: z.enum(['basic', 'pro', 'enterprise']).default('basic'),
  max_funcionarios: z.number().int().positive().default(100),
  max_storage_mb: z.number().int().positive().default(1000),
});

const UpdateEmpresaSchema = CreateEmpresaSchema.partial().omit({ codigo: true });

const EmpresaConfigSchema = z.object({
  // Certificados
  certificado_template_html: z.string().optional().nullable(),
  certificado_logo_url: z.string().url().optional().nullable(),
  certificado_assinatura_digital: z.string().optional().nullable(),
  // Config geral
  timezone: z.string().optional(),
  idioma: z.string().optional(),
  // EdApp (não editável pelo form, mas aceito)
  edapp_api_token: z.string().optional().nullable(),
  edapp_webhook_secret: z.string().optional().nullable(),
  edapp_webhook_id: z.string().optional().nullable(),
  edapp_ativo: z.number().optional(),
  // SMTP
  smtp_host: z.string().optional().nullable(),
  smtp_port: z.number().optional().nullable(),
  smtp_user: z.string().optional().nullable(),
  smtp_password: z.string().optional().nullable(),
  smtp_from: z.string().optional().nullable(),
  // Legacy fields (ignored but accepted for backwards compat)
  dias_alerta_vencimento: z.any().optional(),
  email_notificacoes: z.any().optional(),
  webhook_url: z.any().optional(),
  logo_relatorio: z.any().optional(),
  cores_tema: z.any().optional(),
  modulos_ativos: z.any().optional(),
});

const SistemaConfigSchema = z.object({
  appName: z.string().min(1).max(60).optional(),
  logoUrl: z.string().optional().nullable(),
  faviconUrl: z.string().optional().nullable(),
  compactHeader: z.boolean().optional(),
  defaultPageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).optional(),
  enableAnimations: z.boolean().optional(),
});

function inferImageExtension(fileName: string, contentType: string): string {
  const normalizedType = String(contentType || '')
    .trim()
    .toLowerCase();
  const fromMime: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
  };

  const byMime = fromMime[normalizedType];
  if (byMime) return byMime;

  const byName = (fileName.split('.').pop() || '').trim().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(byName)) {
    return byName === 'jpeg' ? 'jpg' : byName;
  }

  return 'png';
}

async function getEmpresaCoresTema(
  db: Env['DB'],
  empresaId: number,
): Promise<Record<string, unknown>> {
  const config = await db
    .prepare('SELECT cores_tema FROM empresas_config WHERE empresa_id = ?')
    .bind(empresaId)
    .first<{ cores_tema: string | null }>();

  if (!config?.cores_tema) return {};

  try {
    const parsed = JSON.parse(config.cores_tema);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveEmpresaSystemSettings(
  db: Env['DB'],
  empresaId: number,
  settings: Record<string, unknown>,
): Promise<void> {
  const coresTema = await getEmpresaCoresTema(db, empresaId);
  const merged = {
    ...coresTema,
    system_settings: {
      ...(typeof coresTema.system_settings === 'object' && coresTema.system_settings
        ? (coresTema.system_settings as Record<string, unknown>)
        : {}),
      ...settings,
    },
  };

  await db
    .prepare(
      `
      INSERT INTO empresas_config (empresa_id, cores_tema, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(empresa_id) DO UPDATE SET
        cores_tema = excluded.cores_tema,
        updated_at = datetime('now')
    `,
    )
    .bind(empresaId, JSON.stringify(merged))
    .run();
}

function isPlatformSuperAdmin(c: any): boolean {
  return isPlatformAdminContext(c);
}

// Tabela convites_usuarios criada via migration 0290 — não mais DDL em runtime.

async function enviarEmailConvite(
  env: Env,
  destinatario: string,
  nome: string,
  empresaNome: string,
  conviteUrl: string,
): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    console.warn('[INVITE] BREVO_API_KEY ausente. Email não enviado.');
    return false;
  }

  const fromEmail = env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online';
  const fromName = env.BREVO_FROM_NAME || 'Treinamento';
  const assunto = `Convite para acessar ${empresaNome} no AirTrust`;
  const corpo = `
    Olá ${nome || 'usuário'},

    Você foi convidado(a) para acessar a empresa ${empresaNome} no AirTrust.

    Para criar sua senha e concluir o acesso, clique no link abaixo:
    ${conviteUrl}

    Este link expira em 72 horas.

    Se você não esperava este convite, ignore este e-mail.
  `;

  if (env.BREVO_API_KEY) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: destinatario }],
        subject: assunto,
        textContent: corpo,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[INVITE] Erro Brevo:', errorText);
      throw new AppError('Falha ao enviar email de convite', 500);
    }

    return true;
  }

  throw new AppError('Falha ao enviar email de convite: BREVO_API_KEY não configurado', 500);
}

async function getUsuariosEmpresasFeatures(db: Env['DB']): Promise<{ hasModulosAtivos: boolean }> {
  const cols =
    (await db.prepare("PRAGMA table_info('usuarios_empresas')").all<{ name: string }>()).results ||
    [];
  return {
    hasModulosAtivos: cols.some((c) => c.name === 'modulos_ativos'),
  };
}

// ============================================
// GET /api/empresas/minha - Dados da minha empresa
// ============================================
empresasRoutes.get('/minha', async (c) => {
  const db = c.env.DB;
  const tenantCtx = getTenantContext(c);

  if (!tenantCtx.empresaId) {
    throw new AppError('Contexto de empresa não identificado', 400);
  }

  const empresa = await db
    .prepare(
      `
    SELECT e.*, 
           ec.dias_alerta_vencimento, ec.email_notificacoes, ec.webhook_url, 
           ec.timezone, ec.modulos_ativos, ec.logo_relatorio,
           ec.certificado_logo_url, ec.certificado_template_html, ec.cores_tema
    FROM empresas e
    LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
    WHERE e.id = ? AND e.deleted_at IS NULL
  `,
    )
    .bind(tenantCtx.empresaId)
    .first();

  if (!empresa) {
    // AUTO-RECOVERY: Se for a empresa principal (ID 1) e não existir, criar automaticamente
    // Isso evita travamento em dev/staging se o seed não foi rodado
    if (tenantCtx.empresaId === 1) {
      console.log('[AUTO-RECOVERY] Checando existência da empresa AirTrust (ID 1)...');

      try {
        // 1. Verificar se registro existe (mesmo deletado, para evitar erro de PK no INSERT)
        const existing = await db.prepare('SELECT id FROM empresas WHERE id = 1').first();

        if (existing) {
          console.log('[AUTO-RECOVERY] Restaurando empresa ID 1 (Soft Delete)...');
          await db
            .prepare(
              `
            UPDATE empresas 
            SET deleted_at = NULL, ativo = 1, nome = 'AirTrust System', updated_at = datetime('now')
            WHERE id = 1
          `,
            )
            .run();
        } else {
          console.log('[AUTO-RECOVERY] Inserindo nova empresa ID 1...');
          await db
            .prepare(
              `
            INSERT INTO empresas (id, nome, codigo, plano, max_funcionarios, max_storage_mb, ativo, created_at, updated_at) 
            VALUES (1, 'AirTrust System', 'airtrust', 'enterprise', 1000, 10240, 1, datetime('now'), datetime('now'))
          `,
            )
            .run();
        }

        // 2. Garantir configuração
        await db
          .prepare(
            `
          INSERT INTO empresas_config (empresa_id, modulos_ativos, updated_at)
          VALUES (1, '["treinamento","compliance","admin"]', datetime('now'))
          ON CONFLICT(empresa_id) DO UPDATE SET
            modulos_ativos = excluded.modulos_ativos,
            updated_at = datetime('now')
        `,
          )
          .run();

        // 3. Buscar e retornar
        const novaEmpresa = await db
          .prepare(
            `
          SELECT e.*, 
                 ec.dias_alerta_vencimento, ec.email_notificacoes, ec.webhook_url, 
                 ec.timezone, ec.modulos_ativos, ec.logo_relatorio,
                 ec.certificado_logo_url, ec.certificado_template_html, ec.cores_tema
          FROM empresas e
          LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
          WHERE e.id = 1
        `,
          )
          .first();

        if (novaEmpresa) {
          if (novaEmpresa.modulos_ativos && typeof novaEmpresa.modulos_ativos === 'string') {
            try {
              novaEmpresa.modulos_ativos = JSON.parse(novaEmpresa.modulos_ativos);
            } catch (_) {}
          }
          if (novaEmpresa.cores_tema && typeof novaEmpresa.cores_tema === 'string') {
            try {
              novaEmpresa.cores_tema = JSON.parse(novaEmpresa.cores_tema);
            } catch (_) {}
          }
          return c.json({ success: true, data: novaEmpresa });
        }
      } catch (err) {
        createLogger(c, 'Empresas').error('AUTO-RECOVERY: Falha crítica ID 1', toError(err));
        // Deixar cair no 404 original se falhar
      }
    }

    throw new AppError('Empresa não encontrada', 404);
  }

  // Parse JSON fields
  if (empresa.cores_tema && typeof empresa.cores_tema === 'string') {
    try {
      empresa.cores_tema = JSON.parse(empresa.cores_tema);
    } catch (e) {
      // ignore
    }
  }

  if (empresa.modulos_ativos && typeof empresa.modulos_ativos === 'string') {
    try {
      empresa.modulos_ativos = JSON.parse(empresa.modulos_ativos);
    } catch (e) {
      // fallback
      empresa.modulos_ativos = ['treinamento', 'compliance'];
    }
  }

  return c.json({
    success: true,
    data: empresa,
  });
});

// ============================================
// GET /api/empresas/minha/sistema - Config do sistema por empresa
// ============================================
empresasRoutes.get('/minha/sistema', async (c) => {
  const db = c.env.DB;
  const tenantCtx = getTenantContext(c);

  if (!tenantCtx.empresaId) {
    throw new AppError('Contexto de empresa não identificado', 400);
  }

  const empresa = await db
    .prepare(
      `
      SELECT e.id, e.nome, e.logo_url, ec.cores_tema
      FROM empresas e
      LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
      WHERE e.id = ? AND e.deleted_at IS NULL
    `,
    )
    .bind(tenantCtx.empresaId)
    .first<{ id: number; nome: string; logo_url: string | null; cores_tema: string | null }>();

  if (!empresa) {
    throw new AppError('Empresa não encontrada', 404);
  }

  let coresTema: Record<string, unknown> = {};
  if (empresa.cores_tema) {
    try {
      coresTema = JSON.parse(empresa.cores_tema) as Record<string, unknown>;
    } catch {
      coresTema = {};
    }
  }

  const systemSettings =
    coresTema.system_settings && typeof coresTema.system_settings === 'object'
      ? (coresTema.system_settings as Record<string, unknown>)
      : {};

  return c.json({
    success: true,
    data: {
      empresaId: empresa.id,
      appName:
        typeof systemSettings.appName === 'string' && systemSettings.appName.trim().length > 0
          ? systemSettings.appName
          : 'AirTrust',
      logoUrl:
        typeof systemSettings.logoUrl === 'string' && systemSettings.logoUrl.trim().length > 0
          ? systemSettings.logoUrl
          : null,
      faviconUrl:
        typeof systemSettings.faviconUrl === 'string' && systemSettings.faviconUrl.trim().length > 0
          ? systemSettings.faviconUrl
          : null,
      compactHeader: Boolean(systemSettings.compactHeader),
      defaultPageSize:
        systemSettings.defaultPageSize === 50 || systemSettings.defaultPageSize === 100
          ? systemSettings.defaultPageSize
          : 20,
      enableAnimations: systemSettings.enableAnimations !== false,
    },
  });
});

// ============================================
// PUT /api/empresas/minha/sistema - Salvar config do sistema por empresa
// ============================================
empresasRoutes.put('/minha/sistema', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const tenantCtx = getTenantContext(c);

  if (!tenantCtx.empresaId) {
    throw new AppError('Contexto de empresa não identificado', 400);
  }

  const payload = SistemaConfigSchema.parse(await c.req.json());

  await saveEmpresaSystemSettings(db, tenantCtx.empresaId, {
    appName: payload.appName ?? 'AirTrust',
    logoUrl: payload.logoUrl ?? null,
    faviconUrl: payload.faviconUrl ?? null,
    compactHeader: payload.compactHeader ?? false,
    defaultPageSize:
      payload.defaultPageSize === 50 || payload.defaultPageSize === 100
        ? payload.defaultPageSize
        : 20,
    enableAnimations: payload.enableAnimations ?? true,
  });

  return c.json({
    success: true,
    message: 'Configurações do sistema atualizadas com sucesso',
  });
});

// ============================================
// GET /api/empresas - Listar empresas (super-admin)
// ============================================
empresasRoutes.get('/', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;

  // Apenas admins da empresa principal (AirTrust) podem ver todas
  // Outros admins veem apenas sua própria empresa
  const tenantCtx = getTenantContext(c);

  let query: string;
  let params: unknown[] = [];

  if (isPlatformSuperAdmin(c)) {
    // Super-admin: ver todas
    query = `
      SELECT id, nome, cnpj, codigo, logo_url, plano,
             max_funcionarios, max_storage_mb, ativo, dominio, created_at
      FROM empresas
      WHERE deleted_at IS NULL
      ORDER BY nome
    `;
  } else {
    // Admin normal: ver apenas sua empresa
    query = `
      SELECT id, nome, cnpj, codigo, logo_url, plano,
             max_funcionarios, max_storage_mb, ativo, dominio, created_at
      FROM empresas
      WHERE id = ? AND deleted_at IS NULL
    `;
    params = [tenantCtx.empresaId];
  }

  const result = await db
    .prepare(query)
    .bind(...params)
    .all();

  return c.json({
    success: true,
    data: result.results,
  });
});

// ============================================
// GET /api/empresas/:id - Detalhes de uma empresa
// ============================================
empresasRoutes.get('/:id', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  // Verificar permissão
  if (!isPlatformSuperAdmin(c) && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para acessar esta empresa', 403);
  }

  try {
    const empresa = await db
      .prepare(
        `
      SELECT e.*, 
             ec.dias_alerta_vencimento, ec.email_notificacoes, ec.webhook_url, 
             ec.timezone, ec.modulos_ativos, ec.logo_relatorio,
             ec.certificado_logo_url, ec.certificado_template_html, ec.cores_tema
      FROM empresas e
      LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
      WHERE e.id = ? AND e.deleted_at IS NULL
    `,
      )
      .bind(id)
      .first<any>();

    if (!empresa) {
      throw new AppError('Empresa não encontrada', 404);
    }

    // Contar funcionários e uso de storage
    const stats = await db
      .prepare(
        `
      SELECT 
        (SELECT COUNT(*) FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL) as funcionarios,
        (SELECT COALESCE(SUM(a.tamanho), 0) 
         FROM arquivos a 
         INNER JOIN funcionarios f ON a.funcionario_id = f.id 
         WHERE f.empresa_id = ? AND a.deleted_at IS NULL) as storage_bytes
    `,
      )
      .bind(id, id)
      .first<{ funcionarios: number; storage_bytes: number }>();

    // Parse JSON fields
    if (empresa.cores_tema && typeof empresa.cores_tema === 'string') {
      try {
        empresa.cores_tema = JSON.parse(empresa.cores_tema);
      } catch (_) {
        // ignore
      }
    }

    if (empresa.modulos_ativos && typeof empresa.modulos_ativos === 'string') {
      try {
        empresa.modulos_ativos = JSON.parse(empresa.modulos_ativos);
      } catch (_) {
        // fallback
        empresa.modulos_ativos = ['treinamento', 'compliance'];
      }
    }

    return c.json({
      success: true,
      data: {
        ...empresa,
        stats: {
          funcionarios: stats?.funcionarios || 0,
          storage_mb: Math.round((stats?.storage_bytes || 0) / 1024 / 1024),
        },
      },
    });
  } catch (error: any) {
    createLogger(c, 'Empresas').error('GET /:id erro', toError(error));
    // Se for AppError, relançar
    if (error instanceof AppError) throw error; // Fix instanceof check just in case, or keep property check
    if (error.status) throw error;

    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

// ============================================
// POST /api/empresas - Criar nova empresa (super-admin only)
// ============================================
empresasRoutes.post('/', requireTenantRole('admin'), async (c) => {
  console.log('[EMPRESAS POST] Iniciando criação de empresa...');
  const db = c.env.DB;

  try {
    const tenantCtx = getTenantContext(c);
    console.log('[EMPRESAS POST] Tenant context:', tenantCtx);

    // Apenas super-admin pode criar empresas
    if (!isPlatformSuperAdmin(c)) {
      console.log('[EMPRESAS POST] Acesso negado - não é airtrust:', tenantCtx.empresaCodigo);
      throw new AppError('Apenas administradores do sistema podem criar empresas', 403);
    }

    const body = await c.req.json();
    console.log('[EMPRESAS POST] Body recebido:', body);

    const data = CreateEmpresaSchema.parse(body);
    console.log('[EMPRESAS POST] Dados validados:', data);

    // Verificar se código já existe (mesmo deletado)
    const existingEmpresa = await db
      .prepare('SELECT id, deleted_at FROM empresas WHERE codigo = ?')
      .bind(data.codigo)
      .first<{ id: number; deleted_at: string | null }>();

    if (existingEmpresa) {
      // Se existe e está ativo, erro
      if (!existingEmpresa.deleted_at) {
        console.log('[EMPRESAS POST] Código já existe (ativo):', data.codigo);
        throw new AppError(`Código '${data.codigo}' já está em uso`, 400);
      }

      // Se existe e está deletado, REATIVAR (Restore)
      console.log(
        '[EMPRESAS POST] Código existe (deletado). Reativando empresa ID:',
        existingEmpresa.id,
      );

      await db
        .prepare(
          `
          UPDATE empresas 
          SET nome = ?, cnpj = ?, logo_url = ?, plano = ?, max_funcionarios = ?, max_storage_mb = ?, ativo = 1, deleted_at = NULL, updated_at = datetime('now')
          WHERE id = ?
        `,
        )
        .bind(
          data.nome,
          data.cnpj || null,
          data.logo_url || null,
          data.plano,
          data.max_funcionarios,
          data.max_storage_mb,
          existingEmpresa.id,
        )
        .run();

      return c.json({
        success: true,
        data: {
          id: existingEmpresa.id,
          ...data,
          ativo: 1,
        },
        message: 'Empresa reativada com sucesso',
      });
    }

    // Criar nova empresa (se não existe)
    console.log('[EMPRESAS POST] Criando nova empresa...');
    const result = await db
      .prepare(
        `
      INSERT INTO empresas (nome, cnpj, codigo, logo_url, plano, max_funcionarios, max_storage_mb)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .bind(
        data.nome,
        data.cnpj || null,
        data.codigo,
        data.logo_url || null,
        data.plano,
        data.max_funcionarios,
        data.max_storage_mb,
      )
      .run();

    const empresaId = result.meta.last_row_id;
    console.log('[EMPRESAS POST] Empresa criada com ID:', empresaId);

    // Criar configuração padrão
    console.log('[EMPRESAS POST] Criando config padrão...');
    await db
      .prepare(
        `
      INSERT INTO empresas_config (empresa_id, modulos_ativos)
      VALUES (?, ?)
    `,
      )
      .bind(empresaId, JSON.stringify(['treinamento', 'compliance']))
      .run();

    console.log('[EMPRESAS POST] Sucesso!');
    await registrarAuditoria({
      db,
      tabela: 'empresas',
      acao: 'INSERT',
      registro_id: empresaId,
      dados_novos: buildLegacyAuditPayload(c, data, {
        empresa_id: empresaId,
        actor_empresa_id: getTenantContext(c).empresaId,
      }),
      ...buildLegacyAuditoriaActor(c),
    });
    return c.json(
      {
        success: true,
        data: { id: empresaId, ...data },
        message: 'Empresa criada com sucesso',
      },
      201,
    );
  } catch (error: any) {
    createLogger(c, 'Empresas').error('POST / erro ao criar empresa', toError(error));
    throw error;
  }
});

// ============================================
// PUT /api/empresas/:id - Atualizar empresa
// ============================================
empresasRoutes.put('/:id', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  try {
    // Verificar permissão
    if (!isPlatformSuperAdmin(c) && tenantCtx.empresaId !== id) {
      throw new AppError('Sem permissão para editar esta empresa', 403);
    }

    const body = await c.req.json();
    console.log('[PUT /empresas/:id] Body recebido:', JSON.stringify(body));

    // Permite updates parciais, inclusive toggle rápido de ativo/inativo.
    if (body.nome !== undefined && (typeof body.nome !== 'string' || body.nome.trim().length < 2)) {
      throw new AppError('Nome deve ter pelo menos 2 caracteres', 400);
    }

    // Verificar se empresa existe
    const exists = await db
      .prepare('SELECT id FROM empresas WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first();

    if (!exists) {
      // AUTO-RECOVERY: Se for ID 1 (AirTrust) e não existir, permitir recriar via PUT
      if (id === 1 && isPlatformSuperAdmin(c)) {
        await db
          .prepare(
            `
          INSERT INTO empresas (id, nome, codigo, plano, max_funcionarios, max_storage_mb, ativo, created_at, updated_at) 
          VALUES (1, ?, 'airtrust', ?, ?, ?, 1, datetime('now'), datetime('now'))
        `,
          )
          .bind(
            body.nome || 'AirTrust System',
            body.plano || 'enterprise',
            body.max_funcionarios || 1000,
            body.max_storage_mb || 10240,
          )
          .run();

        // Config
        await db
          .prepare(
            `
          INSERT INTO empresas_config (empresa_id)
          VALUES (1)
        `,
          )
          .run();

        // Se tinha CNPJ, atualizar depois
        if (body.cnpj) {
          await db.prepare('UPDATE empresas SET cnpj = ? WHERE id = 1').bind(body.cnpj).run();
        }

        return c.json({
          success: true,
          message: 'Empresa AirTrust recriada e atualizada com sucesso',
        });
      }

      throw new AppError('Empresa não encontrada', 404);
    }

    // Construir query de update dinamicamente
    // WHITELIST de campos permitidos (evita erro ao receber campos extras como 'stats')
    const allowedFields = [
      'nome',
      'cnpj',
      'logo_url',
      'plano',
      'max_funcionarios',
      'max_storage_mb',
      'ativo', // ✅ Adicionado para permitir ativar/desativar empresa
      'dominio', // ✅ Domínio de e-mail para auto-detecção de empresa no login
    ];

    const fields: string[] = [];
    const values: unknown[] = [];

    console.log('[PUT /empresas/:id] Iterando campos do body:', Object.keys(body));
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      throw new AppError('Nenhum campo para atualizar', 400);
    }

    fields.push("updated_at = datetime('now')");
    values.push(id);

    await db
      .prepare(
        `
    UPDATE empresas SET ${fields.join(', ')} WHERE id = ?
  `,
      )
      .bind(...values)
      .run();

    await registrarAuditoria({
      db,
      tabela: 'empresas',
      acao: 'UPDATE',
      registro_id: id,
      dados_novos: buildLegacyAuditPayload(c, body, { empresa_id: id }),
      ...buildLegacyAuditoriaActor(c),
    });

    return c.json({
      success: true,
      message: 'Empresa atualizada com sucesso',
    });
  } catch (error: unknown) {
    createLogger(c, 'Empresas').error('PUT /:id erro ao atualizar empresa', toError(error));

    // Se for erro de validação Zod
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      return c.json(
        {
          success: false,
          error: 'Erro de validação',
          details: 'errors' in error ? error.errors : undefined,
        },
        400,
      );
    }

    // Se for AppError, relançar
    if (error instanceof AppError) throw error;

    // Erro genérico
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

// ============================================
// DELETE /api/empresas/:id - Soft delete empresa
// ============================================
empresasRoutes.delete('/:id', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);

  // Apenas super-admin pode deletar empresas
  if (!isPlatformSuperAdmin(c)) {
    throw new AppError('Apenas administradores do sistema podem remover empresas', 403);
  }

  // Não permitir deletar a empresa AirTrust
  if (id === 1) {
    throw new AppError('Não é possível remover a empresa principal', 400);
  }

  // Verificar se tem dados
  const counts = await db
    .prepare(
      `
    SELECT 
      (SELECT COUNT(*) FROM funcionarios WHERE empresa_id = ? AND deleted_at IS NULL) as funcionarios,
      (SELECT COUNT(*) FROM arquivos a 
       INNER JOIN funcionarios f ON a.funcionario_id = f.id 
       WHERE f.empresa_id = ? AND a.deleted_at IS NULL) as arquivos
  `,
    )
    .bind(id, id)
    .first<{ funcionarios: number; arquivos: number }>();

  if ((counts?.funcionarios || 0) > 0) {
    throw new AppError(
      `Não é possível remover empresa com ${counts?.funcionarios} funcionários ativos. Remova-os primeiro.`,
      400,
    );
  }

  // Soft delete
  await db
    .prepare(
      `
    UPDATE empresas 
    SET deleted_at = datetime('now'), ativo = 0, updated_at = datetime('now')
    WHERE id = ?
  `,
    )
    .bind(id)
    .run();

  await registrarAuditoria({
    db,
    tabela: 'empresas',
    acao: 'DELETE',
    registro_id: id,
    dados_novos: buildLegacyAuditPayload(c, { deleted: true }, { empresa_id: id }),
    ...buildLegacyAuditoriaActor(c),
  });

  return c.json({
    success: true,
    message: 'Empresa removida com sucesso',
  });
});

// ============================================
// POST /api/empresas/:id/logo - Upload de logo
// ============================================
empresasRoutes.post('/:id/logo', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;

  if (!bucket) {
    createLogger(c, 'Empresas').error('Bucket R2 não configurado no ambiente');
    return c.json({ success: false, error: 'Storage não configurado' }, 500);
  }

  const id = parseInt(c.req.param('id'), 10);
  const target = c.req.query('target') || 'empresa'; // 'empresa' | 'certificado' | 'sistema-logo' | 'sistema-favicon'
  const tenantCtx = getTenantContext(c);

  // Admins e administradores da empresa podem atualizar o logo da própria empresa.
  if (!isPlatformSuperAdmin(c) && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para alterar logo desta empresa', 403);
  }

  // Verificar se empresa existe
  const empresa = await db
    .prepare('SELECT codigo FROM empresas WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<{ codigo: string }>();

  if (!empresa) {
    throw new AppError('Empresa não encontrada', 404);
  }

  const form = await c.req.formData();
  const file = form.get('file') as File | null;

  if (!file) {
    throw new AppError('Arquivo obrigatório', 400);
  }

  // Validar tamanho
  const MAX_SIZE =
    target === 'sistema-logo'
      ? 10 * 1024 * 1024
      : target === 'sistema-favicon'
        ? 10 * 1024 * 1024
        : 2 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    const maxSizeLabel = target === 'sistema-logo' || target === 'sistema-favicon' ? '10MB' : '2MB';
    throw new AppError(`Tamanho máximo excedido (${maxSizeLabel})`, 400);
  }

  // Validar tipo
  if (target === 'sistema-logo' || target === 'sistema-favicon') {
    if (file.type !== 'image/png') {
      throw new AppError('Para logo/favicon do sistema, apenas PNG é permitido', 400);
    }
  } else if (!file.type.startsWith('image/')) {
    throw new AppError('Apenas imagens são permitidas', 400);
  } else if (
    !['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(
      file.type.toLowerCase(),
    )
  ) {
    throw new AppError('Formato inválido. Use PNG, JPG, WEBP, GIF ou SVG.', 400);
  }

  try {
    // Gerar nome do arquivo no R2
    const fileExt = inferImageExtension(file.name, file.type);
    const cacheBuster = Date.now();
    const r2Key =
      target === 'certificado'
        ? `empresas/${id}/certificado-logo-${cacheBuster}.${fileExt}`
        : target === 'sistema-favicon'
          ? `empresas/${id}/favicon-${cacheBuster}.${fileExt}`
          : target === 'sistema-logo'
            ? `empresas/${id}/sistema-logo-${cacheBuster}.${fileExt}`
            : `empresas/${id}/logo-${cacheBuster}.${fileExt}`;

    // Upload para R2
    await bucket.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        empresa_id: String(id),
        codigo: empresa.codigo,
        uploaded_at: new Date().toISOString(),
        target,
      },
    });

    // Public URL (assumindo que existe um domínio público configurado para o bucket ou usando worker de assets)
    // Se não tiver domínio público, usar rota de stream ou R2 dev URL
    const publicUrl = `/api/assets/${r2Key}`;

    if (target === 'certificado') {
      // Atualizar empresas_config.certificado_logo_url
      // Upsert config se não existir
      await db
        .prepare(
          `
        INSERT INTO empresas_config (empresa_id, certificado_logo_url)
        VALUES (?, ?)
        ON CONFLICT(empresa_id) DO UPDATE SET
          certificado_logo_url = excluded.certificado_logo_url,
          updated_at = datetime('now')
      `,
        )
        .bind(id, publicUrl)
        .run();
    } else if (target === 'sistema-logo' || target === 'sistema-favicon') {
      await saveEmpresaSystemSettings(db, id, {
        ...(target === 'sistema-logo' ? { logoUrl: publicUrl } : {}),
        ...(target === 'sistema-favicon' ? { faviconUrl: publicUrl } : {}),
      });

      // Compatibilidade: várias telas ainda leem empresas.logo_url diretamente
      if (target === 'sistema-logo') {
        await db
          .prepare("UPDATE empresas SET logo_url = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(publicUrl, id)
          .run();
      }
    } else {
      // Atualizar empresas.logo_url
      await db
        .prepare("UPDATE empresas SET logo_url = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(publicUrl, id)
        .run();
    }

    return c.json({
      success: true,
      data: {
        logo_url: publicUrl,
        target,
      },
      message: 'Logo atualizado com sucesso',
    });
  } catch (error) {
    createLogger(c, 'Empresas').error('Erro no upload de logo', toError(error));
    throw new AppError('Erro ao fazer upload do logo', 500);
  }
});

// ============================================
// GET /api/empresas/:id/config - Config da empresa
// ============================================
empresasRoutes.get('/:id/config', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  if (
    tenantCtx.role !== 'admin' &&
    tenantCtx.empresaCodigo !== 'airtrust' &&
    tenantCtx.empresaId !== id
  ) {
    throw new AppError('Sem permissão para acessar configurações desta empresa', 403);
  }

  const config = await db
    .prepare(
      `
    SELECT * FROM empresas_config WHERE empresa_id = ?
  `,
    )
    .bind(id)
    .first();

  const templateAtivo = await db
    .prepare(
      `SELECT template_json
       FROM certificados_templates
       WHERE empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
       ORDER BY padrao DESC, updated_at DESC
       LIMIT 1`,
    )
    .bind(id)
    .first<{ template_json: string | null }>();

  return c.json({
    success: true,
    data: {
      ...(config || {}),
      certificado_template_html:
        templateAtivo?.template_json || (config as any)?.certificado_template_html || null,
    },
  });
});

// ============================================
// PUT /api/empresas/:id/config - Atualizar config
// ============================================
empresasRoutes.put('/:id/config', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para editar configurações desta empresa', 403);
  }

  try {
    const body = await c.req.json();
    const data = EmpresaConfigSchema.parse(body);

    // Upsert config - only use columns that exist in empresas_config table
    await db
      .prepare(
        `
      INSERT INTO empresas_config (
        empresa_id, certificado_template_html, certificado_logo_url, 
        certificado_assinatura_digital, timezone, idioma
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(empresa_id) DO UPDATE SET
        certificado_template_html = excluded.certificado_template_html,
        certificado_logo_url = excluded.certificado_logo_url,
        certificado_assinatura_digital = excluded.certificado_assinatura_digital,
        timezone = excluded.timezone,
        idioma = excluded.idioma,
        updated_at = datetime('now')
    `,
      )
      .bind(
        id,
        data.certificado_template_html || null,
        data.certificado_logo_url || null,
        data.certificado_assinatura_digital || null,
        data.timezone ?? 'America/Sao_Paulo',
        data.idioma ?? 'pt-BR',
      )
      .run();

    if (data.certificado_template_html && data.certificado_template_html.trim()) {
      await db
        .prepare(
          `UPDATE certificados_templates
           SET ativo = 0, updated_at = datetime('now')
           WHERE empresa_id = ? AND deleted_at IS NULL`,
        )
        .bind(id)
        .run();

      const existente = await db
        .prepare(
          `SELECT id FROM certificados_templates
           WHERE empresa_id = ? AND deleted_at IS NULL
           ORDER BY updated_at DESC, id DESC
           LIMIT 1`,
        )
        .bind(id)
        .first<{ id: number }>();

      if (existente?.id) {
        await db
          .prepare(
            `UPDATE certificados_templates
             SET template_json = ?, nome = ?, ativo = 1, padrao = 1, updated_at = datetime('now')
             WHERE id = ?`,
          )
          .bind(data.certificado_template_html, 'Template Certificado Ativo', existente.id)
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO certificados_templates (
               empresa_id, nome, template_json, ativo, padrao, created_at, updated_at
             ) VALUES (?, ?, ?, 1, 1, datetime('now'), datetime('now'))`,
          )
          .bind(id, 'Template Certificado Ativo', data.certificado_template_html)
          .run();
      }
    }

    return c.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
    });
  } catch (error: unknown) {
    createLogger(c, 'Empresas').error(
      'PUT /:id/config erro ao atualizar configurações',
      toError(error),
    );
    if (error instanceof AppError) throw error;
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

// Usuarios e logo-base64 montados via sub-router
empresasRoutes.route('/', empresasUsuariosRoutes);

export { empresasRoutes };
