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
import { unauthorized } from './error-handler';

const USUARIOS_TABLE_SQL =
  "SELECT 1 as found FROM sqlite_master WHERE type = 'table' AND name = 'usuarios' LIMIT 1";

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

async function hasTable(db: D1Database, sql: string): Promise<boolean> {
  const result = await db.prepare(sql).first<{ found: number }>();
  return Boolean(result?.found);
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

    if (payload.token_type && payload.token_type !== 'access') {
      return unauthorized('Tipo de token inválido para esta rota', 'INVALID_TOKEN_TYPE');
    }

    // Verificar se o JTI está na blocklist (token invalidado via logout)
    if (payload.jti) {
      try {
        const blocked = await c.env.DB.prepare(
          `SELECT 1 FROM token_blocklist WHERE jti = ? AND expires_at > datetime('now') LIMIT 1`,
        )
          .bind(payload.jti)
          .first();
        if (blocked) {
          return unauthorized('Token revogado. Faça login novamente.', 'TOKEN_REVOKED');
        }
      } catch {
        // Se a tabela não existir ainda (migration pendente), não bloquear
      }
    }

    c.set('userId', payload.sub);
    c.set('empresaId', payload.empresa_id ?? 0);
    c.set('userEmail', payload.email);
    c.set('userRole', payload.role ?? '');
    c.set('funcionarioId', payload.funcionario_id ?? null);

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
            if (payload.jti) {
              try {
                const blocked = await c.env.DB.prepare(
                  `SELECT 1 FROM token_blocklist WHERE jti = ? AND expires_at > datetime('now') LIMIT 1`,
                )
                  .bind(payload.jti)
                  .first();
                if (blocked) {
                  await next();
                  return;
                }
              } catch {
                // Se a tabela não existir ainda (migration pendente), mantém comportamento tolerante.
              }
            }

            c.set('userId', payload.sub);
            c.set('empresaId', payload.empresa_id ?? 0);
            c.set('userEmail', payload.email);
            c.set('userRole', payload.role ?? '');
            c.set('funcionarioId', payload.funcionario_id ?? null);
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

/**
 * Role-based middleware - verifica se usuário tem role específico
 * @example
 * app.post('/admin', auth(), requireRole('admin'), handler);
 */
export function requireRole(requiredRole: string): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (c.env.ENVIRONMENT !== 'development' && c.env.ENABLE_DEV_AUTH_BYPASS === 'true') {
      throw new Error('ENABLE_DEV_AUTH_BYPASS nao pode ser usado fora de development');
    }

    const devBypass = isDevAuthBypassEnabled(c.env);

    if (devBypass) {
      return next();
    }

    const userRole = c.get('userRole');

    if (!userRole) {
      return unauthorized('Usuário não autenticado');
    }

    if (userRole !== requiredRole && userRole !== 'ADMIN') {
      return unauthorized(`Acesso negado. Requer role: ${requiredRole}`);
    }

    await next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}
