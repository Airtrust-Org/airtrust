import { normalizeAirtrustRole } from '../utils/role-resolution';

/**
 * Nome do cookie same-site que carrega o perfil ativo escolhido para a sessão.
 * A escolha é sempre revalidada no backend a cada request; o cookie é apenas
 * o transporte da preferência, nunca uma credencial de elevação.
 */
export const SESSION_ROLE_COOKIE = 'airtrust_session_role';

/**
 * Extrai o perfil de sessão selecionado a partir do header Cookie bruto.
 * Retorna null quando não há seleção — nesse caso o middleware de auth deve
 * usar a role canônica sem nenhuma consulta adicional.
 */
export function parseSessionRoleFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${SESSION_ROLE_COOKIE}=([^;]*)`),
  );
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export type SessionRole = 'ADMINISTRADOR' | 'GESTOR' | 'INSTRUTOR' | 'ALUNO' | 'USUARIO';

const ROLE_ORDER: SessionRole[] = ['ADMINISTRADOR', 'GESTOR', 'INSTRUTOR', 'ALUNO', 'USUARIO'];

export function normalizeSessionRole(value: unknown): SessionRole {
  const normalized = normalizeAirtrustRole(value);
  if (normalized === 'COMPLIANCE') return 'GESTOR';
  if (normalized === 'EDITOR') return 'USUARIO';
  if (normalized === 'ADMIN' || normalized === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (normalized === 'MANAGER' || normalized === 'GESTOR') return 'GESTOR';
  if (normalized === 'INSTRUCTOR' || normalized === 'INSTRUTOR') return 'INSTRUTOR';
  if (normalized === 'STUDENT' || normalized === 'ALUNO') return 'ALUNO';
  return 'USUARIO';
}

async function hasActiveInstructorLink(
  db: D1Database,
  funcionarioId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found
         FROM instrutores_simulador
        WHERE CAST(funcionario_id AS INTEGER) = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(funcionarioId)
    .first<{ found: number }>();
  return Boolean(row?.found);
}

async function hasLmsStudentLink(
  db: D1Database,
  funcionarioId: number,
  empresaId: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS found
         FROM lms_matriculas
        WHERE funcionario_id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ found: number }>();
  return Boolean(row?.found);
}

/**
 * Resolve os perfis que o usuário pode assumir na sessão atual.
 *
 * A role administrativa do tenant continua vindo de usuarios_empresas.role.
 * Perfis operacionais adicionais são derivados de vínculos reais do funcionário:
 * - INSTRUTOR: cadastro ativo em instrutores_simulador;
 * - ALUNO: matrícula LMS ativa/não removida no tenant.
 *
 * Nenhum perfil é criado por simples pedido do cliente; o backend sempre valida
 * a evidência no D1 antes de permitir a troca de role no JWT.
 */
export async function resolveAvailableSessionRoles(
  db: D1Database,
  userId: number,
  empresaId: number,
  fallbackRole?: unknown,
): Promise<SessionRole[]> {
  const row = await db
    .prepare(
      `SELECT u.perfil,
              u.funcionario_id,
              ue.role AS empresa_role,
              f.empresa_id AS funcionario_empresa_id
         FROM usuarios u
         LEFT JOIN usuarios_empresas ue
           ON ue.usuario_id = u.id
          AND ue.empresa_id = ?
         LEFT JOIN funcionarios f
           ON f.id = u.funcionario_id
          AND f.deleted_at IS NULL
        WHERE u.id = ?
          AND u.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, userId)
    .first<{
      perfil: string | null;
      funcionario_id: number | null;
      empresa_role: string | null;
      funcionario_empresa_id: number | null;
    }>();

  if (!row) return [];

  // Query explicit profiles
  let explicitProfiles: { perfil: string; ativo: number }[] = [];
  try {
    const { results } = await db
      .prepare(
        `SELECT perfil, ativo 
           FROM usuarios_empresas_perfis 
          WHERE usuario_id = ? 
            AND empresa_id = ?`
      )
      .bind(userId, empresaId)
      .all<{ perfil: string; ativo: number }>();
    explicitProfiles = results || [];
  } catch (err: any) {
    // If the table doesn't exist (e.g. tests without migration), we allow fallback,
    // otherwise this is a critical infra error and we must fail-closed.
    if (err.message && err.message.includes('no such table')) {
      explicitProfiles = [];
    } else {
      throw err;
    }
  }

  const roles = new Set<SessionRole>();

  if (explicitProfiles.length > 0) {
    // AUTHORITATIVE EXPLICIT PROFILES
    for (const p of explicitProfiles) {
      if (p.ativo === 1 && p.perfil) {
        roles.add(normalizeSessionRole(p.perfil));
      }
    }
  } else {
    // LEGACY INFERENCE FALLBACK
    roles.add(normalizeSessionRole(row.empresa_role || row.perfil || fallbackRole));

    const funcionarioId = Number(row.funcionario_id || 0);
    const funcionarioEmpresaId = Number(row.funcionario_empresa_id || 0);
    const funcionarioNoTenant =
      Number.isFinite(funcionarioId) &&
      funcionarioId > 0 &&
      Number.isFinite(funcionarioEmpresaId) &&
      funcionarioEmpresaId === empresaId;

    if (funcionarioNoTenant) {
      if (await hasActiveInstructorLink(db, funcionarioId)) {
        roles.add('INSTRUTOR');
      }
      if (await hasLmsStudentLink(db, funcionarioId, empresaId)) {
        roles.add('ALUNO');
      }
    }
  }

  return ROLE_ORDER.filter((role) => roles.has(role));
}

export async function resolveRequestedSessionRole(
  db: D1Database,
  userId: number,
  empresaId: number,
  requestedRole: unknown,
  fallbackRole?: unknown,
): Promise<SessionRole | null> {
  const requested = normalizeSessionRole(requestedRole);
  const available = await resolveAvailableSessionRoles(db, userId, empresaId, fallbackRole);
  return available.includes(requested) ? requested : null;
}
