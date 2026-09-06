/**
 * EMPRESAS — Usuários e Logo
 * Sub-router mounted at /api/empresas via empresasRoutes.route('/', ...)
 *
 *   POST   /:id/usuarios/invite
 *   GET    /:id/usuarios
 *   GET    /usuarios/:usuarioId/acessos
 *   PUT    /usuarios/:usuarioId/acessos
 *   POST   /:id/usuarios
 *   DELETE /:id/usuarios/:usuarioId
 *   GET    /minha/logo-base64
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { AppError } from '../utils/errors';
import { getTenantContext, requireTenantRole } from '../middleware/tenant';
import { generateRefreshToken } from '../utils/security';
import {
  assertSetoresValidosParaEmpresa,
  buildManagerSetorInsertStatements,
  SetorGestorValidationError,
} from '../services/setores-gestores';

const app = new Hono<{ Bindings: Env }>();

app.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

// ─────────────────────────────────────────────────────────────
// Helpers (local to this module)
// ─────────────────────────────────────────────────────────────

async function enviarEmailConvite(
  env: Env,
  destinatario: string,
  nome: string,
  empresaNome: string,
  conviteUrl: string,
): Promise<boolean> {
  const fromEmail =
    env.BREVO_FROM_EMAIL || env.SENDGRID_FROM_EMAIL || 'treinamento@airtrust.online';
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

  if (env.SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: destinatario }],
            subject: assunto,
          },
        ],
        from: { email: fromEmail, name: fromName },
        content: [{ type: 'text/plain', value: corpo }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[INVITE] Erro SendGrid:', errorText);
      throw new AppError('Falha ao enviar email de convite', 500);
    }

    return true;
  }

  console.warn(
    '[INVITE] Configuração de email ausente (BREVO_API_KEY ou SENDGRID_API_KEY). Email não enviado.',
  );
  return false;
}

async function getUsuariosEmpresasFeatures(db: Env['DB']): Promise<{ hasModulosAtivos: boolean }> {
  const cols =
    (await db.prepare("PRAGMA table_info('usuarios_empresas')").all<{ name: string }>()).results ||
    [];
  return {
    hasModulosAtivos: cols.some((c) => c.name === 'modulos_ativos'),
  };
}

async function findUsuarioAcessosPermitido(
  db: Env['DB'],
  usuarioId: number,
  tenantCtx: ReturnType<typeof getTenantContext>,
): Promise<{ id: number; nome: string; email: string; is_primary: number } | null> {
  if (tenantCtx.empresaCodigo === 'airtrust') {
    return db
      .prepare('SELECT id, nome, email, 0 AS is_primary FROM usuarios WHERE id = ? AND deleted_at IS NULL')
      .bind(usuarioId)
      .first<{ id: number; nome: string; email: string; is_primary: number }>();
  }

  return db
    .prepare(
      `SELECT u.id, u.nome, u.email, ue.is_primary
         FROM usuarios u
         INNER JOIN usuarios_empresas ue
           ON ue.usuario_id = u.id AND ue.empresa_id = ?
        WHERE u.id = ? AND u.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(tenantCtx.empresaId, usuarioId)
    .first<{ id: number; nome: string; email: string; is_primary: number }>();
}

function normalizeEmpresaUserRole(value: unknown): string {
  const role = String(value || 'viewer')
    .trim()
    .toLowerCase();

  if (role === 'admin' || role === 'administrador') return 'admin';
  if (role === 'manager' || role === 'gestor' || role === 'compliance') return 'manager';
  if (role === 'instructor' || role === 'instrutor') return 'instructor';
  if (role === 'student' || role === 'aluno') return 'student';
  if (role === 'viewer' || role === 'visualizador' || role === 'user' || role === 'usuario') {
    return 'viewer';
  }

  throw new AppError('Perfil de usuário inválido', 400);
}

function perfilFromEmpresaRole(role: string): string {
  switch (role) {
    case 'admin':
      return 'ADMINISTRADOR';
    case 'manager':
      return 'GESTOR';
    case 'instructor':
      return 'INSTRUTOR';
    case 'student':
    case 'viewer':
    default:
      return 'ALUNO';
  }
}

function getRoleRank(role: string): number {
  switch (normalizeEmpresaUserRole(role)) {
    case 'admin':
      return 5;
    case 'manager':
      return 4;
    case 'instructor':
      return 3;
    case 'student':
      return 2;
    case 'viewer':
    default:
      return 1;
  }
}

function pickHighestRole(...roles: Array<string | null | undefined>): string {
  return (
    roles
      .map((role) => normalizeEmpresaUserRole(role))
      .sort((a, b) => getRoleRank(b) - getRoleRank(a))[0] || 'viewer'
  );
}

async function syncUsuarioPerfilFromAcessos(db: Env['DB'], usuarioId: number): Promise<void> {
  const roles = await db
    .prepare(
      `
      SELECT role
      FROM usuarios_empresas
      WHERE usuario_id = ?
      ORDER BY
        CASE WHEN is_primary = 1 THEN 0 ELSE 1 END,
        empresa_id ASC
    `,
    )
    .bind(usuarioId)
    .all<{ role: string }>();

  const rolesAtivos = (roles.results || []).map((item) => item.role).filter(Boolean);
  if (rolesAtivos.length === 0) return;

  const highestRole = pickHighestRole(...rolesAtivos);
  const perfil = perfilFromEmpresaRole(highestRole);

  await db
    .prepare(
      `
      UPDATE usuarios
      SET perfil = ?,
          updated_at = datetime('now')
      WHERE id = ?
        AND deleted_at IS NULL
    `,
    )
    .bind(perfil, usuarioId)
    .run();
}

// ============================================
// POST /api/empresas/:id/usuarios/invite - Convidar/Adicionar usuário por Email
// ============================================
app.post('/:id/usuarios/invite', requireTenantRole('manager'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para adicionar usuários a esta empresa', 403);
  }

  const {
    email,
    role = 'viewer',
    perfis,
    nome,
    empresaIds,
    modulosAtivos,
    setorIds,
  } = (await c.req.json()) as {
    email: string;
    role?: string;
    perfis?: string[];
    nome?: string;
    empresaIds?: number[];
    modulosAtivos?: string[];
    setorIds?: number[];
  };

  if (!email) {
    throw new AppError('Email é obrigatório', 400);
  }

  const normalizedPerfis = Array.isArray(perfis) && perfis.length > 0
    ? perfis.map(normalizeEmpresaUserRole)
    : [normalizeEmpresaUserRole(role || 'viewer')];
  const normalizedRole = pickHighestRole(...normalizedPerfis);
  const targetEmpresaIds = Array.from(
    new Set(
      (Array.isArray(empresaIds) && empresaIds.length > 0 ? empresaIds : [id])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  );

  if (targetEmpresaIds.length === 0) {
    throw new AppError('Selecione ao menos uma empresa', 400);
  }

  if (tenantCtx.empresaCodigo !== 'airtrust') {
    const invalidEmpresa = targetEmpresaIds.find((empresaId) => empresaId !== tenantCtx.empresaId);
    if (invalidEmpresa) {
      throw new AppError('Sem permissão para adicionar usuários em múltiplas empresas', 403);
    }
  }

  for (const empresaId of targetEmpresaIds) {
    const empresaAtiva = await db
      .prepare(
        'SELECT id, max_funcionarios FROM empresas WHERE id = ? AND deleted_at IS NULL AND ativo = 1',
      )
      .bind(empresaId)
      .first<{ id: number; max_funcionarios: number }>();

    if (!empresaAtiva) {
      throw new AppError(`Empresa ${empresaId} não encontrada ou inativa`, 404);
    }

    if (normalizeEmpresaUserRole(role) === 'manager') {
      try {
        await assertSetoresValidosParaEmpresa(db, empresaId, setorIds);
      } catch (err) {
        if (err instanceof SetorGestorValidationError) {
          throw new AppError(err.message, 400);
        }
        throw err;
      }
    }

    if (tenantCtx.empresaCodigo !== 'airtrust') {
      const count = await db
        .prepare('SELECT COUNT(*) as total FROM usuarios_empresas WHERE empresa_id = ?')
        .bind(empresaId)
        .first<{ total: number }>();

      if ((count?.total || 0) >= (empresaAtiva.max_funcionarios || 0)) {
        throw new AppError('Limite de usuários atingido', 400);
      }
    }
  }

  const normalizedEmail = String(email).toLowerCase().trim();

  // 1. Verificar se usuário existe
  let user = await db
    .prepare('SELECT id FROM usuarios WHERE email = ? AND deleted_at IS NULL')
    .bind(normalizedEmail)
    .first<{ id: number }>();
  let isNewUser = false;

  if (!user) {
    // 2. Criar usuário se não existir
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const { hashPassword } = await import('../utils/security');
    const hash = await hashPassword(tempPassword);

    const userColumns =
      (await db.prepare("PRAGMA table_info('usuarios')").all<{ name: string }>()).results || [];
    const hasActive = userColumns.some((col) => col.name === 'active');
    const hasAtivo = userColumns.some((col) => col.name === 'ativo');

    const activeColumn = hasActive ? 'active' : hasAtivo ? 'ativo' : null;
    const perfil = perfilFromEmpresaRole(normalizedRole);

    const insertSql = activeColumn
      ? `INSERT INTO usuarios (email, nome, password_hash, perfil, ${activeColumn}, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))`
      : "INSERT INTO usuarios (email, nome, password_hash, perfil, created_at) VALUES (?, ?, ?, ?, datetime('now'))";

    try {
      const result = await db
        .prepare(insertSql)
        .bind(normalizedEmail, nome || normalizedEmail.split('@')[0], hash, perfil)
        .run();

      user = { id: result.meta.last_row_id };
      isNewUser = true;
      console.log(`[INVITE] Novo usuário criado: ${normalizedEmail} (ID: ${user.id}).`);
    } catch (insertError) {
      const uniqueEmailRace =
        insertError instanceof Error &&
        /UNIQUE constraint failed: usuarios\.email/i.test(insertError.message);
      if (!uniqueEmailRace) throw insertError;

      user = await db
        .prepare('SELECT id FROM usuarios WHERE email = ? AND deleted_at IS NULL')
        .bind(normalizedEmail)
        .first<{ id: number }>();
      if (!user) throw insertError;
    }
  }

  const { hasModulosAtivos } = await getUsuariosEmpresasFeatures(db);
  const modulosAtivosJson = Array.isArray(modulosAtivos) ? JSON.stringify(modulosAtivos) : null;

  let vinculosCriados = 0;
  for (const empresaId of targetEmpresaIds) {
    const link = await db
      .prepare('SELECT id FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ?')
      .bind(user.id, empresaId)
      .first();

    if (link) continue;

    const vinculoStatement = hasModulosAtivos
      ? db
          .prepare(
            'INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, modulos_ativos) VALUES (?, ?, ?, 0, ?)',
          )
          .bind(user.id, empresaId, normalizedRole, modulosAtivosJson)
      : db
          .prepare(
            'INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary) VALUES (?, ?, ?, 0)',
          )
          .bind(user.id, empresaId, normalizedRole);

    if (normalizedRole === 'manager') {
      const setorStatements = await buildManagerSetorInsertStatements(
        db,
        empresaId,
        user.id,
        setorIds,
      );
      await db.batch([vinculoStatement, ...setorStatements]);
    } else {
      await vinculoStatement.run();
    }
    
    // Atribuição administrativa explícita de perfis (autoridade — migration 0473).
    // Falha aqui é erro real e deve propagar para o handler da rota; nunca
    // silenciar, para o administrador não achar que a atribuição foi gravada.
    for (const p of normalizedPerfis) {
      await db
        .prepare(
          'INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))',
        )
        .bind(user.id, empresaId, perfilFromEmpresaRole(p))
        .run();
    }

    vinculosCriados += 1;
  }

  if (vinculosCriados === 0) {
    return c.json({ success: false, error: 'Usuário já pertence às empresas selecionadas' }, 400);
  }

  await syncUsuarioPerfilFromAcessos(db, user.id);

  // convites_usuarios existe via migration 0290
  const conviteToken = generateRefreshToken();
  const createdBy = null;

  await db
    .prepare(
      `
      UPDATE convites_usuarios
      SET used_at = datetime('now')
      WHERE usuario_id = ?
        AND empresa_id = ?
        AND used_at IS NULL
    `,
    )
    .bind(user.id, targetEmpresaIds[0])
    .run();

  await db
    .prepare(
      `
      INSERT INTO convites_usuarios (
        token,
        usuario_id,
        empresa_id,
        email,
        role,
        created_by,
        expires_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+72 hours'), datetime('now'))
    `,
    )
    .bind(conviteToken, user.id, targetEmpresaIds[0], normalizedEmail, normalizedRole, createdBy)
    .run();

  const empresa = await db
    .prepare('SELECT nome FROM empresas WHERE id = ?')
    .bind(targetEmpresaIds[0])
    .first<{ nome: string }>();

  const frontendBase = (c.env.FRONTEND_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  const conviteUrl = `${frontendBase}/aceitar-convite?token=${encodeURIComponent(conviteToken)}`;
  const emailSent = await enviarEmailConvite(
    c.env,
    normalizedEmail,
    String(nome || normalizedEmail.split('@')[0]),
    empresa?.nome || 'AirTrust',
    conviteUrl,
  );

  return c.json({
    success: true,
    message: emailSent
      ? 'Convite enviado por email com link para criação de senha'
      : 'Usuário vinculado. Email não enviado (configuração de envio ausente)',
    data: {
      userId: user.id,
      isNewUser,
      empresasVinculadas: vinculosCriados,
      emailSent,
      conviteUrl,
    },
  });
});

// ============================================
// GET /api/empresas/:id/usuarios - Usuários da empresa
// ============================================
app.get('/:id/usuarios', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);
  const { hasModulosAtivos } = await getUsuariosEmpresasFeatures(db);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para ver usuários desta empresa', 403);
  }

  const usuarios = await db
    .prepare(
      `
      SELECT u.id, u.nome, u.email, u.perfil, ue.role, ue.is_primary,
             ${hasModulosAtivos ? "COALESCE(ue.modulos_ativos, '[]')" : "'[]'"} as modulos_ativos
      FROM usuarios u
      INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
      WHERE u.deleted_at IS NULL
      ORDER BY u.nome ASC
    `,
    )
    .bind(id)
    .all<{
      id: number;
      nome: string;
      email: string;
      perfil: string;
      role: string;
      is_primary: number;
      modulos_ativos: string;
    }>();

  return c.json({
    success: true,
    data: (usuarios.results || []).map((u) => {
      let modulosAtivos: string[] = [];
      try {
        modulosAtivos = JSON.parse(u.modulos_ativos || '[]') as string[];
      } catch {
        modulosAtivos = [];
      }
      return { ...u, role: pickHighestRole(u.role, u.perfil), modulos_ativos: modulosAtivos };
    }),
  });
});

// ============================================
// GET /api/empresas/usuarios/:usuarioId/acessos - acessos por empresa
// ============================================
app.get('/usuarios/:usuarioId/acessos', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const usuarioId = parseInt(c.req.param('usuarioId'), 10);
  const tenantCtx = getTenantContext(c);
  const usuario = await findUsuarioAcessosPermitido(db, usuarioId, tenantCtx);

  if (!usuario) {
    if (tenantCtx.empresaCodigo !== 'airtrust') {
      throw new AppError('Sem permissão para acessar usuário de outra empresa', 403);
    }
    throw new AppError('Usuário não encontrado', 404);
  }

  const { hasModulosAtivos } = await getUsuariosEmpresasFeatures(db);

  const acessos = await db
    .prepare(
      `
      SELECT ue.empresa_id, ue.role, ue.is_primary,
              ${hasModulosAtivos ? "COALESCE(ue.modulos_ativos, '[]')" : "'[]'"} as modulos_ativos,
             e.nome as empresa_nome,
             (SELECT json_group_array(perfil) FROM usuarios_empresas_perfis WHERE usuario_id = ue.usuario_id AND empresa_id = ue.empresa_id AND ativo = 1) as perfis
      FROM usuarios_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
        AND (? = 1 OR ue.empresa_id = ?)
      ORDER BY e.nome ASC
    `,
    )
    .bind(usuarioId, tenantCtx.empresaCodigo === 'airtrust' ? 1 : 0, tenantCtx.empresaId)
    .all<{
      empresa_id: number;
      role: string;
      is_primary: number;
      modulos_ativos: string;
      empresa_nome: string;
      perfis?: string;
    }>();

  const resultados = (acessos.results || []).filter((item) => {
    if (tenantCtx.empresaCodigo === 'airtrust') return true;
    return item.empresa_id === tenantCtx.empresaId;
  });

  return c.json({
    success: true,
    data: {
      usuario,
      acessos: resultados.map((item) => {
        let modulosAtivos: string[] = [];
        try {
          modulosAtivos = JSON.parse(item.modulos_ativos || '[]') as string[];
        } catch {
          modulosAtivos = [];
        }
        let perfis: string[] = [];
        try {
          perfis = JSON.parse(item.perfis || '[]') as string[];
        } catch {
          perfis = [];
        }
        return {
          empresa_id: item.empresa_id,
          empresa_nome: item.empresa_nome,
          // `role` continua exposto por compatibilidade (maior perfil ativo);
          // `perfis` é a lista explícita autoritativa (migration 0473).
          role: normalizeEmpresaUserRole(
            perfis.length > 0 ? pickHighestRole(...perfis) : item.role,
          ),
          perfis,
          is_primary: item.is_primary,
          modulos_ativos: modulosAtivos,
        };
      }),
    },
  });
});

// ============================================
// PUT /api/empresas/usuarios/:usuarioId/acessos - atualizar acessos
// ============================================
app.put('/usuarios/:usuarioId/acessos', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const usuarioId = parseInt(c.req.param('usuarioId'), 10);
  const tenantCtx = getTenantContext(c);
  const usuario = await findUsuarioAcessosPermitido(db, usuarioId, tenantCtx);

  if (!usuario) {
    if (tenantCtx.empresaCodigo !== 'airtrust') {
      throw new AppError('Sem permissão para editar acessos de usuário de outra empresa', 403);
    }
    throw new AppError('Usuário não encontrado', 404);
  }

  const body = (await c.req.json()) as {
    acessos?: Array<{ empresaId: number; role?: string; perfis?: string[]; modulosAtivos?: string[] }>;
  };

  const acessos = Array.isArray(body.acessos)
    ? body.acessos
        .map((item) => {
          const perfis = Array.isArray(item.perfis) && item.perfis.length > 0
            ? item.perfis.map(p => normalizeEmpresaUserRole(p))
            : [normalizeEmpresaUserRole(item.role || 'viewer')];
          return {
            empresaId: Number(item.empresaId),
            role: pickHighestRole(...perfis),
            perfis,
            modulosAtivos: Array.isArray(item.modulosAtivos) ? item.modulosAtivos : [],
          };
        })
        .filter((item) => Number.isFinite(item.empresaId) && item.empresaId > 0)
    : [];

  if (acessos.length === 0) {
    throw new AppError('Informe ao menos um acesso de empresa', 400);
  }

  if (tenantCtx.empresaCodigo !== 'airtrust') {
    const invalid = acessos.find((item) => item.empresaId !== tenantCtx.empresaId);
    if (invalid) {
      throw new AppError('Sem permissão para editar acessos de outras empresas', 403);
    }
  }

  // Papel manager exige setor já vinculado na empresa alvo antes de gravar o
  // novo acesso — esta rota não cria vínculos de setor, apenas reatribui role.
  for (const acesso of acessos) {
    if (acesso.role !== 'manager') continue;
    const existingSector = await db
      .prepare(
        `SELECT id FROM setores_gestores
           WHERE usuario_id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL
           LIMIT 1`,
      )
      .bind(usuarioId, acesso.empresaId)
      .first();
    if (!existingSector) {
      throw new AppError(
        `Gestor requer ao menos um setor vinculado na empresa ${acesso.empresaId} antes de assumir o papel manager`,
        400,
      );
    }
  }

  const { hasModulosAtivos } = await getUsuariosEmpresasFeatures(db);

  await db
    .prepare(
      tenantCtx.empresaCodigo === 'airtrust'
        ? 'DELETE FROM usuarios_empresas WHERE usuario_id = ?'
        : 'DELETE FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ?',
    )
    .bind(
      ...(tenantCtx.empresaCodigo === 'airtrust' ? [usuarioId] : [usuarioId, tenantCtx.empresaId]),
    )
    .run();

  // Substituição completa: remove as atribuições explícitas atuais antes de
  // regravar o conjunto enviado pelo administrador. É assim que um perfil
  // removido pelo admin deixa de existir na estrutura autoritativa.
  await db
    .prepare(
      tenantCtx.empresaCodigo === 'airtrust'
        ? 'DELETE FROM usuarios_empresas_perfis WHERE usuario_id = ?'
        : 'DELETE FROM usuarios_empresas_perfis WHERE usuario_id = ? AND empresa_id = ?',
    )
    .bind(...(tenantCtx.empresaCodigo === 'airtrust' ? [usuarioId] : [usuarioId, tenantCtx.empresaId]))
    .run();

  let isPrimarySet = false;
  for (const acesso of acessos) {
    const isPrimary =
      tenantCtx.empresaCodigo === 'airtrust'
        ? (!isPrimarySet ? 1 : 0)
        : Number(usuario.is_primary ?? 0);
    if (tenantCtx.empresaCodigo === 'airtrust') isPrimarySet = true;

    if (hasModulosAtivos) {
      await db
        .prepare(
          `
          INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, modulos_ativos)
          VALUES (?, ?, ?, ?, ?)
        `,
        )
        .bind(
          usuarioId,
          acesso.empresaId,
          acesso.role,
          isPrimary,
          JSON.stringify(acesso.modulosAtivos),
        )
        .run();
    } else {
      await db
        .prepare(
          `
          INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
          VALUES (?, ?, ?, ?)
        `,
        )
        .bind(usuarioId, acesso.empresaId, acesso.role, isPrimary)
        .run();
    }
    
    for (const p of acesso.perfis) {
      await db
        .prepare(
          'INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))',
        )
        .bind(usuarioId, acesso.empresaId, perfilFromEmpresaRole(p))
        .run();
    }
  }

  await syncUsuarioPerfilFromAcessos(db, usuarioId);

  return c.json({
    success: true,
    message: 'Acessos do usuário atualizados com sucesso',
  });
});

// ============================================
// POST /api/empresas/:id/usuarios - Adicionar usuário à empresa
// ============================================
app.post('/:id/usuarios', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const tenantCtx = getTenantContext(c);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para adicionar usuários a esta empresa', 403);
  }

  const body = await c.req.json();
  const { usuario_id, role = 'viewer', perfis, setor_ids: setorIdsForAdd } = body;
  const normalizedPerfis = Array.isArray(perfis) && perfis.length > 0
    ? perfis.map(p => normalizeEmpresaUserRole(p))
    : [normalizeEmpresaUserRole(role)];
  const normalizedRole = pickHighestRole(...normalizedPerfis);

  if (!usuario_id) {
    throw new AppError('usuario_id é obrigatório', 400);
  }

  if (normalizedRole === 'manager') {
    try {
      await assertSetoresValidosParaEmpresa(db, id, setorIdsForAdd);
    } catch (err) {
      if (err instanceof SetorGestorValidationError) {
        throw new AppError(err.message, 400);
      }
      throw err;
    }
  }

  // Verificar se usuário existe
  const usuario = await db
    .prepare('SELECT id FROM usuarios WHERE id = ? AND deleted_at IS NULL')
    .bind(usuario_id)
    .first();

  if (!usuario) {
    throw new AppError('Usuário não encontrado', 404);
  }

  // Verificar limite de funcionários (se não for super-admin)
  if (tenantCtx.empresaCodigo !== 'airtrust') {
    const empresa = await db
      .prepare('SELECT max_funcionarios FROM empresas WHERE id = ? AND deleted_at IS NULL')
      .bind(id)
      .first<{ max_funcionarios: number }>();

    const count = await db
      .prepare('SELECT COUNT(*) as total FROM usuarios_empresas WHERE empresa_id = ?')
      .bind(id)
      .first<{ total: number }>();

    if ((count?.total || 0) >= (empresa?.max_funcionarios || 0)) {
      throw new AppError('Limite de usuários da empresa atingido', 400);
    }
  }

  const vinculoStatement = db
    .prepare(
      `
    INSERT INTO usuarios_empresas (usuario_id, empresa_id, role)
    VALUES (?, ?, ?)
  `,
    )
    .bind(usuario_id, id, normalizedRole);

  if (normalizedRole === 'manager') {
    const setorStatements = await buildManagerSetorInsertStatements(
      db,
      id,
      Number(usuario_id),
      setorIdsForAdd,
    );
    await db.batch([vinculoStatement, ...setorStatements]);
  } else {
    await vinculoStatement.run();
  }

  for (const p of normalizedPerfis) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO usuarios_empresas_perfis (usuario_id, empresa_id, perfil, ativo, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))',
      )
      .bind(usuario_id, id, perfilFromEmpresaRole(p))
      .run();
  }

  await syncUsuarioPerfilFromAcessos(db, Number(usuario_id));

  return c.json(
    {
      success: true,
      message: 'Usuário adicionado à empresa com sucesso',
    },
    201,
  );
});

// ============================================
// DELETE /api/empresas/:id/usuarios/:usuarioId
// ============================================
app.delete('/:id/usuarios/:usuarioId', requireTenantRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = parseInt(c.req.param('id'), 10);
  const usuarioId = parseInt(c.req.param('usuarioId'), 10);
  const tenantCtx = getTenantContext(c);

  if (tenantCtx.empresaCodigo !== 'airtrust' && tenantCtx.empresaId !== id) {
    throw new AppError('Sem permissão para remover usuários desta empresa', 403);
  }

  await db
    .prepare(
      `
    DELETE FROM usuarios_empresas WHERE empresa_id = ? AND usuario_id = ?
  `,
    )
    .bind(id, usuarioId)
    .run();

  await syncUsuarioPerfilFromAcessos(db, usuarioId);

  return c.json({
    success: true,
    message: 'Usuário removido da empresa',
  });
});

// ============================================
// GET /api/empresas/minha/logo-base64 - Retorna logo em base64
// ============================================
app.get('/minha/logo-base64', async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const tenantCtx = getTenantContext(c);

  if (!tenantCtx.empresaId) {
    return c.json({ success: false, error: 'Contexto de empresa não identificado' }, 400);
  }

  try {
    const empresa = await db
      .prepare(
        `SELECT e.logo_url as logo_principal, ec.certificado_logo_url
         FROM empresas e
         LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
         WHERE e.id = ? AND e.deleted_at IS NULL`,
      )
      .bind(tenantCtx.empresaId)
      .first<{ logo_principal: string | null; certificado_logo_url: string | null }>();

    console.log('[LOGO-B64] Empresa encontrada:', empresa);

    const logoUrl = empresa?.certificado_logo_url || empresa?.logo_principal;

    if (!logoUrl) {
      return c.json({ success: true, data: null });
    }

    let logoBase64: string | null = null;

    // Converte ArrayBuffer para base64 de forma segura (sem spread que estoura stack em imagens > 64KB)
    const toBase64Safe = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      return btoa(binary);
    };

    // Se for asset interno (/api/assets/...)
    if (logoUrl.startsWith('/api/assets/')) {
      try {
        const key = logoUrl.replace('/api/assets/', '');
        console.log('[LOGO-B64] Buscando no R2:', key);
        const obj = await bucket.get(key);
        if (obj) {
          const arrayBuffer = await obj.arrayBuffer();
          // Detectar MIME do metadata R2 ou inferir pela extensão
          const mimeType =
            obj.httpMetadata?.contentType ||
            (key.match(/\.(jpe?g)$/i)
              ? 'image/jpeg'
              : key.match(/\.gif$/i)
                ? 'image/gif'
                : key.match(/\.webp$/i)
                  ? 'image/webp'
                  : 'image/png');
          logoBase64 = `data:${mimeType};base64,${toBase64Safe(arrayBuffer)}`;
          console.log('[LOGO-B64] Logo R2 ok:', arrayBuffer.byteLength, 'bytes, mime:', mimeType);
        } else {
          console.warn('[LOGO-B64] Objeto não encontrado no R2:', key);
        }
      } catch (err) {
        console.warn('[LOGO-B64] Erro ao buscar logo no R2:', err);
      }
    } else if (logoUrl.startsWith('http')) {
      // URL externa
      try {
        console.log('[LOGO-B64] Buscando URL externa:', logoUrl);
        const res = await fetch(logoUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const contentType = res.headers.get('content-type') || 'image/png';
          logoBase64 = `data:${contentType};base64,${toBase64Safe(arrayBuffer)}`;
          console.log('[LOGO-B64] Logo externo ok:', arrayBuffer.byteLength, 'bytes');
        } else {
          console.warn('[LOGO-B64] URL externa retornou', res.status);
        }
      } catch (err) {
        console.warn('[LOGO-B64] Erro ao buscar logo externo:', err);
      }
    }

    return c.json({ success: true, data: logoBase64 });
  } catch (error) {
    console.error('[LOGO-B64] Erro:', error);
    return c.json(
      {
        success: false,
        error: 'Erro interno do servidor',
      },
      500,
    );
  }
});

export default app;
