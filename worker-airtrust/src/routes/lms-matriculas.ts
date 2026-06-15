/**
 * LMS — Rotas de Matrículas e Progresso SCORM
 *
 * - Matrícula individual e em lote
 * - Listagem por funcionário e por curso
 * - Endpoint de commit SCORM (runtime state)
 * - Geração automática de qualificação ao concluir
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { hasRole, requireRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import { createLmsQualificationOnCompletion } from '../services/lms-qualification';
import {
  canReuseMatriculaCycle,
  ensureMatriculaCycle,
  hasActiveMatriculaCycle,
  resetMatriculaForNewCycle,
  syncMatriculaCycleFromMatricula,
} from '../services/lms-matricula-cycle';
import { logAudit } from '../utils/db';
import { sendEmail } from '../lib/email';
import type { Env } from '../types';
import { getEmployeeSectorAccess } from '../services/employee-sector-access';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

function getCallerFuncionarioId(c: Context): number | null {
  const raw = c.get('funcionarioId' as never) as unknown;
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : null;
}

/**
 * Versão async: tenta JWT first, se null faz lookup no DB via userId.
 * Resolve o caso em que o vínculo usuario→funcionario foi criado após o JWT ter sido gerado.
 */
async function resolveCallerFuncionarioId(c: Context, db: D1Database): Promise<number | null> {
  const fromJwt = getCallerFuncionarioId(c);
  if (fromJwt) return fromJwt;

  // Fallback: userId está sempre no JWT; busca funcionario_id atual no DB
  const userId = getCallerUserId(c);
  if (!userId) return null;

  const row = await db
    .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(userId)
    .first<{ funcionario_id: number | null }>();

  const parsed = row?.funcionario_id;
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : null;
}

function getCallerUserId(c: Context): number | undefined {
  const raw = c.get('userId' as never) as unknown;
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : undefined;
}

async function logLmsMatriculaAudit(
  db: D1Database,
  c: Context,
  params: {
    action: string;
    matriculaId: number;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  },
) {
  try {
    await logAudit(db, {
      userId: getCallerUserId(c),
      action: params.action,
      entityType: 'lms_matriculas',
      entityId: params.matriculaId,
      oldValues: params.oldValues,
      newValues: params.newValues,
      ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    });
  } catch (error) {
    console.warn('[LMS] Falha ao registrar audit log de matrícula:', error);
  }
}

async function createLmsInAppNotification(
  db: D1Database,
  params: {
    funcionarioId: number;
    empresaId: number;
    tipo: string;
    titulo: string;
    mensagem: string;
    referenciaId: number;
    referenciaTipo: string;
  },
) {
  const createdAt = new Date().toISOString();
  const notificationId = [
    'lms',
    params.tipo,
    params.empresaId,
    params.funcionarioId,
    params.referenciaTipo,
    params.referenciaId,
    createdAt.slice(0, 10),
  ].join(':');

  await db
    .prepare(
      `INSERT OR IGNORE INTO notificacoes_inapp (
         id, funcionario_id, empresa_id, tipo, titulo, mensagem, referencia_id, referencia_tipo, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      notificationId,
      String(params.funcionarioId),
      params.empresaId,
      params.tipo,
      params.titulo,
      params.mensagem,
      String(params.referenciaId),
      params.referenciaTipo,
      createdAt,
    )
    .run();
}

/**
 * Envia e-mail de notificação de matrícula ao funcionário.
 * Fire-and-forget: nunca lança exceção, loga warnings em caso de falha.
 */
async function sendMatriculaEmail(
  env: Env,
  db: D1Database,
  params: {
    funcionarioId: number;
    empresaId: number;
    cursoId: number;
    cursoTitulo: string;
    dataExpiracao?: string | null;
    isNovoCiclo: boolean;
  },
): Promise<void> {
  try {
    const funcionario = await db
      .prepare(
        `SELECT nome, email FROM funcionarios
          WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(params.funcionarioId, params.empresaId)
      .first<{ nome: string; email: string | null }>();

    if (!funcionario?.email) {
      console.info(
        '[lms-matricula] Email não encontrado para funcionario',
        params.funcionarioId,
      );
      return;
    }

    const frontendUrl = String(env.FRONTEND_URL || 'https://airtrust.online').replace(/\/$/, '');
    const cursoUrl = `${frontendUrl}/lms/cursos/${params.cursoId}`;

    const nomeAluno = funcionario.nome || `Funcionário ${params.funcionarioId}`;
    const actionLabel = params.isNovoCiclo ? 'Novo ciclo de treinamento' : 'Novo treinamento';
    const subject = `${actionLabel}: ${params.cursoTitulo}`;

    const validadeLinha = params.dataExpiracao
      ? `<p><strong>Prazo de conclusão:</strong> ${params.dataExpiracao.split('-').reverse().join('/')}</p>`
      : '';

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.6;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1e40af;margin-bottom:16px">${actionLabel}</h2>
        <p>Olá <strong>${nomeAluno}</strong>,</p>
        <p>Você foi matriculado no curso:</p>
        <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:12px 16px;margin:12px 0;border-radius:4px">
          <p style="font-size:16px;font-weight:600;margin:0;color:#1e3a5f">${params.cursoTitulo}</p>
        </div>
        ${validadeLinha}
        <p>Para acessar o curso, clique no botão abaixo:</p>
        <p style="margin:24px 0">
          <a href="${cursoUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            Acessar curso
          </a>
        </p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">
          Este e-mail foi enviado automaticamente pela plataforma AirTrust.
        </p>
      </div>`;

    const textContent = [
      `${actionLabel}: ${params.cursoTitulo}`,
      '',
      `Olá ${nomeAluno},`,
      '',
      `Você foi matriculado no curso: ${params.cursoTitulo}`,
      params.dataExpiracao
        ? `Prazo de conclusão: ${params.dataExpiracao.split('-').reverse().join('/')}`
        : '',
      '',
      `Acesse o curso em: ${cursoUrl}`,
      '',
      'Este e-mail foi enviado automaticamente pela plataforma AirTrust.',
    ]
      .filter(Boolean)
      .join('\n');

    const sent = await sendEmail(env, {
      to: [{ email: funcionario.email, name: nomeAluno }],
      subject,
      textContent,
      htmlContent,
    });

    if (sent) {
      console.log(
        '[lms-matricula] Email enviado para',
        funcionario.email,
        'curso',
        params.cursoId,
      );
    }
  } catch (err) {
    console.warn('[lms-matricula] Falha ao enviar email de matrícula:', err);
  }
}

async function findLatestMatriculaForFuncionario(
  db: D1Database,
  params: { cursoId: number; funcionarioId: number; empresaId: number },
) {
  return db
    .prepare(
      `SELECT id, status, deleted_at
         FROM lms_matriculas
        WHERE curso_id = ?
          AND funcionario_id = ?
          AND empresa_id = ?
        ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, id DESC
        LIMIT 1`,
    )
    .bind(params.cursoId, params.funcionarioId, params.empresaId)
    .first<{ id: number; status: string; deleted_at: string | null }>();
}

async function readMatriculaForCourseList(
  db: D1Database,
  params: { matriculaId: number; empresaId: number },
) {
  return db
    .prepare(
      `SELECT m.*, f.nome AS funcionario_nome, f.matricula AS funcionario_matricula
         FROM lms_matriculas m
         LEFT JOIN funcionarios f
           ON f.id = m.funcionario_id
          AND f.deleted_at IS NULL
          AND COALESCE(f.ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
        WHERE m.id = ?
          AND m.empresa_id = ?
          AND m.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(params.matriculaId, params.empresaId)
    .first<Record<string, unknown>>();
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const MatriculaCreateSchema = z.object({
  funcionario_id: z.number().int().positive(),
  curso_id: z.number().int().positive(),
  data_expiracao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  observacoes: z.string().optional().nullable(),
});

const MatriculaLoteSchema = z.object({
  funcionario_ids: z.array(z.number().int().positive()).min(1).max(200),
  curso_id: z.number().int().positive(),
  data_expiracao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  observacoes: z.string().optional().nullable(),
});

const ScormCommitSchema = z.object({
  matricula_id: z.number().int().positive(),
  // SCORM 1.2
  lesson_status: z.string().optional().nullable(),
  // SCORM 2004
  completion_status: z.string().optional().nullable(),
  success_status: z.string().optional().nullable(),
  // Scores
  score_raw: z.number().optional().nullable(),
  score_max: z.number().optional().nullable(),
  score_min: z.number().optional().nullable(),
  score_scaled: z.number().optional().nullable(),
  // Tempo
  session_time: z.string().optional().nullable(),
  total_time: z.string().optional().nullable(),
  // Dados de estado
  suspend_data: z.string().max(65535).optional().nullable(),
  launch_data: z.string().optional().nullable(),
  // CMI completo (JSON stringified)
  cmi_json: z.string().optional().nullable(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePositiveInt(val: string | null | undefined, fallback: number) {
  const n = parseInt(val ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isMatriculaUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes('UNIQUE constraint failed') && message.includes('lms_matriculas');
}

function clampPct(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function extractProgressPctFromCmiJson(cmiJson: string | null | undefined): number | null {
  if (!cmiJson) return null;
  try {
    const parsed = JSON.parse(cmiJson) as Record<string, unknown>;

    // SCORM 2004 native progress_measure: range 0..1
    const progressMeasure = Number(parsed['cmi.progress_measure']);
    if (Number.isFinite(progressMeasure) && progressMeasure >= 0 && progressMeasure <= 1) {
      return clampPct(progressMeasure * 100);
    }

    const locationRaw =
      (parsed['cmi.location'] as string | undefined) ??
      (parsed['cmi.core.lesson_location'] as string | undefined);
    if (!locationRaw || typeof locationRaw !== 'string') return null;

    // Common patterns: "10/76" or "10 of 76"
    const slashMatch = locationRaw.match(/(\d+)\s*\/\s*(\d+)/);
    if (slashMatch) {
      const current = Number(slashMatch[1]);
      const total = Number(slashMatch[2]);
      if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
        return clampPct((current / total) * 100);
      }
    }

    const ofMatch = locationRaw.match(/(\d+)\s+of\s+(\d+)/i);
    if (ofMatch) {
      const current = Number(ofMatch[1]);
      const total = Number(ofMatch[2]);
      if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
        return clampPct((current / total) * 100);
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Verifica se o status SCORM indica conclusão com sucesso */
function isScormSuccess(data: z.infer<typeof ScormCommitSchema>): boolean {
  const ls = (data.lesson_status ?? '').toLowerCase();
  const cs = (data.completion_status ?? '').toLowerCase();
  const ss = (data.success_status ?? '').toLowerCase();
  // SCORM 1.2
  if (ls === 'passed' || ls === 'completed') return true;
  // SCORM 2004
  if (cs === 'completed' && (ss === 'passed' || ss === 'unknown')) return true;
  return false;
}

/** Verifica se o status indica falha */
function isScormFailed(data: z.infer<typeof ScormCommitSchema>): boolean {
  const ls = (data.lesson_status ?? '').toLowerCase();
  const ss = (data.success_status ?? '').toLowerCase();
  return ls === 'failed' || ss === 'failed';
}

// ── Treinamentos EAD enriquecidos (dashboard do aluno/instrutor) ─────────────

app.get('/minhas-ead', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = await resolveCallerFuncionarioId(c, db);

  if (!funcionarioId) {
    return c.json({ success: true, data: [] });
  }

  const rows = await db
    .prepare(
      `
      SELECT
        m.id,
        m.curso_id,
        m.funcionario_id,
        m.status,
        m.progresso_pct,
        m.score_final,
        m.data_matricula,
        m.data_inicio,
        m.data_conclusao,
        m.data_expiracao,
        m.qualificacao_historico_id,
        c.titulo,
        c.categoria,
        c.carga_horaria_minutos,
        c.thumbnail_r2_key,
        c.tipo_conteudo,
        c.scorm_versao,
        c.publicado,
        c.gerar_qualificacao_ao_concluir,
        CASE
          WHEN qh.id IS NOT NULL AND qh.data_conclusao IS NOT NULL
          THEN date(qh.data_conclusao, '+' || COALESCE(qt.validade, 12) || ' months')
          ELSE NULL
        END AS data_vencimento_qualificacao,
        CASE WHEN qh.certificado_arquivo_id IS NOT NULL THEN 1 ELSE 0 END AS tem_certificado
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id
      LEFT JOIN qualificacoes_historico qh
        ON qh.id = m.qualificacao_historico_id
        AND qh.deleted_at IS NULL
      LEFT JOIN qualificacoes_tipos qt
        ON qt.id = qh.qualificacao_id
        AND qt.deleted_at IS NULL
      WHERE m.funcionario_id = ?
        AND m.empresa_id = ?
        AND m.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND m.status != 'CANCELADO'
      ORDER BY
        CASE m.status
          WHEN 'EM_ANDAMENTO' THEN 1
          WHEN 'NAO_INICIADO' THEN 2
          WHEN 'CONCLUIDO' THEN 3
          ELSE 4
        END,
        data_vencimento_qualificacao ASC NULLS LAST,
        m.updated_at DESC
      LIMIT 50
    `,
    )
    .bind(funcionarioId, empresaId)
    .all<Record<string, unknown>>();

  return c.json({ success: true, data: rows.results });
});

// ── Listar matrículas do funcionário logado ─────────────────────────────────

app.get('/minhas', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const funcionarioId = await resolveCallerFuncionarioId(c, db);
  const page = parsePositiveInt(c.req.query('page'), 1);
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 100), 200);
  const offset = (page - 1) * limit;

  if (!funcionarioId) {
    return c.json({ success: true, data: [], pagination: { page, limit, total: 0 } });
  }

  const total = await db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id
        WHERE m.funcionario_id = ?
          AND m.empresa_id = ?
          AND m.deleted_at IS NULL
          AND c.deleted_at IS NULL`,
    )
    .bind(funcionarioId, empresaId)
    .first<{ n: number }>();

  const rows = await db
    .prepare(
      `
      SELECT m.*,
        c.titulo, c.categoria, c.carga_horaria_minutos, c.thumbnail_r2_key,
          c.tipo_conteudo, c.scorm_versao, c.publicado
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id
      WHERE m.funcionario_id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
        AND c.deleted_at IS NULL
      ORDER BY m.updated_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .bind(funcionarioId, empresaId, limit, offset)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: rows.results,
    pagination: { page, limit, total: total?.n ?? 0 },
  });
});

// ── Listar matrículas por curso (gestão) ─────────────────────────────────────

app.get('/curso/:curso_id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const cursoId = Number(c.req.param('curso_id'));
  const status = c.req.query('status');
  const page = parsePositiveInt(c.req.query('page'), 1);
  const limit = Math.min(parsePositiveInt(c.req.query('limit'), 50), 200);
  const offset = (page - 1) * limit;

  const access = await getEmployeeSectorAccess(c, empresaId);
  if (access.mode === 'restricted' && access.setorIds.length > 0) {
    const sectorOk = await db
      .prepare(
        `SELECT 1 FROM lms_cursos lc
         WHERE lc.id = ? AND lc.empresa_id = ?
           AND lc.qualificacao_tipo_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM qualificacoes_tipos_setores qts
             WHERE qts.tipo_id = lc.qualificacao_tipo_id
               AND qts.empresa_id = lc.empresa_id
               AND qts.setor_id IN (${access.setorIds.map(() => '?').join(',')})
               AND qts.deleted_at IS NULL
           )
         LIMIT 1`,
      )
      .bind(cursoId, empresaId, ...access.setorIds)
      .first();
    if (!sectorOk) throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
  }

  let where = `WHERE m.curso_id = ?
                 AND m.empresa_id = ?
                 AND m.deleted_at IS NULL
                 AND EXISTS (
                   SELECT 1
                     FROM funcionarios fx
                    WHERE fx.id = m.funcionario_id
                      AND fx.deleted_at IS NULL
                      AND COALESCE(fx.ativo, 1) = 1
                      AND UPPER(COALESCE(NULLIF(TRIM(fx.status), ''), 'ATIVO')) = 'ATIVO'
                 )`;
  const binds: (string | number)[] = [cursoId, empresaId];
  if (status) {
    where += ' AND m.status = ?';
    binds.push(status);
  }

  const total = await db
    .prepare(`SELECT COUNT(*) as n FROM lms_matriculas m ${where}`)
    .bind(...binds)
    .first<{ n: number }>();

  const rows = await db
    .prepare(
      `
      SELECT m.*, f.nome AS funcionario_nome, f.matricula AS funcionario_matricula
      FROM lms_matriculas m
      LEFT JOIN funcionarios f
        ON f.id = m.funcionario_id
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      ${where}
      ORDER BY m.data_matricula DESC
      LIMIT ? OFFSET ?
    `,
    )
    .bind(...binds, limit, offset)
    .all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: rows.results,
    pagination: { page, limit, total: total?.n ?? 0 },
  });
});

// ── Detalhe de matrícula ──────────────────────────────────────────────────────

app.get('/:id', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));
  const canManage = hasRole(c, 'admin', 'manager');
  const callerFuncionarioId = canManage ? null : await resolveCallerFuncionarioId(c, db);

  const matricula = await db
    .prepare(
      `
      SELECT m.*, c.titulo, c.tipo_conteudo, c.scorm_versao, c.scorm_launch_file, c.scorm_package_r2_prefix,
          c.scorm_mastery_score, c.gerar_qualificacao_ao_concluir, c.qualificacao_tipo_id,
          qt.nome AS qualificacao_tipo_nome, qt.codigo AS qualificacao_tipo_codigo,
          qt.validade AS qualificacao_validade, h.id AS h5p_conteudo_id,
        f.nome AS funcionario_nome
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id
        LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
        LEFT JOIN lms_h5p_conteudos h
          ON h.empresa_id = c.empresa_id
         AND h.r2_key = c.scorm_package_r2_prefix
         AND h.deleted_at IS NULL
      LEFT JOIN funcionarios f
        ON f.id = m.funcionario_id
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
            FROM funcionarios fx
           WHERE fx.id = m.funcionario_id
             AND fx.deleted_at IS NULL
             AND COALESCE(fx.ativo, 1) = 1
             AND UPPER(COALESCE(NULLIF(TRIM(fx.status), ''), 'ATIVO')) = 'ATIVO'
        )
    `,
    )
    .bind(matriculaId, empresaId)
    .first<Record<string, unknown>>();

  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  if (!canManage) {
    if (!callerFuncionarioId || Number(matricula.funcionario_id) !== callerFuncionarioId) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  const tipoConteudo = (matricula.tipo_conteudo as string) ?? 'scorm';

  // Para SCORM: retornar progresso SCORM
  let progressoScorm: Record<string, unknown> | null = null;
  let xapiSummary: {
    total_statements: number;
    last_verb?: string;
    last_timestamp?: string;
  } | null = null;

  if (tipoConteudo === 'scorm') {
    progressoScorm =
      (await db
        .prepare('SELECT * FROM lms_progresso_scorm WHERE matricula_id = ? AND empresa_id = ?')
        .bind(matriculaId, empresaId)
        .first<Record<string, unknown>>()) ?? null;
  } else if (tipoConteudo === 'h5p') {
    // Para H5P: retornar resumo de statements xAPI
    const xapiRows = await db
      .prepare(
        `
        SELECT COUNT(*) AS total_statements,
          (SELECT verb_id FROM lms_xapi_statements WHERE matricula_id = ? AND empresa_id = ? ORDER BY created_at DESC LIMIT 1) AS last_verb,
          (SELECT timestamp FROM lms_xapi_statements WHERE matricula_id = ? AND empresa_id = ? ORDER BY created_at DESC LIMIT 1) AS last_timestamp
        FROM lms_xapi_statements
        WHERE matricula_id = ? AND empresa_id = ?
      `,
      )
      .bind(matriculaId, empresaId, matriculaId, empresaId, matriculaId, empresaId)
      .first<{ total_statements: number; last_verb: string; last_timestamp: string }>();
    xapiSummary = xapiRows ?? { total_statements: 0 };
  }

  return c.json({
    success: true,
    data: { ...matricula, scorm_progresso: progressoScorm, xapi_summary: xapiSummary },
  });
});

// ── Matricular funcionário ────────────────────────────────────────────────────

app.post('/', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userIdRaw = c.get('userId' as never) as unknown;
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);
  const canManage = hasRole(c, 'admin', 'manager');
  const callerFuncionarioId = canManage ? null : await resolveCallerFuncionarioId(c, db);

  const body = await c.req.json<unknown>();
  const parsed = MatriculaCreateSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);

  const { funcionario_id, curso_id, data_expiracao, observacoes } = parsed.data;

  if (!canManage) {
    if (!callerFuncionarioId) {
      throw new ApiError('Usuário sem vínculo de funcionário', 403);
    }
    if (callerFuncionarioId !== funcionario_id) {
      throw new ApiError('Acesso negado para matricular outro funcionário', 403);
    }
  }

  // Verificar se curso existe e está publicado/ativo
  const cursoQuery = canManage
    ? 'SELECT id, titulo FROM lms_cursos WHERE id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL'
    : 'SELECT id, titulo FROM lms_cursos WHERE id = ? AND empresa_id = ? AND ativo = 1 AND publicado = 1 AND deleted_at IS NULL';
  const curso = await db
    .prepare(cursoQuery)
    .bind(curso_id, empresaId)
    .first<{ id: number; titulo: string }>();
  if (!curso) throw new ApiError('Curso não encontrado ou inativo', 404);

  const funcionario = await db
    .prepare(
      `SELECT id, nome
         FROM funcionarios
        WHERE id = ?
          AND (empresa_id = ? OR ? IS NULL)
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'`,
    )
    .bind(funcionario_id, empresaId, empresaId)
    .first<{ id: number; nome: string }>();
  if (!funcionario) throw new ApiError('Funcionário não encontrado', 404);

  // Verificar se já existe matrícula ativa
  const existente = await findLatestMatriculaForFuncionario(db, {
    cursoId: curso_id,
    funcionarioId: funcionario_id,
    empresaId,
  });

  if (existente) {
    if (hasActiveMatriculaCycle(existente)) {
      throw new ApiError('Funcionário já matriculado neste curso', 409);
    }
    if (canReuseMatriculaCycle(existente)) {
      await resetMatriculaForNewCycle(db, {
        matriculaId: existente.id,
        dataExpiracao: data_expiracao ?? null,
        observacoes: observacoes ?? null,
        matriculadoPor: Number.isFinite(userId) && userId > 0 ? userId : null,
      });
      const updated = await db
        .prepare('SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?')
        .bind(existente.id, empresaId)
        .first();
      await createLmsInAppNotification(db, {
        funcionarioId: funcionario_id,
        empresaId,
        tipo: 'lms_nova_matricula',
        titulo: 'Novo ciclo de treinamento LMS',
        mensagem: `Você foi matriculado novamente em ${curso.titulo}.`,
        referenciaId: existente.id,
        referenciaTipo: 'lms_matricula',
      });
      await logLmsMatriculaAudit(db, c, {
        action: 'LMS_MATRICULA_CRIADA',
        matriculaId: existente.id,
        oldValues: { status: existente.status, deleted_at: existente.deleted_at },
        newValues: {
          status: 'NAO_INICIADO',
          curso_id,
          funcionario_id,
          data_expiracao: data_expiracao ?? null,
          observacoes: observacoes ?? null,
          novo_ciclo: true,
        },
      });
      await sendMatriculaEmail(c.env, db, {
        funcionarioId: funcionario_id,
        empresaId,
        cursoId: curso_id,
        cursoTitulo: curso.titulo,
        dataExpiracao: data_expiracao ?? null,
        isNovoCiclo: true,
      });
      return c.json({ success: true, data: updated }, 200);
    }
  }

  try {
    const result = await db
      .prepare(
        `
        INSERT INTO lms_matriculas (empresa_id, curso_id, funcionario_id, data_expiracao, observacoes, matriculado_por)
        VALUES (?,?,?,?,?,?)
      `,
      )
      .bind(
        empresaId,
        curso_id,
        funcionario_id,
        data_expiracao ?? null,
        observacoes ?? null,
        Number.isFinite(userId) && userId > 0 ? userId : null,
      )
      .run();

    const matriculaId = Number(result.meta.last_row_id);
    const matricula = await db
      .prepare('SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?')
      .bind(matriculaId, empresaId)
      .first();
    await ensureMatriculaCycle(db, {
      matriculaId,
      origin: 'MANUAL',
    });
    await createLmsInAppNotification(db, {
      funcionarioId: funcionario_id,
      empresaId,
      tipo: 'lms_nova_matricula',
      titulo: 'Novo treinamento LMS',
      mensagem: `Você foi matriculado em ${curso.titulo}.`,
      referenciaId: matriculaId,
      referenciaTipo: 'lms_matricula',
    });
    await logLmsMatriculaAudit(db, c, {
      action: 'LMS_MATRICULA_CRIADA',
      matriculaId,
      newValues: {
        curso_id,
        curso_titulo: curso.titulo,
        funcionario_id,
        funcionario_nome: funcionario.nome,
        data_expiracao: data_expiracao ?? null,
      },
    });
    await sendMatriculaEmail(c.env, db, {
      funcionarioId: funcionario_id,
      empresaId,
      cursoId: curso_id,
      cursoTitulo: curso.titulo,
      dataExpiracao: data_expiracao ?? null,
      isNovoCiclo: false,
    });
    return c.json({ success: true, data: matricula }, 201);
  } catch (error) {
    if (!isMatriculaUniqueConstraintError(error)) {
      throw error;
    }

    const concorrente = await findLatestMatriculaForFuncionario(db, {
      cursoId: curso_id,
      funcionarioId: funcionario_id,
      empresaId,
    });

    if (hasActiveMatriculaCycle(concorrente)) {
      throw new ApiError('Funcionário já matriculado neste curso', 409);
    }

    if (!canReuseMatriculaCycle(concorrente)) {
      throw error;
    }

    if (!concorrente) {
      throw error;
    }

    await resetMatriculaForNewCycle(db, {
      matriculaId: concorrente.id,
      dataExpiracao: data_expiracao ?? null,
      observacoes: observacoes ?? null,
      matriculadoPor: Number.isFinite(userId) && userId > 0 ? userId : null,
      origin: 'MANUAL',
    });
    const updated = await db
      .prepare('SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?')
      .bind(concorrente.id, empresaId)
      .first();
    await createLmsInAppNotification(db, {
      funcionarioId: funcionario_id,
      empresaId,
      tipo: 'lms_nova_matricula',
      titulo: 'Novo ciclo de treinamento LMS',
      mensagem: `Você foi matriculado novamente em ${curso.titulo}.`,
      referenciaId: concorrente.id,
      referenciaTipo: 'lms_matricula',
    });
    await logLmsMatriculaAudit(db, c, {
      action: 'LMS_MATRICULA_CRIADA',
      matriculaId: concorrente.id,
      oldValues: { status: concorrente.status, deleted_at: concorrente.deleted_at },
      newValues: {
        status: 'NAO_INICIADO',
        curso_id,
        funcionario_id,
        data_expiracao: data_expiracao ?? null,
        observacoes: observacoes ?? null,
        novo_ciclo: true,
        reconciled_unique_conflict: true,
      },
    });
    await sendMatriculaEmail(c.env, db, {
      funcionarioId: funcionario_id,
      empresaId,
      cursoId: curso_id,
      cursoTitulo: curso.titulo,
      dataExpiracao: data_expiracao ?? null,
      isNovoCiclo: true,
    });
    return c.json({ success: true, data: updated }, 200);
  }
});

// ── Matricula em lote ─────────────────────────────────────────────────────────

app.post('/lote', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const userIdRaw = c.get('userId' as never) as unknown;
  const userId = typeof userIdRaw === 'string' ? Number(userIdRaw) : (userIdRaw as number);

  const body = await c.req.json<unknown>();
  const parsed = MatriculaLoteSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);

  const { funcionario_ids, curso_id, data_expiracao, observacoes } = parsed.data;
  const funcionarioIdsUnicos = [...new Set(funcionario_ids)];

  const curso = await db
    .prepare(
      'SELECT id, titulo, qualificacao_tipo_id FROM lms_cursos WHERE id = ? AND empresa_id = ? AND ativo = 1 AND deleted_at IS NULL',
    )
    .bind(curso_id, empresaId)
    .first<{ id: number; titulo: string; qualificacao_tipo_id: number | null }>();
  if (!curso) throw new ApiError('Curso não encontrado ou inativo', 404);

  const loteAccess = await getEmployeeSectorAccess(c, empresaId);
  if (loteAccess.mode === 'restricted' && loteAccess.setorIds.length > 0) {
    const sectorOk =
      curso.qualificacao_tipo_id != null &&
      (await db
        .prepare(
          `SELECT 1 FROM qualificacoes_tipos_setores qts
           WHERE qts.tipo_id = ? AND qts.empresa_id = ?
             AND qts.setor_id IN (${loteAccess.setorIds.map(() => '?').join(',')})
             AND qts.deleted_at IS NULL
           LIMIT 1`,
        )
        .bind(curso.qualificacao_tipo_id, empresaId, ...loteAccess.setorIds)
        .first());
    if (!sectorOk) throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
  }

  const funcionarioPlaceholders = funcionarioIdsUnicos.map(() => '?').join(', ');
  const funcionarios = await db
    .prepare(
      `SELECT id, nome
         FROM funcionarios
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
          AND id IN (${funcionarioPlaceholders})`,
    )
    .bind(empresaId, ...funcionarioIdsUnicos)
    .all<{ id: number; nome: string }>();
  const funcionariosPorId = new Map(
    (funcionarios.results ?? []).map((funcionario) => [Number(funcionario.id), funcionario]),
  );
  const funcionariosInvalidos = funcionarioIdsUnicos.filter(
    (funcionarioId) => !funcionariosPorId.has(funcionarioId),
  );
  if (funcionariosInvalidos.length > 0) {
    throw new ApiError(
      `Funcionários não encontrados para a empresa informada: ${funcionariosInvalidos.join(', ')}`,
      404,
    );
  }

  const results = { criadas: 0, ignoradas: 0, erros: 0 };
  const matriculasCriadas: Record<string, unknown>[] = [];

  for (const funcionarioId of funcionarioIdsUnicos) {
    try {
      const funcionario = funcionariosPorId.get(funcionarioId);
      if (!funcionario) {
        results.erros++;
        continue;
      }

      const existente = await findLatestMatriculaForFuncionario(db, {
        cursoId: curso_id,
        funcionarioId,
        empresaId,
      });

      if (hasActiveMatriculaCycle(existente)) {
        results.ignoradas++;
        continue;
      }

      if (canReuseMatriculaCycle(existente)) {
        await resetMatriculaForNewCycle(db, {
          matriculaId: existente!.id,
          dataExpiracao: data_expiracao ?? null,
          observacoes: observacoes ?? null,
          matriculadoPor: Number.isFinite(userId) && userId > 0 ? userId : null,
        });
        await createLmsInAppNotification(db, {
          funcionarioId,
          empresaId,
          tipo: 'lms_nova_matricula',
          titulo: 'Novo ciclo de treinamento LMS',
          mensagem: `Sua matrícula em ${curso.titulo} foi reativada para um novo ciclo.`,
          referenciaId: existente!.id,
          referenciaTipo: 'lms_matricula',
        });
        await logLmsMatriculaAudit(db, c, {
          action: 'LMS_MATRICULA_CRIADA',
          matriculaId: existente!.id,
          oldValues: { status: existente!.status, deleted_at: existente!.deleted_at },
          newValues: {
            status: 'NAO_INICIADO',
            curso_id,
            curso_titulo: curso.titulo,
            funcionario_id: funcionario.id,
            funcionario_nome: funcionario.nome,
            data_expiracao: data_expiracao ?? null,
            observacoes: observacoes ?? null,
            novo_ciclo: true,
          },
        });
        await sendMatriculaEmail(c.env, db, {
          funcionarioId,
          empresaId,
          cursoId: curso_id,
          cursoTitulo: curso.titulo,
          dataExpiracao: data_expiracao ?? null,
          isNovoCiclo: true,
        });

        const matriculaAtualizada = await readMatriculaForCourseList(db, {
          matriculaId: existente!.id,
          empresaId,
        });
        if (matriculaAtualizada) {
          matriculasCriadas.push(matriculaAtualizada);
        }
      } else {
        const insertResult = await db
          .prepare(
            'INSERT INTO lms_matriculas (empresa_id, curso_id, funcionario_id, data_expiracao, observacoes, matriculado_por) VALUES (?,?,?,?,?,?)',
          )
          .bind(
            empresaId,
            curso_id,
            funcionarioId,
            data_expiracao ?? null,
            observacoes ?? null,
            Number.isFinite(userId) && userId > 0 ? userId : null,
          )
          .run();
        const matriculaId = Number(insertResult.meta.last_row_id);
        await ensureMatriculaCycle(db, {
          matriculaId,
          origin: 'MANUAL',
        });
        await createLmsInAppNotification(db, {
          funcionarioId,
          empresaId,
          tipo: 'lms_nova_matricula',
          titulo: 'Novo treinamento LMS',
          mensagem: `Você foi matriculado em ${curso.titulo}.`,
          referenciaId: matriculaId,
          referenciaTipo: 'lms_matricula',
        });
        await logLmsMatriculaAudit(db, c, {
          action: 'LMS_MATRICULA_CRIADA',
          matriculaId,
          newValues: {
            curso_id,
            curso_titulo: curso.titulo,
            funcionario_id: funcionario.id,
            funcionario_nome: funcionario.nome,
            data_expiracao: data_expiracao ?? null,
            observacoes: observacoes ?? null,
          },
        });
        await sendMatriculaEmail(c.env, db, {
          funcionarioId,
          empresaId,
          cursoId: curso_id,
          cursoTitulo: curso.titulo,
          dataExpiracao: data_expiracao ?? null,
          isNovoCiclo: false,
        });

        const matriculaCriada = await readMatriculaForCourseList(db, {
          matriculaId,
          empresaId,
        });
        if (matriculaCriada) {
          matriculasCriadas.push(matriculaCriada);
        }
      }
      results.criadas++;
    } catch (error) {
      if (!isMatriculaUniqueConstraintError(error)) {
        results.erros++;
        continue;
      }

      const concorrente = await findLatestMatriculaForFuncionario(db, {
        cursoId: curso_id,
        funcionarioId,
        empresaId,
      });

      if (hasActiveMatriculaCycle(concorrente)) {
        results.ignoradas++;
        continue;
      }

      if (!canReuseMatriculaCycle(concorrente)) {
        results.erros++;
        continue;
      }

      if (!concorrente) {
        results.erros++;
        continue;
      }

      try {
        await resetMatriculaForNewCycle(db, {
          matriculaId: concorrente.id,
          dataExpiracao: data_expiracao ?? null,
          observacoes: observacoes ?? null,
          matriculadoPor: Number.isFinite(userId) && userId > 0 ? userId : null,
          origin: 'MANUAL',
        });
        await createLmsInAppNotification(db, {
          funcionarioId,
          empresaId,
          tipo: 'lms_nova_matricula',
          titulo: 'Novo ciclo de treinamento LMS',
          mensagem: `Sua matrícula em ${curso.titulo} foi reativada para um novo ciclo.`,
          referenciaId: concorrente.id,
          referenciaTipo: 'lms_matricula',
        });
        await logLmsMatriculaAudit(db, c, {
          action: 'LMS_MATRICULA_CRIADA',
          matriculaId: concorrente.id,
          oldValues: { status: concorrente.status, deleted_at: concorrente.deleted_at },
          newValues: {
            status: 'NAO_INICIADO',
            curso_id,
            curso_titulo: curso.titulo,
            funcionario_id: funcionarioId,
            funcionario_nome: funcionariosPorId.get(funcionarioId)?.nome ?? null,
            data_expiracao: data_expiracao ?? null,
            observacoes: observacoes ?? null,
            novo_ciclo: true,
            reconciled_unique_conflict: true,
          },
        });
        await sendMatriculaEmail(c.env, db, {
          funcionarioId,
          empresaId,
          cursoId: curso_id,
          cursoTitulo: curso.titulo,
          dataExpiracao: data_expiracao ?? null,
          isNovoCiclo: true,
        });

        const matriculaAtualizada = await readMatriculaForCourseList(db, {
          matriculaId: concorrente.id,
          empresaId,
        });
        if (matriculaAtualizada) {
          matriculasCriadas.push(matriculaAtualizada);
        }
        results.criadas++;
      } catch {
        results.erros++;
      }
    }
  }

  return c.json({ success: true, data: { ...results, matriculas: matriculasCriadas } });
});

// ── Cancelar matrícula ────────────────────────────────────────────────────────

app.delete('/:id', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));

  const existing = await db
    .prepare(
      `SELECT m.id, m.status, m.funcionario_id, c.titulo AS curso_titulo
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
        WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
    )
    .bind(matriculaId, empresaId)
    .first<{ id: number; status: string; funcionario_id: number; curso_titulo: string }>();
  if (!existing) throw new ApiError('Matrícula não encontrada', 404);

  await db
    .prepare(
      "UPDATE lms_matriculas SET status = 'CANCELADO', deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ?",
    )
    .bind(matriculaId, empresaId)
    .run();
  await syncMatriculaCycleFromMatricula(db, { matriculaId });

  await createLmsInAppNotification(db, {
    funcionarioId: existing.funcionario_id,
    empresaId,
    tipo: 'lms_matricula_status',
    titulo: 'Treinamento LMS cancelado',
    mensagem: `Sua matrícula em ${existing.curso_titulo} foi cancelada.`,
    referenciaId: matriculaId,
    referenciaTipo: 'lms_matricula',
  });
  await logLmsMatriculaAudit(db, c, {
    action: 'LMS_MATRICULA_CANCELADA',
    matriculaId,
    oldValues: { status: existing.status },
    newValues: { status: 'CANCELADO' },
  });

  return c.json({ success: true, data: { id: matriculaId, cancelado: true } });
});

// ── Commit SCORM ─────────────────────────────────────────────────────────────
// POST /api/lms/matriculas/scorm/commit

app.post('/scorm/commit', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const canManage = hasRole(c, 'admin', 'manager');
  const callerFuncionarioId = canManage ? null : await resolveCallerFuncionarioId(c, db);

  const body = await c.req.json<unknown>();
  const parsed = ScormCommitSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);

  const d = parsed.data;

  // Buscar matrícula com dados do curso
  const matricula = await db
    .prepare(
      `
      SELECT m.id, m.empresa_id, m.funcionario_id, m.status, m.progresso_pct, m.tentativas,
        m.qualificacao_historico_id,
        c.scorm_mastery_score, c.gerar_qualificacao_ao_concluir,
        c.qualificacao_tipo_id, c.titulo AS curso_titulo,
        qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome,
        qt.categoria AS qualificacao_categoria, qt.validade AS qualificacao_validade
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
      WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
    `,
    )
    .bind(d.matricula_id, empresaId)
    .first<{
      id: number;
      empresa_id: number;
      funcionario_id: number;
      status: string;
      progresso_pct: number;
      tentativas: number;
      qualificacao_historico_id: number | null;
      scorm_mastery_score: number;
      gerar_qualificacao_ao_concluir: number;
      qualificacao_tipo_id: number | null;
      curso_titulo: string;
      qualificacao_codigo: string | null;
      qualificacao_nome: string | null;
      qualificacao_categoria: string | null;
      qualificacao_validade: number | null;
    }>();

  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  if (!canManage) {
    if (!callerFuncionarioId || matricula.funcionario_id !== callerFuncionarioId) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  const sucesso = isScormSuccess(d);
  const falha = isScormFailed(d);

  // Calcular progresso (estimativa com score e/ou posição SCORM)
  const progressoAnterior = Number(matricula.progresso_pct ?? 0);
  const inferredFromLocation = extractProgressPctFromCmiJson(d.cmi_json);
  const inferredFromScore =
    d.score_raw != null && d.score_max != null && d.score_max > 0
      ? clampPct((d.score_raw / d.score_max) * 100)
      : null;

  let progressoPct = progressoAnterior;
  if (sucesso) {
    progressoPct = 100;
  } else if (inferredFromLocation != null || inferredFromScore != null) {
    // Alguns pacotes mantêm score baixo fixo (ex.: 1/100) mesmo avançando slides.
    // Nesses casos, usamos o maior sinal disponível para não travar o progresso.
    progressoPct = Math.max(progressoAnterior, inferredFromLocation ?? 0, inferredFromScore ?? 0);
  } else if (
    d.lesson_status === 'incomplete' ||
    d.completion_status === 'incomplete' ||
    Boolean(d.suspend_data) ||
    Boolean(d.session_time) ||
    Boolean(d.total_time)
  ) {
    // Evita progresso travado em zero quando o pacote não envia score/location cedo.
    progressoPct = Math.max(progressoAnterior, 1);
  }

  // Progresso não deve regredir entre commits.
  progressoPct = Math.max(progressoAnterior, clampPct(progressoPct));

  // Upsert progresso SCORM
  await db
    .prepare(
      `
      INSERT INTO lms_progresso_scorm
        (matricula_id, empresa_id, lesson_status, completion_status, success_status,
         score_raw, score_max, score_min, score_scaled,
         session_time, total_time, suspend_data, launch_data, cmi_json,
         session_count, last_commit_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'))
      ON CONFLICT(matricula_id) DO UPDATE SET
        lesson_status = excluded.lesson_status,
        completion_status = excluded.completion_status,
        success_status = excluded.success_status,
        score_raw = COALESCE(excluded.score_raw, lms_progresso_scorm.score_raw),
        score_max = COALESCE(excluded.score_max, lms_progresso_scorm.score_max),
        score_min = COALESCE(excluded.score_min, lms_progresso_scorm.score_min),
        score_scaled = COALESCE(excluded.score_scaled, lms_progresso_scorm.score_scaled),
        session_time = excluded.session_time,
        total_time = COALESCE(excluded.total_time, lms_progresso_scorm.total_time),
        suspend_data = COALESCE(excluded.suspend_data, lms_progresso_scorm.suspend_data),
        launch_data = COALESCE(excluded.launch_data, lms_progresso_scorm.launch_data),
        cmi_json = COALESCE(excluded.cmi_json, lms_progresso_scorm.cmi_json),
        session_count = lms_progresso_scorm.session_count + 1,
        last_commit_at = datetime('now'),
        updated_at = datetime('now')
    `,
    )
    .bind(
      d.matricula_id,
      empresaId,
      d.lesson_status ?? null,
      d.completion_status ?? null,
      d.success_status ?? null,
      d.score_raw ?? null,
      d.score_max ?? null,
      d.score_min ?? null,
      d.score_scaled ?? null,
      d.session_time ?? null,
      d.total_time ?? null,
      d.suspend_data ?? null,
      d.launch_data ?? null,
      d.cmi_json ?? null,
    )
    .run();

  // Atualizar status da matrícula
  let novoStatus = matricula.status;
  let dataConclusao: string | null = null;
  const statusAnterior = matricula.status;

  if (matricula.status === 'NAO_INICIADO') {
    novoStatus = 'EM_ANDAMENTO';
  }
  if (sucesso && matricula.status !== 'CONCLUIDO') {
    novoStatus = 'CONCLUIDO';
    dataConclusao = new Date().toISOString().slice(0, 10);
  } else if (falha && matricula.status !== 'REPROVADO') {
    novoStatus = 'REPROVADO';
    dataConclusao = new Date().toISOString().slice(0, 10);
  }

  await db
    .prepare(
      `
      UPDATE lms_matriculas
      SET status = ?, progresso_pct = ?,
          data_inicio = COALESCE(data_inicio, datetime('now')),
          data_conclusao = COALESCE(?, data_conclusao),
          tentativas = tentativas + CASE WHEN ? = 1 THEN 1 ELSE 0 END,
          score_final = COALESCE(?, score_final),
          updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ?
    `,
    )
    .bind(
      novoStatus,
      progressoPct,
      dataConclusao,
      sucesso || falha ? 1 : 0,
      d.score_raw ?? null,
      d.matricula_id,
      empresaId,
    )
    .run();
  await syncMatriculaCycleFromMatricula(db, { matriculaId: d.matricula_id });

  // Gerar qualificação automática se concluído com sucesso
  let qualificacaoGerada: Record<string, unknown> | null = null;
  if (
    sucesso &&
    matricula.gerar_qualificacao_ao_concluir === 1 &&
    matricula.qualificacao_tipo_id &&
    dataConclusao
  ) {
    try {
      const historicoId = await createLmsQualificationOnCompletion({
        db,
        matriculaId: d.matricula_id,
        empresaId,
        funcionarioId: matricula.funcionario_id,
        cursoTitulo: matricula.curso_titulo,
        qualificacaoTipoId: matricula.qualificacao_tipo_id,
        qualificacaoCodigo: matricula.qualificacao_codigo,
        qualificacaoNome: matricula.qualificacao_nome ?? matricula.curso_titulo,
        qualificacaoCategoria: matricula.qualificacao_categoria,
        validade: matricula.qualificacao_validade,
        dataConclusao,
        existingHistoricoId: matricula.qualificacao_historico_id,
      });
      qualificacaoGerada = {
        qualificacao_id: historicoId,
        qualificacao_historico_id: historicoId,
      };
    } catch (e) {
      console.error('[LMS] Erro ao gerar qualificação automática:', e);
    }
  }

  if (novoStatus !== statusAnterior) {
    const action =
      novoStatus === 'CONCLUIDO'
        ? 'LMS_MATRICULA_CONCLUIDA'
        : novoStatus === 'REPROVADO'
          ? 'LMS_MATRICULA_REPROVADA'
          : 'LMS_MATRICULA_STATUS_ATUALIZADO';
    await logLmsMatriculaAudit(db, c, {
      action,
      matriculaId: d.matricula_id,
      oldValues: { status: statusAnterior },
      newValues: {
        status: novoStatus,
        progresso_pct: progressoPct,
        data_conclusao: dataConclusao,
        qualificacao_historico_id:
          (qualificacaoGerada?.qualificacao_historico_id as number | undefined) ??
          matricula.qualificacao_historico_id,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      matricula_id: d.matricula_id,
      novo_status: novoStatus,
      progresso_pct: progressoPct,
      qualificacao_gerada: qualificacaoGerada,
    },
  });
});

// ── Finalizar curso manualmente (aluno/instrutor) ───────────────────────────

app.post('/:id/finalizar', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));
  const canManage = hasRole(c, 'admin', 'manager');
  const callerFuncionarioId = canManage ? null : await resolveCallerFuncionarioId(c, db);

  const matricula = await db
    .prepare(
      `SELECT m.id, m.empresa_id, m.funcionario_id, m.status, m.progresso_pct,
              m.qualificacao_historico_id,
              c.gerar_qualificacao_ao_concluir, c.qualificacao_tipo_id,
              c.titulo AS curso_titulo,
              qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome,
              qt.categoria AS qualificacao_categoria, qt.validade AS qualificacao_validade
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id
         LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
        WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
    )
    .bind(matriculaId, empresaId)
    .first<{
      id: number;
      empresa_id: number;
      funcionario_id: number;
      status: string;
      progresso_pct: number;
      qualificacao_historico_id: number | null;
      gerar_qualificacao_ao_concluir: number;
      qualificacao_tipo_id: number | null;
      curso_titulo: string;
      qualificacao_codigo: string | null;
      qualificacao_nome: string | null;
      qualificacao_categoria: string | null;
      qualificacao_validade: number | null;
    }>();

  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  if (!canManage) {
    if (!callerFuncionarioId || callerFuncionarioId !== matricula.funcionario_id) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  const dataConclusao = new Date().toISOString().slice(0, 10);
  await db
    .prepare(
      `UPDATE lms_matriculas
          SET status = 'CONCLUIDO',
              progresso_pct = 100,
              data_inicio = COALESCE(data_inicio, datetime('now')),
              data_conclusao = COALESCE(data_conclusao, ?),
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    )
    .bind(dataConclusao, matriculaId, empresaId)
    .run();
  await syncMatriculaCycleFromMatricula(db, { matriculaId });

  let qualificacaoGerada: Record<string, unknown> | null = null;
  if (matricula.gerar_qualificacao_ao_concluir === 1 && matricula.qualificacao_tipo_id) {
    try {
      const historicoId = await createLmsQualificationOnCompletion({
        db,
        matriculaId,
        empresaId,
        funcionarioId: matricula.funcionario_id,
        cursoTitulo: matricula.curso_titulo,
        qualificacaoTipoId: matricula.qualificacao_tipo_id,
        qualificacaoCodigo: matricula.qualificacao_codigo,
        qualificacaoNome: matricula.qualificacao_nome ?? matricula.curso_titulo,
        qualificacaoCategoria: matricula.qualificacao_categoria,
        validade: matricula.qualificacao_validade,
        dataConclusao,
        existingHistoricoId: matricula.qualificacao_historico_id,
      });
      qualificacaoGerada = {
        qualificacao_id: historicoId,
        qualificacao_historico_id: historicoId,
      };
    } catch (error) {
      console.error('[LMS] Erro ao gerar qualificação em finalização manual:', error);
    }
  }

  await logLmsMatriculaAudit(db, c, {
    action: 'LMS_MATRICULA_FINALIZADA_MANUAL',
    matriculaId,
    oldValues: {
      status: matricula.status,
      progresso_pct: matricula.progresso_pct,
    },
    newValues: {
      status: 'CONCLUIDO',
      progresso_pct: 100,
      data_conclusao: dataConclusao,
      qualificacao_historico_id:
        (qualificacaoGerada?.qualificacao_historico_id as number | undefined) ??
        matricula.qualificacao_historico_id,
    },
  });

  return c.json({
    success: true,
    data: {
      matricula_id: matriculaId,
      novo_status: 'CONCLUIDO',
      progresso_pct: 100,
      qualificacao_gerada: qualificacaoGerada,
    },
  });
});

// ── Atualizar status manualmente (uso administrativo) ──────────────────────────

const PatchStatusSchema = z.object({
  status: z.enum(['NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'REPROVADO', 'CANCELADO']),
  observacoes: z.string().optional().nullable(),
});

app.patch('/:id/status', requireRole('admin', 'manager'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));

  const body = await c.req.json<unknown>();
  const parsed = PatchStatusSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);

  const existing = await db
    .prepare(
      `SELECT m.id, m.status, m.funcionario_id, m.qualificacao_historico_id,
              c.id AS curso_id, c.titulo AS curso_titulo, c.qualificacao_tipo_id,
              qt.nome AS qualificacao_nome, qt.codigo AS qualificacao_codigo,
              qt.categoria AS qualificacao_categoria, qt.validade AS qualificacao_validade
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
         LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.deleted_at IS NULL
        WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
    )
    .bind(matriculaId, empresaId)
    .first<{
      id: number;
      status: string;
      funcionario_id: number;
      qualificacao_historico_id: number | null;
      curso_id: number;
      curso_titulo: string;
      qualificacao_tipo_id: number | null;
      qualificacao_nome: string | null;
      qualificacao_codigo: string | null;
      qualificacao_categoria: string | null;
      qualificacao_validade: number | null;
    }>();
  if (!existing) throw new ApiError('Matrícula não encontrada', 404);

  const { status, observacoes } = parsed.data;
  const now = new Date().toISOString().slice(0, 10);
  const dataConclusao = status === 'CONCLUIDO' || status === 'REPROVADO' ? now : null;

  await db
    .prepare(
      `
      UPDATE lms_matriculas
      SET status = ?,
          observacoes = COALESCE(?, observacoes),
          data_conclusao = COALESCE(?, data_conclusao),
          updated_at = datetime('now')
      WHERE id = ? AND empresa_id = ?
    `,
    )
    .bind(status, observacoes ?? null, dataConclusao, matriculaId, empresaId)
    .run();
  await syncMatriculaCycleFromMatricula(db, { matriculaId });

  let qualificacaoHistoricoId = existing.qualificacao_historico_id;
  if (status === 'CONCLUIDO' && existing.qualificacao_tipo_id && dataConclusao) {
    qualificacaoHistoricoId = await createLmsQualificationOnCompletion({
      db,
      matriculaId,
      empresaId,
      funcionarioId: existing.funcionario_id,
      cursoTitulo: existing.curso_titulo,
      qualificacaoTipoId: existing.qualificacao_tipo_id,
      qualificacaoCodigo: existing.qualificacao_codigo,
      qualificacaoNome: existing.qualificacao_nome ?? existing.curso_titulo,
      qualificacaoCategoria: existing.qualificacao_categoria,
      validade: existing.qualificacao_validade,
      dataConclusao,
      existingHistoricoId: existing.qualificacao_historico_id,
    });
  }

  const updated = await db
    .prepare('SELECT * FROM lms_matriculas WHERE id = ? AND empresa_id = ?')
    .bind(matriculaId, empresaId)
    .first();

  const action =
    status === 'CONCLUIDO'
      ? 'LMS_MATRICULA_CONCLUIDA'
      : status === 'CANCELADO'
        ? 'LMS_MATRICULA_CANCELADA'
        : status === 'REPROVADO'
          ? 'LMS_MATRICULA_REPROVADA'
          : 'LMS_MATRICULA_STATUS_ATUALIZADO';
  await logLmsMatriculaAudit(db, c, {
    action,
    matriculaId,
    oldValues: {
      status: existing.status,
      qualificacao_historico_id: existing.qualificacao_historico_id,
    },
    newValues: {
      status,
      observacoes: observacoes ?? null,
      data_conclusao: dataConclusao,
      qualificacao_historico_id: qualificacaoHistoricoId,
    },
  });
  return c.json({ success: true, data: updated });
});

// ── Salvar progresso (PDF / PPTX / H5P / vídeo) ──────────────────────────────
// PATCH /matriculas/:id/progresso
// Body: { progresso_pct: number; ultimo_slide?: number; ultima_pagina?: number }

const PatchProgressoSchema = z.object({
  progresso_pct: z.number().int().min(0).max(100).optional(),
  ultimo_slide: z.number().int().min(0).optional(),
  ultima_pagina: z.number().int().min(0).optional(),
});

app.patch('/:id/progresso', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));
  if (!matriculaId || isNaN(matriculaId)) throw new ApiError('ID inválido', 400);

  const body = await c.req.json<unknown>();
  const parsed = PatchProgressoSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);

  const { progresso_pct, ultimo_slide, ultima_pagina } = parsed.data;

  // Verificar que a matrícula pertence à empresa e ao funcionário autenticado
  const userId = c.get('userId' as never) as unknown as number | string;
  const userRole = ((c.get('userRole' as never) as unknown) as string | undefined)?.toUpperCase() ?? '';
  const isAdmin = ['ADMIN', 'MANAGER'].includes(userRole);

  const existing = await db
    .prepare(
      `SELECT m.id, m.status, m.funcionario_id
         FROM lms_matriculas m
        WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
    )
    .bind(matriculaId, empresaId)
    .first<{ id: number; status: string; funcionario_id: number }>();

  if (!existing) throw new ApiError('Matrícula não encontrada', 404);

  // Não-admins: validar que é o próprio aluno
  if (!isAdmin) {
    const funcionarioRow = await db
      .prepare(`SELECT id FROM funcionarios WHERE usuario_id = ? AND empresa_id = ? LIMIT 1`)
      .bind(userId, empresaId)
      .first<{ id: number }>();
    if (!funcionarioRow || funcionarioRow.id !== existing.funcionario_id) {
      throw new ApiError('Sem permissão para atualizar esta matrícula', 403);
    }
  }

  // Não permite regressar se já concluído
  if (existing.status === 'CONCLUIDO') {
    return c.json({
      success: true,
      data: { matricula_id: matriculaId, status: 'CONCLUIDO', ignored: true },
    });
  }

  // Garantir que status muda para EM_ANDAMENTO ao registrar progresso
  const newStatus = existing.status === 'NAO_INICIADO' ? 'EM_ANDAMENTO' : existing.status;

  const setClauses: string[] = [
    "updated_at = datetime('now')",
    'status = ?',
    "data_inicio = COALESCE(data_inicio, datetime('now'))",
  ];
  const binds: (string | number)[] = [newStatus];

  if (progresso_pct !== undefined) {
    setClauses.push('progresso_pct = MAX(COALESCE(progresso_pct, 0), ?)');
    binds.push(progresso_pct);
  }
  if (ultimo_slide !== undefined) {
    setClauses.push('ultimo_slide = MAX(COALESCE(ultimo_slide, 0), ?)'); // SECURITY: Prevent regression
    binds.push(ultimo_slide);
  }
  if (ultima_pagina !== undefined) {
    setClauses.push('ultima_pagina = MAX(COALESCE(ultima_pagina, 0), ?)'); // SECURITY: Prevent regression
    binds.push(ultima_pagina);
  }

  binds.push(matriculaId, empresaId);

  await db
    .prepare(`UPDATE lms_matriculas SET ${setClauses.join(', ')} WHERE id = ? AND empresa_id = ?`)
    .bind(...binds)
    .run();

  const updated = await db
    .prepare(
      `SELECT id, status, progresso_pct, ultimo_slide, ultima_pagina FROM lms_matriculas WHERE id = ?`,
    )
    .bind(matriculaId)
    .first<{
      id: number;
      status: string;
      progresso_pct: number;
      ultimo_slide: number | null;
      ultima_pagina: number | null;
    }>();

  return c.json({
    success: true,
    data: {
      matricula_id: matriculaId,
      status: updated?.status ?? newStatus,
      progresso_pct: updated?.progresso_pct ?? progresso_pct ?? 0,
      ultimo_slide: updated?.ultimo_slide ?? ultimo_slide ?? 0,
      ultima_pagina: updated?.ultima_pagina ?? ultima_pagina ?? 0,
    },
  });
});

export default app;
