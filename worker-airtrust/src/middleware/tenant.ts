/**
 * TENANT MIDDLEWARE - Multi-Tenant Isolation
 *
 * Middleware obrigatório para isolamento de dados por empresa.
 * Injeta empresa_id em todas as queries automaticamente.
 *
 * @module middleware/tenant
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env, Variables } from '../types';
import { AppError } from '../utils/errors';
import { hasUsuariosEmpresasTable } from '../utils/db-schema';

function isDevAuthBypassEnabled(env: Env): boolean {
  return env.ENVIRONMENT === 'development' && env.ENABLE_DEV_AUTH_BYPASS === 'true';
}

// ============================================
// TIPOS E INTERFACES
// ============================================

export interface TenantContext {
  empresaId: number;
  empresaCodigo: string;
  empresaNome: string;
  role: 'admin' | 'manager' | 'editor' | 'viewer' | 'instructor' | 'student';
  plano: string;
  permissions: string[];
}

// Roles hierarchy para verificação de permissões
const ROLE_HIERARCHY = {
  admin: 100,
  manager: 80,
  instructor: 60,
  editor: 50,
  student: 20,
  viewer: 10,
} as const;

function normalizeTenantRole(role: unknown): TenantContext['role'] {
  switch (
    String(role || '')
      .trim()
      .toLowerCase()
  ) {
    case 'admin':
    case 'administrador':
      return 'admin';
    case 'manager':
    case 'gestor':
    case 'compliance':
      return 'manager';
    case 'editor':
      return 'editor';
    case 'instructor':
      return 'instructor';
    case 'student':
    case 'usuario':
      return 'student';
    case 'viewer':
      return 'viewer';
    default:
      return 'viewer';
  }
}

// ============================================
// MIDDLEWARE PRINCIPAL
// ============================================

/**
 * Middleware de tenant - extrai empresa_id do JWT e injeta no contexto
 *
 * @example
 * ```typescript
 * app.use('/api/*', tenantMiddleware());
 *
 * // Nas rotas:
 * const { empresaId } = getTenantContext(c);
 * db.prepare('SELECT * FROM funcionarios WHERE empresa_id = ?').bind(empresaId);
 * ```
 */
export function tenantMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    const devBypass = isDevAuthBypassEnabled(c.env);

    if (devBypass) {
      const userIdRaw = c.get('userId');
      const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

      const db = c.env.DB;
      const useUsuariosEmpresas = await hasUsuariosEmpresasTable(db);
      const fallbackTenant = useUsuariosEmpresas
        ? await db
            .prepare(
              `
              SELECT
                e.id as empresa_id,
                e.codigo,
                e.nome,
                e.plano,
                ue.role
              FROM empresas e
              JOIN usuarios_empresas ue ON ue.empresa_id = e.id
              WHERE ue.usuario_id = ?
                AND e.ativo = 1
                AND e.deleted_at IS NULL
              ORDER BY
                CASE WHEN ue.is_primary = 1 THEN 0 ELSE 1 END,
                ue.empresa_id ASC
              LIMIT 1
            `,
            )
            .bind(Number.isFinite(userId) ? userId : 1)
            .first<{
              empresa_id: number;
              codigo: string;
              nome: string;
              plano: string;
              role: string;
            }>()
        : await db
            .prepare(
              `
              SELECT
                e.id as empresa_id,
                e.codigo,
                e.nome,
                e.plano,
                'admin' as role
              FROM empresas e
              WHERE e.ativo = 1
                AND e.deleted_at IS NULL
              ORDER BY
                CASE
                  WHEN e.codigo = 'airtrust' THEN 0
                  ELSE 1
                END,
                e.id ASC
              LIMIT 1
            `,
            )
            .first<{
              empresa_id: number;
              codigo: string;
              nome: string;
              plano: string;
              role: string;
            }>();

      if (!fallbackTenant) {
        throw new AppError(
          'DEV_AUTH_BYPASS ativo, mas usuário sem vínculo ativo com empresa',
          403,
          'TENANT_ACCESS_DENIED',
        );
      }

      console.log(
        `[TENANT] 🔓 BYPASS: empresa_id=${fallbackTenant.empresa_id} (${fallbackTenant.codigo})`,
      );

      c.set('tenantContext', {
        empresaId: fallbackTenant.empresa_id,
        empresaCodigo: fallbackTenant.codigo,
        empresaNome: fallbackTenant.nome,
        role: normalizeTenantRole(fallbackTenant.role),
        plano: fallbackTenant.plano,
        permissions: buildPermissions(normalizeTenantRole(fallbackTenant.role)),
      } as TenantContext);

      return next();
    }

    // ========================================================================
    // PRODUÇÃO: Extrair empresa do JWT
    // ========================================================================

    const userId = c.get('userId');
    const empresaIdFromJwt = c.get('empresaId');
    const userRoleFromJwt = c.get('userRole');

    if (!empresaIdFromJwt) {
      throw new AppError('Empresa não identificada no token', 401, 'TENANT_REQUIRED');
    }

    // Buscar dados da empresa e permissões do usuário
    const db = c.env.DB;
    const useUsuariosEmpresas = await hasUsuariosEmpresasTable(db);

    const result = useUsuariosEmpresas
      ? await db
          .prepare(
            `
          SELECT 
            e.id as empresa_id,
            e.codigo,
            e.nome,
            e.plano,
            e.ativo,
            ue.role
          FROM empresas e
          JOIN usuarios_empresas ue ON ue.empresa_id = e.id
          WHERE e.id = ? AND ue.usuario_id = ? AND e.ativo = 1 AND e.deleted_at IS NULL
        `,
          )
          .bind(empresaIdFromJwt, userId)
          .first<{
            empresa_id: number;
            codigo: string;
            nome: string;
            plano: string;
            ativo: number;
            role: string;
          }>()
      : await db
          .prepare(
            `
          SELECT
            e.id as empresa_id,
            e.codigo,
            e.nome,
            e.plano,
            e.ativo,
            ? as role
          FROM empresas e
          WHERE e.id = ? AND e.ativo = 1 AND e.deleted_at IS NULL
        `,
          )
          .bind(normalizeTenantRole(userRoleFromJwt), empresaIdFromJwt)
          .first<{
            empresa_id: number;
            codigo: string;
            nome: string;
            plano: string;
            ativo: number;
            role: string;
          }>();

    if (!result) {
      const userIdNumber = typeof userId === 'string' ? Number(userId) : Number(userId || 0);

      if (userIdNumber === 1) {
        const platformFallbackAtivo = await db
          .prepare(
            `
              SELECT
                e.id as empresa_id,
                e.codigo,
                e.nome,
                e.plano,
                e.ativo,
                'admin' as role
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
          .first<{
            empresa_id: number;
            codigo: string;
            nome: string;
            plano: string;
            ativo: number;
            role: string;
          }>();

        const platformFallback =
          platformFallbackAtivo ||
          (await db
            .prepare(
              `
                SELECT
                  e.id as empresa_id,
                  e.codigo,
                  e.nome,
                  e.plano,
                  e.ativo,
                  'admin' as role
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
            .first<{
              empresa_id: number;
              codigo: string;
              nome: string;
              plano: string;
              ativo: number;
              role: string;
            }>());

        if (platformFallback) {
          const tenantContext: TenantContext = {
            empresaId: platformFallback.empresa_id,
            empresaCodigo: platformFallback.codigo,
            empresaNome: platformFallback.nome,
            role: 'admin',
            plano: platformFallback.plano,
            permissions: buildPermissions('admin'),
          };

          c.set('tenantContext', tenantContext);
          console.log(
            `[TENANT] platform fallback empresa=${platformFallback.codigo} user=${userIdNumber}`,
          );

          return next();
        }
      }

      throw new AppError(
        'Acesso negado: usuário não pertence a esta empresa ou empresa inativa',
        403,
        'TENANT_ACCESS_DENIED',
      );
    }

    // Construir contexto do tenant
    const tenantContext: TenantContext = {
      empresaId: result.empresa_id,
      empresaCodigo: result.codigo,
      empresaNome: result.nome,
      role: normalizeTenantRole(result.role),
      plano: result.plano,
      permissions: buildPermissions(normalizeTenantRole(result.role)),
    };

    c.set('tenantContext', tenantContext);

    // Log para auditoria (resumido)
    console.log(`[TENANT] empresa=${result.codigo} user=${userId} role=${result.role}`);

    return next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

// ============================================
// HELPERS
// ============================================

/**
 * Extrai contexto do tenant do contexto da requisição
 * @throws AppError se tenant não estiver configurado
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTenantContext(c: Context<any>): TenantContext {
  const ctx = c.get('tenantContext') as TenantContext | undefined;

  if (!ctx) {
    throw new AppError('Contexto de tenant não encontrado', 500, 'TENANT_NOT_CONFIGURED');
  }

  return ctx;
}

/**
 * Extrai apenas o empresa_id (atalho comum)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEmpresaId(c: Context<any>): number {
  return getTenantContext(c).empresaId;
}

/**
 * Verifica se usuário tem permissão mínima
 * @example checkPermission(c, 'editor') // true se editor, manager ou admin
 */
export function checkPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: Context<any>,
  minimumRole: keyof typeof ROLE_HIERARCHY,
): boolean {
  const ctx = getTenantContext(c);
  return ROLE_HIERARCHY[ctx.role] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Middleware que exige role mínimo
 * @example app.delete('/item/:id', requireTenantRole('manager'), handler);
 */
export function requireTenantRole(
  minimumRole: keyof typeof ROLE_HIERARCHY,
): MiddlewareHandler<{ Bindings: Env }> {
  const handler: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
    if (!checkPermission(c, minimumRole)) {
      throw new AppError(
        `Permissão insuficiente. Requer: ${minimumRole}`,
        403,
        'INSUFFICIENT_PERMISSIONS',
      );
    }
    return next();
  };
  return handler as unknown as MiddlewareHandler<{ Bindings: Env }>;
}

/**
 * Constrói lista de permissões baseado no role
 */
function buildPermissions(role: string): string[] {
  const basePermissions = ['read'];

  switch (role) {
    case 'admin':
      return ['*']; // Todas as permissões
    case 'manager':
      return [...basePermissions, 'write', 'delete', 'export', 'reports', 'manage_users'];
    case 'instructor':
      return [...basePermissions, 'simulator_write', 'sign_sheets', 'view_students'];
    case 'editor':
      return [...basePermissions, 'write'];
    case 'student':
      return [...basePermissions, 'sign_self_sheets', 'view_self'];
    case 'viewer':
    default:
      return basePermissions;
  }
}

// ============================================
// SQL HELPERS - Para usar nos services
// ============================================

/**
 * Adiciona filtro de empresa a uma query SQL
 * @example
 * const sql = withTenantFilter('SELECT * FROM funcionarios', empresaId);
 * // "SELECT * FROM funcionarios WHERE empresa_id = 1"
 */
export function withTenantFilter(baseSql: string, empresaId: number, alias?: string): string {
  const col = alias ? `${alias}.empresa_id` : 'empresa_id';

  // Usa placeholder ? — o caller DEVE adicionar empresaId como bind parameter
  // Verifica se já tem WHERE
  if (baseSql.toUpperCase().includes('WHERE')) {
    return `${baseSql} AND ${col} = ?`;
  }

  return `${baseSql} WHERE ${col} = ?`;
}

/**
 * Cria objeto com empresa_id para INSERT
 * @example
 * const data = withEmpresaId({ nome: 'João' }, empresaId);
 * // { nome: 'João', empresa_id: 1 }
 */
export function withEmpresaId<T extends Record<string, unknown>>(
  data: T,
  empresaId: number,
): T & { empresa_id: number } {
  return { ...data, empresa_id: empresaId };
}

/**
 * Verifica se registro pertence à empresa (para updates/deletes)
 * @returns true se pertence, false se não
 */
export async function verifyRecordOwnership(
  db: D1Database,
  table: string,
  recordId: number,
  empresaId: number,
): Promise<boolean> {
  // Whitelist de tabelas permitidas para prevenir SQL injection
  const ALLOWED_TABLES = [
    'funcionarios',
    'qualificacoes_historico',
    'qualificacoes_tipos',
    'simulador_sessoes',
    'fichas_sessao',
    'simulador_agendamentos',
    'documentos',
    'pasta_virtual',
    'licencas',
    'habilitacoes',
    'aeronaves',
    'modelos_aeronave',
    'categorias',
    'funcoes',
    'setores',
    'frms_jornada',
    'frms_escala',
    'frms_alerta',
    'empresas',
    'certificados',
    'arquivos',
    'manobras',
    'modelos_sessao',
  ];
  if (!ALLOWED_TABLES.includes(table)) {
    throw new AppError(
      `Tabela '${table}' não é permitida para verificação de ownership`,
      400,
      'INVALID_TABLE',
    );
  }
  const result = await db
    .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND empresa_id = ?`)
    .bind(recordId, empresaId)
    .first();

  return !!result;
}
