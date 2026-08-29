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
import {
  resolveOperationalAccess,
  type OperationalAccessResolution,
} from '../services/operational-domain-access';
import {
  isManagerRole,
  resolveEmployeeSectorAccess,
} from '../services/employee-sector-access';
import { resolveFrmsWorkforceProfile } from '../lib/frms/workforce-profile';
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

function getFuncionarioId(c: Context): number {
  return Number((c.get as (key: string) => unknown)('funcionarioId') || 0);
}

type FrmsEmployeeIdentity = {
  id: number;
  nome: string | null;
  cargo: string | null;
  funcao: string | null;
  setor_id: number | null;
};

type MaintenanceManagerScope = {
  allowed: boolean;
  setorIds: number[];
  source: 'operational_rbac' | 'legacy_manager_assignment' | 'denied';
};

async function resolveOwnFrmsEmployee(
  db: D1Database,
  empresaId: number,
  userId: number,
  funcionarioId: number,
): Promise<FrmsEmployeeIdentity | null> {
  if (funcionarioId > 0) {
    const explicit = await db
      .prepare(
        `SELECT id, nome, cargo, funcao, setor_id
           FROM funcionarios
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
            AND COALESCE(ativo, 1) = 1
          LIMIT 1`,
      )
      .bind(funcionarioId, empresaId)
      .first<FrmsEmployeeIdentity>();
    if (explicit?.id) return explicit;
  }

  if (userId <= 0) return null;
  return db
    .prepare(
      `SELECT f.id, f.nome, f.cargo, f.funcao, f.setor_id
         FROM usuarios u
         INNER JOIN funcionarios f
           ON f.id = u.funcionario_id
          AND f.empresa_id = ?
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
        WHERE u.id = ?
          AND (u.deleted_at IS NULL OR u.deleted_at = 0)
        LIMIT 1`,
    )
    .bind(empresaId, userId)
    .first<FrmsEmployeeIdentity>();
}

async function filterMaintenanceSetorIds(
  db: D1Database,
  empresaId: number,
  setorIds: number[],
): Promise<number[]> {
  const unique = [...new Set(setorIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return [];

  const placeholders = unique.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT id
         FROM setores
        WHERE empresa_id = ?
          AND id IN (${placeholders})
          AND ativo = 1
          AND deleted_at IS NULL
          AND UPPER(TRIM(COALESCE(dominio_codigo, ''))) = 'MANUTENCAO'
        ORDER BY id`,
    )
    .bind(empresaId, ...unique)
    .all<{ id: number }>();

  return (rows.results || [])
    .map((row) => Number(row.id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function resolveMaintenanceManagerScope(
  c: Context<{ Bindings: Env }>,
  access?: OperationalAccessResolution,
): Promise<MaintenanceManagerScope> {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const userRole = (c.get as (key: string) => unknown)('userRole');
  const resolvedAccess =
    access || (await resolveOperationalAccess({ db, empresaId, userId, userRole }));

  if (resolvedAccess.enabled) {
    if (!resolvedAccess.domains.includes('MANUTENCAO')) {
      return { allowed: false, setorIds: [], source: 'denied' };
    }
    const setorIds = await filterMaintenanceSetorIds(db, empresaId, resolvedAccess.setorIds);
    return {
      allowed: setorIds.length > 0,
      setorIds,
      source: setorIds.length > 0 ? 'operational_rbac' : 'denied',
    };
  }

  // Durante rollout de tenants antigos, role de administrador não concede a
  // visão de manutenção por si só. É necessária atribuição real como gestor
  // de um setor de MANUTENCAO, preservando a separação entre departamentos.
  if (!isManagerRole(userRole)) {
    return { allowed: false, setorIds: [], source: 'denied' };
  }

  const legacy = await resolveEmployeeSectorAccess(db, empresaId, userId, userRole, {
    funcionarioId: getFuncionarioId(c) || null,
  });
  if (legacy.mode !== 'restricted') {
    return { allowed: false, setorIds: [], source: 'denied' };
  }

  const setorIds = await filterMaintenanceSetorIds(db, empresaId, legacy.setorIds);
  return {
    allowed: setorIds.length > 0,
    setorIds,
    source: setorIds.length > 0 ? 'legacy_manager_assignment' : 'denied',
  };
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
  const funcionarioId = getFuncionarioId(c);
  const userRole = (c.get as (key: string) => unknown)('userRole');

  const access = await resolveOperationalAccess({ db, empresaId, userId, userRole });
  const [employee, maintenanceScope] = await Promise.all([
    resolveOwnFrmsEmployee(db, empresaId, userId, funcionarioId),
    resolveMaintenanceManagerScope(c, access),
  ]);
  const frmsProfile = resolveFrmsWorkforceProfile(employee?.cargo, employee?.funcao);

  return c.json({
    success: true,
    data: {
      administrative_role: userRole ?? null,
      enabled: access.enabled,
      domains: access.domains,
      setor_ids: access.setorIds,
      actions: access.actions,
      frms_profile: frmsProfile,
      employee: employee
        ? {
            id: employee.id,
            nome: employee.nome,
            cargo: employee.cargo,
            funcao: employee.funcao,
            setor_id: employee.setor_id,
          }
        : null,
      can_manage_maintenance: maintenanceScope.allowed,
      maintenance_setor_ids: maintenanceScope.setorIds,
    },
  });
});

/**
 * GET /api/me/operational-access/frms-maintenance-team?date=YYYY-MM-DD
 *
 * Painel FRMS exclusivamente da gestão de manutenção. O backend exige uma
 * atribuição real de gestor em setor de MANUTENCAO e devolve somente
 * Mecânicos/Inspetores daquele escopo, dentro do tenant ativo.
 */
router.get('/frms-maintenance-team', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const date = c.req.query('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  }

  const maintenanceScope = await resolveMaintenanceManagerScope(c);
  if (!maintenanceScope.allowed || maintenanceScope.setorIds.length === 0) {
    return c.json(
      {
        success: false,
        error: 'Acesso restrito à gestão de manutenção',
        code: 'FRMS_MAINTENANCE_MANAGER_REQUIRED',
      },
      403,
    );
  }

  const placeholders = maintenanceScope.setorIds.map(() => '?').join(', ');
  const rows = await db
    .prepare(
      `SELECT
          f.id AS funcionario_id,
          f.nome AS funcionario_nome,
          f.cargo,
          f.funcao,
          f.setor_id,
          s.nome AS setor_nome,
          ch.id AS checkin_id,
          ch.hora_checkin,
          ch.horas_sono,
          ch.qualidade_sono,
          ch.kss_score,
          ch.score_fadiga,
          ch.nivel_fadiga,
          ch.status_operacional,
          ch.computed_risk_level,
          ch.requires_operational_review,
          ra.id AS readiness_id,
          ra.classification AS readiness_classification,
          ra.baseline_sessions,
          ra.baseline_ready,
          ra.median_rt_delta_pct,
          ra.lapse_rate_delta,
          ra.created_at AS readiness_created_at
       FROM funcionarios f
       INNER JOIN setores s
         ON s.id = f.setor_id
        AND s.empresa_id = f.empresa_id
        AND s.deleted_at IS NULL
        AND s.ativo = 1
       LEFT JOIN frms_fadiga_checkin ch
         ON ch.empresa_id = f.empresa_id
        AND ch.funcionario_id = f.id
        AND ch.data_checkin = ?
        AND ch.deleted_at IS NULL
       LEFT JOIN frms_readiness_assessment ra
         ON ra.empresa_id = f.empresa_id
        AND ra.funcionario_id = f.id
        AND ra.reference_date = ?
        AND ra.deleted_at IS NULL
       WHERE f.empresa_id = ?
         AND f.setor_id IN (${placeholders})
         AND f.deleted_at IS NULL
         AND COALESCE(f.ativo, 1) = 1
         AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
       ORDER BY f.nome ASC`,
    )
    .bind(date, date, empresaId, ...maintenanceScope.setorIds)
    .all<Record<string, unknown>>();

  const items = (rows.results || []).filter(
    (row) => resolveFrmsWorkforceProfile(row.cargo, row.funcao) === 'maintenance',
  );

  return c.json({
    success: true,
    data: {
      date,
      items,
      meta: {
        scope: 'maintenance',
        setor_ids: maintenanceScope.setorIds,
        access_source: maintenanceScope.source,
      },
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
