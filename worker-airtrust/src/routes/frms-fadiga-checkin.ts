import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv, Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { registrarAuditoria } from '../utils/auditoria';
import {
  calcularHorasSono,
  calcularScoreFadiga,
  type FadigaScoreConfig,
  type FadigaScoreInput,
} from '../lib/frms/fadiga-score';
import { FrmsParameterResolutionError, resolveFrmsOperationalContext } from '../lib/frms/parameter-governance';
import { sincronizarCheckinComFrms } from '../lib/frms/fadiga-frms-sync';
import { buildFratSuggestion } from '../lib/frms/fadiga-frat-bridge';
import { canSeeFrmsTeamScope } from '../lib/frms/access';
import {
  getEmployeeSectorAccess,
  buildFuncionarioScopeWhere,
} from '../services/employee-sector-access';
import {
  CheckinCreateSchema,
  GestorRespostaSchema,
  type CheckinCreateInput,
} from './frms-fadiga-checkin.schema';

const router = new Hono<AppEnv>();
router.use('*', auth());

type FrmsContext = Context<AppEnv>;

type FadigaConfigRow = {
  threshold_amarelo: number;
  threshold_vermelho: number;
  peso_kss: number;
  peso_sono_duracao: number;
  peso_sono_qualidade: number;
  peso_sintomas: number;
  ativo: number;
  janela_inicio: string;
  janela_fim: string;
};

type DailyRiskLevel = 'normal' | 'attention' | 'critical' | 'unfit_for_duty';

type NormalizedCheckinInput = {
  dataCheckin: string;
  horaDormiu: string | null;
  horaAcordou: string;
  horasSono24h: number;
  horasSono48h: number | null;
  qualidadeSono: number | null;
  kssScore: number;
  subjectiveFatigueLevel: number | null;
  sleepinessLevel: number | null;
  apto: 0 | 1;
  motivoInaptidao: string | null;
  medsUlt12h: 0 | 1 | null;
  alcoolUlt12h: 0 | 1 | null;
  riscoAutoavaliado: number | null;
  jornadaInicioPrevista: string | null;
  observacoes: string | null;
  sintomas: CheckinCreateInput['sintomas'];
  aceiteTermos: boolean;
  aceitePrivacidade: boolean;
};

function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function normalizeOptionalBinary(value: boolean | number | null | undefined): 0 | 1 | null {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  return null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseTimeToMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isManagerPlus(c: FrmsContext): boolean {
  return canSeeFrmsTeamScope(c.get('userRole'));
}

async function getConfig(db: D1Database, empresaId: number): Promise<FadigaConfigRow> {
  const row = await db
    .prepare(
      `SELECT
        ativo,
        janela_inicio,
        janela_fim,
        threshold_amarelo,
        threshold_vermelho,
        peso_kss,
        peso_sono_duracao,
        peso_sono_qualidade,
        peso_sintomas
       FROM frms_fadiga_config_empresa
       WHERE empresa_id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(empresaId)
    .first<FadigaConfigRow>();

  if (row) return row;

  await db
    .prepare(
      `INSERT INTO frms_fadiga_config_empresa
       (empresa_id, ativo, janela_inicio, janela_fim, threshold_amarelo, threshold_vermelho, peso_kss, peso_sono_duracao, peso_sono_qualidade, peso_sintomas, created_at, updated_at)
       VALUES (?, 1, '04:00', '11:00', 40, 60, 0.35, 0.25, 0.20, 0.20, ?, ?)`,
    )
    .bind(empresaId, nowSql(), nowSql())
    .run();

  return {
    ativo: 1,
    janela_inicio: '04:00',
    janela_fim: '11:00',
    threshold_amarelo: 40,
    threshold_vermelho: 60,
    peso_kss: 0.35,
    peso_sono_duracao: 0.25,
    peso_sono_qualidade: 0.2,
    peso_sintomas: 0.2,
  };
}

async function resolveFuncionarioId(c: FrmsContext): Promise<number | null> {
  const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
  const funcionarioIdFromContext = Number(c.get('funcionarioId') || 0);
  const userId = Number(c.get('userId') || 0);
  if (funcionarioIdFromContext > 0) {
    const fromContext = await c.env.DB
      .prepare(
        `SELECT id
           FROM funcionarios
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL
            AND COALESCE(ativo, 1) = 1
            AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
          LIMIT 1`,
      )
      .bind(funcionarioIdFromContext, empresaId)
      .first<{ id: number }>();

    if (fromContext?.id) return fromContext.id;
  }

  if (!userId) return null;

  const asUsuario = await c.env.DB.prepare(
    `SELECT f.id
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
      WHERE u.id = ?
        AND (u.deleted_at IS NULL OR u.deleted_at = 0)
        AND f.empresa_id = ?
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      LIMIT 1`,
  )
    .bind(userId, empresaId)
    .first<{ id: number }>();

  if (asUsuario?.id) return asUsuario.id;

  // Compatibilidade legada: alguns tokens antigos usam sub como id do funcionário.
  const asFuncionario = await c.env.DB.prepare(
    `SELECT id
       FROM funcionarios
      WHERE id = ?
        AND empresa_id = ?
        AND deleted_at IS NULL
        AND COALESCE(ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
      LIMIT 1`,
  )
    .bind(userId, empresaId)
    .first<{ id: number }>();

  return asFuncionario?.id ?? null;
}

async function registrarAcaoAdmin(
  db: D1Database,
  params: {
    userId?: number;
    action: string;
    module: string;
    success: boolean;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO admin_actions
         (user_id, action, module, deleted_count, success, metadata_json, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        params.userId || null,
        params.action,
        params.module,
        0,
        params.success ? 1 : 0,
        params.metadata ? JSON.stringify(params.metadata) : null,
        params.ipAddress || null,
        params.userAgent || null,
      )
      .run();
  } catch {
    // tabela pode não existir em ambientes antigos
  }
}

function mapNivelToLegacy(
  nivel: 'VERDE' | 'AMARELO' | 'LARANJA' | 'VERMELHO',
): 'BAIXO' | 'MODERADO' | 'ALTO' | 'CRITICO' {
  if (nivel === 'VERDE') return 'BAIXO';
  if (nivel === 'AMARELO') return 'MODERADO';
  if (nivel === 'LARANJA') return 'ALTO';
  return 'CRITICO';
}

/**
 * Resolves the canonical fit-for-duty value from the two accepted fields.
 * Returns { conflict: true } if both fields are present with contradictory values.
 * fit_for_duty is the canonical field; apto is accepted as legacy compatibility only.
 */
function normalizeFitForDutyPayload(
  input: Pick<CheckinCreateInput, 'fit_for_duty' | 'apto'>,
): { apto: 0 | 1 } | { conflict: true } | { missing: true } {
  const hasApto = typeof input.apto === 'number';
  const hasFitForDuty = typeof input.fit_for_duty === 'boolean';
  if (hasApto && hasFitForDuty) {
    if ((input.apto === 1) !== input.fit_for_duty) return { conflict: true };
    return { apto: input.fit_for_duty ? 1 : 0 };
  }
  if (hasFitForDuty) return { apto: input.fit_for_duty ? 1 : 0 };
  if (hasApto) return { apto: input.apto === 0 ? 0 : 1 };
  return { missing: true };
}

function validateCheckinPayloadCompleteness(
  input: CheckinCreateInput,
): { ok: true } | { ok: false; error: string; message: string; field: string } {
  const wakeTime = input.wake_time || input.hora_acordou;
  if (!wakeTime) {
    return {
      ok: false,
      error: 'wake_time_required',
      field: 'wake_time',
      message: 'Informe wake_time ou hora_acordou para registrar o check-in de fadiga.',
    };
  }

  const hasHorasSono24h = typeof input.horas_sono_24h === 'number';
  const hasHoraDormiu = Boolean(input.hora_dormiu);
  if (!hasHorasSono24h && !hasHoraDormiu) {
    return {
      ok: false,
      error: 'sleep_data_required',
      field: 'horas_sono_24h',
      message: 'Informe horas_sono_24h ou hora_dormiu para registrar o check-in de fadiga.',
    };
  }

  return { ok: true };
}

function normalizeCheckinInput(
  input: CheckinCreateInput,
  aptoNormalizado: 0 | 1,
): NormalizedCheckinInput {
  const dataCheckin = input.reference_date || input.data_checkin || todayIso();
  const horaAcordou = input.wake_time || input.hora_acordou || '';
  const horaDormiu = input.hora_dormiu || null;
  const horasSono24h =
    typeof input.horas_sono_24h === 'number'
      ? clamp(input.horas_sono_24h, 0, 24)
      : calcularHorasSono(horaDormiu || horaAcordou, horaAcordou);
  const sleepinessLevel =
    typeof input.sleepiness_level === 'number' ? clamp(input.sleepiness_level, 0, 10) : null;
  const kssScore =
    typeof input.kss_score === 'number'
      ? clamp(input.kss_score, 1, 9)
      : sleepinessLevel == null
        ? 5
        : clamp(Math.round((sleepinessLevel / 10) * 8) + 1, 1, 9);
  const subjectiveFatigueLevel =
    typeof input.subjective_fatigue_level === 'number'
      ? clamp(input.subjective_fatigue_level, 0, 10)
      : null;
  const riscoAutoavaliado =
    typeof input.risco_autoavaliado === 'number'
      ? clamp(input.risco_autoavaliado, 1, 10)
      : subjectiveFatigueLevel;
  const observacoes = input.free_text_notes || input.observacoes || null;

  return {
    dataCheckin,
    horaDormiu,
    horaAcordou,
    horasSono24h,
    horasSono48h:
      typeof input.horas_sono_48h === 'number' ? clamp(input.horas_sono_48h, 0, 48) : null,
    qualidadeSono:
      typeof input.qualidade_sono === 'number' ? clamp(input.qualidade_sono, 1, 5) : null,
    kssScore,
    subjectiveFatigueLevel,
    sleepinessLevel,
    apto: aptoNormalizado,
    motivoInaptidao: input.motivo_inaptidao ?? null,
    medsUlt12h: normalizeOptionalBinary(input.meds_ult_12h),
    alcoolUlt12h: normalizeOptionalBinary(input.alcool_ult_12h),
    riscoAutoavaliado,
    jornadaInicioPrevista: input.jornada_inicio_prevista ?? null,
    observacoes,
    sintomas: input.sintomas,
    aceiteTermos: input.aceite_termos === true,
    aceitePrivacidade: input.aceite_privacidade === true,
  };
}

function buildScoreInput(input: NormalizedCheckinInput): FadigaScoreInput {
  const sintomasJson: Record<string, number> | null = input.sintomas
    ? Object.entries(input.sintomas).reduce<Record<string, number>>((acc, [key, value]) => {
        if (key !== 'descricao_dor' && typeof value === 'number') {
          acc[key] = value;
        }
        return acc;
      }, {})
    : null;

  return {
    kss_score: input.kssScore,
    horas_sono: input.horasSono24h,
    qualidade_sono: input.qualidadeSono,
    sintomas_json: sintomasJson,
    apto: input.apto,
    meds_ult_12h: input.medsUlt12h,
    alcool_ult_12h: input.alcoolUlt12h,
  };
}

function evaluateDailyRisk(input: NormalizedCheckinInput): DailyRiskLevel {
  if (input.apto === 0) return 'unfit_for_duty';
  if (input.horasSono24h < 4) return 'critical';
  if ((input.subjectiveFatigueLevel ?? 0) >= 8) return 'critical';
  if ((input.sleepinessLevel ?? 0) >= 8) return 'critical';
  if (input.horasSono24h < 5) return 'attention';
  if ((input.subjectiveFatigueLevel ?? 0) >= 6) return 'attention';
  if ((input.sleepinessLevel ?? 0) >= 6) return 'attention';
  return 'normal';
}

function mapRiskToSeverity(level: DailyRiskLevel): 'ATENCAO' | 'CRITICO' | null {
  if (level === 'attention') return 'ATENCAO';
  if (level === 'critical' || level === 'unfit_for_duty') return 'CRITICO';
  return null;
}

export function resolveContextoPilotoLimites(
  limites?: Partial<{ HV_7_DIAS_HORAS: number; HV_28_DIAS_HORAS: number; HV_MES_HORAS: number }> | null,
): {
  limite7dHoras: number;
  limite28dHoras: number;
} {
  const limite7 = Number(limites?.HV_7_DIAS_HORAS);
  const limite28 = Number(limites?.HV_28_DIAS_HORAS ?? limites?.HV_MES_HORAS);

  return {
    limite7dHoras: Number.isFinite(limite7) && limite7 > 0 ? limite7 : 45,
    limite28dHoras: Number.isFinite(limite28) && limite28 > 0 ? limite28 : 90,
  };
}

async function computeContextoPiloto(
  db: D1Database,
  funcionarioId: number,
  governedLimites: Readonly<Record<string, number>>,
): Promise<{
  acumulo_7d_horas: number;
  acumulo_28d_horas: number;
  limite_7d_horas: number;
  limite_28d_horas: number;
  effectiveness_hoje: number | null;
  media_kss_7d: number | null;
  media_sono_7d: number | null;
  alertas_ativos: number;
}> {
  const hoje = todayIso();
  const rolling = await db
    .prepare(
      `SELECT hv_7_dias_min, hv_28_dias_min
       FROM frms_acumulo_rolling
       WHERE tripulante_id = ? AND data_referencia = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(funcionarioId, hoje)
    .first<{ hv_7_dias_min: number; hv_28_dias_min: number }>();

  const effectiveness = await db
    .prepare(
      `SELECT ffj.effectiveness_pct
       FROM frms_jornada fj
       JOIN frms_fatorizacao_jornada ffj ON ffj.jornada_id = fj.id AND ffj.deleted_at IS NULL
       WHERE fj.tripulante_id = ?
         AND fj.data = ?
         AND fj.deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(funcionarioId, hoje)
    .first<{ effectiveness_pct: number | null }>();

  const media7d = await db
    .prepare(
      `SELECT AVG(kss_score) AS media_kss, AVG(horas_sono) AS media_sono
       FROM frms_fadiga_checkin
       WHERE funcionario_id = ?
         AND deleted_at IS NULL
         AND date(data_checkin) >= date('now', '-7 days')`,
    )
    .bind(funcionarioId)
    .first<{ media_kss: number | null; media_sono: number | null }>();

  const alertasAtivos = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM frms_alerta
       WHERE tripulante_id = ? AND resolvido = 0 AND deleted_at IS NULL`,
    )
    .bind(String(funcionarioId))
    .first<{ total: number }>();

  const limitesContexto = resolveContextoPilotoLimites(governedLimites);

  return {
    acumulo_7d_horas: Number(((rolling?.hv_7_dias_min ?? 0) / 60).toFixed(1)),
    acumulo_28d_horas: Number(((rolling?.hv_28_dias_min ?? 0) / 60).toFixed(1)),
    limite_7d_horas: limitesContexto.limite7dHoras,
    limite_28d_horas: limitesContexto.limite28dHoras,
    effectiveness_hoje: effectiveness?.effectiveness_pct ?? null,
    media_kss_7d: media7d?.media_kss ?? null,
    media_sono_7d: media7d?.media_sono ?? null,
    alertas_ativos: alertasAtivos?.total ?? 0,
  };
}

async function getFrmsSleepDefaults(db: D1Database): Promise<{
  horasSonoPadrao: number;
  minutosAntesApresentacao: number;
}> {
  const rows = await db
    .prepare(
      `SELECT nome, valor_numerico
         FROM frms_configuracao_limites
        WHERE nome IN ('HORAS_SONO_PADRAO', 'MINUTOS_ANTES_APRESENTACAO')
          AND ativo = 1
          AND deleted_at IS NULL`,
    )
    .all<{ nome: string; valor_numerico: number }>();

  const horasSonoPadrao = clamp(
    Number(rows.results?.find((r) => r.nome === 'HORAS_SONO_PADRAO')?.valor_numerico ?? 8),
    4,
    12,
  );
  const minutosAntesApresentacao = clamp(
    Number(
      rows.results?.find((r) => r.nome === 'MINUTOS_ANTES_APRESENTACAO')?.valor_numerico ?? 90,
    ),
    30,
    240,
  );

  return {
    horasSonoPadrao,
    minutosAntesApresentacao,
  };
}

function computeWakeTimeFromJornada(
  horaApresentacao: string | null | undefined,
  minutosAntesApresentacao: number,
): string {
  const startMin = parseTimeToMinutes(horaApresentacao || '');
  if (startMin == null) return '06:00';
  return minutesToTime(startMin - minutosAntesApresentacao);
}

async function createDailyFatigueAlert(params: {
  db: D1Database;
  empresaId: number;
  tripulanteId: number;
  dataCheckin: string;
  riskLevel: DailyRiskLevel;
  scoreFadiga: number;
  horasSono24h: number;
  wakeTime: string;
  checkinId: string;
}): Promise<void> {
  const severity = mapRiskToSeverity(params.riskLevel);
  if (!severity) return;

  const existing = await params.db
    .prepare(
      `SELECT id
         FROM frms_alerta
        WHERE tripulante_id = ?
          AND tipo_limite = 'REPOUSO'
          AND nivel = ?
          AND date(created_at) = ?
          AND mensagem LIKE '[FADIGA_DIARIA]%'
          AND resolvido = 0
          AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(String(params.tripulanteId), severity, params.dataCheckin)
    .first<{ id: string }>();

  if (existing?.id) return;

  const riskLabel =
    params.riskLevel === 'unfit_for_duty'
      ? 'daily_fatigue_unfit_for_duty'
      : params.riskLevel === 'critical'
        ? 'daily_fatigue_critical'
        : 'daily_fatigue_attention';

  const mensagem =
    `[FADIGA_DIARIA] ${riskLabel}: revisão operacional necessária. ` +
    `Data ${params.dataCheckin}. Sono 24h ${params.horasSono24h.toFixed(1)}h. ` +
    `Despertar ${params.wakeTime}. Score ${params.scoreFadiga}.`;

  const now = nowSql();
  await params.db
    .prepare(
      `INSERT INTO frms_alerta (
         id, tripulante_id, jornada_id, tipo_limite, nivel,
         percentual_atingido, valor_atual_min, valor_limite_min, mensagem,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      String(params.tripulanteId),
      null,
      'REPOUSO',
      severity,
      params.scoreFadiga,
      Math.round(params.horasSono24h * 60),
      300,
      mensagem,
      now,
      now,
    )
    .run();
}

async function buildDailyFatigueStatus(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  date: string;
}): Promise<Record<string, unknown>> {
  const [defaults, checkin, jornada] = await Promise.all([
    getFrmsSleepDefaults(params.db),
    params.db
      .prepare(
        `SELECT
            id, data_checkin, hora_checkin, horas_sono, horas_sono_48h, wake_time,
            qualidade_sono, kss_score, subjective_fatigue_level, sleepiness_level,
            fit_for_duty, score_fadiga, nivel_fadiga, status_operacional,
            computed_risk_level, requires_operational_review, observacoes, submitted_at
         FROM frms_fadiga_checkin
         WHERE empresa_id = ?
           AND funcionario_id = ?
           AND data_checkin = ?
           AND deleted_at IS NULL
         LIMIT 1`,
      )
      .bind(params.empresaId, params.funcionarioId, params.date)
      .first<Record<string, unknown>>(),
    params.db
      .prepare(
        `SELECT id, hora_apresentacao
         FROM frms_jornada
         WHERE tripulante_id = ?
           AND data = ?
           AND deleted_at IS NULL
           AND status IN ('ES','TS','TV','EX','RE','SA')
         LIMIT 1`,
      )
      .bind(params.funcionarioId, params.date)
      .first<{ id: string; hora_apresentacao: string | null }>(),
  ]);

  const wakeEstimated = computeWakeTimeFromJornada(
    jornada?.hora_apresentacao,
    defaults.minutosAntesApresentacao,
  );

  if (!checkin) {
    return {
      status: 'not_submitted',
      submitted: false,
      data_source: 'default_estimate',
      confidence: 'reduced',
      message:
        'Fadiga diária não preenchida pelo tripulante — usando estimativa padrão. Revisão operacional necessária.',
      requires_operational_review: true,
      sleep_hours_24h: defaults.horasSonoPadrao,
      wake_time: wakeEstimated,
      fit_for_duty: null,
      has_jornada: Boolean(jornada?.id),
      jornada_id: jornada?.id ?? null,
    };
  }

  const riskLevel = String(checkin.computed_risk_level || 'normal');
  return {
    status: riskLevel,
    submitted: true,
    data_source: 'crew_reported',
    confidence: 'reported',
    message:
      riskLevel === 'normal'
        ? 'Fadiga diária informada pelo tripulante.'
        : 'Fadiga diária informada pelo tripulante com revisão operacional necessária.',
    requires_operational_review: Number(checkin.requires_operational_review || 0) === 1,
    sleep_hours_24h: Number(checkin.horas_sono || 0),
    sleep_hours_48h:
      checkin.horas_sono_48h == null ? null : Number(checkin.horas_sono_48h || 0),
    wake_time: String(checkin.wake_time || wakeEstimated),
    fit_for_duty:
      checkin.fit_for_duty == null ? null : Number(checkin.fit_for_duty || 0) === 1,
    score_fadiga: Number(checkin.score_fadiga || 0),
    nivel_fadiga: String(checkin.nivel_fadiga || ''),
    status_operacional: String(checkin.status_operacional || ''),
    checkin,
    has_jornada: Boolean(jornada?.id),
    jornada_id: jornada?.id ?? null,
  };
}

router.get('/fadiga-checkin/hoje', async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const funcionarioId = await resolveFuncionarioId(c);
    if (!funcionarioId) {
      return c.json(
        { success: false, error: 'Funcionário não encontrado para o usuário atual' },
        404,
      );
    }

    const hoje = todayIso();
    const row = await c.env.DB.prepare(
      `SELECT *
       FROM frms_fadiga_checkin
       WHERE empresa_id = ? AND funcionario_id = ? AND data_checkin = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
      .bind(empresaId, funcionarioId, hoje)
      .first<Record<string, unknown>>();

    return c.json({ success: true, data: row ?? null });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar check-in de hoje' }, 500);
  }
});

router.get('/fadiga-checkin/me', async (c) => {
  const date = c.req.query('date') || todayIso();
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const funcionarioId = await resolveFuncionarioId(c);
    if (!funcionarioId) {
      return c.json(
        { success: false, error: 'Funcionário não encontrado para o usuário atual' },
        404,
      );
    }
    const row = await c.env.DB.prepare(
      `SELECT * FROM frms_fadiga_checkin
       WHERE empresa_id = ? AND funcionario_id = ? AND data_checkin = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
      .bind(empresaId, funcionarioId, date)
      .first<Record<string, unknown>>();

    return c.json({ success: true, data: row ?? null });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar check-in do tripulante' }, 500);
  }
});

router.get('/fadiga-checkin/config', async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const config = await getConfig(c.env.DB, empresaId);
    return c.json({ success: true, data: config });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar configuração de fadiga diária' }, 500);
  }
});

router.get('/daily-fatigue', async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const date = c.req.query('date') || todayIso();
    const scope = (c.req.query('scope') || '').toLowerCase();
    const canSeeTeam = isManagerPlus(c) && scope === 'team';

    if (!canSeeTeam) {
      const funcionarioId = await resolveFuncionarioId(c);
      if (!funcionarioId) {
        return c.json(
          { success: false, error: 'Funcionário não encontrado para o usuário atual' },
          404,
        );
      }
      const status = await buildDailyFatigueStatus({
        db: c.env.DB,
        empresaId,
        funcionarioId,
        date,
      });
      return c.json({
        success: true,
        data: {
          date,
          funcionario_id: funcionarioId,
          ...status,
        },
      });
    }

    const limit = Math.min(Math.max(Number(c.req.query('limit') || 100), 1), 500);
    const offset = Math.max(Number(c.req.query('offset') || 0), 0);

    const sectorAccess = await getEmployeeSectorAccess(
      c as unknown as Context<{ Bindings: Env }>,
      empresaId,
    );
    const sectorScope = buildFuncionarioScopeWhere(sectorAccess, 'f');

    const defaults = await getFrmsSleepDefaults(c.env.DB);
    const rows = await c.env.DB
      .prepare(
        `SELECT
            f.id AS funcionario_id,
            f.nome AS funcionario_nome,
            COALESCE(f.cargo, f.funcao) AS cargo,
            fj.id AS jornada_id,
            fj.hora_apresentacao,
            ch.id AS checkin_id,
            ch.hora_checkin, ch.kss_score,
            ch.horas_sono,
            ch.horas_sono_48h,
            ch.wake_time,
            ch.score_fadiga,
            ch.nivel_fadiga,
            ch.status_operacional,
            ch.computed_risk_level,
            ch.requires_operational_review
         FROM funcionarios f
         LEFT JOIN frms_jornada fj
           ON fj.tripulante_id = f.id
          AND fj.data = ?
          AND fj.deleted_at IS NULL
          AND fj.status IN ('ES','TS','TV','EX','RE','SA')
         LEFT JOIN frms_fadiga_checkin ch
           ON ch.funcionario_id = f.id
          AND ch.empresa_id = f.empresa_id
          AND ch.data_checkin = ?
          AND ch.deleted_at IS NULL
         WHERE f.empresa_id = ?
           AND f.deleted_at IS NULL
           AND COALESCE(f.ativo, 1) = 1
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND UPPER(COALESCE(f.funcao, '')) IN ('PILOTO','COPILOTO','COMANDANTE')
           AND ${sectorScope.clause}
         ORDER BY
           CASE
             WHEN ch.id IS NULL AND fj.id IS NOT NULL THEN 1
             WHEN ch.computed_risk_level IN ('critical', 'unfit_for_duty') THEN 2
             WHEN ch.computed_risk_level = 'attention' THEN 3
             ELSE 4
           END,
           f.nome ASC
         LIMIT ? OFFSET ?`,
      )
      .bind(date, date, empresaId, ...sectorScope.bindings, limit, offset)
      .all<Record<string, unknown>>();

    const itens = (rows.results || []).map((row) => {
      const hasCheckin = Boolean(row.checkin_id);
      const wakeEstimated = computeWakeTimeFromJornada(
        String(row.hora_apresentacao || ''),
        defaults.minutosAntesApresentacao,
      );
      const status = hasCheckin
        ? String(row.computed_risk_level || 'normal')
        : row.jornada_id
          ? 'not_submitted'
          : 'no_duty';
      const source =
        status === 'not_submitted'
          ? 'default_estimate'
          : hasCheckin
            ? 'crew_reported'
            : 'not_applicable';
      const reviewRequired =
        status === 'not_submitted' ||
        status === 'attention' ||
        status === 'critical' ||
        status === 'unfit_for_duty';

      return {
        ...row,
        date,
        status,
        data_source: source,
        sleep_hours_24h: hasCheckin ? Number(row.horas_sono || 0) : defaults.horasSonoPadrao,
        sleep_hours_48h: hasCheckin
          ? row.horas_sono_48h == null
            ? null
            : Number(row.horas_sono_48h || 0)
          : null,
        wake_time: hasCheckin ? String(row.wake_time || wakeEstimated) : wakeEstimated,
        requires_operational_review: reviewRequired ? 1 : 0,
        status_label:
          status === 'not_submitted'
            ? 'Não preenchida'
            : status === 'attention'
              ? 'Atenção'
              : status === 'critical' || status === 'unfit_for_duty'
                ? 'Crítica'
                : status === 'normal'
                  ? 'Preenchida'
                  : 'Sem jornada',
      };
    });

    return c.json({
      success: true,
      data: {
        date,
        defaults: {
          horas_sono_padrao: defaults.horasSonoPadrao,
          minutos_antes_apresentacao: defaults.minutosAntesApresentacao,
        },
        items: itens,
        pagination: { limit, offset },
      },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar status de fadiga diária' }, 500);
  }
});

router.get('/daily-fatigue/alerts', async (c) => {
  try {
    const date = c.req.query('date') || todayIso();
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    if (!isManagerPlus(c)) {
      const funcionarioId = await resolveFuncionarioId(c);
      if (!funcionarioId) {
        return c.json(
          { success: false, error: 'Funcionário não encontrado para o usuário atual' },
          404,
        );
      }
      const status = await buildDailyFatigueStatus({
        db: c.env.DB,
        empresaId,
        funcionarioId,
        date,
      });
      const statusName = String(status.status || '');
      const shouldAlert =
        statusName === 'not_submitted' ||
        statusName === 'attention' ||
        statusName === 'critical' ||
        statusName === 'unfit_for_duty';
      return c.json({
        success: true,
        data: {
          date,
          count: shouldAlert ? 1 : 0,
          items: shouldAlert
            ? [
                {
                  id: `daily-fatigue-self-${funcionarioId}-${date}`,
                  tripulante_id: funcionarioId,
                  nivel:
                    statusName === 'attention' || statusName === 'not_submitted'
                      ? 'ATENCAO'
                      : 'CRITICO',
                  tipo_limite: statusName,
                  mensagem:
                    statusName === 'not_submitted'
                      ? 'Fadiga diária não preenchida pelo tripulante — usando estimativa padrão.'
                      : 'Fadiga diária com revisão operacional necessária.',
                  created_at: `${date} 00:00:00`,
                  resolvido: 0,
                  resolvido_em: null,
                  requires_operational_review: 1,
                },
              ]
            : [],
        },
      });
    }

    const alertsSectorAccess = await getEmployeeSectorAccess(
      c as unknown as Context<{ Bindings: Env }>,
      empresaId,
    );
    const alertsSectorScope = buildFuncionarioScopeWhere(alertsSectorAccess, 'f');

    const rows = await c.env.DB
      .prepare(
        `SELECT a.id, a.tripulante_id, a.nivel, a.tipo_limite, a.mensagem, a.created_at, a.resolvido, a.resolvido_em,
                f.nome AS tripulante_nome
         FROM frms_alerta a
         LEFT JOIN funcionarios f ON f.id = a.tripulante_id
         WHERE a.deleted_at IS NULL
           AND a.tipo_limite = 'REPOUSO'
           AND a.mensagem LIKE '[FADIGA_DIARIA]%'
           AND date(a.created_at) = ?
           AND f.empresa_id = ?
           AND ${alertsSectorScope.clause}
         ORDER BY
           CASE a.nivel WHEN 'CRITICO' THEN 1 WHEN 'ATENCAO' THEN 2 ELSE 3 END,
           a.created_at DESC`,
      )
      .bind(date, empresaId, ...alertsSectorScope.bindings)
      .all<Record<string, unknown>>();

    const teamResponse = await router.fetch(
      new Request(`${c.req.url.split('?')[0].replace('/daily-fatigue/alerts', '/daily-fatigue')}?date=${encodeURIComponent(date)}&scope=team`, c.req.raw),
      c.env,
      c.executionCtx,
    );
    const teamPayload = (await teamResponse.json()) as {
      data?: { items?: Array<Record<string, unknown>> };
    };
    const syntheticNotSubmitted = (teamPayload.data?.items || [])
      .filter((item) => item.status === 'not_submitted')
      .map((item) => ({
        id: `daily-fatigue-not-submitted-${item.funcionario_id}-${date}`,
        tripulante_id: item.funcionario_id,
        nivel: 'ATENCAO',
        tipo_limite: 'daily_fatigue_not_submitted',
        mensagem:
          'Fadiga diária não preenchida pelo tripulante — usando estimativa padrão. Revisão operacional necessária.',
        created_at: `${date} 00:00:00`,
        resolvido: 0,
        resolvido_em: null,
        tripulante_nome: item.funcionario_nome,
        requires_operational_review: 1,
        alert_type: 'daily_fatigue_not_submitted',
      }));

    const persisted = (rows.results || []).map((row) => ({
      ...row,
      requires_operational_review: 1,
      alert_type: String(row.mensagem || '').includes('daily_fatigue_unfit_for_duty')
        ? 'daily_fatigue_unfit_for_duty'
        : String(row.mensagem || '').includes('daily_fatigue_critical')
          ? 'daily_fatigue_critical'
          : 'daily_fatigue_attention',
    }));
    const items = [...syntheticNotSubmitted, ...persisted];

    return c.json({
      success: true,
      data: {
        date,
        count: items.length,
        items,
      },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar alertas de fadiga diária' }, 500);
  }
});

router.post('/daily-fatigue', async (c) => {
  return router.fetch(new Request(c.req.url.replace('/daily-fatigue', '/fadiga-checkin'), c.req.raw), c.env, c.executionCtx);
});

router.post('/fadiga-checkin', async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const userId = Number(c.get('userId') || 0);
    const funcionarioId = await resolveFuncionarioId(c);
    if (!funcionarioId) {
      return c.json(
        { success: false, error: 'Funcionário não encontrado para o usuário atual' },
        404,
      );
    }

    const body = await c.req.json();
    const parsed = CheckinCreateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    const fitNorm = normalizeFitForDutyPayload(parsed.data);
    if ('conflict' in fitNorm) {
      return c.json(
        { success: false, error: 'payload_conflict', message: 'fit_for_duty e apto possuem valores conflitantes' },
        400,
      );
    }
    if ('missing' in fitNorm) {
      return c.json(
        { success: false, error: 'fit_for_duty_required', message: 'Informe fit_for_duty ou apto para registrar o check-in de fadiga.' },
        400,
      );
    }

    const completeness = validateCheckinPayloadCompleteness(parsed.data);
    if (!completeness.ok) {
      return c.json(
        {
          success: false,
          error: completeness.error,
          message: completeness.message,
          field: completeness.field,
        },
        400,
      );
    }

    const input = normalizeCheckinInput(parsed.data, fitNorm.apto);
    const dataCheckin = input.dataCheckin;

    const config = await getConfig(c.env.DB, empresaId);
    if (!config.ativo) {
      return c.json({ success: false, error: 'Check-in diário desativado para esta empresa' }, 400);
    }

    const scoreConfig: FadigaScoreConfig = {
      threshold_amarelo: config.threshold_amarelo,
      threshold_vermelho: config.threshold_vermelho,
      peso_kss: config.peso_kss,
      peso_sono_duracao: config.peso_sono_duracao,
      peso_sono_qualidade: config.peso_sono_qualidade,
      peso_sintomas: config.peso_sintomas,
    };

    let operationalContext;
    try {
      operationalContext = await resolveFrmsOperationalContext(c.env.DB, {
        empresaId,
        referenceAt: dataCheckin,
        funcionarioId,
      });
    } catch (error) {
      if (error instanceof FrmsParameterResolutionError) {
        return c.json({ success: false, error: error.code, message: error.message }, 422);
      }
      throw error;
    }
    const scoreBase = calcularScoreFadiga(buildScoreInput(input), scoreConfig, operationalContext.fadigaPolicy);
    const dailyRiskLevel = evaluateDailyRisk(input);
    const finalNivel =
      dailyRiskLevel === 'unfit_for_duty' || dailyRiskLevel === 'critical'
        ? 'VERMELHO'
        : dailyRiskLevel === 'attention' && scoreBase.nivel_fadiga === 'VERDE'
          ? 'AMARELO'
          : scoreBase.nivel_fadiga;
    const finalStatusOperacional =
      dailyRiskLevel === 'unfit_for_duty'
        ? 'NAO_APTO'
        : dailyRiskLevel === 'critical'
          ? 'RESTRITO'
          : scoreBase.status_operacional;
    const requiresOperationalReview =
      dailyRiskLevel !== 'normal' || scoreBase.requires_frat_review === 1 ? 1 : 0;
    const wakeTime = input.horaAcordou;
    const recomendacaoFinal =
      dailyRiskLevel === 'unfit_for_duty'
        ? 'Revisão operacional imediata: tripulante reportou condição não segura para jornada.'
        : dailyRiskLevel === 'critical'
          ? 'Risco crítico em fadiga diária: revisão operacional imediata recomendada.'
          : dailyRiskLevel === 'attention'
            ? 'Sinalização de atenção em fadiga diária: revisar jornada com coordenação.'
            : scoreBase.recomendacao;

    const now = nowSql();
    const existing = await c.env.DB.prepare(
      `SELECT id
         FROM frms_fadiga_checkin
         WHERE empresa_id = ? AND funcionario_id = ? AND data_checkin = ? AND deleted_at IS NULL
         LIMIT 1`,
    )
      .bind(empresaId, funcionarioId, dataCheckin)
      .first<{ id: string }>();

    const checkinId = existing?.id || crypto.randomUUID();
    const horaCheckin = now.slice(11, 16);
    const sintomasJson = input.sintomas ? JSON.stringify(input.sintomas) : null;
    // As colunas legadas são NOT NULL DEFAULT 0; null é mantido no cálculo e na resposta,
    // mas persistido como 0 até existir source flag/migration para "não informado".
    const medsUlt12hDb = input.medsUlt12h ?? 0;
    const alcoolUlt12hDb = input.alcoolUlt12h ?? 0;

    if (existing?.id) {
      await c.env.DB.prepare(
        `UPDATE frms_fadiga_checkin
           SET hora_checkin = ?,
               kss_score = ?,
               horas_sono = ?,
               qualidade_sono = ?,
               sintomas_json = ?,
               observacoes = ?,
               score_fadiga = ?,
               nivel_fadiga = ?,
               status_operacional = ?,
               recomendacao = ?,
               apto = ?,
               requires_frat_review = ?,
               frat_sugerido_nivel = ?,
               jornada_inicio_prevista = ?,
               jornada_fim_prevista = ?,
               horas_acordado = ?,
               meds_ult_12h = ?,
               alcool_ult_12h = ?,
               risco_autoavaliado = ?,
               horas_sono_48h = ?,
               wake_time = ?,
               subjective_fatigue_level = ?,
               sleepiness_level = ?,
               fit_for_duty = ?,
               computed_risk_level = ?,
               requires_operational_review = ?,
               report_source = 'CREW_REPORTED',
               regulatory_profile_id = ?, profile_code = ?, config_revision_id = ?, model_version = ?,
               submitted_at = ?,
               origem_registro = 'TRIPULANTE',
               updated_at = ?
           WHERE id = ?`,
      )
        .bind(
          horaCheckin,
          input.kssScore,
          input.horasSono24h,
          input.qualidadeSono ?? 3,
          sintomasJson,
          input.observacoes,
          scoreBase.score_fadiga,
          finalNivel,
          finalStatusOperacional,
          recomendacaoFinal,
          input.apto,
          requiresOperationalReview,
          scoreBase.frat_sugerido_nivel,
          input.jornadaInicioPrevista,
          null,
          null,
          medsUlt12hDb,
          alcoolUlt12hDb,
          input.riscoAutoavaliado,
          input.horasSono48h,
          wakeTime,
          input.subjectiveFatigueLevel,
          input.sleepinessLevel,
          input.apto,
          dailyRiskLevel,
          requiresOperationalReview,
          operationalContext.regulatoryProfileId,
          operationalContext.profileCode,
          operationalContext.configRevisionId,
          operationalContext.modelVersion,
          now,
          now,
          checkinId,
        )
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO frms_fadiga_checkin (
             id, empresa_id, funcionario_id, data_checkin, hora_checkin,
             kss_score, horas_sono, qualidade_sono,
             sintomas_json, observacoes,
             score_fadiga, nivel_fadiga, status_operacional, recomendacao,
             apto, requires_frat_review, frat_sugerido_nivel, associado_frat_avaliacao_id,
             jornada_inicio_prevista, jornada_fim_prevista, horas_acordado,
             meds_ult_12h, alcool_ult_12h, risco_autoavaliado,
             horas_sono_48h, wake_time, subjective_fatigue_level, sleepiness_level,
             fit_for_duty, computed_risk_level, requires_operational_review, report_source,
             regulatory_profile_id, profile_code, config_revision_id, model_version, submitted_at,
             origem_registro, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          checkinId,
          empresaId,
          funcionarioId,
          dataCheckin,
          horaCheckin,
          input.kssScore,
          input.horasSono24h,
          input.qualidadeSono ?? 3,
          sintomasJson,
          input.observacoes,
          scoreBase.score_fadiga,
          finalNivel,
          finalStatusOperacional,
          recomendacaoFinal,
          input.apto,
          requiresOperationalReview,
          scoreBase.frat_sugerido_nivel,
          null,
          input.jornadaInicioPrevista,
          null,
          null,
          medsUlt12hDb,
          alcoolUlt12hDb,
          input.riscoAutoavaliado,
          input.horasSono48h,
          wakeTime,
          input.subjectiveFatigueLevel,
          input.sleepinessLevel,
          input.apto,
          dailyRiskLevel,
          requiresOperationalReview,
          'CREW_REPORTED',
          operationalContext.regulatoryProfileId,
          operationalContext.profileCode,
          operationalContext.configRevisionId,
          operationalContext.modelVersion,
          now,
          'TRIPULANTE',
          userId || null,
          now,
          now,
        )
        .run();
    }

    const sync = await sincronizarCheckinComFrms(
      c.env.DB,
      checkinId,
      funcionarioId,
      dataCheckin,
      input.horasSono24h,
      empresaId,
      input.horaAcordou,
    );

    const eventType = existing?.id ? 'CHECKIN_ATUALIZADO' : 'CHECKIN_CRIADO';
    await c.env.DB.prepare(
      `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        empresaId,
        checkinId,
        eventType,
        JSON.stringify({
          score_fadiga: scoreBase.score_fadiga,
          nivel_fadiga: finalNivel,
          status_operacional: finalStatusOperacional,
          computed_risk_level: dailyRiskLevel,
          requires_operational_review: requiresOperationalReview,
          componentes: scoreBase.componentes,
        }),
        now,
      )
      .run();

    await createDailyFatigueAlert({
      db: c.env.DB,
      empresaId,
      tripulanteId: funcionarioId,
      dataCheckin,
      riskLevel: dailyRiskLevel,
      scoreFadiga: scoreBase.score_fadiga,
      horasSono24h: input.horasSono24h,
      wakeTime,
      checkinId,
    });

    if (dailyRiskLevel !== 'normal' || finalNivel === 'LARANJA' || finalNivel === 'VERMELHO') {
      await c.env.DB.prepare(
        `INSERT INTO notificacoes_sistema
           (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at)
           VALUES ('FRMS_CHECKIN_FADIGA', 'ALTA', 'Check-in de fadiga em atenção', ?, 'frms', ?, ?, datetime('now'), datetime('now'))`,
      )
        .bind(
          `Tripulante #${funcionarioId} registrou risco ${dailyRiskLevel} em ${dataCheckin}. Revisão operacional necessária.`,
          JSON.stringify({
            empresa_id: empresaId,
            funcionario_id: funcionarioId,
            checkin_id: checkinId,
            score_fadiga: scoreBase.score_fadiga,
            nivel_fadiga: finalNivel,
            computed_risk_level: dailyRiskLevel,
            requires_operational_review: requiresOperationalReview,
          }),
          empresaId,
        )
        .run();

      await c.env.DB.prepare(
        `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
           VALUES (?, ?, ?, 'GESTOR_NOTIFICADO', ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          empresaId,
          checkinId,
          JSON.stringify({
            nivel_fadiga: finalNivel,
            score_fadiga: scoreBase.score_fadiga,
            computed_risk_level: dailyRiskLevel,
          }),
          now,
        )
        .run();
    }

    await registrarAuditoria({
      db: c.env.DB,
      tabela: 'frms_fadiga_checkin',
      acao: existing?.id ? 'UPDATE' : 'INSERT',
      registro_id: checkinId,
      usuario_id: String(userId || '0'),
      dados_novos: {
        funcionario_id: funcionarioId,
        data_checkin: dataCheckin,
        score_fadiga: scoreBase.score_fadiga,
        nivel_fadiga: finalNivel,
        computed_risk_level: dailyRiskLevel,
        requires_operational_review: requiresOperationalReview,
      },
      ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
      user_agent: c.req.header('user-agent'),
    });

    await registrarAcaoAdmin(c.env.DB, {
      userId,
      action: existing?.id ? 'FRMS_FADIGA_CHECKIN_UPDATE' : 'FRMS_FADIGA_CHECKIN_CREATE',
      module: 'frms_fadiga_checkin',
      success: true,
      metadata: {
        checkin_id: checkinId,
        funcionario_id: funcionarioId,
        data_checkin: dataCheckin,
        nivel_fadiga: finalNivel,
        computed_risk_level: dailyRiskLevel,
      },
      ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || undefined,
      userAgent: c.req.header('user-agent') || undefined,
    });

    const contextoPiloto = await computeContextoPiloto(
      c.env.DB,
      funcionarioId,
      operationalContext.parameters,
    );

    return c.json({
      success: true,
      data: {
        checkin: {
          id: checkinId,
          empresa_id: empresaId,
          funcionario_id: funcionarioId,
          data_checkin: dataCheckin,
          hora_checkin: horaCheckin,
          kss_score: input.kssScore,
          horas_sono: input.horasSono24h,
          horas_sono_48h: input.horasSono48h,
          wake_time: wakeTime,
          qualidade_sono: input.qualidadeSono ?? 3,
          sintomas_json: input.sintomas,
          observacoes: input.observacoes,
          score_fadiga: scoreBase.score_fadiga,
          nivel_fadiga: finalNivel,
          status_operacional: finalStatusOperacional,
          recomendacao: recomendacaoFinal,
          subjective_fatigue_level: input.subjectiveFatigueLevel,
          sleepiness_level: input.sleepinessLevel,
          fit_for_duty: input.apto === 1,
          computed_risk_level: dailyRiskLevel,
          requires_operational_review: requiresOperationalReview,
          apto: input.apto,
          requires_frat_review: requiresOperationalReview,
          frat_sugerido_nivel: scoreBase.frat_sugerido_nivel,
          jornada_inicio_prevista: input.jornadaInicioPrevista,
          meds_ult_12h: input.medsUlt12h,
          alcool_ult_12h: input.alcoolUlt12h,
          risco_autoavaliado: input.riscoAutoavaliado,
        },
        sincronizacao_frms: {
          sincronizado: sync.sincronizado,
          jornada_encontrada: Boolean(sync.jornada_id),
          effectiveness_anterior: sync.effectiveness_anterior ?? null,
          effectiveness_nova: sync.effectiveness_nova ?? null,
          delta: sync.delta_effectiveness ?? null,
          mensagem: sync.sincronizado
            ? 'Fatorização FRMS atualizada com dado real de sono.'
            : 'Sem jornada elegível no dia para sincronizar.',
        },
        contexto_piloto: contextoPiloto,
      },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao registrar check-in de fadiga' }, 500);
  }
});

router.post('/fadiga-checkin/me', async (c) => {
  return router.fetch(new Request(c.req.url.replace('/me', ''), c.req.raw), c.env, c.executionCtx);
});

router.get('/fadiga-checkin/historico', async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const funcionarioId = await resolveFuncionarioId(c);
    if (!funcionarioId) {
      return c.json(
        { success: false, error: 'Funcionário não encontrado para o usuário atual' },
        404,
      );
    }

    const page = Math.max(Number(c.req.query('page') || 1), 1);
    const limit = Math.min(Math.max(Number(c.req.query('limit') || 20), 1), 100);
    const offset = (page - 1) * limit;
    const dataInicio = c.req.query('data_inicio') || todayIso().slice(0, 8) + '01';
    const dataFim = c.req.query('data_fim') || todayIso();

    const requestedFuncionario = (c.req.query('funcionario_id') || '').trim();
    const search = (c.req.query('search') || c.req.query('q') || '').trim().slice(0, 120);
    const canSeeAll = isManagerPlus(c);
    const whereClauses = [
      'ch.empresa_id = ?',
      'ch.deleted_at IS NULL',
      'ch.data_checkin BETWEEN ? AND ?',
    ];
    const whereValues: Array<string | number> = [empresaId, dataInicio, dataFim];

    if (!canSeeAll) {
      whereClauses.push('ch.funcionario_id = ?');
      whereValues.push(funcionarioId);
    } else {
      if (requestedFuncionario) {
        const requestedFuncionarioId = Number(requestedFuncionario);
        if (!Number.isInteger(requestedFuncionarioId) || requestedFuncionarioId <= 0) {
          return c.json({ success: false, error: 'funcionario_id inválido' }, 400);
        }
        whereClauses.push('ch.funcionario_id = ?');
        whereValues.push(requestedFuncionarioId);
      }

      if (search) {
        const searchLower = `%${search.toLowerCase()}%`;
        const searchAsFuncionarioId = Number(search);
        if (Number.isInteger(searchAsFuncionarioId) && searchAsFuncionarioId > 0) {
          whereClauses.push('(ch.funcionario_id = ? OR LOWER(f.nome) LIKE ?)');
          whereValues.push(searchAsFuncionarioId, searchLower);
        } else {
          whereClauses.push('LOWER(f.nome) LIKE ?');
          whereValues.push(searchLower);
        }
      }
    }

    const whereSql = whereClauses.join('\n           AND ');

    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f
           ON f.id = ch.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         WHERE ${whereSql}`,
    )
      .bind(...whereValues)
      .first<{ total: number }>();

    const rows = await c.env.DB.prepare(
      `SELECT ch.*, f.nome AS funcionario_nome
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f
           ON f.id = ch.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         WHERE ${whereSql}
         ORDER BY ch.data_checkin DESC, ch.created_at DESC
         LIMIT ? OFFSET ?`,
    )
      .bind(...whereValues, limit, offset)
      .all<Record<string, unknown>>();

    const resumo = await c.env.DB.prepare(
      `SELECT
           AVG(kss_score) AS media_kss,
           AVG(horas_sono) AS media_sono_horas,
           AVG(score_fadiga) AS media_score_fadiga,
           COUNT(*) AS total_checkins,
           SUM(CASE WHEN nivel_fadiga = 'VERDE' THEN 1 ELSE 0 END) AS verde,
           SUM(CASE WHEN nivel_fadiga = 'AMARELO' THEN 1 ELSE 0 END) AS amarelo,
           SUM(CASE WHEN nivel_fadiga = 'LARANJA' THEN 1 ELSE 0 END) AS laranja,
           SUM(CASE WHEN nivel_fadiga = 'VERMELHO' THEN 1 ELSE 0 END) AS vermelho
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f
           ON f.id = ch.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         WHERE ${whereSql}`,
    )
      .bind(...whereValues)
      .first<Record<string, number>>();

    return c.json({
      success: true,
      data: {
        data: rows.results || [],
        pagination: {
          page,
          limit,
          total: total?.total ?? 0,
          totalPages: Math.max(1, Math.ceil((total?.total ?? 0) / limit)),
        },
        resumo: {
          media_kss: resumo?.media_kss ?? 0,
          media_sono_horas: resumo?.media_sono_horas ?? 0,
          media_score_fadiga: resumo?.media_score_fadiga ?? 0,
          distribuicao_niveis: {
            VERDE: resumo?.verde ?? 0,
            AMARELO: resumo?.amarelo ?? 0,
            LARANJA: resumo?.laranja ?? 0,
            VERMELHO: resumo?.vermelho ?? 0,
          },
          total_checkins: resumo?.total_checkins ?? 0,
        },
      },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao consultar histórico de check-ins' }, 500);
  }
});

router.get('/fadiga-checkin/painel-gestor', requireRole('manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const data = c.req.query('data') || todayIso();

    const painelSectorAccess = await getEmployeeSectorAccess(
      c as unknown as Context<{ Bindings: Env }>,
      empresaId,
    );
    const painelSectorScope = buildFuncionarioScopeWhere(painelSectorAccess, 'f');

    const rows = await c.env.DB.prepare(
      `SELECT
           f.id AS funcionario_id,
           f.nome AS funcionario_nome,
           COALESCE(f.cargo, f.funcao) AS cargo,
           fj.id IS NOT NULL AS tem_jornada_hoje,
           ch.id AS checkin_id,
           ch.kss_score,
           ch.horas_sono,
           ch.score_fadiga,
           ch.nivel_fadiga,
           ch.status_operacional,
           ffj.effectiveness_pct,
           ar.hv_7_dias_min
         FROM funcionarios f
         LEFT JOIN frms_jornada fj
           ON fj.tripulante_id = f.id
          AND fj.data = ?
          AND fj.deleted_at IS NULL
          AND fj.status IN ('ES','TS','TV','EX','RE','SA')
         LEFT JOIN frms_fadiga_checkin ch
           ON ch.funcionario_id = f.id
          AND ch.empresa_id = f.empresa_id
          AND ch.data_checkin = ?
          AND ch.deleted_at IS NULL
         LEFT JOIN frms_fatorizacao_jornada ffj
           ON ffj.jornada_id = fj.id
          AND ffj.deleted_at IS NULL
         LEFT JOIN frms_acumulo_rolling ar
           ON ar.tripulante_id = f.id
          AND ar.data_referencia = ?
          AND ar.deleted_at IS NULL
         WHERE f.empresa_id = ?
           AND f.deleted_at IS NULL
           AND COALESCE(f.ativo, 1) = 1
           AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
           AND COALESCE(f.ativo, 1) = 1
           AND UPPER(COALESCE(f.funcao, '')) IN ('PILOTO','COPILOTO','COMANDANTE')
           AND ${painelSectorScope.clause}
         ORDER BY
           CASE ch.nivel_fadiga
             WHEN 'VERMELHO' THEN 1
             WHEN 'LARANJA' THEN 2
             WHEN 'AMARELO' THEN 3
             WHEN 'VERDE' THEN 4
             ELSE 5
           END,
           CASE WHEN ch.id IS NULL THEN 1 ELSE 0 END,
           f.nome ASC`,
    )
      .bind(data, data, data, empresaId, ...painelSectorScope.bindings)
      .all<Record<string, unknown>>();

    return c.json({ success: true, data: rows.results || [] });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar painel do gestor' }, 500);
  }
});

router.get('/fadiga-checkin/painel', requireRole('manager'), async (c) => {
  try {
    const date = c.req.query('data') || todayIso();
    const response = await router.fetch(
      new Request(`${c.req.url.split('?')[0].replace('/fadiga-checkin/painel', '/daily-fatigue')}?date=${encodeURIComponent(date)}&scope=team`, c.req.raw),
      c.env,
      c.executionCtx,
    );
    const payload = (await response.json()) as {
      success?: boolean;
      data?: { items?: Array<Record<string, unknown>> };
    };
    const items = payload.data?.items || [];
    const total = items.filter((item) => item.status !== 'no_duty').length;
    const critico = items.filter(
      (item) => item.status === 'critical' || item.status === 'unfit_for_duty',
    ).length;
    const atencao = items.filter((item) => item.status === 'attention').length;
    const naoPreenchida = items.filter((item) => item.status === 'not_submitted').length;
    const mediaScoreRaw = items
      .map((item) => Number(item.score_fadiga || 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    return c.json({
      success: true,
      data: {
        data: date,
        resumo: {
          total_checkins: total,
          critico,
          alto: atencao,
          nao_preenchida: naoPreenchida,
          media_score: mediaScoreRaw.length
            ? mediaScoreRaw.reduce((acc, curr) => acc + curr, 0) / mediaScoreRaw.length
            : 0,
        },
        itens: items,
      },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar painel diário de fadiga' }, 500);
  }
});

router.get('/fadiga-checkin/analytics', requireRole('manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const dataInicio =
      c.req.query('data_inicio') || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const dataFim = c.req.query('data_fim') || todayIso();

    const analyticsSectorAccess = await getEmployeeSectorAccess(
      c as unknown as Context<{ Bindings: Env }>,
      empresaId,
    );
    const analyticsSectorScope = buildFuncionarioScopeWhere(analyticsSectorAccess, 'f');

    const evolucaoDiaria = await c.env.DB.prepare(
      `SELECT
           ch.data_checkin AS data,
           AVG(ch.kss_score) AS media_kss,
           AVG(ch.horas_sono) AS media_sono,
           AVG(ch.score_fadiga) AS media_score,
           COUNT(*) AS total_checkins
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f ON f.id = ch.funcionario_id AND f.deleted_at IS NULL
         WHERE ch.empresa_id = ?
           AND ch.deleted_at IS NULL
           AND ch.data_checkin BETWEEN ? AND ?
           AND ${analyticsSectorScope.clause}
         GROUP BY ch.data_checkin
         ORDER BY ch.data_checkin`,
    )
      .bind(empresaId, dataInicio, dataFim, ...analyticsSectorScope.bindings)
      .all<Record<string, unknown>>();

    const distribuicao = await c.env.DB.prepare(
      `SELECT
           SUM(CASE WHEN ch.nivel_fadiga = 'VERDE' THEN 1 ELSE 0 END) AS verde,
           SUM(CASE WHEN ch.nivel_fadiga = 'AMARELO' THEN 1 ELSE 0 END) AS amarelo,
           SUM(CASE WHEN ch.nivel_fadiga = 'LARANJA' THEN 1 ELSE 0 END) AS laranja,
           SUM(CASE WHEN ch.nivel_fadiga = 'VERMELHO' THEN 1 ELSE 0 END) AS vermelho
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f ON f.id = ch.funcionario_id AND f.deleted_at IS NULL
         WHERE ch.empresa_id = ?
           AND ch.deleted_at IS NULL
           AND ch.data_checkin BETWEEN ? AND ?
           AND ${analyticsSectorScope.clause}`,
    )
      .bind(empresaId, dataInicio, dataFim, ...analyticsSectorScope.bindings)
      .first<Record<string, number>>();

    const rankingAtencao = await c.env.DB.prepare(
      `SELECT
           f.nome,
           COALESCE(f.cargo, f.funcao) AS cargo,
           SUM(CASE WHEN ch.nivel_fadiga IN ('LARANJA', 'VERMELHO') THEN 1 ELSE 0 END) AS ocorrencias_laranja_vermelho,
           AVG(ch.kss_score) AS media_kss
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f ON f.id = ch.funcionario_id AND f.deleted_at IS NULL
         WHERE ch.empresa_id = ?
           AND ch.deleted_at IS NULL
           AND ch.data_checkin BETWEEN ? AND ?
           AND ${analyticsSectorScope.clause}
         GROUP BY f.id, f.nome, f.cargo, f.funcao
         ORDER BY ocorrencias_laranja_vermelho DESC, media_kss DESC
         LIMIT 10`,
    )
      .bind(empresaId, dataInicio, dataFim, ...analyticsSectorScope.bindings)
      .all<Record<string, unknown>>();

    const correlacaoSonoKss = await c.env.DB.prepare(
      `SELECT ch.horas_sono, ch.kss_score
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f ON f.id = ch.funcionario_id AND f.deleted_at IS NULL
         WHERE ch.empresa_id = ?
           AND ch.deleted_at IS NULL
           AND ch.data_checkin BETWEEN ? AND ?
           AND ${analyticsSectorScope.clause}`,
    )
      .bind(empresaId, dataInicio, dataFim, ...analyticsSectorScope.bindings)
      .all<Record<string, unknown>>();

    const correlacaoScoreEffectiveness = await c.env.DB.prepare(
      `SELECT
           ch.data_checkin AS data,
           ch.score_fadiga,
           ffj.effectiveness_pct,
           f.nome AS tripulante_nome
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f ON f.id = ch.funcionario_id AND f.deleted_at IS NULL
         JOIN frms_jornada fj
           ON fj.tripulante_id = ch.funcionario_id
          AND fj.data = ch.data_checkin
          AND fj.deleted_at IS NULL
         JOIN frms_fatorizacao_jornada ffj ON ffj.jornada_id = fj.id AND ffj.deleted_at IS NULL
         WHERE ch.empresa_id = ?
           AND ch.deleted_at IS NULL
           AND ch.data_checkin BETWEEN ? AND ?
           AND ${analyticsSectorScope.clause}`,
    )
      .bind(empresaId, dataInicio, dataFim, ...analyticsSectorScope.bindings)
      .all<Record<string, unknown>>();

    return c.json({
      success: true,
      data: {
        evolucao_diaria: evolucaoDiaria.results || [],
        distribuicao_niveis_periodo: {
          VERDE: distribuicao?.verde ?? 0,
          AMARELO: distribuicao?.amarelo ?? 0,
          LARANJA: distribuicao?.laranja ?? 0,
          VERMELHO: distribuicao?.vermelho ?? 0,
        },
        ranking_atencao: rankingAtencao.results || [],
        correlacao_sono_kss: correlacaoSonoKss.results || [],
        correlacao_score_effectiveness: correlacaoScoreEffectiveness.results || [],
      },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar analytics de fadiga' }, 500);
  }
});

router.patch('/fadiga-checkin/:id/resposta-gestor', requireRole('manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const gestorId = Number(c.get('userId') || 0);
    const { id } = c.req.param();
    const body = await c.req.json();
    const parsed = GestorRespostaSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ success: false, error: parsed.error.flatten() }, 400);
    }

    const checkin = await c.env.DB.prepare(
      `SELECT id, funcionario_id
         FROM frms_fadiga_checkin
         WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
         LIMIT 1`,
    )
      .bind(id, empresaId)
      .first<{ id: string; funcionario_id: number }>();

    if (!checkin) {
      return c.json({ success: false, error: 'Check-in não encontrado' }, 404);
    }

    await c.env.DB.prepare(
      `INSERT INTO frms_fadiga_evento (id, empresa_id, checkin_id, tipo, payload_json, created_at)
         VALUES (?, ?, ?, 'RESPOSTA_GESTOR', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        empresaId,
        checkin.id,
        JSON.stringify({ resposta: parsed.data.resposta, gestor_id: gestorId }),
        nowSql(),
      )
      .run();

    await c.env.DB.prepare(
      `INSERT INTO notificacoes_sistema
         (tipo, prioridade, titulo, mensagem, grupo, dados, empresa_id, created_at, updated_at)
         VALUES ('FRMS_FEEDBACK_GESTOR', 'MEDIA', 'Resposta do gestor ao check-in de fadiga', ?, 'frms', ?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        parsed.data.resposta,
        JSON.stringify({
          empresa_id: empresaId,
          checkin_id: checkin.id,
          funcionario_id: checkin.funcionario_id,
          gestor_id: gestorId,
        }),
        empresaId,
      )
      .run();

    return c.json({
      success: true,
      data: { checkin_id: checkin.id, resposta: parsed.data.resposta },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao registrar resposta do gestor' }, 500);
  }
});

router.get('/fadiga-checkin/export', requireRole('manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const dataInicio = c.req.query('data_inicio') || todayIso().slice(0, 8) + '01';
    const dataFim = c.req.query('data_fim') || todayIso();

    const exportSectorAccess = await getEmployeeSectorAccess(
      c as unknown as Context<{ Bindings: Env }>,
      empresaId,
    );
    const exportSectorScope = buildFuncionarioScopeWhere(exportSectorAccess, 'f');

    const rows = await c.env.DB.prepare(
      `SELECT
           ch.data_checkin,
           f.nome AS funcionario_nome,
           ch.kss_score,
           ch.horas_sono,
           ch.qualidade_sono,
           ch.score_fadiga,
           ch.nivel_fadiga,
           ch.status_operacional,
           ch.requires_frat_review,
           ch.frat_sugerido_nivel,
           ch.associado_frat_avaliacao_id,
           ch.observacoes
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f ON f.id = ch.funcionario_id AND f.deleted_at IS NULL
         WHERE ch.empresa_id = ?
           AND ch.deleted_at IS NULL
           AND ch.data_checkin BETWEEN ? AND ?
           AND ${exportSectorScope.clause}
         ORDER BY ch.data_checkin DESC, f.nome ASC`,
    )
      .bind(empresaId, dataInicio, dataFim, ...exportSectorScope.bindings)
      .all<Record<string, unknown>>();

    const header = [
      'data_checkin',
      'funcionario_nome',
      'kss_score',
      'horas_sono',
      'qualidade_sono',
      'score_fadiga',
      'nivel_fadiga',
      'status_operacional',
      'requires_frat_review',
      'frat_sugerido_nivel',
      'associado_frat_avaliacao_id',
      'observacoes',
    ];

    const lines = [header.map(csvEscape).join(',')];
    for (const row of rows.results || []) {
      lines.push(
        [
          row.data_checkin,
          row.funcionario_nome,
          row.kss_score,
          row.horas_sono,
          row.qualidade_sono,
          row.score_fadiga,
          row.nivel_fadiga,
          row.status_operacional,
          row.requires_frat_review,
          row.frat_sugerido_nivel,
          row.associado_frat_avaliacao_id,
          row.observacoes,
        ]
          .map(csvEscape)
          .join(','),
      );
    }

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header(
      'Content-Disposition',
      `attachment; filename="frms-fadiga-${dataInicio}-${dataFim}.csv"`,
    );
    return c.body(lines.join('\n'));
  } catch {
    return c.json({ success: false, error: 'Erro ao exportar check-ins de fadiga' }, 500);
  }
});

router.get('/fadiga-checkin/frat-prefill', async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const date = c.req.query('date') || todayIso();
    const funcionarioIdQuery = c.req.query('funcionario_id');
    const funcionarioId = funcionarioIdQuery
      ? Number(funcionarioIdQuery)
      : await resolveFuncionarioId(c);

    if (!funcionarioId) {
      return c.json({ success: false, error: 'funcionario_id não encontrado' }, 400);
    }

    const row = await c.env.DB.prepare(
      `SELECT *
         FROM frms_fadiga_checkin
         WHERE empresa_id = ?
           AND funcionario_id = ?
           AND data_checkin = ?
           AND deleted_at IS NULL
         LIMIT 1`,
    )
      .bind(empresaId, funcionarioId, date)
      .first<{
        id: string;
        score_fadiga: number;
        nivel_fadiga: 'VERDE' | 'AMARELO' | 'LARANJA' | 'VERMELHO';
        recomendacao: string;
        kss_score: number;
        horas_sono: number;
        qualidade_sono: number;
        sintomas_json: string | null;
      }>();

    if (!row) {
      return c.json({ success: true, data: null });
    }

    const suggestion = buildFratSuggestion({
      score: {
        scoreFadiga: row.score_fadiga,
        nivelFadiga: mapNivelToLegacy(row.nivel_fadiga),
        statusOperacional: (row.nivel_fadiga === 'VERDE' || row.nivel_fadiga === 'AMARELO'
          ? 'APTO'
          : row.nivel_fadiga === 'LARANJA'
            ? 'RESTRITO'
            : 'NAO_APTO') as 'APTO' | 'RESTRITO' | 'NAO_APTO',
        recomendacao: row.recomendacao,
        apto: row.nivel_fadiga === 'VERDE' || row.nivel_fadiga === 'AMARELO',
        requiresFratReview: row.nivel_fadiga === 'VERMELHO',
      },
      kssScore: row.kss_score,
      horasSono: row.horas_sono,
      qualidadeSono: row.qualidade_sono,
      sintomas: row.sintomas_json
        ? Object.keys(JSON.parse(row.sintomas_json) as Record<string, unknown>)
        : [],
    });

    return c.json({
      success: true,
      data: {
        checkin_id: row.id,
        funcionario_id: funcionarioId,
        data_checkin: date,
        suggestion,
      },
    });
  } catch {
    return c.json({ success: false, error: 'Erro ao gerar prefill FRAT' }, 500);
  }
});

export default router;
