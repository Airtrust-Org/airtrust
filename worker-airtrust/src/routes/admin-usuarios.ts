import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getTenantContext } from '../middleware/tenant';
import { badRequest, forbidden } from '../middleware/error-handler';
import { createLogger } from '../utils/logger';
import { hashPassword } from '../utils/security';
import { isPlatformAdminAccess, resolvePlatformAccessState } from '../lib/rbac/platform-access';
import { adminUsuariosRoutes as legacyAdminUsuariosRoutes } from './admin-usuarios-legacy';

export { buildInviteLink } from './admin-usuarios-legacy';

type AdminVars = {
  userId: number | string;
  userEmail: string;
  userRole: string;
  empresaId?: number | string;
};

type UserListRow = {
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

type PermissionInput = {
  permissao: string;
  tipo: 'GRANT' | 'DENY';
};

const protectedAdminUsuariosRoutes = new Hono<{
  Bindings: Env;
  Variables: AdminVars;
}>();

protectedAdminUsuariosRoutes.use('/*', auth());
protectedAdminUsuariosRoutes.use('/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Vary', 'Authorization');
});

function getCallerId(c: { get: (key: string) => unknown }): number {
  const raw = c.get('userId');
  const id = typeof raw === 'string' ? Number(raw) : Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw forbidden('Identidade administrativa inválida', 'INVALID_ADMIN_IDENTITY');
  }
  return id;
}

function getCallerRole(c: { get: (key: string) => unknown }): string {
  return String(c.get('userRole') || '').toUpperCase();
}

function requireAdminOrGestor(role: string, action: string): void {
  if (!['ADMINISTRADOR', 'ADMIN', 'GESTOR'].includes(role)) {
    throw forbidden(`Apenas ADMINISTRADOR ou GESTOR podem ${action}`, 'INSUFFICIENT_ROLE');
  }
}

function requireAdmin(role: string, action: string): void {
  if (!['ADMINISTRADOR', 'ADMIN'].includes(role)) {
    throw forbidden(`Apenas ADMINISTRADOR pode ${action}`, 'INSUFFICIENT_ROLE');
  }
}

async function hasPlatformAdminAccess(db: D1Database, callerId: number): Promise<boolean> {
  const state = await resolvePlatformAccessState(db, callerId);
  return isPlatformAdminAccess(state);
}

function parseTargetUserId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw badRequest('Usuário inválido', 'INVALID_USER_ID');
  }
  return id;
}

type TargetAccess = {
  id: number;
  perfil: string;
  membership_count: number;
  empresa_id: number;
  accessed_cross_tenant: boolean;
};

async function findTargetInTenant(
  db: D1Database,
  targetUserId: number,
  empresaId: number,
): Promise<Omit<TargetAccess, 'empresa_id' | 'accessed_cross_tenant'> | null> {
  return db
    .prepare(
      `SELECT
         u.id,
         COALESCE(ue.role, u.perfil) AS perfil,
         (SELECT COUNT(*) FROM usuarios_empresas all_ue WHERE all_ue.usuario_id = u.id)
           AS membership_count
       FROM usuarios u
       INNER JOIN usuarios_empresas ue
         ON ue.usuario_id = u.id AND ue.empresa_id = ?
       WHERE u.id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(empresaId, targetUserId)
    .first<Omit<TargetAccess, 'empresa_id' | 'accessed_cross_tenant'>>();
}

async function findTargetForPlatformAdmin(
  db: D1Database,
  targetUserId: number,
): Promise<Omit<TargetAccess, 'accessed_cross_tenant'> | null> {
  return db
    .prepare(
      `SELECT
         u.id,
         COALESCE(ue.role, u.perfil) AS perfil,
         ue.empresa_id,
         (SELECT COUNT(*) FROM usuarios_empresas all_ue WHERE all_ue.usuario_id = u.id)
           AS membership_count
       FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id
       WHERE u.id = ? AND u.deleted_at IS NULL
       ORDER BY ue.is_primary DESC, ue.empresa_id ASC
       LIMIT 1`,
    )
    .bind(targetUserId)
    .first<Omit<TargetAccess, 'accessed_cross_tenant'>>();
}

async function resolveTargetAccess(
  db: D1Database,
  callerId: number,
  targetUserId: number,
  empresaId: number,
): Promise<TargetAccess> {
  if (Number.isInteger(empresaId) && empresaId > 0) {
    const tenantTarget = await findTargetInTenant(db, targetUserId, empresaId);
    if (tenantTarget) {
      return {
        ...tenantTarget,
        empresa_id: empresaId,
        accessed_cross_tenant: false,
      };
    }
  }

  const platformAdmin = await hasPlatformAdminAccess(db, callerId);
  if (!platformAdmin) {
    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      throw forbidden('Contexto de empresa inválido', 'INVALID_TENANT_CONTEXT');
    }
    throw forbidden('Usuário não pertence à sua empresa', 'WRONG_TENANT');
  }

  const platformTarget = await findTargetForPlatformAdmin(db, targetUserId);
  if (!platformTarget) {
    throw forbidden('Usuário não possui vínculo empresarial ativo', 'WRONG_TENANT');
  }
  if (Number(platformTarget.membership_count) !== 1) {
    throw forbidden(
      'A empresa alvo deve ser explícita para identidade multiempresa',
      'AMBIGUOUS_TARGET_TENANT',
    );
  }

  return { ...platformTarget, accessed_cross_tenant: true };
}

function assertManagerMayManageTarget(callerRole: string, targetRole: string): void {
  if (
    ['ADMINISTRADOR', 'ADMIN'].includes(targetRole.toUpperCase()) &&
    !['ADMINISTRADOR', 'ADMIN'].includes(callerRole)
  ) {
    throw forbidden(
      'Apenas ADMINISTRADOR pode gerenciar outros administradores',
      'INSUFFICIENT_ROLE',
    );
  }
}

function normalizePermissions(input: PermissionInput[]): PermissionInput[] {
  const unique = new Map<string, PermissionInput>();
  for (const permission of input) {
    const permissao = String(permission?.permissao || '').trim();
    const tipo = String(permission?.tipo || '').toUpperCase();
    if (!permissao || (tipo !== 'GRANT' && tipo !== 'DENY')) continue;
    unique.set(permissao, { permissao, tipo: tipo as PermissionInput['tipo'] });
  }
  return [...unique.values()];
}

// GET /api/admin/usuarios
// ADMIN/ADMINISTRADOR is a tenant role. Only persisted platform access may list
// identities from every tenant.
protectedAdminUsuariosRoutes.get('/', async (c) => {
  const callerRole = getCallerRole(c);
  requireAdminOrGestor(callerRole, 'listar usuários');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const db = c.env.DB;
  const platformAdmin = await hasPlatformAdminAccess(db, callerId);

  if (platformAdmin) {
    const result = await db
      .prepare(
        `SELECT
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
              AND cu.used_at IS NULL AND datetime(cu.expires_at) > datetime('now'))
             AS convite_pendente
         FROM usuarios u
         INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id
         INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
         LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
         WHERE u.deleted_at IS NULL
         ORDER BY u.nome ASC`,
      )
      .all<UserListRow>();

    return c.json({ success: true, data: result.results || [] });
  }

  const result = await db
    .prepare(
      `SELECT
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
            AND cu.used_at IS NULL AND datetime(cu.expires_at) > datetime('now'))
           AS convite_pendente
       FROM usuarios u
       INNER JOIN usuarios_empresas ue ON ue.usuario_id = u.id AND ue.empresa_id = ?
       INNER JOIN empresas e ON e.id = ue.empresa_id AND e.deleted_at IS NULL
       LEFT JOIN funcionarios f ON f.id = u.funcionario_id AND f.deleted_at IS NULL
       WHERE u.deleted_at IS NULL
       ORDER BY u.nome ASC`,
    )
    .bind(empresaId, empresaId)
    .all<UserListRow>();

  return c.json({ success: true, data: result.results || [] });
});

// DELETE /api/admin/usuarios/:id
// The tenant administrator removes only the current company membership. The
// global identity is disabled only after its final membership is removed.
protectedAdminUsuariosRoutes.delete('/:id', async (c) => {
  const callerRole = getCallerRole(c);
  requireAdminOrGestor(callerRole, 'remover acesso de usuário');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const targetUserId = parseTargetUserId(c.req.param('id'));
  const db = c.env.DB;

  if (targetUserId === callerId) {
    throw badRequest('Você não pode remover sua própria conta', 'SELF_DEACTIVATION');
  }

  const target = await resolveTargetAccess(db, callerId, targetUserId, empresaId);
  const targetEmpresaId = target.empresa_id;
  assertManagerMayManageTarget(callerRole, target.perfil);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE convites_usuarios
         SET used_at = COALESCE(used_at, datetime('now'))
         WHERE usuario_id = ? AND empresa_id = ? AND used_at IS NULL`,
      )
      .bind(targetUserId, targetEmpresaId),
    db
      .prepare(
        `UPDATE setores_gestores
         SET ativo = 0, deleted_at = COALESCE(deleted_at, datetime('now'))
         WHERE usuario_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(targetUserId, targetEmpresaId),
    db
      .prepare(`DELETE FROM usuarios_empresas WHERE usuario_id = ? AND empresa_id = ?`)
      .bind(targetUserId, targetEmpresaId),
    db
      .prepare(
        `INSERT OR IGNORE INTO token_blocklist (jti, expires_at)
         SELECT access_token_jti, expires_at
         FROM refresh_tokens
         WHERE user_id = ?
           AND revoked_at IS NULL
           AND access_token_jti IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM usuarios_empresas WHERE usuario_id = ?
           )`,
      )
      .bind(targetUserId, targetUserId),
    db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, datetime('now'))
         WHERE user_id = ?
           AND revoked_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM usuarios_empresas WHERE usuario_id = ?
           )`,
      )
      .bind(targetUserId, targetUserId),
    db
      .prepare(
        `UPDATE usuarios
         SET active = 0,
             deleted_at = COALESCE(deleted_at, datetime('now')),
             updated_at = datetime('now')
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM usuarios_empresas WHERE usuario_id = ?
           )`,
      )
      .bind(targetUserId, targetUserId),
    db
      .prepare(
        `INSERT INTO audit_logs
           (empresa_id, usuario_id, acao, tabela, registro_id, detalhes, created_at)
         SELECT ?, ?, 'ADMIN_REMOVE_TENANT_ACCESS', 'usuarios_empresas', ?,
                json_object(
                  'target_user_id', ?,
                  'identity_deactivated',
                  CASE WHEN NOT EXISTS (
                    SELECT 1 FROM usuarios_empresas WHERE usuario_id = ?
                  ) THEN 1 ELSE 0 END
                ),
                datetime('now')`,
      )
      .bind(targetEmpresaId, callerId, targetUserId, targetUserId, targetUserId),
    db
      .prepare(
        `SELECT CASE WHEN NOT EXISTS (
           SELECT 1 FROM usuarios_empresas WHERE usuario_id = ?
         ) THEN 1 ELSE 0 END AS identity_deactivated`,
      )
      .bind(targetUserId),
  ];

  // D1 executes batch statements sequentially in one transaction. The final
  // membership decision therefore observes the DELETE above, not a stale count
  // read before a concurrent request enters its own transaction.
  const batchResults = await db.batch(statements);
  const deactivationRow = batchResults.at(-1)?.results?.[0];
  const identityDeactivated =
    typeof deactivationRow === 'object' &&
    deactivationRow !== null &&
    'identity_deactivated' in deactivationRow &&
    Number(deactivationRow.identity_deactivated) === 1;

  return c.json({
    success: true,
    message: identityDeactivated
      ? 'Último acesso empresarial removido; identidade desativada'
      : 'Acesso do usuário à empresa removido',
    data: { identity_deactivated: identityDeactivated },
  });
});

// GET /api/admin/usuarios/:id/permissoes
// usuario_permissoes is currently identity-wide. Tenant administrators may
// inspect it only for identities linked to a single tenant.
protectedAdminUsuariosRoutes.get('/:id/permissoes', async (c) => {
  const callerRole = getCallerRole(c);
  requireAdminOrGestor(callerRole, 'ver permissões');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const targetUserId = parseTargetUserId(c.req.param('id'));
  const db = c.env.DB;
  const target = await resolveTargetAccess(db, callerId, targetUserId, empresaId);

  const platformAdmin =
    target.accessed_cross_tenant || (await hasPlatformAdminAccess(db, callerId));
  if (Number(target.membership_count) > 1 && !platformAdmin) {
    throw forbidden(
      'Permissões globais de usuário multiempresa exigem administrador de plataforma',
      'MULTI_TENANT_PERMISSIONS_REQUIRE_PLATFORM_ADMIN',
    );
  }

  const permissions = await db
    .prepare(
      `SELECT permissao, tipo, created_at
       FROM usuario_permissoes
       WHERE usuario_id = ?
       ORDER BY permissao`,
    )
    .bind(targetUserId)
    .all<{ permissao: string; tipo: string; created_at: string }>();

  return c.json({ success: true, data: permissions.results || [] });
});

// PUT /api/admin/usuarios/:id/permissoes
// Replacement is atomic. Until permissions become tenant-scoped in schema,
// tenant administrators cannot alter a multi-company identity.
protectedAdminUsuariosRoutes.put('/:id/permissoes', async (c) => {
  const callerRole = getCallerRole(c);
  requireAdminOrGestor(callerRole, 'atualizar permissões');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const targetUserId = parseTargetUserId(c.req.param('id'));
  const db = c.env.DB;
  const body = await c.req.json<{ permissoes?: PermissionInput[] }>();
  const target = await resolveTargetAccess(db, callerId, targetUserId, empresaId);
  assertManagerMayManageTarget(callerRole, target.perfil);

  const platformAdmin =
    target.accessed_cross_tenant || (await hasPlatformAdminAccess(db, callerId));
  if (Number(target.membership_count) > 1 && !platformAdmin) {
    throw forbidden(
      'Permissões globais de usuário multiempresa exigem administrador de plataforma',
      'MULTI_TENANT_PERMISSIONS_REQUIRE_PLATFORM_ADMIN',
    );
  }

  const permissions = normalizePermissions(body?.permissoes || []);
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM usuario_permissoes WHERE usuario_id = ?`).bind(targetUserId),
    ...permissions.map((permission) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO usuario_permissoes
             (usuario_id, permissao, tipo, created_by)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(targetUserId, permission.permissao, permission.tipo, callerId),
    ),
    db
      .prepare(
        `INSERT INTO audit_logs
           (empresa_id, usuario_id, acao, tabela, registro_id, detalhes, created_at)
         VALUES (?, ?, 'ADMIN_REPLACE_USER_PERMISSIONS', 'usuario_permissoes', ?, ?, datetime('now'))`,
      )
      .bind(
        target.empresa_id,
        callerId,
        targetUserId,
        JSON.stringify({ target_user_id: targetUserId, permission_count: permissions.length }),
      ),
  ];

  await db.batch(statements);
  return c.json({ success: true, message: 'Permissões atualizadas' });
});

// PATCH /api/admin/usuarios/:id/reset-senha
// Password, session revocation and audit are one fail-closed D1 batch.
protectedAdminUsuariosRoutes.patch('/:id/reset-senha', async (c) => {
  const callerRole = getCallerRole(c);
  requireAdmin(callerRole, 'redefinir senha de usuário');
  const callerId = getCallerId(c);
  const { empresaId } = getTenantContext(c);
  const targetUserId = parseTargetUserId(c.req.param('id'));
  const db = c.env.DB;
  const logger = createLogger(c, 'AdminUsuarios.resetSenha');
  const body = await c.req.json<{ nova_senha?: string }>();
  const novaSenha = String(body?.nova_senha || '').trim();

  if (novaSenha.length < 8) {
    throw badRequest('A nova senha deve ter no mínimo 8 caracteres', 'PASSWORD_TOO_SHORT');
  }

  const target = await findTargetInTenant(db, targetUserId, empresaId);
  if (!target) {
    throw forbidden('Usuário não pertence à sua empresa', 'WRONG_TENANT');
  }

  const novoHash = await hashPassword(novaSenha);
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO token_blocklist (jti, expires_at)
         SELECT access_token_jti, expires_at
         FROM refresh_tokens
         WHERE user_id = ? AND revoked_at IS NULL AND access_token_jti IS NOT NULL`,
      )
      .bind(targetUserId),
    db
      .prepare(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, datetime('now'))
         WHERE user_id = ? AND revoked_at IS NULL`,
      )
      .bind(targetUserId),
    db
      .prepare(
        `UPDATE usuarios
         SET password_hash = ?,
             failed_login_attempts = 0,
             locked_until = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(novoHash, targetUserId),
    db
      .prepare(
        `INSERT INTO audit_logs
           (empresa_id, usuario_id, acao, tabela, registro_id, detalhes, created_at)
         VALUES (?, ?, 'ADMIN_RESET_SENHA', 'usuarios', ?, ?, datetime('now'))`,
      )
      .bind(
        empresaId,
        callerId,
        targetUserId,
        JSON.stringify({ target_user_id: targetUserId, sessions_revoked: true }),
      ),
  ]);

  logger.info(`Admin id=${callerId} redefiniu senha do usuário id=${targetUserId}`);
  return c.json({ success: true, message: 'Senha redefinida com sucesso' });
});

const adminUsuariosRoutes = new Hono<{ Bindings: Env; Variables: AdminVars }>();

// Register security overrides first. A completed override handler does not call
// next(), so the legacy implementation is never reached for these exact paths.
adminUsuariosRoutes.route('/', protectedAdminUsuariosRoutes);
adminUsuariosRoutes.route('/', legacyAdminUsuariosRoutes);

export { adminUsuariosRoutes };
