/**
 * ADMIN USUARIOS ROUTES
 *
 * Gerenciamento completo de usuários: CRUD, convites, permissões individuais.
 * Requer perfil ADMINISTRADOR ou GESTOR (apenas admin pode alterar outros admins).
 *
 * Endpoints:
 *   GET    /api/admin/usuarios              - Listar usuários da empresa
 *   POST   /api/admin/usuarios              - Criar usuário (envia convite)
 *   GET    /api/admin/usuarios/:id          - Detalhar usuário
 *   PUT    /api/admin/usuarios/:id          - Atualizar usuário
 *   DELETE /api/admin/usuarios/:id          - Desativar usuário (soft delete)
 *   POST   /api/admin/usuarios/:id/invite   - Reenviar convite
 *   GET    /api/admin/usuarios/:id/permissoes - Permissões individuais
 *   PUT    /api/admin/usuarios/:id/permissoes - Atualizar permissões individuais
 *   GET    /api/admin/usuarios/funcionarios-sem-usuario - Funcionários sem usuário
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { badRequest, forbidden, notFound } from '../middleware/error-handler';
import { createLogger } from '../utils/logger';
import { hashPassword } from '../utils/security';
import {
  isManagerPerfil,
  assertSetoresValidosParaEmpresa,
  buildManagerSetorInsertStatements,
  SetorGestorValidationError,
} from '../services/setores-gestores';
import {
  isPlatformAdminAccess,
  resolvePlatformAccessState,
} from '../lib/rbac/platform-access';
// crypto.randomBytes está disponível via Node.js compat ou podemos usar crypto.getRandomValues

type AdminVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
};

const adminUsuariosRoutes = new Hono<{ Bindings: Env; Variables: AdminVars }>();

// Todos os endpoints requerem autenticação
adminUsuariosRoutes.use('/*', auth());
adminUsuariosRoutes.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

// ---------------------------------------------------------------------------
// Helper: garante que o caller é ADMINISTRADOR ou GESTOR
// ---------------------------------------------------------------------------
function requireAdminOrGestor(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN' && normalized !== 'GESTOR') {
    throw forbidden(
      action
        ? `Apenas ADMINISTRADOR ou GESTOR podem ${action}`
        : 'Acesso restrito a ADMINISTRADOR e GESTOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

function requireAdmin(role: string, action?: string): void {
  const normalized = role?.toUpperCase();
  if (normalized !== 'ADMINISTRADOR' && normalized !== 'ADMIN') {
    throw forbidden(
      action ? `Apenas ADMINISTRADOR pode ${action}` : 'Acesso restrito a ADMINISTRADOR',
      'INSUFFICIENT_ROLE',
    );
  }
}

/**
 * Verifica se o caller tem acesso ao usuário-alvo dentro do tenant.
 *
 * - Se o target tem vínculo com a empresa do caller → permitido.
 * - Se o caller é platform admin → permitido (cross-tenant).
 * - Caso contrário → 403 WRONG_TENANT.
 *
 * FAIL-CLOSED: contexto de empresa inválido (ausente/zero) bloqueia a operação
 * para qualquer perfil que não seja platform admin.
 */
async function requireTenantAccess(
  db: D1Database,
  callerId: number,
  targetUserId: number,
  empresaId: number,
): Promise<void> {
  // Fail-closed: invalid empresa context blocks non-platform-admin
  if (!empresaId || empresaId <= 0) {
    const platformAccessState = await resolvePlatformAccessState(db, callerId);
    if (!isPlatformAdminAccess(platformAccessState)) {
      throw forbidden('Contexto de empresa inválido', 'INVALID_TENANT_CONTEXT');
    }
    return; // platform admin pode operar sem tenant fixo (cross-tenant support)
  }

  const vinculo = await db
    .prepare(`SELECT 1 FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ?`)
    .bind(targetUserId, empresaId)
    .first();

  if (vinculo) return; // target pertence ao tenant do caller

  // Platform admin pode operar cross-tenant
  const platformAccessState = await resolvePlatformAccessState(db, callerId);
  if (isPlatformAdminAccess(platformAccessState)) return;

  throw forbidden('Usuário não pertence à sua empresa', 'WRONG_TENANT');
}

function getCallerId(c: { get: (k: string) => unknown }): number {
  const raw = c.get('userId');
  return typeof raw === 'string' ? Number(raw) : (raw as number);
}

function getCallerRole(c: { get: (k: string) => unknown }): string {
  return String(c.get('userRole') || '').toUpperCase();
}

// Gerar token de convite seguro (usar Web Crypto disponível no Workers)
function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Data de expiração do convite (48 horas)
function inviteExpiresAt(): string {
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function escapeInviteHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInviteLink(frontendUrl: string | undefined, inviteToken: string): string {
  const baseUrl = (frontendUrl || 'https://airtrust.online').replace(/\/$/, '');
  return `${baseUrl}/aceitar-convite?token=${encodeURIComponent(inviteToken)}`;
}

async function sendInviteEmail(
  env: Env,
  logger: ReturnType<typeof createLogger>,
  payload: { email: string; nome: string; perfil: string; inviteLink: string },
): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    return false;
  }

  try {
    const fromEmail = env.BREVO_FROM_EMAIL || 'treinamento@airtrust.online';
    const fromName = env.BREVO_FROM_NAME || 'Treinamento';

    if (env.BREVO_API_KEY) {
      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': env.BREVO_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: payload.email, name: payload.nome }],
          subject: 'Bem-vindo ao AirTrust — Defina sua senha',
          htmlContent: `
            <p>Olá, <strong>${escapeInviteHtml(payload.nome)}</strong>!</p>
            <p>Você foi convidado para acessar o AirTrust com o perfil <strong>${escapeInviteHtml(payload.perfil)}</strong>.</p>
            <p>Clique no botão abaixo para definir sua senha e ativar seu acesso:</p>
            <p><a href="${payload.inviteLink}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Ativar minha conta</a></p>
            <p>Este link expira em 48 horas.</p>
            <p>Se você não esperava este convite, ignore este e-mail.</p>
          `,
        }),
      });

      const emailSent = brevoResponse.status === 201;
      if (!emailSent) {
        logger.warn(
          `Brevo retornou status ${brevoResponse.status} para convite de ${payload.email}`,
        );
      }

      return emailSent;
    }

    return false;
  } catch (emailError) {
    logger.warn(`Falha ao enviar e-mail de convite para ${payload.email}:`, { error: String(emailError) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/funcionarios-sem-usuario
// Lista funcionários da empresa sem vínculo com usuário do sistema
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/funcionarios-sem-usuario', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'listar funcionários');
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;

  const rows = await db
    .prepare(
      `
      SELECT f.id, f.nome, f.email, f.matricula, f.cargo
      FROM funcionarios f
      WHERE f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND f.ativo = 1
        AND NOT EXISTS (
          SELECT 1 FROM usuarios u
          WHERE u.funcionario_id = f.id
            AND u.deleted_at IS NULL
            AND u.active = 1
        )
      ORDER BY f.nome ASC
      LIMIT 200
    `,
    )
    .bind(empresaId)
    .all<{
      id: number;
      nome: string;
      email: string | null;
      matricula: string | null;
      cargo: string | null;
    }>();

  return c.json({ success: true, data: rows.results || [] });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios
// Lista usuários da empresa (admin vê todas, gestor vê sua empresa)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'listar usuários');
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;

  // Admins globais podem ver todos; outros ficam restritos à empresa
  const callerRole = getCallerRole(c);
  const isGlobalAdmin = callerRole === 'ADMINISTRADOR' || callerRole === 'ADMIN';

  type UserRow = {
    id: number;
    email: string;
    nome: string;
    perfil: string;
    active: number;
    funcionario_id: number | null;
    funcionario_nome: string | null;
    empresa_id: number;
    empresa_nome: string;
    is_primary: number;
    created_at: string;
    last_login: string | null;
    convite_pendente: number;
  };

  let rows: UserRow[] = [];

  if (isGlobalAdmin) {
    const result = await db
      .prepare(
        `
        SELECT
          u.id,
          u.email,
          u.nome,
          COALESCE(ue.role, u.perfil) AS perfil,
          u.active,
          u.funcionario_id,
          f.nome AS funcionario_nome,
          ue.empresa_id,
          e.nome AS empresa_nome,
          ue.is_primary,
          u.created_at,
          u.last_login,
          (SELECT COUNT(*) FROM convites_usuarios cu
           WHERE cu.usuario_id = u.id AND cu.empresa_id = ue.empresa_id
           AND cu.used_at IS NULL AND datetime(cu.expires_at) > datetime('now')) AS convite_pendente
        FROM usuarios u
        INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id
        INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        WHERE u.deleted_at IS NULL
        ORDER BY u.nome ASC
      `,
      )
      .all<UserRow>();
    rows = result.results || [];
  } else {
    const result = await db
      .prepare(
        `
        SELECT
          u.id,
          u.email,
          u.nome,
          COALESCE(ue.role, u.perfil) AS perfil,
          u.active,
          u.funcionario_id,
          f.nome AS funcionario_nome,
          ue.empresa_id,
          e.nome AS empresa_nome,
          ue.is_primary,
          u.created_at,
          u.last_login,
          (SELECT COUNT(*) FROM convites_usuarios cu
           WHERE cu.usuario_id = u.id AND cu.empresa_id = ?
           AND cu.used_at IS NULL AND datetime(cu.expires_at) > datetime('now')) AS convite_pendente
        FROM usuarios u
        INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
        INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        WHERE u.deleted_at IS NULL
        ORDER BY u.nome ASC
      `,
      )
      .bind(empresaId, empresaId)
      .all<UserRow>();
    rows = result.results || [];
  }

  return c.json({ success: true, data: rows });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/:id
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'ver usuário');
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  type UserDetail = {
    id: number;
    email: string;
    nome: string;
    perfil: string;
    active: number;
    funcionario_id: number | null;
    funcionario_nome: string | null;
    empresa_id: number;
    created_at: string;
    last_login: string | null;
  };

  const user = await db
    .prepare(
      `
      SELECT
        u.id, u.email, u.nome, u.perfil, u.active,
        u.funcionario_id, f.nome AS funcionario_nome,
        (SELECT empresa_id FROM usuarios_empresas WHERE usuario_id = u.id LIMIT 1) AS empresa_id,
        u.created_at, u.last_login
      FROM usuarios u
      LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
      WHERE u.id = ? AND u.deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(id)
    .first<UserDetail>();

  if (!user) throw notFound('Usuário não encontrado');

  // Verificar vínculo com a empresa (platform admin pode cross-tenant)
  await requireTenantAccess(db, getCallerId(c), id, empresaId);

  // Carregar permissões individuais
  const permissoes = await db
    .prepare(
      `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
    )
    .bind(id)
    .all<{ permissao: string; tipo: string }>();

  return c.json({
    success: true,
    data: {
      ...user,
      permissoes: permissoes.results || [],
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/usuarios
// Criar novo usuário e disparar convite
// ---------------------------------------------------------------------------
adminUsuariosRoutes.post('/', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'criar usuário');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const tenantCtx = getTenantContext(c);
  const { empresaId, empresaCodigo } = tenantCtx;
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.create');

  const body = await c.req.json<{
    email?: string;
    nome?: string;
    perfil?: string;
    funcionario_id?: number | null;
    empresa_id?: number;
    setor_ids?: number[];
  }>();

  const email = String(body?.email || '')
    .trim()
    .toLowerCase();
  const nome = String(body?.nome || '').trim();
  const perfil = String(body?.perfil || 'ALUNO').toUpperCase();
  const funcionarioId = body?.funcionario_id ?? null;
  const targetEmpresaId = Number(body?.empresa_id ?? empresaId);
  const isManager = isManagerPerfil(perfil);

  if (!email || !nome) {
    throw badRequest('email e nome são obrigatórios', 'MISSING_FIELDS');
  }

  if (!Number.isFinite(targetEmpresaId) || targetEmpresaId <= 0) {
    throw badRequest('empresa_id inválido', 'INVALID_EMPRESA_ID');
  }

  if (empresaCodigo !== 'airtrust' && targetEmpresaId !== empresaId) {
    throw forbidden('Sem permissão para convidar usuários para outra empresa', 'WRONG_TENANT');
  }

  // Gestor não pode criar ADMINISTRADOR
  if (perfil === 'ADMINISTRADOR' || perfil === 'ADMIN') {
    requireAdmin(callerRole, 'criar usuário ADMINISTRADOR');
  }

  // Gestor exige ao menos um setor válido da mesma empresa (fail-closed por design)
  let setorIdsValidados: number[] = [];
  if (isManager) {
    try {
      setorIdsValidados = await assertSetoresValidosParaEmpresa(db, targetEmpresaId, body?.setor_ids);
    } catch (err) {
      if (err instanceof SetorGestorValidationError) {
        throw badRequest(err.message, 'MANAGER_REQUIRES_SECTOR');
      }
      throw err;
    }
  }

  // Validar e-mail básico
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('E-mail inválido', 'INVALID_EMAIL');
  }

  // Verificar se email já existe
  const existing = await db
    .prepare(`SELECT id FROM usuarios WHERE email = ? AND deleted_at IS NULL LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (existing) {
    throw badRequest('E-mail já cadastrado no sistema', 'EMAIL_ALREADY_EXISTS');
  }

  // Criar usuário (sem senha — será definida via convite)
  const placeholderHash = `INVITE_PENDING_${Date.now()}`;

  const insertResult = await db
    .prepare(
      `INSERT INTO usuarios (email, password_hash, nome, perfil, funcionario_id, active)
       VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .bind(email, placeholderHash, nome, perfil, funcionarioId)
    .run();

  const novoUsuarioId = insertResult.meta?.last_row_id as number;

  if (!novoUsuarioId) {
    throw new Error('Falha ao criar usuário');
  }

  // Vincular à empresa e, se gestor, gravar os setores atomicamente com o vínculo
  if (isManager) {
    const setorStatements = await buildManagerSetorInsertStatements(
      db,
      targetEmpresaId,
      novoUsuarioId,
      setorIdsValidados,
    );
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role)
           VALUES (?, ?, 1, ?)`,
        )
        .bind(novoUsuarioId, targetEmpresaId, perfil),
      ...setorStatements,
    ]);
  } else {
    await db
      .prepare(
        `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role)
         VALUES (?, ?, 1, ?)`,
      )
      .bind(novoUsuarioId, targetEmpresaId, perfil)
      .run();
  }

  // Gerar token de convite (48h)
  const inviteToken = generateInviteToken();
  const expiresAt = inviteExpiresAt();

  await db
    .prepare(
      `INSERT INTO convites_usuarios (token, usuario_id, empresa_id, email, role, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(inviteToken, novoUsuarioId, targetEmpresaId, email, perfil, callerId, expiresAt)
    .run();

  logger.info(`Usuário criado: id=${novoUsuarioId} email=${email} perfil=${perfil}`);

  const inviteLink = buildInviteLink(c.env.FRONTEND_URL, inviteToken);
  const emailSent = await sendInviteEmail(c.env, logger, {
    email,
    nome,
    perfil,
    inviteLink,
  });

  return c.json(
    {
      success: true,
      data: {
        id: novoUsuarioId,
        email,
        nome,
        perfil,
        inviteToken,
        inviteLink,
        inviteExpiresAt: expiresAt,
        emailSent,
      },
      message: emailSent
        ? 'Usuário criado. E-mail de convite enviado.'
        : 'Usuário criado. Compartilhe o link de convite para que o usuário defina sua senha.',
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// PUT /api/admin/usuarios/:id
// Atualizar dados do usuário
// ---------------------------------------------------------------------------
adminUsuariosRoutes.put('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'editar usuário');
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  const body = await c.req.json<{
    nome?: string;
    perfil?: string;
    funcionario_id?: number | null;
    active?: boolean;
    setor_ids?: number[];
  }>();

  // Verificar que usuário existe
  const existente = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(id)
    .first<{ id: number; perfil: string }>();

  if (!existente) throw notFound('Usuário não encontrado');

  // Verificar vínculo com a empresa (platform admin pode cross-tenant)
  await requireTenantAccess(db, getCallerId(c), id, empresaId);

  // Gestor não pode editar ADMINISTRADOR
  const targetPerfil = body?.perfil?.toUpperCase() || existente.perfil.toUpperCase();
  if (
    (existente.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      existente.perfil.toUpperCase() === 'ADMIN' ||
      targetPerfil === 'ADMINISTRADOR' ||
      targetPerfil === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden('Apenas ADMINISTRADOR pode editar outros administradores', 'INSUFFICIENT_ROLE');
  }

  // Promoção para gestor ou ativação de gestor exige ao menos um setor (fail-closed)
  const tornandoSeGestor = Boolean(body?.perfil) && isManagerPerfil(targetPerfil) && !isManagerPerfil(existente.perfil);
  const ativandoGestor = body?.active === true && isManagerPerfil(targetPerfil);
  let setorStatementsParaGestor: D1PreparedStatement[] = [];

  if (tornandoSeGestor || ativandoGestor) {
    if (Array.isArray(body?.setor_ids) && body.setor_ids.length > 0) {
      try {
        setorStatementsParaGestor = await buildManagerSetorInsertStatements(
          db,
          empresaId,
          id,
          body.setor_ids,
        );
      } catch (err) {
        if (err instanceof SetorGestorValidationError) {
          throw badRequest(err.message, 'MANAGER_REQUIRES_SECTOR');
        }
        throw err;
      }
    } else {
      const existingCount = await db
        .prepare(
          `SELECT COUNT(*) as n FROM setores_gestores
             WHERE usuario_id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL`,
        )
        .bind(id, empresaId)
        .first<{ n: number }>();

      if (!Number(existingCount?.n || 0)) {
        throw badRequest(
          'Gestor requer ao menos um setor (setor_ids) para ser criado/ativado',
          'MANAGER_REQUIRES_SECTOR',
        );
      }
    }
  }

  const updates: string[] = [];
  const binds: (string | number | null)[] = [];
  const statementsAdicionais: D1PreparedStatement[] = [];

  if (body?.nome) {
    updates.push('nome = ?');
    binds.push(body.nome.trim());
  }
  if (body?.perfil) {
    updates.push('perfil = ?');
    binds.push(body.perfil.toUpperCase());
    // Sincronizar role em usuarios_empresas na mesma transação da UPDATE
    // de usuarios abaixo — não deixar perfil e role divergentes.
    statementsAdicionais.push(
      db
        .prepare(`UPDATE usuarios_empresas SET role = ? WHERE usuario_id = ? AND empresa_id = ?`)
        .bind(body.perfil.toUpperCase(), id, empresaId),
    );
  }
  if (body?.funcionario_id !== undefined) {
    updates.push('funcionario_id = ?');
    binds.push(body.funcionario_id);
  }
  if (body?.active !== undefined) {
    updates.push('active = ?');
    binds.push(body.active ? 1 : 0);
  }

  if (updates.length === 0) {
    throw badRequest('Nenhum campo para atualizar', 'NO_FIELDS');
  }

  updates.push("updated_at = datetime('now')");
  binds.push(id);

  const todosOsStatements = [...statementsAdicionais, ...setorStatementsParaGestor];
  if (todosOsStatements.length > 0) {
    await db.batch([
      db.prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`).bind(...binds),
      ...todosOsStatements,
    ]);
  } else {
    await db
      .prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run();
  }

  const atualizado = await db
    .prepare(
      `SELECT u.id, u.email, u.nome, u.perfil, u.active, u.funcionario_id, f.nome AS funcionario_nome,
              ue.empresa_id, e.nome AS empresa_nome, ue.is_primary, u.created_at, u.last_login
       FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
       LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
       WHERE u.id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(empresaId, id)
    .first();

  return c.json({ success: true, message: 'Usuário atualizado', data: atualizado });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/usuarios/:id  (soft delete / desativação)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.delete('/:id', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'desativar usuário');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));

  if (id === callerId) {
    throw badRequest('Você não pode desativar sua própria conta', 'SELF_DEACTIVATION');
  }

  const db = c.env.DB;

  // Buscar usuário (sem restrição de empresa para não bloquear órfãos)
  const existente = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(id)
    .first<{ id: number; perfil: string }>();

  if (!existente) throw notFound('Usuário não encontrado');

  // Verificar vínculo com a empresa (platform admin pode cross-tenant)
  await requireTenantAccess(db, getCallerId(c), id, empresaId);

  // Gestor não pode deletar ADMINISTRADOR
  if (
    (existente.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      existente.perfil.toUpperCase() === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden(
      'Apenas ADMINISTRADOR pode desativar outros administradores',
      'INSUFFICIENT_ROLE',
    );
  }

  await db
    .prepare(`UPDATE usuarios SET active = 0, deleted_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();

  return c.json({ success: true, message: 'Usuário desativado' });
});

// ---------------------------------------------------------------------------
// POST /api/admin/usuarios/:id/invite
// Reenviar convite (gera novo token, invalida anteriores)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.post('/:id/invite', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'reenviar convite');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.resendInvite');

  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.nome, u.perfil FROM usuarios u
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(id)
    .first<{ id: number; email: string; nome: string; perfil: string }>();

  if (!user) throw notFound('Usuário não encontrado');

  // Verificar vínculo com a empresa (platform admin pode cross-tenant)
  await requireTenantAccess(db, getCallerId(c), id, empresaId);

  // Invalidar convites anteriores
  await db
    .prepare(
      `UPDATE convites_usuarios SET used_at = datetime('now') WHERE usuario_id = ? AND empresa_id = ? AND used_at IS NULL`,
    )
    .bind(id, empresaId)
    .run();

  // Gerar novo convite
  const inviteToken = generateInviteToken();
  const expiresAt = inviteExpiresAt();

  await db
    .prepare(
      `INSERT INTO convites_usuarios (token, usuario_id, empresa_id, email, role, created_by, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(inviteToken, id, empresaId, user.email, user.perfil, callerId, expiresAt)
    .run();

  const inviteLink = buildInviteLink(c.env.FRONTEND_URL, inviteToken);
  const emailSent = await sendInviteEmail(c.env, logger, {
    email: user.email,
    nome: user.nome,
    perfil: user.perfil,
    inviteLink,
  });

  return c.json({
    success: true,
    data: {
      inviteToken,
      inviteLink,
      inviteExpiresAt: expiresAt,
      emailSent,
    },
    message: emailSent
      ? 'Novo convite gerado e enviado por e-mail.'
      : 'Novo convite gerado. Compartilhe o link para que o usuário defina sua senha.',
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/usuarios/:id/permissoes
// Retorna permissões individuais do usuário
// ---------------------------------------------------------------------------
adminUsuariosRoutes.get('/:id/permissoes', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'ver permissões');
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  // Verificar acesso
  const exists = await db
    .prepare(
      `SELECT u.id FROM usuarios u
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(id)
    .first();

  if (!exists) throw notFound('Usuário não encontrado');

  await requireTenantAccess(db, getCallerId(c), id, empresaId);

  const permissoes = await db
    .prepare(
      `SELECT permissao, tipo, created_at FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
    )
    .bind(id)
    .all<{ permissao: string; tipo: string; created_at: string }>();

  return c.json({ success: true, data: permissoes.results || [] });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/usuarios/:id/permissoes
// Atualizar permissões individuais (substituição completa)
// ---------------------------------------------------------------------------
adminUsuariosRoutes.put('/:id/permissoes', async (c) => {
  requireAdminOrGestor(getCallerRole(c), 'atualizar permissões');
  const callerId = getCallerId(c);
  const callerRole = getCallerRole(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;

  const body = await c.req.json<{
    permissoes?: Array<{ permissao: string; tipo: 'GRANT' | 'DENY' }>;
  }>();
  const permissoes = body?.permissoes || [];

  // Verificar acesso e role do target
  const targetUser = await db
    .prepare(
      `SELECT u.id, u.perfil FROM usuarios u
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(id)
    .first<{ id: number; perfil: string }>();

  if (!targetUser) throw notFound('Usuário não encontrado');

  // Verificar vínculo com a empresa (platform admin pode cross-tenant)
  await requireTenantAccess(db, getCallerId(c), id, empresaId);

  // Gestor não pode alterar permissões de ADMINISTRADOR
  if (
    (targetUser.perfil.toUpperCase() === 'ADMINISTRADOR' ||
      targetUser.perfil.toUpperCase() === 'ADMIN') &&
    callerRole !== 'ADMINISTRADOR' &&
    callerRole !== 'ADMIN'
  ) {
    throw forbidden('Não é permitido alterar permissões de administrador', 'INSUFFICIENT_ROLE');
  }

  // Substituição completa: deletar todas e reinserir
  await db.prepare(`DELETE FROM usuario_permissoes WHERE usuario_id = ?`).bind(id).run();

  if (permissoes.length > 0) {
    for (const p of permissoes) {
      if (!p.permissao || !['GRANT', 'DENY'].includes(p.tipo)) continue;
      await db
        .prepare(
          `INSERT OR REPLACE INTO usuario_permissoes (usuario_id, permissao, tipo, created_by)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(id, p.permissao, p.tipo, callerId)
        .run();
    }
  }

  return c.json({ success: true, message: 'Permissões atualizadas' });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/usuarios/:id/reset-senha
// Admin redefine a senha de qualquer usuário sem precisar da senha atual
// ---------------------------------------------------------------------------
adminUsuariosRoutes.patch('/:id/reset-senha', async (c) => {
  requireAdmin(getCallerRole(c), 'redefinir senha de usuário');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const id = Number(c.req.param('id'));
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.resetSenha');

  const body = await c.req.json<{ nova_senha?: string }>();
  const novaSenha = String(body?.nova_senha || '').trim();

  if (!novaSenha || novaSenha.length < 8) {
    throw badRequest('A nova senha deve ter no mínimo 8 caracteres', 'PASSWORD_TOO_SHORT');
  }

  // Buscar usuário (rota já exige ADMIN, não precisa de restrição de empresa)
  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.nome FROM usuarios u
       WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1`,
    )
    .bind(id)
    .first<{ id: number; email: string; nome: string }>();

  if (!user) throw notFound('Usuário não encontrado');

  const novoHash = await hashPassword(novaSenha);

  await db
    .prepare(
      `UPDATE usuarios
       SET password_hash = ?,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(novoHash, id)
    .run();

  // Audit log
  try {
    await db
      .prepare(
        `INSERT INTO audit_logs (empresa_id, usuario_id, acao, tabela, registro_id, detalhes, created_at)
         VALUES (?, ?, 'ADMIN_RESET_SENHA', 'usuarios', ?, ?, datetime('now'))`,
      )
      .bind(
        empresaId,
        callerId,
        id,
        JSON.stringify({ target_email: user.email, target_nome: user.nome }),
      )
      .run();
  } catch {
    // Audit log é best-effort
    logger.warn(`Falha ao registrar audit log para reset de senha user_id=${id}`);
  }

  logger.info(`Admin id=${callerId} redefiniu senha do usuário id=${id} (${user.email})`);

  return c.json({ success: true, message: 'Senha redefinida com sucesso' });
});

export { adminUsuariosRoutes };
