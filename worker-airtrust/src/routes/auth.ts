/**
 * AUTH ROUTES - Login, Refresh, Logout
 * Atualizado para usar tabela usuarios + refresh tokens
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import {
  generateJWT,
  verifyPassword,
  hashPassword,
  generateRefreshToken,
  getRefreshTokenExpiry,
  extractBearerToken,
  verifyJWT,
} from '../utils/security';
import { badRequest, internalError, unauthorized } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { rateLimiter, rateLimitPresets } from '../middleware/rate-limit';
import { resolveAllowedOrigin } from '../config/allowed-origins';
import { createLogger, toError } from '../utils/logger';
import { hasUsuariosEmpresasTable, getUsuariosSchema } from '../utils/db-schema';
import { logAudit } from '../utils/db'; // SECURITY: Import audit logging
import { buildAuditMetadata } from '../lib/audit/context';
import { enviarEmailAlert } from '../cron/notificacoes';
import { isAdminRole, normalizeAirtrustRole } from '../utils/role-resolution';
import { isPlatformAdminAccess, resolvePlatformAccessState } from '../lib/rbac/platform-access';

// Tipar variáveis adicionadas ao contexto pelo middleware auth()
type AuthVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
  empresas?: number[];
};

const authRoutes = new Hono<{ Bindings: Env; Variables: AuthVars }>();
const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;
const REFRESH_TOKEN_TTL_DAYS = 90;
const MAX_ACTIVE_REFRESH_TOKENS_PER_USER = 8;

// Tabela convites_usuarios criada via migration 0290 — não mais DDL em runtime.

async function resolveUserEmpresaId(db: D1Database, userId: number): Promise<number> {
  if (!(await hasUsuariosEmpresasTable(db))) {
    const funcionarioEmpresa = await db
      .prepare(
        `
          SELECT f.empresa_id
          FROM usuarios u
          INNER JOIN funcionarios f ON f.id = u.funcionario_id
          WHERE u.id = ?
            AND u.deleted_at IS NULL
            AND f.deleted_at IS NULL
            AND f.empresa_id IS NOT NULL
          LIMIT 1
        `,
      )
      .bind(userId)
      .first<{ empresa_id: number }>();

    if (funcionarioEmpresa?.empresa_id) {
      return funcionarioEmpresa.empresa_id;
    }

    const activeEmpresas = await db
      .prepare(
        `
          SELECT e.id
          FROM empresas e
          WHERE e.deleted_at IS NULL
            AND e.ativo = 1
          ORDER BY
            CASE
              WHEN e.codigo = 'airtrust' THEN 0
              ELSE 1
            END,
            e.id ASC
          LIMIT 2
        `,
      )
      .all<{ id: number }>();

    if ((activeEmpresas.results || []).length === 1) {
      return activeEmpresas.results[0].id;
    }

    throw unauthorized('Usuário sem vínculo ativo com empresa', 'USER_WITHOUT_EMPRESA');
  }

  const empresa = await db
    .prepare(
      `
        SELECT ue.empresa_id
        FROM usuarios_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = ?
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        ORDER BY
          CASE
            WHEN ue.is_primary = 1 THEN 0
            WHEN e.codigo = 'airtrust' THEN 1
            ELSE 2
          END,
          ue.empresa_id ASC
        LIMIT 1
      `,
    )
    .bind(userId)
    .first<{ empresa_id: number }>();

  if (!empresa?.empresa_id) {
    const platformAccessState = await resolvePlatformAccessState(db, userId);
    if (isPlatformAdminAccess(platformAccessState)) {
      const fallbackEmpresaAtiva = await db
        .prepare(
          `
            SELECT e.id AS empresa_id
            FROM empresas e
            WHERE e.deleted_at IS NULL
              AND e.ativo = 1
            ORDER BY
              CASE
                WHEN e.codigo = 'airtrust' THEN 0
                ELSE 1
              END,
              e.id ASC
            LIMIT 1
          `,
        )
        .first<{ empresa_id: number }>();

      const fallbackEmpresa =
        fallbackEmpresaAtiva ||
        (await db
          .prepare(
            `
              SELECT e.id AS empresa_id
              FROM empresas e
              WHERE e.deleted_at IS NULL
              ORDER BY
                CASE
                  WHEN e.codigo = 'airtrust' THEN 0
                  ELSE 1
                END,
                e.id ASC
              LIMIT 1
            `,
          )
          .first<{ empresa_id: number }>());

      if (fallbackEmpresa?.empresa_id) {
        await db
          .prepare(
            `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
             VALUES (?, ?, 'admin', 1, datetime('now'))`,
          )
          .bind(userId, fallbackEmpresa.empresa_id)
          .run()
          .catch(() => null);

        return fallbackEmpresa.empresa_id;
      }
    }

    throw unauthorized('Usuário sem vínculo ativo com empresa', 'USER_WITHOUT_EMPRESA');
  }

  return empresa.empresa_id;
}

function normalizeAuthRole(value: unknown): string {
  const normalized = normalizeAirtrustRole(value);
  if (normalized === 'COMPLIANCE') return 'GESTOR';
  if (normalized === 'EDITOR') return 'USUARIO';
  return normalized;
}

type DevBypassIdentity = {
  nome: string;
  resolvedRole: string;
  persistedProfile: string;
  empresaRole: string;
  isPreset: boolean;
};

function resolveDevBypassIdentity(email: string): DevBypassIdentity {
  const normalizedEmail = email.trim().toLowerCase();
  const localPart = normalizedEmail.split('@')[0] || 'dev';

  if (localPart.includes('admin')) {
    return {
      nome: 'Administrador Dev',
      resolvedRole: 'ADMINISTRADOR',
      persistedProfile: 'ADMIN',
      empresaRole: 'admin',
      isPreset: true,
    };
  }

  if (localPart.includes('gestor') || localPart.includes('manager')) {
    return {
      nome: 'Gestor Dev',
      resolvedRole: 'GESTOR',
      persistedProfile: 'GESTOR',
      empresaRole: 'manager',
      isPreset: true,
    };
  }

  if (localPart.includes('instrutor') || localPart.includes('instructor')) {
    return {
      nome: 'Instrutor Dev',
      resolvedRole: 'INSTRUTOR',
      persistedProfile: 'USUARIO',
      empresaRole: 'instructor',
      isPreset: true,
    };
  }

  if (
    localPart.includes('aluno') ||
    localPart.includes('aluna') ||
    localPart.includes('student') ||
    localPart.includes('member')
  ) {
    return {
      nome: 'Aluno Dev',
      resolvedRole: 'ALUNO',
      persistedProfile: 'USUARIO',
      empresaRole: 'student',
      isPreset: true,
    };
  }

  return {
    nome: localPart,
    resolvedRole: 'USUARIO',
    persistedProfile: 'USUARIO',
    empresaRole: 'member',
    isPreset: false,
  };
}

async function syncDevBypassUser(
  db: D1Database,
  devIdentity: DevBypassIdentity,
  userId: number,
  statusColumns: { hasActive: boolean; hasAtivo: boolean },
): Promise<void> {
  const statusSetClause = statusColumns.hasActive
    ? ', active = 1'
    : statusColumns.hasAtivo
      ? ', ativo = 1'
      : '';

  await db
    .prepare(
      `UPDATE usuarios
       SET password_hash = ?, nome = ?, perfil = ?, deleted_at = NULL, updated_at = datetime('now')${statusSetClause}
       WHERE id = ?`,
    )
    .bind('dev-local-bypass', devIdentity.nome, devIdentity.persistedProfile, userId)
    .run();

  const primeiraEmpresa = await db
    .prepare(`SELECT id FROM empresas WHERE deleted_at IS NULL AND ativo = 1 ORDER BY id ASC LIMIT 1`)
    .first<{ id: number }>();

  if (!primeiraEmpresa?.id) {
    return;
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, is_primary, role) VALUES (?, ?, 1, ?)`,
    )
    .bind(userId, primeiraEmpresa.id, devIdentity.empresaRole)
    .run();

  await db
    .prepare(
      `UPDATE usuarios_empresas
       SET role = ?, is_primary = CASE WHEN empresa_id = ? THEN 1 ELSE is_primary END
       WHERE usuario_id = ?
         AND empresa_id = ?`,
    )
    .bind(devIdentity.empresaRole, primeiraEmpresa.id, userId, primeiraEmpresa.id)
    .run();
}

function normalizeModulosAtivos(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const normalized = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return normalized.length > 0 ? normalized : [];
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return null;
  }
}

async function resolveAuthRoleForUser(
  db: D1Database,
  userId: number,
  empresaId: number,
  fallbackRole: string,
): Promise<string> {
  const fallback = normalizeAuthRole(fallbackRole);

  if (!(await hasUsuariosEmpresasTable(db))) {
    return fallback;
  }

  const roleFromEmpresa = await db
    .prepare(
      `
        SELECT ue.role
        FROM usuarios_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = ?
          AND ue.empresa_id = ?
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        LIMIT 1
      `,
    )
    .bind(userId, empresaId)
    .first<{ role: string | null }>();

  if (!roleFromEmpresa?.role) {
    return fallback;
  }

  return normalizeAuthRole(roleFromEmpresa.role);
}

async function issueAccessTokenForEmpresa(
  c: { env: Env },
  payload: { userId: number; email: string; role: string; nome: string; empresaId: number },
): Promise<{ token: string; jti: string }> {
  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');
  return generateJWT(
    {
      sub: payload.userId,
      empresa_id: payload.empresaId,
      email: payload.email,
      role: payload.role.toUpperCase(),
      nome: payload.nome,
    },
    jwtSecret,
    ACCESS_TOKEN_TTL_SECONDS,
  );
}

async function cleanupExpiredRefreshTokens(db: D1Database): Promise<void> {
  await db
    .prepare(
      `DELETE FROM refresh_tokens
       WHERE expires_at <= datetime('now')`,
    )
    .run()
    .catch(() => null);
}

async function enforceRefreshTokenLimit(db: D1Database, userId: number): Promise<void> {
  const activeTokens = await db
    .prepare(
      `SELECT id
       FROM refresh_tokens
       WHERE user_id = ?
         AND revoked_at IS NULL
         AND expires_at > datetime('now')
       ORDER BY datetime(created_at) DESC, id DESC`,
    )
    .bind(userId)
    .all<{ id: number }>()
    .catch(() => ({ results: [] as Array<{ id: number }> }));

  const staleTokens = (activeTokens.results || []).slice(MAX_ACTIVE_REFRESH_TOKENS_PER_USER);

  for (const token of staleTokens) {
    await db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, datetime('now'))
         WHERE id = ?`,
      )
      .bind(token.id)
      .run()
      .catch(() => null);
  }
}

async function persistRefreshToken(
  db: D1Database,
  payload: { userId: number; refreshToken: string; expiresAt: string; accessTokenJti: string },
): Promise<void> {
  await cleanupExpiredRefreshTokens(db);

  await db
    .prepare(
      'INSERT INTO refresh_tokens (user_id, token, expires_at, access_token_jti) VALUES (?, ?, ?, ?)',
    )
    .bind(payload.userId, payload.refreshToken, payload.expiresAt, payload.accessTokenJti)
    .run()
    .catch(() =>
      db
        .prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)')
        .bind(payload.userId, payload.refreshToken, payload.expiresAt)
        .run(),
    );

  await enforceRefreshTokenLimit(db, payload.userId);
}

async function blocklistAccessTokenJti(
  db: D1Database,
  accessTokenJti: string | null | undefined,
): Promise<void> {
  if (!accessTokenJti) return;

  await db
    .prepare(
      `INSERT OR IGNORE INTO token_blocklist (jti, expires_at)
       VALUES (?, datetime('now', '+30 minutes'))`,
    )
    .bind(accessTokenJti)
    .run()
    .catch(() => null);
}

// Handler OPTIONS para todas as rotas de auth (preflight CORS)
authRoutes.options('/*', (c) => {
  const origin = c.req.header('Origin');
  c.header('Access-Control-Allow-Origin', resolveAllowedOrigin(origin, c.env.CORS_ORIGINS));
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  c.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept, Origin',
  );
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400');
  c.status(204);
  return c.body(null);
});

/**
 * GET /api/auth/invite/validate?token=...
 * Valida token de convite para criação de senha
 */
authRoutes.get('/invite/validate', async (c) => {
  const token = String(c.req.query('token') || '').trim();
  if (!token) {
    throw badRequest('token é obrigatório', 'MISSING_TOKEN');
  }

  const db = c.env.DB;

  const convite = await db
    .prepare(
      `
      SELECT
        cu.id,
        cu.email,
        cu.expires_at,
        cu.used_at,
        u.nome,
        e.nome AS empresa_nome
      FROM convites_usuarios cu
      INNER JOIN usuarios u ON u.id = cu.usuario_id
      INNER JOIN empresas e ON e.id = cu.empresa_id
      WHERE cu.token = ?
      LIMIT 1
    `,
    )
    .bind(token)
    .first<{
      id: number;
      email: string;
      expires_at: string;
      used_at: string | null;
      nome: string;
      empresa_nome: string;
    }>();

  if (!convite) {
    throw unauthorized('Convite inválido', 'INVALID_INVITE_TOKEN');
  }

  if (convite.used_at) {
    throw unauthorized('Convite já utilizado', 'INVITE_ALREADY_USED');
  }

  const expired = await db
    .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS expired`)
    .bind(convite.expires_at)
    .first<{ expired: number }>();

  if (expired?.expired) {
    throw unauthorized('Convite expirado', 'INVITE_EXPIRED');
  }

  return c.json({
    success: true,
    data: {
      email: convite.email,
      nome: convite.nome,
      empresaNome: convite.empresa_nome,
      expiresAt: convite.expires_at,
    },
  });
});

/** Valida força mínima da senha — reutilizar em todo endpoint que define senha */
function validatePassword(senha: string): void {
  if (!senha || senha.length < 8) {
    throw badRequest('Senha deve ter no mínimo 8 caracteres', 'INVALID_PASSWORD');
  }
}

function normalizeEmail(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildResetPasswordUrl(frontendUrl: string | undefined, token: string): string {
  const base = (frontendUrl || 'https://airtrust.online').replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

async function issuePasswordResetToken(
  db: D1Database,
  userId: number,
  email: string,
): Promise<string> {
  const rawToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(rawToken);

  await db
    .prepare(
      `UPDATE password_reset_tokens
       SET consumed_at = COALESCE(consumed_at, datetime('now')),
           updated_at = datetime('now')
       WHERE user_id = ?
         AND consumed_at IS NULL
         AND expires_at > datetime('now')`,
    )
    .bind(userId)
    .run();

  await db
    .prepare(
      `INSERT INTO password_reset_tokens
        (id, user_id, email, token_hash, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now', '+60 minutes'), datetime('now'), datetime('now'))`,
    )
    .bind(crypto.randomUUID(), userId, email, tokenHash)
    .run();

  return rawToken;
}

/**
 * POST /api/auth/invite/accept
 * Define senha inicial a partir de token de convite
 */
authRoutes.post('/invite/accept', async (c) => {
  const body = await c.req.json<{ token?: string; senha?: string; password?: string }>();
  const token = String(body?.token || '').trim();
  const senha = String(body?.senha || body?.password || '');

  if (!token) {
    throw badRequest('token é obrigatório', 'MISSING_TOKEN');
  }

  validatePassword(senha);

  const db = c.env.DB;

  const convite = await db
    .prepare(
      `
      SELECT id, usuario_id, empresa_id, role, expires_at, used_at
      FROM convites_usuarios
      WHERE token = ?
      LIMIT 1
    `,
    )
    .bind(token)
    .first<{
      id: number;
      usuario_id: number;
      empresa_id: number;
      role: string | null;
      expires_at: string;
      used_at: string | null;
    }>();

  if (!convite) {
    throw unauthorized('Convite inválido', 'INVALID_INVITE_TOKEN');
  }

  if (convite.used_at) {
    throw unauthorized('Convite já utilizado', 'INVITE_ALREADY_USED');
  }

  const expired = await db
    .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS expired`)
    .bind(convite.expires_at)
    .first<{ expired: number }>();

  if (expired?.expired) {
    throw unauthorized('Convite expirado', 'INVITE_EXPIRED');
  }

  const passwordHash = await hashPassword(senha);

  const { hasActive, hasAtivo } = await getUsuariosSchema(db);

  const updateUserSql = hasActive
    ? `UPDATE usuarios SET password_hash = ?, active = 1, updated_at = datetime('now') WHERE id = ?`
    : hasAtivo
      ? `UPDATE usuarios SET password_hash = ?, ativo = 1, updated_at = datetime('now') WHERE id = ?`
      : `UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`;

  await db.prepare(updateUserSql).bind(passwordHash, convite.usuario_id).run();

  const inviteRole = convite.role || 'member';

  await db
    .prepare(
      `
      INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
      SELECT
        ?,
        ?,
        ?,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM usuarios_empresas
            WHERE usuario_id = ?
              AND is_primary = 1
          ) THEN 0
          ELSE 1
        END,
        datetime('now')
    `,
    )
    .bind(convite.usuario_id, convite.empresa_id, inviteRole, convite.usuario_id)
    .run();

  await db
    .prepare(
      `UPDATE usuarios_empresas
       SET role = ?
       WHERE usuario_id = ?
         AND empresa_id = ?`,
    )
    .bind(inviteRole, convite.usuario_id, convite.empresa_id)
    .run();

  await db
    .prepare(`UPDATE convites_usuarios SET used_at = datetime('now') WHERE id = ?`)
    .bind(convite.id)
    .run();

  return c.json({
    success: true,
    message: 'Senha criada com sucesso. Faça login para continuar.',
  });
});

/**
 * POST /api/auth/forgot-password
 * Sempre retorna sucesso para evitar enumeração de usuários.
 */
authRoutes.post(
  '/forgot-password',
  rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'auth-forgot-password' }),
  async (c) => {
    const logger = createLogger(c, 'AuthRoutes.forgotPassword');

    const body = await c.req
      .json<{
        email?: string;
      }>()
      .catch(() => ({}));

    const email = normalizeEmail((body as { email?: string }).email);

    if (!email || !email.includes('@')) {
      return c.json({ success: true });
    }

    try {
      const db = c.env.DB;
      const { activeWhere } = await getUsuariosSchema(db);

      const user = await db
        .prepare(
          `SELECT id, email
           FROM usuarios
           WHERE email = ?
             AND deleted_at IS NULL
             ${activeWhere}
           LIMIT 1`,
        )
        .bind(email)
        .first<{ id: number; email: string }>();

      if (user && c.env.BREVO_API_KEY) {
        const token = await issuePasswordResetToken(db, user.id, user.email);
        const resetUrl = buildResetPasswordUrl(c.env.FRONTEND_URL, token);
        const assunto = '[AirTrust] Recuperação de senha';
        const corpo = `Recebemos uma solicitação para redefinir sua senha no AirTrust.\n\nUse o link abaixo para criar uma nova senha (válido por 60 minutos):\n${resetUrl}\n\nSe você não solicitou esta alteração, ignore este e-mail.`;
        await enviarEmailAlert(c.env, [user.email], assunto, corpo);
      }
    } catch (error) {
      logger.warn('[AUTH] forgot-password: falha controlada', { error: toError(error).message });
    }

    return c.json({ success: true });
  },
);

/**
 * POST /api/auth/reset-password
 */
authRoutes.post(
  '/reset-password',
  rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'auth-reset-password' }),
  async (c) => {
    const body = await c.req.json<{
      token?: string;
      senha?: string;
      password?: string;
      confirmarSenha?: string;
      confirmPassword?: string;
    }>();

    const token = String(body?.token || '').trim();
    const senha = String(body?.senha || body?.password || '');
    const confirmacao = String(body?.confirmarSenha || body?.confirmPassword || '');

    if (!token) {
      throw badRequest('Token é obrigatório', 'MISSING_RESET_TOKEN');
    }

    validatePassword(senha);
    if (confirmacao && confirmacao !== senha) {
      throw badRequest('A confirmação da nova senha não confere', 'PASSWORD_CONFIRMATION_MISMATCH');
    }

    const db = c.env.DB;
    const tokenHash = await sha256Hex(token);

    const tokenRow = await db
      .prepare(
        `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = ?
           AND consumed_at IS NULL
           AND expires_at > datetime('now')
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(tokenHash)
      .first<{ id: string; user_id: number }>();

    if (!tokenRow?.id) {
      throw unauthorized('Token inválido ou expirado', 'INVALID_RESET_TOKEN');
    }

    const { activeWhere } = await getUsuariosSchema(db);
    const user = await db
      .prepare(
        `SELECT id, password_hash
         FROM usuarios
         WHERE id = ?
           AND deleted_at IS NULL
           ${activeWhere}
         LIMIT 1`,
      )
      .bind(tokenRow.user_id)
      .first<{ id: number; password_hash: string }>();

    if (!user?.id) {
      throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
    }

    const passwordHash = await hashPassword(senha);

    await db
      .prepare(`UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(passwordHash, user.id)
      .run();

    await db
      .prepare(
        `UPDATE password_reset_tokens
         SET consumed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(tokenRow.id)
      .run();

    // Revoga refresh tokens para forçar novo login em todos os dispositivos.
    await db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = datetime('now')
         WHERE user_id = ?
           AND revoked_at IS NULL`,
      )
      .bind(user.id)
      .run();

    return c.json({
      success: true,
      message: 'Senha redefinida com sucesso.',
    });
  },
);

/**
 * POST /api/auth/login
 *
 * Autentica usuário com email/senha e retorna access + refresh tokens
 *
 * Body:
 * {
 *   "email": "admin@airtrust.com",
 *   "senha": "<senha-do-usuario>"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "a1b2c3d4...",
 *     "user": {
 *       "id": 1,
 *       "email": "admin@airtrust.com",
 *       "role": "admin",
 *       "nome": "Administrador AirTrust"
 *     }
 *   }
 * }
 */
authRoutes.post(
  '/login',
  rateLimiter({ ...rateLimitPresets.login, keyPrefix: 'auth-login' }),
  async (c) => {
    const requestId = (c.get('requestId') as string) || crypto.randomUUID();
    c.header('X-Request-ID', requestId);
    const logger = createLogger(c, 'AuthRoutes.login');
    const logStep = (step: string, extra?: Record<string, unknown>) => {
      try { logger.info(`[LOGIN:${step}]`, { requestId, ...extra }); } catch { /* never let logging break the response */ }
    };
    try {
      const body = await c.req.json();
      // Aceita tanto 'password' quanto 'senha' para compatibilidade
      const { email, senha, password } = body;
      const passwordToUse = senha || password;

      // Validação básica
      if (!email || !passwordToUse) {
        throw badRequest('Email e senha são obrigatórios', 'MISSING_CREDENTIALS');
      }

      const devEnv = c.env.ENVIRONMENT ?? 'production';
      const devBypassEnabled = devEnv === 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true';
      const devIdentity = devBypassEnabled ? resolveDevBypassIdentity(email) : null;

      // Buscar usuário no D1
      const db = c.env.DB;
      const { hasActive, hasAtivo, activeWhere } = await getUsuariosSchema(db);

      type DbUser = {
        id: number;
        email: string;
        perfil: string;
        password_hash: string;
        nome: string;
      } | null;

      let user = await db
        .prepare(
          `
        SELECT id, email, nome, perfil, password_hash
        FROM usuarios
        WHERE email = ?
          AND deleted_at IS NULL
          ${activeWhere}
      `,
        )
        .bind(email.toLowerCase())
        .first<DbUser>();

      if (devBypassEnabled && devIdentity?.isPreset && user) {
        await syncDevBypassUser(db, devIdentity, user.id, { hasActive, hasAtivo });
        user = await db
          .prepare(
            `SELECT id, email, nome, perfil, password_hash FROM usuarios WHERE email = ? AND deleted_at IS NULL ${activeWhere}`,
          )
          .bind(email.toLowerCase())
          .first<DbUser>();
      }

      if (!user && devBypassEnabled && devIdentity?.isPreset) {
        const legacyUser = await db
          .prepare(`SELECT id, email, nome, perfil, password_hash FROM usuarios WHERE email = ? LIMIT 1`)
          .bind(email.toLowerCase())
          .first<DbUser>();

        if (legacyUser) {
          await syncDevBypassUser(db, devIdentity, legacyUser.id, { hasActive, hasAtivo });
          user = await db
            .prepare(
              `SELECT id, email, nome, perfil, password_hash FROM usuarios WHERE email = ? AND deleted_at IS NULL ${activeWhere}`,
            )
            .bind(email.toLowerCase())
            .first<DbUser>();
        }
      }

      if (!user) {
        if (devBypassEnabled && devIdentity) {
          // Dev bypass: auto-provisionar perfis locais sem tocar ambientes remotos.
          await db
            .prepare(
              `INSERT OR IGNORE INTO usuarios (email, password_hash, nome, perfil, deleted_at, ${
                hasActive ? 'active' : hasAtivo ? 'ativo' : 'created_at'
              })
             VALUES (?, ?, ?, ?, NULL, ${hasActive || hasAtivo ? '1' : "datetime('now')"})`,
            )
            .bind(
              email.toLowerCase(),
              'dev-local-bypass',
              devIdentity.nome,
              devIdentity.persistedProfile,
            )
            .run();

          const created = await db
            .prepare(
              `SELECT id, email, nome, perfil, password_hash FROM usuarios WHERE email = ? AND deleted_at IS NULL ${activeWhere}`,
            )
            .bind(email.toLowerCase())
            .first<DbUser>();
          if (created) {
            await syncDevBypassUser(db, devIdentity, created.id, { hasActive, hasAtivo });
            user = await db
              .prepare(
                `SELECT id, email, nome, perfil, password_hash FROM usuarios WHERE email = ? AND deleted_at IS NULL ${activeWhere}`,
              )
              .bind(email.toLowerCase())
              .first<DbUser>();
          } else {
            throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
          }
        } else {
          throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
        }
      }

      // Verificar senha — em dev com bypass, aceitar qualquer senha para utilizadores auto-provisionados
      let isValidPassword = false;
      try {
        if (devBypassEnabled && (user as NonNullable<DbUser>).password_hash === 'dev-local-bypass') {
          isValidPassword = true;
        } else {
          isValidPassword = await verifyPassword(
            passwordToUse,
            (user as NonNullable<DbUser>).password_hash,
          );
        }
      } catch (e) {
        logger.error('[AUTH] Erro ao verificar senha (bcrypt)', toError(e));
      }

      if (!isValidPassword) {
        throw unauthorized('Credenciais inválidas', 'INVALID_CREDENTIALS');
      }

      const authenticatedUser = user as NonNullable<DbUser>;
      logStep('password_ok', { userId: authenticatedUser.id });

      // Gerar JWT access token curto para reduzir janela de exposição.
      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');

      let empresaId: number;
      try {
        empresaId = await resolveUserEmpresaId(db, authenticatedUser.id);
        logStep('empresa_resolved', { userId: authenticatedUser.id, empresaId });
      } catch (empresaErr) {
        logStep('empresa_failed', { error: toError(empresaErr).message });
        throw empresaErr;
      }

      let resolvedRole: string;
      try {
        resolvedRole = await resolveAuthRoleForUser(
          db,
          authenticatedUser.id,
          empresaId,
          authenticatedUser.perfil,
        );
        logStep('role_resolved', { userId: authenticatedUser.id, empresaId });
      } catch (roleErr) {
        logStep('role_failed', { error: toError(roleErr).message });
        throw roleErr;
      }

      // Carregar permissões individuais do usuário
      const permissoesRows = await db
        .prepare(
          `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
        )
        .bind(authenticatedUser.id)
        .all<{ permissao: string; tipo: string }>()
        .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));

      const permissions = (permissoesRows.results || []).map((p) => `${p.tipo}:${p.permissao}`);

      // Carregar funcionario_id se existir
      const userFull = await db
        .prepare(`SELECT funcionario_id FROM usuarios WHERE id = ? LIMIT 1`)
        .bind(authenticatedUser.id)
        .first<{ funcionario_id: number | null }>()
        .catch(() => null);

      const { token: accessToken, jti } = await generateJWT(
        {
          sub: authenticatedUser.id,
          empresa_id: empresaId,
          email: authenticatedUser.email,
          role: resolvedRole,
          nome: authenticatedUser.nome,
          permissions: permissions.length > 0 ? permissions : undefined,
          funcionario_id: userFull?.funcionario_id ?? null,
        },
        jwtSecret,
        ACCESS_TOKEN_TTL_SECONDS,
      );
      logStep('jwt_generated', { userId: authenticatedUser.id });

      // Gerar refresh token longo com rotação.
      const refreshToken = generateRefreshToken();
      const expiresAt = getRefreshTokenExpiry(REFRESH_TOKEN_TTL_DAYS);

      try {
        await persistRefreshToken(db, {
          userId: authenticatedUser.id,
          refreshToken,
          expiresAt,
          accessTokenJti: jti,
        });
        logStep('refresh_token_saved', { userId: authenticatedUser.id });
      } catch (refreshErr) {
        logStep('refresh_token_failed', { error: toError(refreshErr).message });
        throw refreshErr;
      }

      // Retornar tokens e dados do usuário
      return c.json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: authenticatedUser.id,
            email: authenticatedUser.email,
            role: resolvedRole,
            nome: authenticatedUser.nome,
            permissions,
            funcionario_id: userFull?.funcionario_id ?? null,
          },
        },
        requestId,
      });
    } catch (error) {
      // Preserve ApiError to allow specific codes/messages from helpers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorName = (error as any)?.name;
      if (errorName === 'ApiError') {
        // Inject requestId into ApiError responses so client can correlate
        if ((error as any)?.code) {
          try { c.header('X-Request-ID', requestId); } catch { /* best effort */ }
        }
        throw error as never;
      }
      // Log safely — logger may fail if env is misconfigured
      try { logStep('login_error', { errorName, errorMessage: toError(error).message }); } catch { /* silent */ }
      try { logger.error('[AUTH] Login error', toError(error)); } catch { /* silent */ }
      // Always return JSON with requestId, never let an unexpected error crash the response
      return c.json(
        {
          success: false,
          error: 'Erro ao processar login',
          code: 'LOGIN_ERROR',
          requestId,
        },
        500,
      );
    }
  },
);

/**
 * POST /api/auth/refresh
 *
 * Renova access token usando refresh token válido
 *
 * Body:
 * {
 *   "refreshToken": "a1b2c3d4..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "e5f6g7h8..." (opcional: novo refresh token)
 *   }
 * }
 */
authRoutes.post(
  '/refresh',
  rateLimiter({ maxRequests: 20, windowSeconds: 60, keyPrefix: 'auth-refresh' }),
  async (c) => {
    const logger = createLogger(c, 'AuthRoutes.refresh');
    try {
      const body = await c.req.json();
      const { refreshToken } = body;

      if (!refreshToken) {
        throw badRequest('Refresh token é obrigatório', 'MISSING_REFRESH_TOKEN');
      }

      const db = c.env.DB;

      type RefreshTokenRecord = {
        user_id: number;
        revoked_at: string | null;
        expires_at: string;
      } | null;
      const refreshTokenRecord = await db
        .prepare(
          `
        SELECT rt.user_id, rt.revoked_at, rt.expires_at
        FROM refresh_tokens rt
        WHERE rt.token = ?
        LIMIT 1
      `,
        )
        .bind(refreshToken)
        .first<RefreshTokenRecord>();

      if (!refreshTokenRecord) {
        throw unauthorized('Refresh token inválido', 'INVALID_REFRESH_TOKEN');
      }

      if (refreshTokenRecord.revoked_at) {
        throw unauthorized('Refresh token revogado', 'REFRESH_TOKEN_REVOKED');
      }

      const expiredRow = await db
        .prepare(`SELECT CASE WHEN datetime(?) <= datetime('now') THEN 1 ELSE 0 END AS expired`)
        .bind(refreshTokenRecord.expires_at)
        .first<{ expired: number }>();

      if (expiredRow?.expired) {
        throw unauthorized('Refresh token expirado', 'REFRESH_TOKEN_EXPIRED');
      }

      const { activeWhere } = await getUsuariosSchema(db);

      type TokenRecord = {
        user_id: number;
        email: string;
        perfil: string;
        nome: string;
        funcionario_id: number | null;
      } | null;
      const tokenRecord = await db
        .prepare(
          `
        SELECT rt.user_id, u.email, u.perfil, u.nome, u.funcionario_id
        FROM refresh_tokens rt
        INNER JOIN usuarios u ON rt.user_id = u.id
        WHERE rt.token = ?
          AND u.deleted_at IS NULL
          ${activeWhere}
        LIMIT 1
      `,
        )
        .bind(refreshToken)
        .first<TokenRecord>();

      if (!tokenRecord) {
        await db
          .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
          .bind(refreshToken)
          .run()
          .catch(() => null);
        throw unauthorized('Usuário inativo ou removido', 'USER_INACTIVE');
      }

      const jwtSecret = c.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');
      const userId = (tokenRecord as NonNullable<TokenRecord>).user_id;
      const empresaId = await resolveUserEmpresaId(
        db,
        (tokenRecord as NonNullable<TokenRecord>).user_id,
      );
      const resolvedRole = await resolveAuthRoleForUser(
        db,
        userId,
        empresaId,
        tokenRecord.perfil,
      );

      // Recarregar permissões individuais (overrides GRANT/DENY)
      const permissoesRefresh = await db
        .prepare(
          `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
        )
        .bind(userId)
        .all<{ permissao: string; tipo: string }>()
        .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));
      const permissionsRefresh = (permissoesRefresh.results || []).map(
        (p) => `${p.tipo}:${p.permissao}`,
      );

      const { token: newAccessToken, jti: newJti } = await generateJWT(
        {
          sub: userId,
          empresa_id: empresaId,
          email: tokenRecord.email,
          role: resolvedRole,
          nome: tokenRecord.nome,
          permissions: permissionsRefresh,
          funcionario_id: (tokenRecord as NonNullable<TokenRecord>).funcionario_id ?? null,
        },
        jwtSecret,
        ACCESS_TOKEN_TTL_SECONDS,
      );

      // Rotação de refresh token
      const newRefreshToken = generateRefreshToken();
      const newExpiresAt = getRefreshTokenExpiry(REFRESH_TOKEN_TTL_DAYS);

      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
        .bind(refreshToken)
        .run();

      await persistRefreshToken(db, {
        userId: (tokenRecord as NonNullable<TokenRecord>).user_id,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
        accessTokenJti: newJti,
      });

      return c.json({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.name === 'ApiError') throw error as never;
      logger.error('[AUTH] Refresh error', toError(error));
      throw internalError('Erro ao renovar token', 'REFRESH_ERROR');
    }
  },
);

/**
 * POST /api/auth/logout
 *
 * Invalida refresh token (revoga)
 *
 * Body:
 * {
 *   "refreshToken": "a1b2c3d4..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "Logout realizado com sucesso"
 * }
 */
authRoutes.post('/logout', async (c) => {
  const logger = createLogger(c, 'AuthRoutes.logout');
  try {
    const body = await c.req.json<{ refreshToken?: string }>().catch(() => ({}));
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : null;

    const db = c.env.DB;
    await cleanupExpiredRefreshTokens(db);

    const accessToken = extractBearerToken(c.req.header('Authorization'));
    const accessPayload =
      accessToken && c.env.JWT_SECRET ? await verifyJWT(accessToken, c.env.JWT_SECRET) : null;
    const currentAccessJti = accessPayload?.jti ?? null;
    const currentUserId = Number(accessPayload?.sub || 0);

    if (!refreshToken && currentUserId <= 0) {
      throw badRequest('Refresh token é obrigatório', 'MISSING_REFRESH_TOKEN');
    }

    if (refreshToken) {
      const tokenRow = await db
        .prepare('SELECT access_token_jti FROM refresh_tokens WHERE token = ? AND revoked_at IS NULL')
        .bind(refreshToken)
        .first<{ access_token_jti: string | null }>()
        .catch(() => null);

      await db
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE token = ?')
        .bind(refreshToken)
        .run();

      await blocklistAccessTokenJti(db, tokenRow?.access_token_jti);
    } else {
      await db
        .prepare(
          `UPDATE refresh_tokens
           SET revoked_at = datetime('now')
           WHERE user_id = ?
             AND revoked_at IS NULL`,
        )
        .bind(currentUserId)
        .run()
        .catch(() => null);
    }

    await blocklistAccessTokenJti(db, currentAccessJti);

    return c.json({
      success: true,
      message: 'Logout realizado com sucesso',
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[AUTH] Logout error', toError(error));
    throw internalError('Erro ao fazer logout', 'LOGOUT_ERROR');
  }
});

/**
 * GET /api/auth/me
 *
 * Retorna dados do usuário autenticado
 * Requer: Authorization: Bearer <accessToken>
 */
authRoutes.get('/me', auth(), async (c) => {
  const logger = createLogger(c, 'AuthRoutes.me');
  try {
    // c.get is tipado via Variables, mas pode retornar string
    const userIdRaw = c.get('userId');
    const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

    // Buscar dados do usuário no D1
    const db = c.env.DB;

    const { activeWhere } = await getUsuariosSchema(db);

    type MeRow = { id: number; email: string; perfil: string; nome: string } | null;
    const user = await db
      .prepare(
        `
        SELECT id, email, nome, perfil
        FROM usuarios
        WHERE id = ?
          AND deleted_at IS NULL
          ${activeWhere}
      `,
      )
      .bind(userId)
      .first<MeRow>();

    if (!user) {
      throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
    }

    const empresaIdRaw = c.get('empresaId');
    const empresaId =
      typeof empresaIdRaw === 'string' ? Number(empresaIdRaw) : Number(empresaIdRaw || 0);
    const resolvedRole = await resolveAuthRoleForUser(
      db,
      (user as NonNullable<MeRow>).id,
      empresaId,
      (user as NonNullable<MeRow>).perfil,
    );

    return c.json({
      success: true,
      data: {
        id: (user as NonNullable<MeRow>).id,
        email: (user as NonNullable<MeRow>).email,
        role: resolvedRole,
        nome: (user as NonNullable<MeRow>).nome,
      },
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[AUTH] /me error', toError(error));
    throw internalError('Erro ao buscar dados do usuário', 'ME_ERROR');
  }
});

authRoutes.post('/change-password', auth(), async (c) => {
  const body = await c.req.json<{
    senhaAtual?: string;
    currentPassword?: string;
    novaSenha?: string;
    newPassword?: string;
    confirmarSenha?: string;
    confirmPassword?: string;
  }>();

  const senhaAtual = String(body?.senhaAtual || body?.currentPassword || '');
  const novaSenha = String(body?.novaSenha || body?.newPassword || '');
  const confirmarSenha = String(body?.confirmarSenha || body?.confirmPassword || '');

  if (!senhaAtual) {
    throw badRequest('Senha atual é obrigatória', 'MISSING_CURRENT_PASSWORD');
  }

  validatePassword(novaSenha);

  if (confirmarSenha && confirmarSenha !== novaSenha) {
    throw badRequest('A confirmação da nova senha não confere', 'PASSWORD_CONFIRMATION_MISMATCH');
  }

  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);
  const db = c.env.DB;
  const { activeWhere } = await getUsuariosSchema(db);

  const user = await db
    .prepare(
      `SELECT id, password_hash
       FROM usuarios
       WHERE id = ?
         AND deleted_at IS NULL
         ${activeWhere}
       LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: number; password_hash: string } | null>();

  if (!user?.password_hash) {
    throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
  }

  const devEnv = c.env.ENVIRONMENT ?? 'production';
  const devBypassEnabled = devEnv === 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true';
  const senhaAtualValida =
    devBypassEnabled && user.password_hash === 'dev-local-bypass'
      ? true
      : await verifyPassword(senhaAtual, user.password_hash);

  if (!senhaAtualValida) {
    throw unauthorized('Senha atual inválida', 'INVALID_CURRENT_PASSWORD');
  }

  if (!(devBypassEnabled && user.password_hash === 'dev-local-bypass')) {
    const isSamePassword = await verifyPassword(novaSenha, user.password_hash);
    if (isSamePassword) {
      throw badRequest('A nova senha deve ser diferente da atual', 'PASSWORD_UNCHANGED');
    }
  }

  const passwordHash = await hashPassword(novaSenha);
  await db
    .prepare(`UPDATE usuarios SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(passwordHash, userId)
    .run();

  await db
    .prepare(
      `UPDATE refresh_tokens
       SET revoked_at = datetime('now')
       WHERE user_id = ?
         AND revoked_at IS NULL`,
    )
    .bind(userId)
    .run()
    .catch(() => null);

  const currentAccessToken = extractBearerToken(c.req.header('Authorization'));
  if (currentAccessToken && c.env.JWT_SECRET) {
    const payload = await verifyJWT(currentAccessToken, c.env.JWT_SECRET).catch(() => null);
    await blocklistAccessTokenJti(db, payload?.jti ?? null);
  }

  return c.json({
    success: true,
    message: 'Senha alterada com sucesso.',
  });
});

/**
 * GET /api/auth/empresas
 * Lista empresas vinculadas ao usuário autenticado
 */
authRoutes.get('/empresas', auth(), async (c) => {
  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

  const db = c.env.DB;
  const empresaIdAtual = await resolveUserEmpresaId(db, userId);
  const platformAccessState = await resolvePlatformAccessState(db, userId);
  const isPlatformAdmin = isPlatformAdminAccess(platformAccessState);

  const empresas = await db
    .prepare(
      isPlatformAdmin
        ? `
      SELECT
        e.id,
        e.nome,
        e.codigo,
        e.logo_url,
        ec.modulos_ativos,
        'admin' AS role,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_primary,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_current
      FROM empresas e
      LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
      WHERE e.deleted_at IS NULL
        AND e.ativo = 1
      ORDER BY
        CASE WHEN e.id = ? THEN 0 ELSE 1 END,
        CASE WHEN e.codigo = 'airtrust' THEN 0 ELSE 1 END,
        e.nome ASC
    `
        : `
      SELECT
        e.id,
        e.nome,
        e.codigo,
        e.logo_url,
        ec.modulos_ativos,
        ue.role,
        ue.is_primary,
        CASE WHEN e.id = ? THEN 1 ELSE 0 END AS is_current
      FROM usuarios_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      LEFT JOIN empresas_config ec ON ec.empresa_id = e.id
      WHERE ue.usuario_id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      ORDER BY
        CASE WHEN e.id = ? THEN 0 ELSE 1 END,
        CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
        e.nome ASC
    `,
    )
    .bind(
      ...(isPlatformAdmin
        ? [empresaIdAtual, empresaIdAtual, empresaIdAtual]
        : [empresaIdAtual, userId, empresaIdAtual]),
    )
    .all<{
      id: number;
      nome: string;
      codigo: string;
      logo_url: string | null;
      modulos_ativos: string | null;
      role: string;
      is_primary: number;
      is_current: number;
    }>();

  const normalizedEmpresas = (empresas.results || []).map((empresa) => ({
    ...empresa,
    modulos_ativos: normalizeModulosAtivos(empresa.modulos_ativos),
  }));

  return c.json({
    success: true,
    data: {
      empresaAtualId: empresaIdAtual,
      empresas: normalizedEmpresas,
    },
  });
});

/**
 * POST /api/auth/select-empresa
 * Alterna empresa ativa do usuário e retorna novo access token
 */
authRoutes.post('/select-empresa', auth(), async (c) => {
  const body = await c.req.json<{ empresaId?: number }>();
  const targetEmpresaId = Number(body?.empresaId || 0);

  if (!targetEmpresaId || !Number.isFinite(targetEmpresaId)) {
    throw badRequest('empresaId é obrigatório', 'MISSING_EMPRESA_ID');
  }

  const userIdRaw = c.get('userId');
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);
  const db = c.env.DB;
  const platformAccessState = await resolvePlatformAccessState(db, userId);
  const isPlatformAdmin = isPlatformAdminAccess(platformAccessState);

  const vinculo = await db
    .prepare(
      isPlatformAdmin
        ? `
      SELECT 'admin' AS role, e.id as empresa_id, e.nome as empresa_nome, e.codigo as empresa_codigo
      FROM empresas e
      WHERE e.id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      LIMIT 1
    `
        : `
      SELECT ue.role, e.id as empresa_id, e.nome as empresa_nome, e.codigo as empresa_codigo
      FROM usuarios_empresas ue
      INNER JOIN empresas e ON e.id = ue.empresa_id
      WHERE ue.usuario_id = ?
        AND ue.empresa_id = ?
        AND e.deleted_at IS NULL
        AND e.ativo = 1
      LIMIT 1
    `,
    )
    .bind(...(isPlatformAdmin ? [targetEmpresaId] : [userId, targetEmpresaId]))
    .first<{ role: string; empresa_id: number; empresa_nome: string; empresa_codigo: string }>();

  if (!vinculo) {
    throw unauthorized('Usuário não possui acesso à empresa selecionada', 'TENANT_ACCESS_DENIED');
  }

  if (isPlatformAdmin) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
         VALUES (?, ?, 'admin', 1, datetime('now'))`,
      )
      .bind(userId, targetEmpresaId)
      .run()
      .catch(() => null);
  }

  await db
    .prepare(
      `
      UPDATE usuarios_empresas
      SET is_primary = CASE WHEN empresa_id = ? THEN 1 ELSE 0 END
      WHERE usuario_id = ?
    `,
    )
    .bind(targetEmpresaId, userId)
    .run();

  type UserRow = { id: number; email: string; perfil: string; nome: string } | null;
  const user = await db
    .prepare(
      `
      SELECT id, email, perfil, nome
      FROM usuarios
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(userId)
    .first<UserRow>();

  if (!user) {
    throw unauthorized('Usuário não encontrado', 'USER_NOT_FOUND');
  }

  const { token: accessToken } = await issueAccessTokenForEmpresa(c, {
    userId,
    email: user.email,
    role: await resolveAuthRoleForUser(db, userId, targetEmpresaId, vinculo.role || user.perfil),
    nome: user.nome,
    empresaId: targetEmpresaId,
  });

  return c.json({
    success: true,
    data: {
      accessToken,
      empresa: {
        id: vinculo.empresa_id,
        nome: vinculo.empresa_nome,
        codigo: vinculo.empresa_codigo,
      },
    },
  });
});

/**
 * POST /api/auth/impersonate
 *
 * Permite que um ADMIN faça login como outro usuário para fins de teste.
 *
 * Body: { "userId": 42 }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "user": { "id": 42, "email": "...", "nome": "...", "role": "..." }
 *   }
 * }
 */
authRoutes.post('/impersonate', auth(), async (c) => {
  const logger = createLogger(c, 'AuthRoutes.impersonate');
  try {
    // SECURITY: Normalize role to uppercase to prevent case-sensitivity bypass
    const callerRole = (c.get('userRole') as string | undefined)?.toUpperCase() ?? '';
    if (!isAdminRole(callerRole)) {
      throw unauthorized('Apenas administradores podem usar impersonação', 'FORBIDDEN');
    }

    const callerId = c.get('userId') as number | string;
    const body = await c.req.json<{ userId: number }>();
    const targetUserId = Number(body?.userId);
    if (!targetUserId || isNaN(targetUserId)) {
      throw badRequest('userId inválido', 'INVALID_USER_ID');
    }

    if (Number(callerId) === targetUserId) {
      throw badRequest('Não é possível impersonar a si mesmo', 'SELF_IMPERSONATE');
    }

    const db = c.env.DB;
    type TargetUser = { id: number; email: string; perfil: string; nome: string };
    const target = await db
      .prepare(
        `SELECT id, email, perfil, nome FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      )
      .bind(targetUserId)
      .first<TargetUser>();

    if (!target) {
      throw unauthorized('Usuário alvo não encontrado', 'USER_NOT_FOUND');
    }

    const empresaId = await resolveUserEmpresaId(db, target.id);
    const resolvedRole = await resolveAuthRoleForUser(db, target.id, empresaId, target.perfil);

    const permissoesRows = await db
      .prepare(
        `SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao`,
      )
      .bind(target.id)
      .all<{ permissao: string; tipo: string }>()
      .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));
    const permissions = (permissoesRows.results || []).map((p) => `${p.tipo}:${p.permissao}`);

    const userFull = await db
      .prepare(`SELECT funcionario_id FROM usuarios WHERE id = ? LIMIT 1`)
      .bind(target.id)
      .first<{ funcionario_id: number | null }>()
      .catch(() => null);

    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) throw new Error('JWT_SECRET não configurado');

    const { token: accessToken } = await generateJWT(
      {
        sub: target.id,
        empresa_id: empresaId,
        email: target.email,
        role: resolvedRole,
        nome: target.nome,
        permissions: permissions.length > 0 ? permissions : undefined,
        funcionario_id: userFull?.funcionario_id ?? null,
        impersonated_by: Number(callerId),
      },
      jwtSecret,
      3600,
    );

    logger.info(
      `[IMPERSONATE] Admin ${callerId} impersonando usuário ${target.id} (${target.email})`,
    );

    // SECURITY: Log impersonation action for compliance/audit trail
    await logAudit(db, {
      userId: Number(callerId),
      action: 'IMPERSONATE',
      entityType: 'usuario',
      entityId: targetUserId,
      newValues: buildAuditMetadata(c, {
        target_user_id: targetUserId,
        impersonation_duration_seconds: 3600,
      }),
      ipAddress: c.req.header('cf-connecting-ip'),
      userAgent: c.req.header('user-agent'),
    }).catch((err) => {
      logger.warn('[IMPERSONATE] Falha ao registrar auditoria', { error: toError(err).message });
      // Don't throw - audit failure shouldn't block login
    });

    return c.json({
      success: true,
      data: {
        accessToken,
        user: {
          id: target.id,
          email: target.email,
          nome: target.nome,
          role: resolvedRole,
          permissions,
          funcionario_id: userFull?.funcionario_id ?? null,
        },
      },
    });
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.name === 'ApiError') throw error as never;
    logger.error('[IMPERSONATE] Erro', toError(error));
    throw internalError('Erro ao processar impersonação', 'IMPERSONATE_ERROR');
  }
});

export { authRoutes };
