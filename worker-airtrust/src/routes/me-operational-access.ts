/**
 * /api/me/operational-access
 *
 * Operational-domain access plus explicit session-profile selection for users
 * that legitimately hold more than one operational role in the same tenant.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { auth } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import type { Env } from '../types';
import { resolveOperationalAccess } from '../services/operational-domain-access';
import {
  SESSION_ROLE_COOKIE,
  normalizeSessionRole,
  resolveAvailableSessionRoles,
  resolveRequestedSessionRole,
} from '../services/auth-session-roles';
import { generateJWT } from '../utils/security';

const router = new Hono<{ Bindings: Env }>();
const ACCESS_TOKEN_TTL_SECONDS = 30 * 60;

router.use('/*', auth());
router.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

function getUserId(c: Context): number {
  return Number((c.get as (key: string) => unknown)('userId') || 0);
}

function setSessionRoleCookie(c: Context, role: string): void {
  const isProduction = (c.env as Env).ENVIRONMENT === 'production';
  const domain = isProduction ? '; Domain=.airtrust.online' : '';
  const secure = isProduction ? '; Secure' : '';
  c.header(
    'Set-Cookie',
    `${SESSION_ROLE_COOKIE}=${encodeURIComponent(role)}; Path=/; SameSite=Lax${domain}${secure}`,
  );
}

router.get('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const userRole = (c.get as (key: string) => unknown)('userRole');

  const access = await resolveOperationalAccess({ db, empresaId, userId, userRole });

  return c.json({
    success: true,
    data: {
      administrative_role: userRole ?? null,
      enabled: access.enabled,
      domains: access.domains,
      setor_ids: access.setorIds,
      actions: access.actions,
    },
  });
});

/**
 * GET /api/me/operational-access/session-profiles
 * Lists only roles that the backend can prove for this user in this tenant.
 */
router.get('/session-profiles', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const activeRole = normalizeSessionRole((c.get as (key: string) => unknown)('userRole'));
  const roles = await resolveAvailableSessionRoles(db, userId, empresaId, activeRole);

  return c.json({
    success: true,
    data: {
      activeRole,
      roles,
      requiresSelection: roles.length > 1,
    },
  });
});

/**
 * POST /api/me/operational-access/session-profile
 * Issues a new access token scoped to one validated profile and stores the
 * selected role in a same-site session cookie. That cookie is independently
 * revalidated on every request, so the selected profile survives access-token
 * refresh without changing the canonical usuarios_empresas.role.
 */
router.post('/session-profile', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const body = await c.req
    .json<{ role?: string }>()
    .catch(() => ({}) as { role?: string });
  const requestedRole = String(body.role || '').trim();

  if (!requestedRole) {
    return c.json({ success: false, error: 'Perfil é obrigatório', code: 'SESSION_ROLE_REQUIRED' }, 400);
  }

  const currentRole = (c.get as (key: string) => unknown)('userRole');
  const selectedRole = await resolveRequestedSessionRole(
    db,
    userId,
    empresaId,
    requestedRole,
    currentRole,
  );

  if (!selectedRole) {
    return c.json(
      {
        success: false,
        error: 'Perfil não disponível para este usuário nesta empresa',
        code: 'SESSION_ROLE_NOT_AVAILABLE',
      },
      403,
    );
  }

  const user = await db
    .prepare(
      `SELECT id, email, nome, funcionario_id
         FROM usuarios
        WHERE id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(userId)
    .first<{
      id: number;
      email: string;
      nome: string;
      funcionario_id: number | null;
    }>();

  if (!user) {
    return c.json({ success: false, error: 'Usuário não encontrado', code: 'USER_NOT_FOUND' }, 401);
  }

  const permissionRows = await db
    .prepare('SELECT permissao, tipo FROM usuario_permissoes WHERE usuario_id = ? ORDER BY permissao')
    .bind(userId)
    .all<{ permissao: string; tipo: string }>()
    .catch(() => ({ results: [] as Array<{ permissao: string; tipo: string }> }));
  const permissions = (permissionRows.results || []).map((item) => `${item.tipo}:${item.permissao}`);

  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET não configurado no ambiente');
  }

  const { token: accessToken } = await generateJWT(
    {
      sub: user.id,
      empresa_id: empresaId,
      email: user.email,
      role: selectedRole,
      nome: user.nome,
      permissions,
      funcionario_id: user.funcionario_id ?? null,
    },
    jwtSecret,
    ACCESS_TOKEN_TTL_SECONDS,
  );

  setSessionRoleCookie(c, selectedRole);
  const roles = await resolveAvailableSessionRoles(db, userId, empresaId, selectedRole);

  return c.json({
    success: true,
    data: {
      accessToken,
      activeRole: selectedRole,
      roles,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        role: selectedRole,
        permissions,
        funcionario_id: user.funcionario_id ?? null,
      },
    },
  });
});

export default router;
