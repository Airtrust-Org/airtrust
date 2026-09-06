/**
 * AUTH MIDDLEWARE - JWT Authentication
 *
 * Middleware de autenticação via JWT
 * PREPARADO MAS DESABILITADO por padrão
 *
 * Para habilitar:
 * - Descomentar uso no index.ts ou em rotas específicas
 * - Garantir que JWT_SECRET está configurado
 * - Implementar endpoint de login que gera tokens
 */

import type { MiddlewareHandler } from 'hono';
import type { Env, Variables, JwtPayload } from '../types';
import { extractBearerToken, verifyJWT } from '../utils/security';
import { getUsuariosSchema, hasUsuariosEmpresasTable } from '../utils/db-schema';
import { normalizeAirtrustRole } from '../utils/role-resolution';
import {
  parseSessionRoleFromCookieHeader,
  resolveRequestedSessionRole,
} from '../services/auth-session-roles';
import { unauthorized, serviceUnavailable } from './error-handler';

const USUARIOS_TABLE_SQL =
  "SELECT 1 as found FROM sqlite_master WHERE type = 'table' AND name = 'usuarios' LIMIT 1";

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

async function hasTable(db: D1Database, sql: string): Promise<boolean> {
  const result = await db.prepare(sql).first<{ found: number }>();
  return Boolean(result?.found);
}

function normalizeRuntimeRole(role: unknown): string {
  const normalized = normalizeAirtrustRole(role);
  if (normalized === 'COMPLIANCE') return 'GESTOR';
  if (normalized === 'EDITOR') return 'USUARIO';
  return normalized;
}

async function resolveEffectiveUserRole(
  db: D1Database,
  userId: string | number | undefined,
  empresaId: string | number | undefined,
  fallbackRole: unknown,
): Promise<string> {
  const fallback = normalizeRuntimeRole(fallbackRole);
  const uid = typeof userId === 'string' ? Number(userId) : Number(userId || 0);
  const eid = typeof empresaId === 'string' ? Number(empresaId) : Number(empresaId || 0);

  if (!Number.isFinite(uid) || uid <= 0) return fallback;
  if (!Number.isFinite(eid) || eid <= 0) return fallback;
  if (!(await hasUsuariosEmpresasTable(db))) return fallback;

  const roleRow = await db
    .prepare(
      `
      SELECT ue.role, u.perfil
      FROM usuarios u
      LEFT JOIN usuarios_empresas ue
        ON ue.usuario_id = u.id
       AND ue.empresa_id = ?
      WHERE u.id = ?
        AND u.deleted_at IS NULL
      LIMIT 1
    `,
    )
    .bind(eid, uid)
    .first<{ role: string | null; perfil: string | null }>();

  return normalizeRuntimeRole(roleRow?.role || roleRow?.perfil || fallback);
}

/**
 * Verifica se um JTI está na blocklist de tokens revogados (logout).
 * Fail-closed: qualquer erro de leitura é propagado (não engolido), para que
 * o chamador decida como reagir — o caller MANDATÓRIO (auth()) deve tratar
 * como falha de infraestrutura (503), nunca como "não bloqueado".
 */
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
  role: string;
  hasMembership: boolean;
};

/**
 * Resolve o estado de segurança do usuário autenticado: se a conta ainda
 * existe/está ativa, e se possui vínculo válido com o tenant carregado no
 * JWT (quando o token carrega empresa_id). Ao contrário de
 * resolveEffectiveUserRole, isto NUNCA cai em fallback silencioso para a
 * role do JWT quando o vínculo de tenant esperado não existe — a ausência
 * de vínculo é tratada como falha de autorização, não como "sem tenant".
 */
async function resolveUserSecurityState(
  db: D1Database,
  userId: string | number | undefined,
  empresaId: string | number | undefined,
  fallbackRole: unknown,
): Promise<UserSecurityState> {
  const fallback = normalizeRuntimeRole(fallbackRole);
  const uid = typeof userId === 'string' ? Number(userId) : Number(userId || 0);
  const eid = typeof empresaId === 'string' ? Number(empresaId) : Number(empresaId || 0);

  if (!Number.isFinite(uid) || uid <= 0) {
    return { found: false, active: false, role: fallback, hasMembership: false };
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
    return { found: false, active: false, role: fallback, hasMembership: false };
  }

  const hasMembership = scoped ? Boolean(row.role) : true;

  return {
    found: true,
    active: true,
    role: normalizeRuntimeRole(row.role || row.perfil || fallback),
    hasMembership,
  };
}

export type AccessTokenSecurityState = {
  role: string;
};

/**
 * Revalida um access JWT já assinado contra o estado mutável de segurança.
 * Usado tanto pelo middleware auth() quanto por superfícies públicas que
 * precisam aceitar Authorization bearer sem pular logout, desativação de
 * usuário ou remoção de vínculo empresarial.
 */
export async function validateAccessTokenSecurityState(
  db: D1Database,
  payload: JwtPayload,
): Promise<AccessTokenSecurityState> {
  if (payload.token_type && payload.token_type !== 'access') {
    return unauthorized('Tipo de token inválido para esta rota', 'INVALID_TOKEN_TYPE');
  }

  if (payload.jti) {
    let blocked: boolean;
    try {
      blocked = await isJtiBlocklisted(db, payload.jti);
    } catch (e) {
      console.error('[AUTH] Falha ao consultar token_blocklist:', (e as Error).message);
      return serviceUnavailable(
        'Não foi possível verificar a revogação do token. Tente novamente.',
        'AUTH_REVOCATION_CHECK_UNAVAILABLE',
      );
    }
    if (blocked) {
      return unauthorized('Token revogado. Faça login novamente.', 'TOKEN_REVOKED');
    }
  }

  let security: UserSecurityState;
  try {
    security = await resolveUserSecurityState(
      db,
      payload.sub,
      payload.empresa_id,
      payload.role ?? '',
    );
  } catch (e) {
    console.error('[AUTH] Falha ao verificar estado do usuário:', (e as Error).message);
    return serviceUnavailable(
      'Não foi possível verificar o status da conta. Tente novamente.',
      'AUTH_USER_STATE_CHECK_UNAVAILABLE',
    );
  }

  if (!security.found || !security.active) {
    return unauthorized(
      'Usuário inativo ou não encontrado. Faça login novamente.',
      'USER_INACTIVE',
    );
  }

  if (!security.hasMembership) {
    return unauthorized(
      'Usuário sem vínculo válido com o tenant do token.',
      'TENANT_MEMBERSHIP_INVALID',
    );
  }

  return { role: security.role };
}

async function resolveDevEmpresaId(db: D1Database, userId: number): Promise<number | null> {
  const usuariosEmpresasExists = await hasUsuariosEmpresasTable(db);

  if (usuariosEmpresasExists) {
    const primaryEmpresa = await db
      .prepare(
        `
        SELECT ue.empresa_id
        FROM usuarios_empresas ue
        INNER JOIN empresas e ON e.id = ue.empresa_id
        WHERE ue.usuario_id = ?
          AND e.deleted_at IS NULL
          AND e.ativo = 1
        ORDER BY
          CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
          ue.empresa_id ASC
        LIMIT 1
      `,
      )
      .bind(userId)
      .first<{ empresa_id: number }>();

    if (primaryEmpresa?.empresa_id) {
      return primaryEmpresa.empresa_id;
    }
  }

  const usuariosExists = await hasTable(db, USUARIOS_TABLE_SQL);

  if (usuariosExists) {
    const fallbackEmpresa = await db
      .prepare(
        `
        SELECT COALESCE(f.empresa_id, e.id) AS empresa_id
        FROM usuarios u
        LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
        LEFT JOIN empresas e ON e.deleted_at IS NULL AND e.ativo = 1
        WHERE u.id = ?
          AND u.deleted_at IS NULL
        ORDER BY
          CASE
            WHEN e.codigo = 'airtrust' THEN 0
            ELSE 1
          END,
          COALESCE(f.empresa_id, e.id) ASC
        LIMIT 1
      `,
      )
      .bind(userId)
      .first<{ empresa_id: number }>();

    if (fallbackEmpresa?.empresa_id) {
      return fallbackEmpresa.empresa_id;
    }
  }

  const empresaAtiva = await db
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

  return empresaAtiva?.empresa_id ?? null;
}

type DevBypassIdentity = {
  userId: number;
  email: string;
  role: string;
  empresaId: number;
  funcionarioId: number | null;
};

async function resolveDevBypassIdentity(db: D1Database): Promise<DevBypassIdentity | null> {
  const usuariosEmpresasExists = await hasUsuariosEmpresasTable(db);
  const { activeWhere } = await getUsuariosSchema(db);

  if (usuariosEmpresasExists) {
    const linkedUser = await db
      .prepare(
        `
        SELECT
          u.id AS user_id,
          u.email AS email,
          u.perfil AS role,
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
            WHEN LOWER(u.perfil) IN ('admin', 'administrador') THEN 0
            WHEN LOWER(u.perfil) IN ('gestor', 'manager') THEN 1
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

    if (linkedUser?.user_id && linkedUser.empresa_id) {
      return {
        userId: linkedUser.user_id,
        email: linkedUser.email,
        role: linkedUser.role,
        empresaId: linkedUser.empresa_id,
        funcionarioId: linkedUser.funcionario_id ?? null,
      };
    }
  }

  const fallbackEmpresaId = await resolveDevEmpresaId(db, 1);
  if (!fallbackEmpresaId) {
    return null;
  }

  return {
    userId: 1,
    email: 'dev@airtrust.local',
    role: 'ADMIN',
    empresaId: fallbackEmpresaId,
    funcionarioId: 1,
  };
}

/**
 * Middleware de autenticação JWT
 * Verifica token no header Authorization
 * Adiciona userId ao contexto se válido
 *
 * @example
 * ```typescript
 * // Proteger uma rota específica:
 * app.get('/api/protected', auth(), async (c) => {
 *   const userId = c.get('userId');
 *   return c.json({ userId });
 * });
 * ```
 */
export function auth(): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true') {
      throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
    }

    const devBypass = isDevAuthBypassEnabled(c.env);

    if (devBypass) {
      console.log('[AUTH] 🔓 DEV_AUTH_BYPASS ativo — autenticação desabilitada (apenas dev)');
      const db = c.env.DB;
      const identity = await resolveDevBypassIdentity(db);

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

    // ===================== AUTENTICAÇÃO JWT REAL =====================
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return unauthorized('Token de autenticação não fornecido', 'MISSING_TOKEN');
    }

    const token = extractBearerToken(authHeader);

    if (!token) {
      return unauthorized('Formato de token inválido. Use: Bearer <token>', 'INVALID_FORMAT');
    }

    const jwtSecret = c.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('[AUTH] JWT_SECRET não configurado!');
      throw new Error('Configuração de autenticação inválida');
    }

    let payload: JwtPayload | null = null;
    try {
      payload = await verifyJWT(token, jwtSecret);
    } catch (e) {
      console.warn('[AUTH VERIFY ERROR]', (e as Error).message);
      return unauthorized('Token inválido ou expirado', 'INVALID_TOKEN');
    }

    if (!payload) {
      return unauthorized('Token inválido ou expirado', 'INVALID_TOKEN');
    }

    const security = await validateAccessTokenSecurityState(c.env.DB, payload);

    c.set('userId', payload.sub);
    c.set('empresaId', payload.empresa_id ?? 0);
    c.set('userEmail', payload.email);
    c.set('userRole', security.role);
    c.set('funcionarioId', payload.funcionario_id ?? null);

    // ============ PERFIL ATIVO DE SESSÃO (multi-perfil) ============
    // A role canônica acima (usuarios_empresas.role) permanece a fonte de
    // verdade administrativa e NÃO é sobrescrita no banco. Só quando existe
    // uma seleção EXPLÍCITA de perfil na sessão é que consultamos o backend
    // para validá-la contra vínculos reais do usuário neste tenant. Sem
    // seleção, nenhuma consulta adicional é feita e a role canônica é usada.
    const selectedSessionRole = parseSessionRoleFromCookieHeader(c.req.header('Cookie'));
    if (selectedSessionRole) {
      let activeRole: string | null;
      try {
        activeRole = await resolveRequestedSessionRole(
          c.env.DB,
          Number(payload.sub),
          Number(payload.empresa_id ?? 0),
          selectedSessionRole,
          security.role,
        );
      } catch (e) {
        console.error('[AUTH] Falha ao validar perfil ativo da sessão:', (e as Error).message);
        return serviceUnavailable(
          'Não foi possível validar o perfil ativo da sessão. Tente novamente.',
          'AUTH_SESSION_ROLE_CHECK_UNAVAILABLE',
        );
      }
      if (!activeRole) {
        return unauthorized(
          'O perfil selecionado não está disponível para este usuário nesta empresa.',
          'SESSION_ROLE_INVALID',
        );
      }
      c.set('userRole', activeRole);
    }

    await next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

/**
 * Middleware de autenticação opcional
 * Não bloqueia se token não estiver presente
 * Mas se estiver, valida e adiciona userId ao contexto
 */
export function optionalAuth(): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true') {
      throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
    }

    const devBypass = isDevAuthBypassEnabled(c.env);

    if (devBypass) {
      const db = c.env.DB;
      const identity = await resolveDevBypassIdentity(db);

      if (identity) {
        c.set('userId', identity.userId);
        c.set('empresaId', identity.empresaId);
        c.set('userEmail', identity.email);
        c.set('userRole', identity.role);
        c.set('funcionarioId', identity.funcionarioId);
      }
      return next();
    }

    // Token opcional: não bloqueia, mas valida se presente
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      const token = extractBearerToken(authHeader);
      if (token && c.env.JWT_SECRET) {
        try {
          const payload = await verifyJWT(token, c.env.JWT_SECRET);
          if (payload) {
            // Token opcional também deve respeitar blocklist para evitar sessão "fantasma"
            // após logout/revogação em rotas que aceitam autenticação opcional.
            // Fail-closed para a IDENTIDADE: se a checagem falhar, tratamos como
            // "não autenticado" (não define userId/userRole) em vez de autenticar
            // silenciosamente — mas optionalAuth nunca bloqueia a requisição em si.
            if (payload.jti) {
              try {
                const blocked = await isJtiBlocklisted(c.env.DB, payload.jti);
                if (blocked) {
                  await next();
                  return;
                }
              } catch (e) {
                console.error(
                  '[OPTIONAL_AUTH] Falha ao consultar token_blocklist:',
                  (e as Error).message,
                );
                await next();
                return;
              }
            }

            const effectiveRole = await resolveEffectiveUserRole(
              c.env.DB,
              payload.sub,
              payload.empresa_id,
              payload.role ?? '',
            );

            c.set('userId', payload.sub);
            c.set('empresaId', payload.empresa_id ?? 0);
            c.set('userEmail', payload.email);
            c.set('userRole', effectiveRole);
            c.set('funcionarioId', payload.funcionario_id ?? null);

            // Perfil ativo de sessão: mesma regra do auth() obrigatório, mas
            // optionalAuth nunca bloqueia — se a seleção não puder ser
            // validada, mantém-se a role canônica já resolvida acima.
            const optSessionRole = parseSessionRoleFromCookieHeader(c.req.header('Cookie'));
            if (optSessionRole) {
              try {
                const activeRole = await resolveRequestedSessionRole(
                  c.env.DB,
                  Number(payload.sub),
                  Number(payload.empresa_id ?? 0),
                  optSessionRole,
                  effectiveRole,
                );
                if (activeRole) {
                  c.set('userRole', activeRole);
                }
              } catch (e) {
                console.warn(
                  '[OPTIONAL_AUTH] Falha ao validar perfil ativo da sessão:',
                  (e as Error).message,
                );
              }
            }
          }
        } catch (e) {
          console.warn('[OPTIONAL_AUTH] Token inválido:', (e as Error).message);
        }
      }
    }
    await next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}
