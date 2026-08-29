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
import { assessMaintenanceFatigue } from '../lib/frms/maintenance-fatigue';
import {
  SESSION_ROLE_COOKIE,
  normalizeSessionRole,
  resolveAvailableSessionRoles,
  resolveRequestedSessionRole,
} from '../services/auth-session-roles';
import { generateJWT } from '../utils/security';
import { registrarAuditoria } from '../utils/auditoria';

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

function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isClockTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
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

type MaintenanceCheckinInput = {
  reference_date?: string;
  wake_time?: string;
  sleep_hours_24h?: number;
  sleep_quality?: number;
  kss_score?: number;
  fit_for_duty?: boolean;
  notes?: string;
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
            AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
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
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
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

router.get('/frms-maintenance-team', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const date = c.req.query('date') || new Date().toISOString().slice(0, 10);
  if (!isIsoDate(date)) {
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

router.post('/frms-maintenance-checkin', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const employee = await resolveOwnFrmsEmployee(db, empresaId, userId, getFuncionarioId(c));

  if (!employee) {
    return c.json({ success: false, error: 'Funcionário não encontrado', code: 'EMPLOYEE_NOT_FOUND' }, 404);
  }
  if (resolveFrmsWorkforceProfile(employee.cargo, employee.funcao) !== 'maintenance') {
    return c.json(
      {
        success: false,
        error: 'Check-in disponível apenas para Mecânico/Inspetor',
        code: 'FRMS_MAINTENANCE_CARGO_REQUIRED',
      },
      403,
    );
  }

  const body = await c.req.json<MaintenanceCheckinInput>().catch(() => null);
  if (!body) return c.json({ success: false, error: 'invalid_json' }, 400);

  const referenceDate = body.reference_date || new Date().toISOString().slice(0, 10);
  const wakeTime = body.wake_time;
  const sleepHours24h = Number(body.sleep_hours_24h);
  const sleepQuality = Number(body.sleep_quality);
  const kssScore = Number(body.kss_score);
  const fitForDuty = body.fit_for_duty;
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';

  if (!isIsoDate(referenceDate)) return c.json({ success: false, error: 'invalid_reference_date' }, 400);
  if (!isClockTime(wakeTime)) return c.json({ success: false, error: 'invalid_wake_time' }, 400);
  if (!Number.isFinite(sleepHours24h) || sleepHours24h < 0 || sleepHours24h > 24) {
    return c.json({ success: false, error: 'invalid_sleep_hours_24h' }, 400);
  }
  if (!Number.isInteger(sleepQuality) || sleepQuality < 1 || sleepQuality > 5) {
    return c.json({ success: false, error: 'invalid_sleep_quality' }, 400);
  }
  if (!Number.isInteger(kssScore) || kssScore < 1 || kssScore > 9) {
    return c.json({ success: false, error: 'invalid_kss_score' }, 400);
  }
  if (typeof fitForDuty !== 'boolean') return c.json({ success: false, error: 'fit_for_duty_required' }, 400);
  if (!fitForDuty && notes.length === 0) {
    return c.json({ success: false, error: 'notes_required_for_review' }, 400);
  }

  const assessment = assessMaintenanceFatigue({ sleepHours24h, sleepQuality, kssScore, fitForDuty });
  const now = nowSql();
  const existing = await db
    .prepare(
      `SELECT id FROM frms_fadiga_checkin
        WHERE empresa_id = ? AND funcionario_id = ? AND data_checkin = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(empresaId, employee.id, referenceDate)
    .first<{ id: string }>();
  const checkinId = existing?.id || crypto.randomUUID();
  const hour = now.slice(11, 16);
  const fitValue = fitForDuty ? 1 : 0;
  const subjectiveFatigueLevel = kssScore >= 8 ? 10 : kssScore >= 7 ? 8 : kssScore >= 5 ? 5 : kssScore >= 3 ? 3 : 1;

  if (existing?.id) {
    await db
      .prepare(
        `UPDATE frms_fadiga_checkin
            SET hora_checkin = ?, kss_score = ?, horas_sono = ?, qualidade_sono = ?, observacoes = ?,
                score_fadiga = ?, nivel_fadiga = ?, status_operacional = ?, recomendacao = ?, apto = ?,
                requires_frat_review = 0, frat_sugerido_nivel = NULL,
                jornada_inicio_prevista = NULL, jornada_fim_prevista = NULL, horas_acordado = NULL,
                meds_ult_12h = 0, alcool_ult_12h = 0, risco_autoavaliado = ?, horas_sono_48h = NULL,
                wake_time = ?, subjective_fatigue_level = ?, sleepiness_level = ?, fit_for_duty = ?,
                computed_risk_level = ?, requires_operational_review = ?, report_source = 'MAINTENANCE_REPORTED',
                regulatory_profile_id = NULL, profile_code = NULL, config_revision_id = NULL,
                model_version = ?, submitted_at = ?, origem_registro = 'MANUTENCAO', updated_at = ?
          WHERE id = ? AND empresa_id = ? AND funcionario_id = ?`,
      )
      .bind(
        hour, kssScore, sleepHours24h, sleepQuality, notes || null,
        assessment.score, assessment.fatigueLevel, assessment.operationalStatus, assessment.recommendation, fitValue,
        subjectiveFatigueLevel, wakeTime, subjectiveFatigueLevel, subjectiveFatigueLevel, fitValue,
        assessment.riskLevel, assessment.requiresOperationalReview, assessment.scoringVersion, now, now,
        checkinId, empresaId, employee.id,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO frms_fadiga_checkin (
           id, empresa_id, funcionario_id, data_checkin, hora_checkin,
           kss_score, horas_sono, qualidade_sono, sintomas_json, observacoes,
           score_fadiga, nivel_fadiga, status_operacional, recomendacao,
           apto, requires_frat_review, frat_sugerido_nivel, associado_frat_avaliacao_id,
           jornada_inicio_prevista, jornada_fim_prevista, horas_acordado,
           meds_ult_12h, alcool_ult_12h, risco_autoavaliado,
           horas_sono_48h, wake_time, subjective_fatigue_level, sleepiness_level,
           fit_for_duty, computed_risk_level, requires_operational_review, report_source,
           regulatory_profile_id, profile_code, config_revision_id, model_version, submitted_at,
           origem_registro, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, NULL, NULL, NULL, 0, 0, ?, NULL, ?, ?, ?, ?, ?, ?, 'MAINTENANCE_REPORTED', NULL, NULL, NULL, ?, ?, 'MANUTENCAO', ?, ?, ?)`,
      )
      .bind(
        checkinId, empresaId, employee.id, referenceDate, hour,
        kssScore, sleepHours24h, sleepQuality, null, notes || null,
        assessment.score, assessment.fatigueLevel, assessment.operationalStatus, assessment.recommendation,
        fitValue, subjectiveFatigueLevel, wakeTime, subjectiveFatigueLevel, subjectiveFatigueLevel,
        fitValue, assessment.riskLevel, assessment.requiresOperationalReview,
        assessment.scoringVersion, now, userId || null, now, now,
      )
      .run();
  }

  await db
    .prepare(
      `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(), empresaId, checkinId,
      existing?.id ? 'CHECKIN_MANUTENCAO_ATUALIZADO' : 'CHECKIN_MANUTENCAO_CRIADO',
      JSON.stringify({
        workforce_profile: 'maintenance', cargo: employee.cargo,
        score_fadiga: assessment.score, nivel_fadiga: assessment.fatigueLevel,
        computed_risk_level: assessment.riskLevel,
        requires_operational_review: assessment.requiresOperationalReview,
        reasons: assessment.reasons, scoring_version: assessment.scoringVersion,
      }),
      now,
    )
    .run();

  if (assessment.requiresOperationalReview === 1) {
    await db
      .prepare(
        `INSERT INTO notificacoes_sistema
           (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at)
         VALUES ('FRMS_MANUTENCAO_FADIGA', 'ALTA', 'Fadiga de manutenção em atenção', ?, 'frms', ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(
        `Profissional de manutenção #${employee.id} registrou risco ${assessment.riskLevel} em ${referenceDate}. Revisão pela gestão de manutenção necessária.`,
        JSON.stringify({
          empresa_id: empresaId, funcionario_id: employee.id, checkin_id: checkinId,
          setor_id: employee.setor_id, workforce_profile: 'maintenance',
          computed_risk_level: assessment.riskLevel, requires_operational_review: 1,
        }),
        empresaId,
      )
      .run();
  }

  await registrarAuditoria({
    db,
    tabela: 'frms_fadiga_checkin',
    acao: existing?.id ? 'UPDATE' : 'INSERT',
    registro_id: checkinId,
    usuario_id: String(userId || '0'),
    dados_novos: {
      funcionario_id: employee.id, cargo: employee.cargo, workforce_profile: 'maintenance',
      data_checkin: referenceDate, score_fadiga: assessment.score,
      nivel_fadiga: assessment.fatigueLevel, computed_risk_level: assessment.riskLevel,
      requires_operational_review: assessment.requiresOperationalReview,
      scoring_version: assessment.scoringVersion,
    },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
    user_agent: c.req.header('user-agent'),
  });

  return c.json({
    success: true,
    data: {
      checkin: {
        id: checkinId, funcionario_id: employee.id, cargo: employee.cargo,
        reference_date: referenceDate, wake_time: wakeTime,
        sleep_hours_24h: sleepHours24h, sleep_quality: sleepQuality, kss_score: kssScore,
        fit_for_duty: fitForDuty, score_fadiga: assessment.score,
        nivel_fadiga: assessment.fatigueLevel, status_operacional: assessment.operationalStatus,
        computed_risk_level: assessment.riskLevel,
        requires_operational_review: assessment.requiresOperationalReview,
        reasons: assessment.reasons, recommendation: assessment.recommendation,
        scoring_version: assessment.scoringVersion,
      },
      readiness_required: true,
    },
  });
});

router.get('/session-profiles', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const activeRole = normalizeSessionRole((c.get as (key: string) => unknown)('userRole'));
  const roles = await resolveAvailableSessionRoles(db, userId, empresaId, activeRole);

  return c.json({
    success: true,
    data: { activeRole, roles, requiresSelection: roles.length > 1 },
  });
});

router.post('/session-profile', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);
  const userId = getUserId(c);
  const body = await c.req.json<{ role?: string }>().catch(() => ({}) as { role?: string });
  const requestedRole = String(body.role || '').trim();

  if (!requestedRole) {
    return c.json({ success: false, error: 'Perfil é obrigatório', code: 'SESSION_ROLE_REQUIRED' }, 400);
  }

  const currentRole = (c.get as (key: string) => unknown)('userRole');
  const selectedRole = await resolveRequestedSessionRole(db, userId, empresaId, requestedRole, currentRole);

  if (!selectedRole) {
    return c.json(
      { success: false, error: 'Perfil não disponível para este usuário nesta empresa', code: 'SESSION_ROLE_NOT_AVAILABLE' },
      403,
    );
  }

  const user = await db
    .prepare(
      `SELECT id, email, nome, funcionario_id FROM usuarios
        WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(userId)
    .first<{ id: number; email: string; nome: string; funcionario_id: number | null }>();

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
  if (!jwtSecret) throw new Error('JWT_SECRET não configurado no ambiente');

  const { token: accessToken } = await generateJWT(
    {
      sub: user.id, empresa_id: empresaId, email: user.email, role: selectedRole,
      nome: user.nome, permissions, funcionario_id: user.funcionario_id ?? null,
    },
    jwtSecret,
    ACCESS_TOKEN_TTL_SECONDS,
  );

  setSessionRoleCookie(c, selectedRole);
  const roles = await resolveAvailableSessionRoles(db, userId, empresaId, selectedRole);

  return c.json({
    success: true,
    data: {
      accessToken, activeRole: selectedRole, roles,
      user: {
        id: user.id, email: user.email, nome: user.nome, role: selectedRole,
        permissions, funcionario_id: user.funcionario_id ?? null,
      },
    },
  });
});

export default router;
