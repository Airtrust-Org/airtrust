import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../types';
import { auth, requireRole } from '../middleware/auth';
import { getEmpresaId } from '../middleware/tenant';
import { registrarAuditoria } from '../utils/auditoria';
import {
  calcularHorasSono,
  calcularScoreFadiga,
  type FadigaScoreConfig,
  type FadigaScoreInput,
} from '../lib/frms/fadiga-score';
import { sincronizarCheckinComFrms } from '../lib/frms/fadiga-frms-sync';
import { buildFratSuggestion } from '../lib/frms/fadiga-frat-bridge';
import {
  CheckinCreateSchema,
  GestorRespostaSchema,
  type CheckinCreateInput,
} from './frms-fadiga-checkin.schema';

const router = new Hono<{ Bindings: Env; Variables: { userId?: string; userRole?: string } }>();
router.use('*', auth());

type FrmsContext = Context<{
  Bindings: Env;
  Variables: { userId?: string; userRole?: string };
}>;

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

function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function isManagerPlus(c: FrmsContext): boolean {
  const role = String(c.get('userRole') || '').toUpperCase();
  return role === 'ADMIN' || role === 'MANAGER' || role === 'GESTOR';
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
  const userId = Number(c.get('userId') || 0);
  if (!userId) return null;

  const asFuncionario = await c.env.DB.prepare(
    `SELECT id
       FROM funcionarios
      WHERE id = ?
        AND deleted_at IS NULL
        AND COALESCE(ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
      LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: number }>();

  if (asFuncionario?.id) return asFuncionario.id;

  const asUsuario = await c.env.DB.prepare(
    `SELECT f.id
       FROM usuarios u
       JOIN funcionarios f ON f.id = u.funcionario_id
      WHERE u.id = ?
        AND (u.deleted_at IS NULL OR u.deleted_at = 0)
        AND f.deleted_at IS NULL
        AND COALESCE(f.ativo, 1) = 1
        AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: number }>();

  return asUsuario?.id ?? null;
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

function buildScoreInput(input: CheckinCreateInput, horasSono: number): FadigaScoreInput {
  const sintomasJson: Record<string, number> | null = input.sintomas
    ? Object.entries(input.sintomas).reduce<Record<string, number>>((acc, [key, value]) => {
        if (key !== 'descricao_dor' && typeof value === 'number') {
          acc[key] = value;
        }
        return acc;
      }, {})
    : null;

  return {
    kss_score: input.kss_score,
    horas_sono: horasSono,
    qualidade_sono: input.qualidade_sono,
    sintomas_json: sintomasJson,
    apto: input.apto,
    meds_ult_12h: input.meds_ult_12h,
    alcool_ult_12h: input.alcool_ult_12h,
  };
}

async function computeContextoPiloto(
  db: D1Database,
  funcionarioId: number,
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

  return {
    acumulo_7d_horas: Number(((rolling?.hv_7_dias_min ?? 0) / 60).toFixed(1)),
    acumulo_28d_horas: Number(((rolling?.hv_28_dias_min ?? 0) / 60).toFixed(1)),
    limite_7d_horas: 45,
    limite_28d_horas: 90,
    effectiveness_hoje: effectiveness?.effectiveness_pct ?? null,
    media_kss_7d: media7d?.media_kss ?? null,
    media_sono_7d: media7d?.media_sono ?? null,
    alertas_ativos: alertasAtivos?.total ?? 0,
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

    const input = parsed.data;
    const dataCheckin = input.data_checkin || todayIso();
    const horasSono = calcularHorasSono(input.hora_dormiu, input.hora_acordou);

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

    const score = calcularScoreFadiga(buildScoreInput(input, horasSono), scoreConfig);

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
               origem_registro = 'TRIPULANTE',
               updated_at = ?
           WHERE id = ?`,
      )
        .bind(
          horaCheckin,
          input.kss_score,
          horasSono,
          input.qualidade_sono,
          sintomasJson,
          input.observacoes ?? null,
          score.score_fadiga,
          score.nivel_fadiga,
          score.status_operacional,
          score.recomendacao,
          input.apto,
          score.requires_frat_review,
          score.frat_sugerido_nivel,
          input.jornada_inicio_prevista ?? null,
          null,
          null,
          input.meds_ult_12h,
          input.alcool_ult_12h,
          input.risco_autoavaliado ?? null,
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
             origem_registro, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          checkinId,
          empresaId,
          funcionarioId,
          dataCheckin,
          horaCheckin,
          input.kss_score,
          horasSono,
          input.qualidade_sono,
          sintomasJson,
          input.observacoes ?? null,
          score.score_fadiga,
          score.nivel_fadiga,
          score.status_operacional,
          score.recomendacao,
          input.apto,
          score.requires_frat_review,
          score.frat_sugerido_nivel,
          null,
          input.jornada_inicio_prevista ?? null,
          null,
          null,
          input.meds_ult_12h,
          input.alcool_ult_12h,
          input.risco_autoavaliado ?? null,
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
      horasSono,
      empresaId,
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
          score_fadiga: score.score_fadiga,
          nivel_fadiga: score.nivel_fadiga,
          status_operacional: score.status_operacional,
          componentes: score.componentes,
        }),
        now,
      )
      .run();

    if (score.nivel_fadiga === 'LARANJA' || score.nivel_fadiga === 'VERMELHO') {
      await c.env.DB.prepare(
        `INSERT INTO notificacoes_sistema
           (tipo, prioridade, titulo, mensagem, grupo, dados, created_at, updated_at)
           VALUES ('FRMS_CHECKIN_FADIGA', 'ALTA', 'Check-in de fadiga em atenção', ?, 'frms', ?, datetime('now'), datetime('now'))`,
      )
        .bind(
          `Tripulante #${funcionarioId} registrou nível ${score.nivel_fadiga} em ${dataCheckin}.`,
          JSON.stringify({
            empresa_id: empresaId,
            funcionario_id: funcionarioId,
            checkin_id: checkinId,
            score_fadiga: score.score_fadiga,
            nivel_fadiga: score.nivel_fadiga,
          }),
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
          JSON.stringify({ nivel_fadiga: score.nivel_fadiga, score_fadiga: score.score_fadiga }),
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
        score_fadiga: score.score_fadiga,
        nivel_fadiga: score.nivel_fadiga,
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
        nivel_fadiga: score.nivel_fadiga,
      },
      ipAddress: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || undefined,
      userAgent: c.req.header('user-agent') || undefined,
    });

    const contextoPiloto = await computeContextoPiloto(c.env.DB, funcionarioId);

    return c.json({
      success: true,
      data: {
        checkin: {
          id: checkinId,
          empresa_id: empresaId,
          funcionario_id: funcionarioId,
          data_checkin: dataCheckin,
          hora_checkin: horaCheckin,
          kss_score: input.kss_score,
          horas_sono: horasSono,
          qualidade_sono: input.qualidade_sono,
          sintomas_json: input.sintomas,
          observacoes: input.observacoes ?? null,
          score_fadiga: score.score_fadiga,
          nivel_fadiga: score.nivel_fadiga,
          status_operacional: score.status_operacional,
          recomendacao: score.recomendacao,
          apto: input.apto,
          requires_frat_review: score.requires_frat_review,
          frat_sugerido_nivel: score.frat_sugerido_nivel,
          jornada_inicio_prevista: input.jornada_inicio_prevista ?? null,
          meds_ult_12h: input.meds_ult_12h,
          alcool_ult_12h: input.alcool_ult_12h,
          risco_autoavaliado: input.risco_autoavaliado ?? null,
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

    const requestedFuncionario = c.req.query('funcionario_id');
    const canSeeAll = isManagerPlus(c);
    const targetFuncionarioId =
      canSeeAll && requestedFuncionario ? Number(requestedFuncionario) : funcionarioId;

    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total
         FROM frms_fadiga_checkin
         WHERE empresa_id = ? AND deleted_at IS NULL
           AND funcionario_id = ?
           AND data_checkin BETWEEN ? AND ?`,
    )
      .bind(empresaId, targetFuncionarioId, dataInicio, dataFim)
      .first<{ total: number }>();

    const rows = await c.env.DB.prepare(
      `SELECT ch.*, f.nome AS funcionario_nome
         FROM frms_fadiga_checkin ch
         JOIN funcionarios f
           ON f.id = ch.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
         WHERE ch.empresa_id = ?
           AND ch.deleted_at IS NULL
           AND ch.funcionario_id = ?
           AND ch.data_checkin BETWEEN ? AND ?
         ORDER BY ch.data_checkin DESC, ch.created_at DESC
         LIMIT ? OFFSET ?`,
    )
      .bind(empresaId, targetFuncionarioId, dataInicio, dataFim, limit, offset)
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
         FROM frms_fadiga_checkin
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND funcionario_id = ?
           AND data_checkin BETWEEN ? AND ?`,
    )
      .bind(empresaId, targetFuncionarioId, dataInicio, dataFim)
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
      .bind(data, data, data, empresaId)
      .all<Record<string, unknown>>();

    return c.json({ success: true, data: rows.results || [] });
  } catch {
    return c.json({ success: false, error: 'Erro ao carregar painel do gestor' }, 500);
  }
});

router.get('/fadiga-checkin/analytics', requireRole('manager'), async (c) => {
  try {
    const empresaId = getEmpresaId(c as unknown as Context<{ Bindings: Env }>);
    const dataInicio =
      c.req.query('data_inicio') || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const dataFim = c.req.query('data_fim') || todayIso();

    const evolucaoDiaria = await c.env.DB.prepare(
      `SELECT
           data_checkin AS data,
           AVG(kss_score) AS media_kss,
           AVG(horas_sono) AS media_sono,
           AVG(score_fadiga) AS media_score,
           COUNT(*) AS total_checkins
         FROM frms_fadiga_checkin
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND data_checkin BETWEEN ? AND ?
         GROUP BY data_checkin
         ORDER BY data_checkin`,
    )
      .bind(empresaId, dataInicio, dataFim)
      .all<Record<string, unknown>>();

    const distribuicao = await c.env.DB.prepare(
      `SELECT
           SUM(CASE WHEN nivel_fadiga = 'VERDE' THEN 1 ELSE 0 END) AS verde,
           SUM(CASE WHEN nivel_fadiga = 'AMARELO' THEN 1 ELSE 0 END) AS amarelo,
           SUM(CASE WHEN nivel_fadiga = 'LARANJA' THEN 1 ELSE 0 END) AS laranja,
           SUM(CASE WHEN nivel_fadiga = 'VERMELHO' THEN 1 ELSE 0 END) AS vermelho
         FROM frms_fadiga_checkin
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND data_checkin BETWEEN ? AND ?`,
    )
      .bind(empresaId, dataInicio, dataFim)
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
         GROUP BY f.id, f.nome, f.cargo, f.funcao
         ORDER BY ocorrencias_laranja_vermelho DESC, media_kss DESC
         LIMIT 10`,
    )
      .bind(empresaId, dataInicio, dataFim)
      .all<Record<string, unknown>>();

    const correlacaoSonoKss = await c.env.DB.prepare(
      `SELECT horas_sono, kss_score
         FROM frms_fadiga_checkin
         WHERE empresa_id = ?
           AND deleted_at IS NULL
           AND data_checkin BETWEEN ? AND ?`,
    )
      .bind(empresaId, dataInicio, dataFim)
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
           AND ch.data_checkin BETWEEN ? AND ?`,
    )
      .bind(empresaId, dataInicio, dataFim)
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
         (tipo, prioridade, titulo, mensagem, grupo, dados, created_at, updated_at)
         VALUES ('FRMS_FEEDBACK_GESTOR', 'MEDIA', 'Resposta do gestor ao check-in de fadiga', ?, 'frms', ?, datetime('now'), datetime('now'))`,
    )
      .bind(
        parsed.data.resposta,
        JSON.stringify({
          checkin_id: checkin.id,
          funcionario_id: checkin.funcionario_id,
          gestor_id: gestorId,
        }),
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
         ORDER BY ch.data_checkin DESC, f.nome ASC`,
    )
      .bind(empresaId, dataInicio, dataFim)
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
