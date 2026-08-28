import type { MiddlewareHandler } from 'hono';
import type { Env, Variables, JwtPayload } from '../types';
import { extractBearerToken, verifyJWT } from '../utils/security';
import { getUsuariosSchema, hasUsuariosEmpresasTable } from '../utils/db-schema';
import { normalizeAirtrustRole } from '../utils/role-resolution';
import { resolveRequestedSessionRole } from '../services/auth-session-roles';
import { unauthorized, serviceUnavailable } from './error-handler';

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

function normalizeRuntimeRole(role: unknown): string {
  const normalized = normalizeAirtrustRole(role);
  if (normalized === 'COMPLIANCE') return 'GESTOR';
  if (normalized === 'EDITOR') return 'USUARIO';
  return normalized;
}

async function isJtiBlocklisted(db: D1Database, jti: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM token_blocklist WHERE jti = ? AND expires_at > datetime('now') LIMIT 1`)
    .bind(jti)
    .first();
  return Boolean(row);
}

type UserSecurityState = {
  found: boolean;
  active: boolean;
  canonicalRole: string;
  hasMembership: boolean;
};

async function resolveUserSecurityState(
  db: D1Database,
  userId: string | number | undefined,
  empresaId: string | number | undefined,
  fallbackRole: unknown,
): Promise<UserSecurityState> {
  const fallback = normalizeRuntimeRole(fallbackRole);
  const uid = Number(userId || 0);
  const eid = Number(empresaId || 0);

  if (!Number.isFinite(uid) || uid <= 0) {
    return { found: false, active: false, canonicalRole: fallback, hasMembership: false };
  }

  const { activeWhere } = await getUsuariosSchema(db);
  const scoped = eid > 0 && (await hasUsuariosEmpresasTable(db));

  const row = scoped
    ? await db
        .prepare(
          `
          SELECT u.id AS id, u.perfil AS perfil, ue.role AS role
          FROM usuarios u
          LEFT JOIN usuarios_empresas ue
            ON ue.usuario_id = u.id AND ue.empresa_id = ?
          WHERE u.id = ? AND u.deleted_at IS NULL ${activeWhere}
          LIMIT 1
        `,
        )
        .bind(eid, uid)
        .first<{ id: number; perfil: string | null; role: string | null }>()
    : await db
        .prepare(
          `SELECT id AS id, perfil AS perfil, NULL AS role FROM usuarios WHERE id = ? AND deleted_at IS NULL ${activeWhere} LIMIT 1`,
        )
        .bind(uid)
        .first<{ id: number; perfil: string | null; role: string | null }>();

  if (!row) {
    return { found: false, active: false, canonicalRole: fallback, hasMembership: false };
  }

  return {
    found: true,
    active: true,
    canonicalRole: normalizeRuntimeRole(row.role || row.perfil || fallback),
    hasMembership: scoped ? Boolean(row.role) : true,
  };
}

async function resolveRoleForAuthenticatedToken(
  db: D1Database,
  payload: JwtPayload,
  security: UserSecurityState,
): Promise<string | null> {
  const requestedRole = normalizeRuntimeRole(payload.role ?? '');
  if (!requestedRole || requestedRole === security.canonicalRole) {
    return security.canonicalRole;
  }

  const uid = Number(payload.sub || 0);
  const eid = Number(payload.empresa_id || 0);
  if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(eid) || eid <= 0) {
    return null;
  }

  return resolveRequestedSessionRole(
    db,
    uid,
    eid,
    requestedRole,
    security.canonicalRole,
  );
}

async function resolveDevBypassIdentity(db: D1Database): Promise<{
  userId: number;
  empresaId: number;
  email: string;
  role: string;
  funcionarioId: number | null;
} | null> {
  try {
    const { activeWhere } = await getUsuariosSchema(db);
    const row = await db
      .prepare(
        `
        SELECT u.id AS user_id,
               u.email AS email,
               COALESCE(ue.role, u.perfil) AS role,
               u.funcionario_id AS funcionario_id,
               ue.empresa_id AS empresa_id
        FROM usuarios u
        INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE u.deleted_at IS NULL
          ${activeWhere}
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        ORDER BY
          CASE
            WHEN LOWER(COALESCE(ue.role, u.perfil)) IN ('admin', 'administrador') THEN 0
            WHEN LOWER(COALESCE(ue.role, u.perfil)) IN ('manager', 'gestor') THEN 1
            ELSE 2
          END,
          CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
          u.id ASC
        LIMIT 1
      `,
      )
      .first<{
        user_id: number;
        email: string;
        role: string;
        funcionario_id: number | null;
        empresa_id: number;
      }>();

    if (!row?.user_id || !row.empresa_id) return null;
    return {
      userId: row.user_id,
      empresaId: row.empresa_id,
      email: row.email,
      role: normalizeRuntimeRole(row.role),
      funcionarioId: row.funcionario_id ?? null,
    };
  } catch {
    return null;
  }
}

async function verifyAccessPayload(c: Parameters<MiddlewareHandler<{ Bindings: Env }>>[0]) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return { error: unauthorized('Token de autenticação não fornecido', 'MISSING_TOKEN') };

  const token = extractBearerToken(authHeader);
  if (!token) return { error: unauthorized('Formato de token inválido. Use: Bearer <token>', 'INVALID_FORMAT') };

  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('Configuração de autenticação inválida');

  let payload: JwtPayload | null = null;
  try {
    payload = await verifyJWT(token, jwtSecret);
  } catch {
    return { error: unauthorized('Token inválido ou expirado', 'INVALID_TOKEN') };
  }

  if (!payload) return { error: unauthorized('Token inválido ou expirado', 'INVALID_TOKEN') };
  if (payload.token_type && payload.token_type !== 'access') {
    return { error: unauthorized('Tipo de token inválido para esta rota', 'INVALID_TOKEN_TYPE') };
  }
  return { payload };
}

export function auth(): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true') {
      throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
    }

    if (isDevAuthBypassEnabled(c.env)) {
      const identity = await resolveDevBypassIdentity(c.env.DB);
      if (!identity) {
        return unauthorized(
          'DEV_AUTH_BYPASS ativo, mas nenhum usuário de desenvolvimento com empresa ativa foi encontrado',
          'DEV_BYPASS_USER_NOT_FOUND',
        );
      }
      c.set('userId', identity.userId);
      c.set('empresaId', identity.empresaId);
      c.set('userEmail', identity.email);
      c.set('userRole', identity.role);
      c.set('funcionarioId', identity.funcionarioId);
      return next();
    }

    const verified = await verifyAccessPayload(c as never);
    if ('error' in verified && verified.error) return verified.error;
    const payload = verified.payload as JwtPayload;

    if (payload.jti) {
      try {
        if (await isJtiBlocklisted(c.env.DB, payload.jti)) {
          return unauthorized('Token revogado. Faça login novamente.', 'TOKEN_REVOKED');
        }
      } catch (error) {
        console.error('[AUTH] Falha ao consultar token_blocklist:', (error as Error).message);
        return serviceUnavailable(
          'Não foi possível verificar a revogação do token. Tente novamente.',
          'AUTH_REVOCATION_CHECK_UNAVAILABLE',
        );
      }
    }

    let security: UserSecurityState;
    try {
      security = await resolveUserSecurityState(
        c.env.DB,
        payload.sub,
        payload.empresa_id,
        payload.role ?? '',
      );
    } catch (error) {
      console.error('[AUTH] Falha ao verificar estado do usuário:', (error as Error).message);
      return serviceUnavailable(
        'Não foi possível verificar o status da conta. Tente novamente.',
        'AUTH_USER_STATE_CHECK_UNAVAILABLE',
      );
    }

    if (!security.found || !security.active) {
      return unauthorized('Usuário inativo ou não encontrado. Faça login novamente.', 'USER_INACTIVE');
    }
    if (!security.hasMembership) {
      return unauthorized(
        'Usuário sem vínculo válido com o tenant do token.',
        'TENANT_MEMBERSHIP_INVALID',
      );
    }

    let activeRole: string | null;
    try {
      activeRole = await resolveRoleForAuthenticatedToken(c.env.DB, payload, security);
    } catch (error) {
      console.error('[AUTH] Falha ao validar perfil ativo da sessão:', (error as Error).message);
      return serviceUnavailable(
        'Não foi possível validar o perfil ativo da sessão. Tente novamente.',
        'AUTH_SESSION_ROLE_CHECK_UNAVAILABLE',
      );
    }

    if (!activeRole) {
      return unauthorized(
        'O perfil ativo desta sessão não está mais disponível. Faça login novamente.',
        'SESSION_ROLE_INVALID',
      );
    }

    c.set('userId', payload.sub);
    c.set('empresaId', payload.empresa_id ?? 0);
    c.set('userEmail', payload.email);
    c.set('userRole', activeRole);
    c.set('funcionarioId', payload.funcionario_id ?? null);
    await next();
  };

  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

export function optionalAuth(): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true') {
      throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
    }

    if (isDevAuthBypassEnabled(c.env)) {
      const identity = await resolveDevBypassIdentity(c.env.DB);
      if (identity) {
        c.set('userId', identity.userId);
        c.set('empresaId', identity.empresaId);
        c.set('userEmail', identity.email);
        c.set('userRole', identity.role);
        c.set('funcionarioId', identity.funcionarioId);
      }
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      await next();
      return;
    }

    try {
      const token = extractBearerToken(authHeader);
      if (!token || !c.env.JWT_SECRET) {
        await next();
        return;
      }
      const payload = await verifyJWT(token, c.env.JWT_SECRET);
      if (!payload || (payload.token_type && payload.token_type !== 'access')) {
        await next();
        return;
      }

      if (payload.jti) {
        try {
          if (await isJtiBlocklisted(c.env.DB, payload.jti)) {
            await next();
            return;
          }
        } catch (error) {
          console.error('[OPTIONAL_AUTH] Falha ao consultar token_blocklist:', (error as Error).message);
          await next();
          return;
        }
      }

      const security = await resolveUserSecurityState(
        c.env.DB,
        payload.sub,
        payload.empresa_id,
        payload.role ?? '',
      );
      if (!security.found || !security.active || !security.hasMembership) {
        await next();
        return;
      }

      const activeRole = await resolveRoleForAuthenticatedToken(c.env.DB, payload, security);
      if (!activeRole) {
        await next();
        return;
      }

      c.set('userId', payload.sub);
      c.set('empresaId', payload.empresa_id ?? 0);
      c.set('userEmail', payload.email);
      c.set('userRole', activeRole);
      c.set('funcionarioId', payload.funcionario_id ?? null);
    } catch (error) {
      console.warn('[OPTIONAL_AUTH] Token inválido:', (error as Error).message);
    }

    await next();
  };

  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}
