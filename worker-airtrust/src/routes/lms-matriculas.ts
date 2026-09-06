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
import { completeLmsMatricula, LmsCompletionRejectedError } from '../services/lms-completion';
import type { VencimentoMode } from '../utils/qualificacoes-expiration';
import {
  ensureMatriculaCycle,
  hasActiveMatriculaCycle,
  syncMatriculaCycleFromMatricula,
} from '../services/lms-matricula-cycle';
import {
  buildScormCompletionDiagnostic,
  extractScormLocationFromCmiJson,
  isTrustedScorm12Finish,
  mergeScormRuntimeState,
  mergeMonotonicMatriculaStatus,
  mergeMonotonicNumber,
  parseScormLocationPair,
  preferScormValue,
  resolveLmsEffectiveProgress,
  shouldPreferIncomingScormState,
} from '../services/lms-progress-guardrails';
import { logAudit } from '../utils/db';
import { sendEmail } from '../lib/email';
import type { Env } from '../types';
import {
  assertFuncionarioInScope,
  employeeSectorSql,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import { buildAuditMetadata } from '../lib/audit/context';
import { ensureCertificateForQualification } from '../services/ensure-certificate';
import { getQualificacoesVencimentoExpr } from '../utils/qualificacoes-alerta-config';

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
      console.info('[lms-matricula] Email não encontrado para funcionario', params.funcionarioId);
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
        '[lms-matricula] Email enviado para o funcionario',
        params.funcionarioId,
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
          AND f.empresa_id = m.empresa_id
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
  // Metadados do wrapper AirTrust
  commit_event: z.string().optional().nullable(),
  completion_candidate: z.boolean().optional().nullable(),
  completion_observed_at: z.string().optional().nullable(),
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

function formatScormLocationTelemetry(marker: { current: number; total: number | null } | null) {
  if (!marker) return null;
  return marker.total != null ? `${marker.current}/${marker.total}` : String(marker.current);
}

function summarizeScormTextPayload(value: string | null | undefined) {
  if (typeof value !== 'string') return { present: false, bytes: 0 };
  return {
    present: value.trim().length > 0,
    bytes: value.length,
  };
}

function buildMatriculaCompletionDiagnostic(params: {
  matriculaStatus?: string | null;
  progressoPct?: number | null;
  masteryScore?: number | null;
  scorm:
    | {
        lesson_status?: string | null;
        completion_status?: string | null;
        success_status?: string | null;
        score_raw?: number | null;
        score_max?: number | null;
        score_scaled?: number | null;
        suspend_data?: string | null;
        session_time?: string | null;
        total_time?: string | null;
        cmi_json?: string | null;
      }
    | null
    | undefined;
  commit?: z.infer<typeof ScormCommitSchema>;
}) {
  const base = buildScormCompletionDiagnostic({
    lessonStatus: params.scorm?.lesson_status ?? null,
    completionStatus: params.scorm?.completion_status ?? null,
    successStatus: params.scorm?.success_status ?? null,
    scoreRaw: params.scorm?.score_raw ?? null,
    scoreMax: params.scorm?.score_max ?? null,
    scoreScaled: params.scorm?.score_scaled ?? null,
    masteryScore: params.masteryScore ?? null,
    progressoPct: params.progressoPct ?? null,
    cmiJson: params.scorm?.cmi_json ?? null,
    suspendData: params.scorm?.suspend_data ?? null,
    sessionTime: params.scorm?.session_time ?? null,
    totalTime: params.scorm?.total_time ?? null,
    commit: params.commit,
  });

  return {
    ...base,
    matricula_status: params.matriculaStatus ?? null,
    pending_server_confirmation:
      base.status === 'candidate' &&
      String(params.matriculaStatus ?? '').toUpperCase() !== 'CONCLUIDO',
  };
}

function requiresExplicitScormCompletion(
  tipoConteudo: string | null | undefined,
  completionDiagnostic: {
    explicit_completion?: boolean;
  },
): boolean {
  const isScorm = String(tipoConteudo ?? 'scorm').toLowerCase() === 'scorm';
  return isScorm && completionDiagnostic.explicit_completion !== true;
}

function requiresServerValidatedNonScormEvidence(
  tipoConteudo: string | null | undefined,
  gerarQualificacaoAoConcluir: number | null | undefined,
): boolean {
  if (gerarQualificacaoAoConcluir !== 1) return false;
  const type = String(tipoConteudo ?? 'scorm').trim().toLowerCase();
  return !['scorm', 'h5p'].includes(type);
}

function emitScormCommitTelemetry(params: {
  matriculaId: number;
  cursoTitulo: string;
  preferIncomingState: boolean;
  previousLocation: { current: number; total: number | null } | null;
  incomingLocation: { current: number; total: number | null } | null;
  finalLocation: { current: number; total: number | null } | null;
  previousSuspendData: string | null | undefined;
  incomingSuspendData: string | null | undefined;
  finalSuspendData: string | null | undefined;
  decisions: {
    blockedLocationRegression: boolean;
    blockedEmptySuspendData: boolean;
    blockedShorterSuspendData: boolean;
    preservedLocationFromCurrent: boolean;
  };
}) {
  const blocked =
    params.decisions.blockedLocationRegression ||
    params.decisions.blockedEmptySuspendData ||
    params.decisions.blockedShorterSuspendData;

  const event = blocked ? 'SCORM_REGRESSION_BLOCKED' : 'SCORM_COMMIT';
  const reason = [
    params.decisions.blockedLocationRegression ? 'location-regression' : null,
    params.decisions.blockedEmptySuspendData ? 'empty-suspend-data' : null,
    params.decisions.blockedShorterSuspendData ? 'shorter-suspend-data' : null,
    !blocked && params.decisions.preservedLocationFromCurrent ? 'preserved-current-location' : null,
  ]
    .filter(Boolean)
    .join(',');

  console.info(
    '[LMS SCORM TELEMETRY]',
    JSON.stringify({
      matricula_id: params.matriculaId,
      curso_titulo: params.cursoTitulo,
      event,
      decision: blocked ? 'blocked' : 'accepted',
      reason: reason || 'normal-merge',
      prefer_incoming_state: params.preferIncomingState,
      previous_location: formatScormLocationTelemetry(params.previousLocation),
      incoming_location: formatScormLocationTelemetry(params.incomingLocation),
      final_location: formatScormLocationTelemetry(params.finalLocation),
      previous_suspend_data: summarizeScormTextPayload(params.previousSuspendData),
      incoming_suspend_data: summarizeScormTextPayload(params.incomingSuspendData),
      final_suspend_data: summarizeScormTextPayload(params.finalSuspendData),
    }),
  );
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

function resolveScormScorePct(params: {
  scoreRaw?: number | null;
  scoreMax?: number | null;
  scoreScaled?: number | null;
}): number | null {
  const scaled = params.scoreScaled == null ? null : Number(params.scoreScaled);
  if (scaled != null && Number.isFinite(scaled) && scaled >= 0 && scaled <= 1) {
    return clampPct(scaled * 100);
  }

  const raw = params.scoreRaw == null ? null : Number(params.scoreRaw);
  const max = params.scoreMax == null ? null : Number(params.scoreMax);
  if (raw != null && max != null && Number.isFinite(raw) && Number.isFinite(max) && max > 0) {
    return clampPct((raw / max) * 100);
  }

  if (raw != null && Number.isFinite(raw) && raw >= 0) {
    return clampPct(raw);
  }

  return null;
}

/** Verifica se o status SCORM indica conclusão com sucesso */
function isScormSuccess(
  data: z.infer<typeof ScormCommitSchema>,
  options?: {
    masteryScore?: number | null;
    effectiveScorePct?: number | null;
  },
): boolean {
  const ls = (data.lesson_status ?? '').toLowerCase();
  const cs = (data.completion_status ?? '').toLowerCase();
  const ss = (data.success_status ?? '').toLowerCase();
  const masteryScore = Number(options?.masteryScore);
  const hasMasteryScore = Number.isFinite(masteryScore) && masteryScore > 0;
  const effectiveScorePct = Number(options?.effectiveScorePct);
  const meetsMasteryScore =
    !hasMasteryScore || (Number.isFinite(effectiveScorePct) && effectiveScorePct >= masteryScore);
  if (isTrustedScorm12Finish(data)) return meetsMasteryScore;
  // SCORM 1.2
  if (ls === 'passed') return true;
  if (ls === 'completed') return meetsMasteryScore;
  // SCORM 2004
  if (ss === 'passed') return cs !== 'incomplete';
  if (cs === 'completed' && (ss === 'unknown' || !ss)) return meetsMasteryScore;
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
          WHEN qh.id IS NOT NULL THEN ${getQualificacoesVencimentoExpr()}
          ELSE NULL
        END AS data_vencimento_qualificacao,
        CASE WHEN qh.certificado_arquivo_id IS NOT NULL THEN 1 ELSE 0 END AS tem_certificado,
        CASE WHEN qh.id IS NOT NULL THEN 'LINKED' ELSE 'LINK_PENDING' END AS qualification_link_state,
        CASE
          WHEN COALESCE(c.gerar_qualificacao_ao_concluir, 0) = 0 THEN 'NOT_REQUIRED'
          WHEN qh.certificado_arquivo_id IS NOT NULL THEN 'AVAILABLE'
          WHEN m.status = 'CONCLUIDO' THEN 'PENDING'
          ELSE 'NOT_REQUIRED'
        END AS certificate_state
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
      LEFT JOIN qualificacoes_historico qh
        ON qh.id = m.qualificacao_historico_id
        AND qh.empresa_id = m.empresa_id
        AND qh.deleted_at IS NULL
      LEFT JOIN qualificacoes_tipos qt
        ON qt.id = qh.qualificacao_id
        AND qt.empresa_id = m.empresa_id
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

  const data = (rows.results ?? []).map((row) => {
    const effectiveProgress = resolveLmsEffectiveProgress({
      status: row.status as string | null,
      progressoBruto: row.progresso_pct as number | null,
    });
    return {
      ...row,
      progresso_bruto: effectiveProgress.progresso_bruto,
      progresso_efetivo: effectiveProgress.progresso_efetivo,
      completion_state: effectiveProgress.completion_state,
      completion_reason_code: effectiveProgress.completion_reason_code,
    };
  });

  return c.json({ success: true, data });
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
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
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
      JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
      WHERE m.funcionario_id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
        AND c.deleted_at IS NULL
      ORDER BY m.updated_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .bind(funcionarioId, empresaId, limit, offset)
    .all<Record<string, unknown>>();

  const data = (rows.results ?? []).map((row) => {
    const effectiveProgress = resolveLmsEffectiveProgress({
      status: row.status as string | null,
      progressoBruto: row.progresso_pct as number | null,
    });
    return {
      ...row,
      progresso_bruto: effectiveProgress.progresso_bruto,
      progresso_efetivo: effectiveProgress.progresso_efetivo,
      completion_state: effectiveProgress.completion_state,
      completion_reason_code: effectiveProgress.completion_reason_code,
    };
  });

  return c.json({
    success: true,
    data,
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
  if (access.mode === 'restricted') {
    if (access.setorIds.length === 0) {
      throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
    }
    const setorPlaceholders = access.setorIds.map(() => '?').join(',');
    const sectorOk = await db
      .prepare(
        `SELECT 1 FROM lms_cursos lc
         WHERE lc.id = ? AND lc.empresa_id = ?
           AND (
             EXISTS (SELECT 1 FROM lms_cursos_setores lcs WHERE lcs.curso_id = lc.id AND lcs.empresa_id = lc.empresa_id AND lcs.setor_id IN (${setorPlaceholders}) AND lcs.deleted_at IS NULL)
             OR (
               NOT EXISTS (SELECT 1 FROM lms_cursos_setores lcs_chk WHERE lcs_chk.curso_id = lc.id AND lcs_chk.empresa_id = lc.empresa_id AND lcs_chk.deleted_at IS NULL)
               AND lc.qualificacao_tipo_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM qualificacoes_tipos_setores qts WHERE qts.tipo_id = lc.qualificacao_tipo_id AND qts.empresa_id = lc.empresa_id AND qts.setor_id IN (${setorPlaceholders}) AND qts.deleted_at IS NULL)
             )
           )
         LIMIT 1`,
      )
      .bind(cursoId, empresaId, ...access.setorIds, ...access.setorIds)
      .first();
    if (!sectorOk) throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
  }

  const funcionarioScope = employeeSectorSql(access, 'fx');
  let where = `WHERE m.curso_id = ?
                 AND m.empresa_id = ?
                 AND m.deleted_at IS NULL
                 AND EXISTS (
                   SELECT 1
                     FROM funcionarios fx
                    WHERE fx.id = m.funcionario_id
                      AND fx.empresa_id = m.empresa_id
                      AND fx.deleted_at IS NULL
                      AND COALESCE(fx.ativo, 1) = 1
                      AND UPPER(COALESCE(NULLIF(TRIM(fx.status), ''), 'ATIVO')) = 'ATIVO'
                      AND ${funcionarioScope.clause}
                 )`;
  const binds: (string | number)[] = [cursoId, empresaId, ...funcionarioScope.bindings];
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
       AND f.empresa_id = m.empresa_id
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

  const data = (rows.results ?? []).map((row) => {
    const effectiveProgress = resolveLmsEffectiveProgress({
      status: row.status as string | null,
      progressoBruto: row.progresso_pct as number | null,
    });
    return {
      ...row,
      progresso_bruto: effectiveProgress.progresso_bruto,
      progresso_efetivo: effectiveProgress.progresso_efetivo,
      completion_state: effectiveProgress.completion_state,
      completion_reason_code: effectiveProgress.completion_reason_code,
    };
  });

  return c.json({
    success: true,
    data,
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
          qt.validade AS qualificacao_validade, qt.vencimento_fim_mes AS qualificacao_vencimento_fim_mes, h.id AS h5p_conteudo_id,
        f.nome AS funcionario_nome
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
        LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.empresa_id = m.empresa_id
        LEFT JOIN lms_h5p_conteudos h
          ON h.empresa_id = c.empresa_id
         AND h.r2_key = c.scorm_package_r2_prefix
         AND h.deleted_at IS NULL
      LEFT JOIN funcionarios f
        ON f.id = m.funcionario_id
       AND f.empresa_id = m.empresa_id
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
      WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
            FROM funcionarios fx
           WHERE fx.id = m.funcionario_id
             AND fx.empresa_id = m.empresa_id
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
  } else {
    // Managers with a restricted sector scope must not see matrículas of
    // employees outside their assigned sectors, even when they know the id.
    const access = await getEmployeeSectorAccess(c, empresaId);
    if (access.mode === 'restricted') {
      await assertFuncionarioInScope(db, empresaId, Number(matricula.funcionario_id), access);
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

  const completionDiagnostic =
    tipoConteudo === 'scorm'
      ? buildMatriculaCompletionDiagnostic({
          matriculaStatus: String(matricula.status ?? ''),
          progressoPct: Number(matricula.progresso_pct ?? 0),
          masteryScore: Number(matricula.scorm_mastery_score ?? 0),
          scorm:
            progressoScorm == null
              ? null
              : {
                  lesson_status: String(progressoScorm.lesson_status ?? '') || null,
                  completion_status: String(progressoScorm.completion_status ?? '') || null,
                  success_status: String(progressoScorm.success_status ?? '') || null,
                  score_raw:
                    progressoScorm.score_raw == null ? null : Number(progressoScorm.score_raw),
                  score_max:
                    progressoScorm.score_max == null ? null : Number(progressoScorm.score_max),
                  score_scaled:
                    progressoScorm.score_scaled == null
                      ? null
                      : Number(progressoScorm.score_scaled),
                  suspend_data:
                    typeof progressoScorm.suspend_data === 'string'
                      ? progressoScorm.suspend_data
                      : null,
                  session_time:
                    typeof progressoScorm.session_time === 'string'
                      ? progressoScorm.session_time
                      : null,
                  total_time:
                    typeof progressoScorm.total_time === 'string'
                      ? progressoScorm.total_time
                      : null,
                  cmi_json:
                    typeof progressoScorm.cmi_json === 'string' ? progressoScorm.cmi_json : null,
                },
        })
      : null;

  const effectiveProgress = resolveLmsEffectiveProgress({
    status: matricula.status as string | null,
    progressoBruto: matricula.progresso_pct as number | null,
  });

  return c.json({
    success: true,
    data: {
      ...matricula,
      progresso_bruto: effectiveProgress.progresso_bruto,
      progresso_efetivo: effectiveProgress.progresso_efetivo,
      completion_state: effectiveProgress.completion_state,
      completion_reason_code: effectiveProgress.completion_reason_code,
      scorm_progresso: progressoScorm,
      xapi_summary: xapiSummary,
      completion_diagnostic: completionDiagnostic,
    },
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

  if (canManage) {
    const access = await getEmployeeSectorAccess(c, empresaId);
    if (access.mode === 'restricted') {
      // Verificar escopo setorial: funcionário pertence aos setores do gestor
      await assertFuncionarioInScope(db, empresaId, funcionario_id, access);
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
    await logLmsMatriculaAudit(db, c, {
      action: 'LMS_MATRICULA_PRESERVADA',
      matriculaId: existente.id,
      oldValues: { status: existente.status, deleted_at: existente.deleted_at },
      newValues: {
        curso_id,
        funcionario_id,
        data_expiracao: data_expiracao ?? null,
        observacoes: observacoes ?? null,
        preserved_existing_enrollment: true,
        explicit_reset_required: true,
      },
    });
    return c.json(
      {
        success: true,
        data: {
          id: existente.id,
          empresa_id: empresaId,
          curso_id,
          funcionario_id,
          status: existente.status,
          deleted_at: existente.deleted_at,
          data_expiracao: data_expiracao ?? null,
          observacoes: observacoes ?? null,
          preserved_existing_enrollment: true,
          explicit_reset_required: true,
        },
      },
      200,
    );
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

    if (!concorrente) {
      throw error;
    }
    await logLmsMatriculaAudit(db, c, {
      action: 'LMS_MATRICULA_PRESERVADA',
      matriculaId: concorrente.id,
      oldValues: { status: concorrente.status, deleted_at: concorrente.deleted_at },
      newValues: {
        curso_id,
        funcionario_id,
        data_expiracao: data_expiracao ?? null,
        observacoes: observacoes ?? null,
        preserved_existing_enrollment: true,
        explicit_reset_required: true,
        reconciled_unique_conflict: true,
      },
    });
    return c.json(
      {
        success: true,
        data: {
          id: concorrente.id,
          empresa_id: empresaId,
          curso_id,
          funcionario_id,
          status: concorrente.status,
          deleted_at: concorrente.deleted_at,
          data_expiracao: data_expiracao ?? null,
          observacoes: observacoes ?? null,
          preserved_existing_enrollment: true,
          explicit_reset_required: true,
        },
      },
      200,
    );
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
  if (loteAccess.mode === 'restricted') {
    if (loteAccess.setorIds.length === 0) {
      throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
    }
    const loteSetorPlaceholders = loteAccess.setorIds.map(() => '?').join(',');
    const sectorOk = await db
      .prepare(
        `SELECT 1 FROM lms_cursos lc
         WHERE lc.id = ? AND lc.empresa_id = ?
           AND (
             EXISTS (SELECT 1 FROM lms_cursos_setores lcs WHERE lcs.curso_id = lc.id AND lcs.empresa_id = lc.empresa_id AND lcs.setor_id IN (${loteSetorPlaceholders}) AND lcs.deleted_at IS NULL)
             OR (
               NOT EXISTS (SELECT 1 FROM lms_cursos_setores lcs_chk WHERE lcs_chk.curso_id = lc.id AND lcs_chk.empresa_id = lc.empresa_id AND lcs_chk.deleted_at IS NULL)
               AND lc.qualificacao_tipo_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM qualificacoes_tipos_setores qts WHERE qts.tipo_id = lc.qualificacao_tipo_id AND qts.empresa_id = lc.empresa_id AND qts.setor_id IN (${loteSetorPlaceholders}) AND qts.deleted_at IS NULL)
             )
           )
         LIMIT 1`,
      )
      .bind(curso_id, empresaId, ...loteAccess.setorIds, ...loteAccess.setorIds)
      .first();
    if (!sectorOk) throw new ApiError('Acesso negado: curso fora do seu escopo de setor', 403);
  }

  const funcionarioPlaceholders = funcionarioIdsUnicos.map(() => '?').join(', ');
  let funcionarioQuery = `SELECT id, nome
         FROM funcionarios
        WHERE empresa_id = ?
          AND deleted_at IS NULL
          AND COALESCE(ativo, 1) = 1
          AND UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
          AND id IN (${funcionarioPlaceholders})`;
  const funcionarioBinds: (number | string)[] = [empresaId, ...funcionarioIdsUnicos];
  if (loteAccess.mode === 'restricted') {
    funcionarioQuery += ` AND setor_id IN (${loteAccess.setorIds.map(() => '?').join(',')})`;
    funcionarioBinds.push(...loteAccess.setorIds);
  }
  const funcionarios = await db
    .prepare(funcionarioQuery)
    .bind(...funcionarioBinds)
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

      if (existente) {
        results.ignoradas++;
        continue;
      }
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

      if (concorrente) {
        results.ignoradas++;
        continue;
      }
      results.erros++;
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

  if (!hasRole(c, 'admin')) {
    const access = await getEmployeeSectorAccess(c, empresaId);
    if (access.mode === 'restricted') {
      await assertFuncionarioInScope(db, empresaId, existing.funcionario_id, access);
    }
  }

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
        c.id AS curso_id, c.scorm_mastery_score, c.gerar_qualificacao_ao_concluir,
        c.qualificacao_tipo_id, c.titulo AS curso_titulo,
        qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome,
        qt.categoria AS qualificacao_categoria, qt.validade AS qualificacao_validade,
        qt.vencimento_fim_mes AS qualificacao_vencimento_fim_mes
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.empresa_id = m.empresa_id
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
      curso_id: number;
      scorm_mastery_score: number;
      gerar_qualificacao_ao_concluir: number;
      qualificacao_tipo_id: number | null;
      curso_titulo: string;
      qualificacao_codigo: string | null;
      qualificacao_nome: string | null;
      qualificacao_categoria: string | null;
      qualificacao_validade: number | null;
      qualificacao_vencimento_fim_mes: VencimentoMode | null;
    }>();
  const scormAtual = await db
    .prepare(
      `SELECT lesson_status, completion_status, success_status,
              score_raw, score_max, score_min, score_scaled,
              session_time, total_time, suspend_data, launch_data, cmi_json
         FROM lms_progresso_scorm
        WHERE matricula_id = ?
          AND empresa_id = ?`,
    )
    .bind(d.matricula_id, empresaId)
    .first<{
      lesson_status: string | null;
      completion_status: string | null;
      success_status: string | null;
      score_raw: number | null;
      score_max: number | null;
      score_min: number | null;
      score_scaled: number | null;
      session_time: string | null;
      total_time: string | null;
      suspend_data: string | null;
      launch_data: string | null;
      cmi_json: string | null;
    }>();

  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  if (!canManage) {
    if (!callerFuncionarioId || matricula.funcionario_id !== callerFuncionarioId) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  // ─── Guard: prevent CONCLUIDO downgrade via SCORM commit ─────────────────
  // Completed enrollments must never be downgraded to incomplete/failed/not attempted.
  // Only idempotent commits preserving completion state are allowed.
  const matriculaWasConcluido = matricula.status === 'CONCLUIDO';
  if (matriculaWasConcluido) {
    const incomingStatus = (d.lesson_status ?? d.completion_status ?? '').toLowerCase();

    // Whitelist: statuses safe for an already-completed enrollment
    const safeStatuses = new Set(['passed', 'completed', 'complete', '']);

    if (!safeStatuses.has(incomingStatus)) {
      return c.json({
        success: true,
        data: {
          id: d.matricula_id,
          status: matricula.status,
          progresso_pct: matricula.progresso_pct,
          tentativas: matricula.tentativas,
          qualificacao_historico_id: matricula.qualificacao_historico_id,
          ignoredDowngrade: true,
          message: 'Curso já concluído. Commit ignorado para preservar conclusão.',
        },
      });
    }
  }

  const runtimeMerge = mergeScormRuntimeState({
    currentCmiJson: scormAtual?.cmi_json ?? null,
    incomingCmiJson: d.cmi_json ?? null,
    currentSuspendData: scormAtual?.suspend_data ?? null,
    incomingSuspendData: d.suspend_data ?? null,
  });
  const mergedCmiJson = runtimeMerge.cmiJson;
  const mergedLocation = runtimeMerge.location;

  // Calcular progresso usando o estado runtime reconciliado, não apenas o payload cru.
  const progressoAnterior = Number(matricula.progresso_pct ?? 0);
  const inferredFromLocation = extractProgressPctFromCmiJson(mergedCmiJson);
  const inferredFromScore =
    d.score_raw != null && d.score_max != null && d.score_max > 0
      ? clampPct((d.score_raw / d.score_max) * 100)
      : null;
  const effectiveScoreRaw = mergeMonotonicNumber(
    scormAtual?.score_raw ?? null,
    d.score_raw ?? null,
  );
  const effectiveScoreMax = mergeMonotonicNumber(
    scormAtual?.score_max ?? null,
    d.score_max ?? null,
  );
  const effectiveScoreScaled = mergeMonotonicNumber(
    scormAtual?.score_scaled ?? null,
    d.score_scaled ?? null,
  );
  const effectiveScorePct = resolveScormScorePct({
    scoreRaw: effectiveScoreRaw,
    scoreMax: effectiveScoreMax,
    scoreScaled: effectiveScoreScaled,
  });
  // "Rever" replay: nunca recomputar sucesso/falha (preserva data_conclusao/tentativas).
  const sucesso =
    !matriculaWasConcluido &&
    isScormSuccess(d, { masteryScore: matricula.scorm_mastery_score, effectiveScorePct });
  const falha = !matriculaWasConcluido && isScormFailed(d);

  let progressoPct = progressoAnterior;
  if (sucesso) {
    progressoPct = 100;
  } else if (inferredFromLocation != null || inferredFromScore != null) {
    // A nota NUNCA sobrepõe a localização: quiz por capítulo publica score alto no 1º
    // módulo e, sendo o progresso monotônico, fixava a matrícula em 100% ainda incompleta.
    progressoPct = Math.max(progressoAnterior, inferredFromLocation ?? inferredFromScore ?? 0);
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

  const preferIncomingScormState = shouldPreferIncomingScormState({
    current: {
      ...scormAtual,
      progresso_pct: progressoAnterior,
    },
    incoming: {
      lesson_status: d.lesson_status ?? null,
      completion_status: d.completion_status ?? null,
      success_status: d.success_status ?? null,
      suspend_data: d.suspend_data ?? null,
      cmi_json: d.cmi_json ?? null,
      progresso_pct: progressoPct,
    },
  });

  const currentLocation = extractScormLocationFromCmiJson(scormAtual?.cmi_json ?? null);
  const incomingLocation = extractScormLocationFromCmiJson(d.cmi_json ?? null);
  const completionDiagnostic = buildMatriculaCompletionDiagnostic({
    matriculaStatus: matricula.status,
    progressoPct,
    masteryScore: matricula.scorm_mastery_score,
    commit: d,
    scorm: {
      lesson_status: preferScormValue(
        scormAtual?.lesson_status ?? null,
        d.lesson_status ?? null,
        preferIncomingScormState,
      ),
      completion_status: preferScormValue(
        scormAtual?.completion_status ?? null,
        d.completion_status ?? null,
        preferIncomingScormState,
      ),
      success_status: preferScormValue(
        scormAtual?.success_status ?? null,
        d.success_status ?? null,
        preferIncomingScormState,
      ),
      score_raw: effectiveScoreRaw,
      score_max: effectiveScoreMax,
      score_scaled: effectiveScoreScaled,
      suspend_data: runtimeMerge.suspendData,
      session_time: preferScormValue(
        scormAtual?.session_time ?? null,
        d.session_time ?? null,
        preferIncomingScormState,
      ),
      total_time: preferScormValue(
        scormAtual?.total_time ?? null,
        d.total_time ?? null,
        preferIncomingScormState,
      ),
      cmi_json: mergedCmiJson,
    },
  });
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
      preferScormValue(
        scormAtual?.lesson_status ?? null,
        d.lesson_status ?? null,
        preferIncomingScormState,
      ),
      preferScormValue(
        scormAtual?.completion_status ?? null,
        d.completion_status ?? null,
        preferIncomingScormState,
      ),
      preferScormValue(
        scormAtual?.success_status ?? null,
        d.success_status ?? null,
        preferIncomingScormState,
      ),
      effectiveScoreRaw,
      effectiveScoreMax,
      mergeMonotonicNumber(scormAtual?.score_min ?? null, d.score_min ?? null),
      effectiveScoreScaled,
      preferScormValue(
        scormAtual?.session_time ?? null,
        d.session_time ?? null,
        preferIncomingScormState,
      ),
      preferScormValue(
        scormAtual?.total_time ?? null,
        d.total_time ?? null,
        preferIncomingScormState,
      ),
      runtimeMerge.suspendData,
      preferScormValue(
        scormAtual?.launch_data ?? null,
        d.launch_data ?? null,
        preferIncomingScormState,
      ),
      mergedCmiJson,
    )
    .run();

  emitScormCommitTelemetry({
    matriculaId: d.matricula_id,
    cursoTitulo: matricula.curso_titulo,
    preferIncomingState: preferIncomingScormState,
    previousLocation: currentLocation,
    incomingLocation,
    finalLocation: mergedLocation,
    previousSuspendData: scormAtual?.suspend_data ?? null,
    incomingSuspendData: d.suspend_data ?? null,
    finalSuspendData: runtimeMerge.suspendData,
    decisions: runtimeMerge.decisions,
  });

  // Atualizar status da matrícula
  const statusAnterior = matricula.status;
  let statusSemConclusao = matricula.status;
  if (matricula.status === 'NAO_INICIADO') {
    statusSemConclusao = mergeMonotonicMatriculaStatus(matricula.status, 'EM_ANDAMENTO');
  }

  let novoStatus = statusSemConclusao;
  let dataConclusao: string | null = null;
  if (sucesso) {
    novoStatus = mergeMonotonicMatriculaStatus(statusSemConclusao, 'CONCLUIDO');
    dataConclusao = new Date().toISOString().slice(0, 10);
  } else if (falha) {
    novoStatus = mergeMonotonicMatriculaStatus(statusSemConclusao, 'REPROVADO');
    dataConclusao = new Date().toISOString().slice(0, 10);
  }

  // GUARD: Se a matrícula já estava CONCLUÍDA antes deste commit SCORM, a
  // qualificação e certificado já foram gerados — pular para evitar duplicatas.
  const isNewCompletion =
    novoStatus === 'CONCLUIDO' && statusAnterior !== 'CONCLUIDO' && Boolean(dataConclusao);

  let qualificacaoGerada: Record<string, unknown> | null = null;
  let qualificationFailed = false;
  let statusFinal = novoStatus;
  let dataConclusaoFinal = dataConclusao;

  if (isNewCompletion) {
    // Toda a persistência da conclusão (Histórico, vínculo, ciclo, matrícula,
    // auditoria) é delegada ao serviço canônico — atômica via db.batch(). Ver
    // worker-airtrust/src/services/lms-completion.ts.
    try {
      const result = await completeLmsMatricula({
        db,
        empresaId,
        matriculaId: d.matricula_id,
        funcionarioId: matricula.funcionario_id,
        cursoId: matricula.curso_id,
        cursoTitulo: matricula.curso_titulo,
        gerarQualificacaoAoConcluir: matricula.gerar_qualificacao_ao_concluir === 1,
        qualificacaoTipoId: matricula.qualificacao_tipo_id,
        qualificacaoCodigo: matricula.qualificacao_codigo,
        qualificacaoNome: matricula.qualificacao_nome ?? matricula.curso_titulo,
        qualificacaoCategoria: matricula.qualificacao_categoria,
        validade: matricula.qualificacao_validade,
        vencimentoFimMes: matricula.qualificacao_vencimento_fim_mes,
        dataConclusao: dataConclusao as string,
        existingHistoricoId: matricula.qualificacao_historico_id,
        progressoPct,
        scoreFinal: effectiveScoreRaw,
        action: 'LMS_MATRICULA_CONCLUIDA',
        actorUserId: getCallerUserId(c),
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? undefined,
        userAgent: c.req.header('user-agent') ?? undefined,
      });
      if (result.qualificacaoHistoricoId) {
        qualificacaoGerada = {
          qualificacao_id: result.qualificacaoHistoricoId,
          qualificacao_historico_id: result.qualificacaoHistoricoId,
        };
      }
    } catch (e) {
      if (!(e instanceof LmsCompletionRejectedError)) throw e;
      // Qualificação exigida e não garantida: o batch inteiro reverteu — a
      // matrícula permanece no status pré-conclusão, sem qualquer efeito
      // parcial. Retry idempotente no próximo commit.
      qualificationFailed = true;
      statusFinal = statusSemConclusao;
      dataConclusaoFinal = null;
      console.error('[LMS] Conclusão via SCORM rejeitada (batch revertido):', e);
    }

    // tentativas/ultimo_slide/session-level fields não fazem parte do batch
    // canônico (são específicos de runtime SCORM, não da conclusão em si).
    await db
      .prepare(
        `UPDATE lms_matriculas
            SET ultimo_slide = MAX(COALESCE(ultimo_slide, 0), COALESCE(?, 0)),
                tentativas = tentativas + 1,
                updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ?`,
      )
      .bind(mergedLocation?.current ?? null, d.matricula_id, empresaId)
      .run();

    if (!qualificationFailed && qualificacaoGerada) {
      try {
        const historicoId = qualificacaoGerada.qualificacao_historico_id as number;
        const certResult = await ensureCertificateForQualification(c.env, historicoId, empresaId, {
          actorUserId: getCallerUserId(c),
        });
        console.log(`[auto-cert/scorm] historicoId=${historicoId} state=${certResult.state}`);
      } catch (certErr) {
        console.error(
          `[auto-cert/scorm] ERROR historicoId=${qualificacaoGerada.qualificacao_historico_id}:`,
          certErr,
        );
      }
    }
  } else {
    // Sem transição para CONCLUIDO nesta chamada (progresso parcial ou
    // REPROVADO): mantém a atualização direta de matrícula, fora do serviço
    // canônico (que só cobre a conclusão em si).
    await db
      .prepare(
        `
        UPDATE lms_matriculas
        SET status = ?, progresso_pct = MAX(COALESCE(progresso_pct, 0), ?),
            ultimo_slide = MAX(COALESCE(ultimo_slide, 0), COALESCE(?, 0)),
            data_inicio = COALESCE(data_inicio, datetime('now')),
            data_conclusao = COALESCE(?, data_conclusao),
            tentativas = tentativas + CASE WHEN ? = 1 THEN 1 ELSE 0 END,
            score_final = CASE
              WHEN ? IS NULL THEN score_final
              WHEN score_final IS NULL THEN ?
              ELSE MAX(score_final, ?)
            END,
            updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?
      `,
      )
      .bind(
        statusFinal,
        progressoPct,
        mergedLocation?.current ?? null,
        dataConclusaoFinal,
        sucesso || falha ? 1 : 0,
        effectiveScoreRaw,
        effectiveScoreRaw,
        effectiveScoreRaw,
        d.matricula_id,
        empresaId,
      )
      .run();
    await syncMatriculaCycleFromMatricula(db, { matriculaId: d.matricula_id });
  }

  novoStatus = statusFinal;

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

  if (sucesso) {
    await logLmsMatriculaAudit(db, c, {
      action: 'SCORM_COMPLETION_ACCEPTED',
      matriculaId: d.matricula_id,
      newValues: {
        commit_event: d.commit_event ?? null,
        completion_diagnostic: completionDiagnostic,
      },
    });

    await logLmsMatriculaAudit(db, c, {
      action: qualificacaoGerada ? 'SCORM_QUALIFICATION_TRIGGERED' : 'SCORM_QUALIFICATION_SKIPPED',
      matriculaId: d.matricula_id,
      newValues: {
        novo_status: novoStatus,
        commit_event: d.commit_event ?? null,
        qualificacao_gerada: qualificacaoGerada,
      },
    });
  } else if (completionDiagnostic.status === 'candidate') {
    await logLmsMatriculaAudit(db, c, {
      action: 'SCORM_COMPLETION_CANDIDATE',
      matriculaId: d.matricula_id,
      newValues: {
        commit_event: d.commit_event ?? null,
        completion_candidate: d.completion_candidate ?? null,
        completion_observed_at: d.completion_observed_at ?? null,
        completion_diagnostic: completionDiagnostic,
      },
    });
  } else if (
    completionDiagnostic.code === 'SCORM_FINAL_COMMIT_MISSING' ||
    completionDiagnostic.code === 'SCORM_STATUS_INCONSISTENT'
  ) {
    await logLmsMatriculaAudit(db, c, {
      action: completionDiagnostic.code,
      matriculaId: d.matricula_id,
      newValues: {
        commit_event: d.commit_event ?? null,
        completion_candidate: d.completion_candidate ?? null,
        completion_diagnostic: completionDiagnostic,
      },
    });
  }

  const effectiveProgress = resolveLmsEffectiveProgress({
    status: novoStatus,
    progressoBruto: progressoPct,
  });

  if (qualificationFailed) {
    // Qualificação exigida e não garantida: erro HTTP sanitizado, nunca 200
    // com qualification_failed:true. Estado persistido já ficou inalterado
    // (batch revertido) — cliente pode reenviar o commit para retry.
    return c.json(
      {
        success: false,
        error:
          'Não foi possível confirmar a qualificação exigida por este curso. A matrícula não foi concluída — tente novamente.',
        code: 'LMS_QUALIFICATION_COMPLETION_FAILED',
        data: {
          matricula_id: d.matricula_id,
          novo_status: novoStatus,
          progresso_bruto: effectiveProgress.progresso_bruto,
          progresso_efetivo: effectiveProgress.progresso_efetivo,
          completion_state: effectiveProgress.completion_state,
          completion_reason_code: effectiveProgress.completion_reason_code,
          qualificacao_gerada: null,
          completion_diagnostic: completionDiagnostic,
        },
      },
      409,
    );
  }

  return c.json({
    success: true,
    data: {
      matricula_id: d.matricula_id,
      novo_status: novoStatus,
      progresso_pct: progressoPct,
      progresso_bruto: effectiveProgress.progresso_bruto,
      progresso_efetivo: effectiveProgress.progresso_efetivo,
      completion_state: effectiveProgress.completion_state,
      completion_reason_code: effectiveProgress.completion_reason_code,
      qualificacao_gerada: qualificacaoGerada,
      completion_diagnostic: completionDiagnostic,
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
              c.id AS curso_id, c.tipo_conteudo, c.gerar_qualificacao_ao_concluir, c.qualificacao_tipo_id, c.scorm_mastery_score,
              c.titulo AS curso_titulo,
              qt.codigo AS qualificacao_codigo, qt.nome AS qualificacao_nome,
              qt.categoria AS qualificacao_categoria, qt.validade AS qualificacao_validade,
              qt.vencimento_fim_mes AS qualificacao_vencimento_fim_mes
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
         LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.empresa_id = m.empresa_id
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
      curso_id: number;
      tipo_conteudo: string | null;
      gerar_qualificacao_ao_concluir: number;
      qualificacao_tipo_id: number | null;
      scorm_mastery_score: number | null;
      curso_titulo: string;
      qualificacao_codigo: string | null;
      qualificacao_nome: string | null;
      qualificacao_categoria: string | null;
      qualificacao_validade: number | null;
      qualificacao_vencimento_fim_mes: VencimentoMode | null;
    }>();

  const scormAtual = await db
    .prepare(
      `SELECT lesson_status, completion_status, success_status,
              score_raw, score_max, score_scaled,
              session_time, total_time, suspend_data, cmi_json
         FROM lms_progresso_scorm
        WHERE matricula_id = ?
          AND empresa_id = ?`,
    )
    .bind(matriculaId, empresaId)
    .first<{
      lesson_status: string | null;
      completion_status: string | null;
      success_status: string | null;
      score_raw: number | null;
      score_max: number | null;
      score_scaled: number | null;
      session_time: string | null;
      total_time: string | null;
      suspend_data: string | null;
      cmi_json: string | null;
    }>();

  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  if (!canManage) {
    if (!callerFuncionarioId || callerFuncionarioId !== matricula.funcionario_id) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  const completionDiagnostic = buildMatriculaCompletionDiagnostic({
    matriculaStatus: matricula.status,
    progressoPct: matricula.progresso_pct,
    masteryScore: matricula.scorm_mastery_score,
    scorm: scormAtual,
  });
  if (matricula.status === 'CONCLUIDO') {
    return c.json({
      success: true,
      data: {
        matricula_id: matriculaId,
        novo_status: 'CONCLUIDO',
        progresso_pct: 100,
        qualificacao_gerada: null,
        completion_diagnostic: completionDiagnostic,
      },
    });
  }

  if (requiresExplicitScormCompletion(matricula.tipo_conteudo, completionDiagnostic)) {
    await logLmsMatriculaAudit(db, c, {
      action: 'SCORM_COMPLETION_REJECTED',
      matriculaId,
      newValues: {
        origem: 'manual-finalize-endpoint',
        completion_diagnostic: completionDiagnostic,
      },
    });

    return c.json(
      {
        success: false,
        error:
          'Nao foi possivel confirmar a conclusao com os dados SCORM disponiveis. Cursos SCORM exigem status final explicito passed/completed.',
        code: 'SCORM_COMPLETION_REJECTED',
        data: {
          matricula_id: matriculaId,
          novo_status: matricula.status,
          progresso_pct: matricula.progresso_pct,
          qualificacao_gerada: null,
          completion_diagnostic: completionDiagnostic,
        },
      },
      409,
    );
  }

  if (
    requiresServerValidatedNonScormEvidence(
      matricula.tipo_conteudo,
      matricula.gerar_qualificacao_ao_concluir,
    )
  ) {
    return c.json(
      {
        success: false,
        code: 'CONTENT_EVIDENCE_REQUIRED',
        error:
          'Conteúdo não-SCORM qualificante exige evidência de conclusão validada pelo servidor.',
        data: {
          matricula_id: matriculaId,
          novo_status: matricula.status,
          progresso_pct: matricula.progresso_pct,
          qualificacao_gerada: null,
        },
      },
      409,
    );
  }

  const dataConclusao = new Date().toISOString().slice(0, 10);

  // Toda a persistência da conclusão é delegada ao serviço canônico —
  // atômica via db.batch(). Se a qualificação exigida não puder ser
  // garantida, o batch inteiro reverte e a matrícula permanece como estava.
  let qualificacaoGerada: Record<string, unknown> | null = null;
  try {
    const result = await completeLmsMatricula({
      db,
      empresaId,
      matriculaId,
      funcionarioId: matricula.funcionario_id,
      cursoId: matricula.curso_id,
      cursoTitulo: matricula.curso_titulo,
      gerarQualificacaoAoConcluir: matricula.gerar_qualificacao_ao_concluir === 1,
      qualificacaoTipoId: matricula.qualificacao_tipo_id,
      qualificacaoCodigo: matricula.qualificacao_codigo,
      qualificacaoNome: matricula.qualificacao_nome ?? matricula.curso_titulo,
      qualificacaoCategoria: matricula.qualificacao_categoria,
      validade: matricula.qualificacao_validade,
      vencimentoFimMes: matricula.qualificacao_vencimento_fim_mes,
      dataConclusao,
      existingHistoricoId: matricula.qualificacao_historico_id,
      progressoPct: 100,
      action: 'LMS_MATRICULA_FINALIZADA_MANUAL',
      actorUserId: getCallerUserId(c),
      ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? undefined,
      userAgent: c.req.header('user-agent') ?? undefined,
    });
    if (result.qualificacaoHistoricoId) {
      qualificacaoGerada = {
        qualificacao_id: result.qualificacaoHistoricoId,
        qualificacao_historico_id: result.qualificacaoHistoricoId,
      };
    }
  } catch (error) {
    if (!(error instanceof LmsCompletionRejectedError)) throw error;
    console.error('[LMS] Conclusão manual rejeitada (batch revertido):', error);
    await logLmsMatriculaAudit(db, c, {
      action: 'LMS_QUALIFICATION_COMPLETION_FAILED',
      matriculaId,
      newValues: {
        origem: 'manual-finalize-endpoint',
        completion_diagnostic: completionDiagnostic,
      },
    });

    return c.json(
      {
        success: false,
        error:
          'Não foi possível confirmar a qualificação exigida por este curso. A matrícula não foi concluída — tente novamente.',
        code: 'LMS_QUALIFICATION_COMPLETION_FAILED',
        data: {
          matricula_id: matriculaId,
          novo_status: matricula.status,
          progresso_pct: matricula.progresso_pct,
          qualificacao_gerada: null,
          completion_diagnostic: completionDiagnostic,
        },
      },
      409,
    );
  }

  await logLmsMatriculaAudit(db, c, {
    action: 'SCORM_COMPLETION_ACCEPTED',
    matriculaId,
    newValues: {
      origem: 'manual-finalize-endpoint',
      completion_diagnostic: completionDiagnostic,
    },
  });

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
      completion_diagnostic: completionDiagnostic,
    },
  });

  await logLmsMatriculaAudit(db, c, {
    action: qualificacaoGerada ? 'SCORM_QUALIFICATION_TRIGGERED' : 'SCORM_QUALIFICATION_SKIPPED',
    matriculaId,
    newValues: {
      origem: 'manual-finalize-endpoint',
      qualificacao_gerada: qualificacaoGerada,
    },
  });

  return c.json({
    success: true,
    data: {
      matricula_id: matriculaId,
      novo_status: 'CONCLUIDO',
      progresso_pct: 100,
      progresso_bruto: 100,
      progresso_efetivo: 100,
      completion_state: 'COMPLETED',
      completion_reason_code: 'MATRICULA_CONCLUIDA',
      qualificacao_gerada: qualificacaoGerada,
      completion_diagnostic: completionDiagnostic,
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
      `SELECT m.id, m.status, m.progresso_pct, m.funcionario_id, m.qualificacao_historico_id,
              c.id AS curso_id, c.titulo AS curso_titulo, c.qualificacao_tipo_id,
              c.tipo_conteudo, c.scorm_mastery_score, c.gerar_qualificacao_ao_concluir,
              qt.nome AS qualificacao_nome, qt.codigo AS qualificacao_codigo,
              qt.categoria AS qualificacao_categoria, qt.validade AS qualificacao_validade,
              qt.vencimento_fim_mes AS qualificacao_vencimento_fim_mes
         FROM lms_matriculas m
         JOIN lms_cursos c ON c.id = m.curso_id AND c.empresa_id = m.empresa_id
         LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id AND qt.empresa_id = m.empresa_id AND qt.deleted_at IS NULL
        WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL`,
    )
    .bind(matriculaId, empresaId)
    .first<{
      id: number;
      status: string;
      progresso_pct: number | null;
      funcionario_id: number;
      qualificacao_historico_id: number | null;
      curso_id: number;
      curso_titulo: string;
      qualificacao_tipo_id: number | null;
      tipo_conteudo: string | null;
      scorm_mastery_score: number | null;
      gerar_qualificacao_ao_concluir: number;
      qualificacao_nome: string | null;
      qualificacao_codigo: string | null;
      qualificacao_categoria: string | null;
      qualificacao_validade: number | null;
      qualificacao_vencimento_fim_mes: VencimentoMode | null;
    }>();
  if (!existing) throw new ApiError('Matrícula não encontrada', 404);

  if (!hasRole(c, 'admin')) {
    const access = await getEmployeeSectorAccess(c, empresaId);
    if (access.mode === 'restricted') {
      await assertFuncionarioInScope(db, empresaId, existing.funcionario_id, access);
    }
  }

  const { status, observacoes } = parsed.data;
  const now = new Date().toISOString().slice(0, 10);

  // ── Gate obrigatório para CONCLUIDO ─────────────────────────────────────────
  if (status === 'CONCLUIDO') {
    // Qualificação aeronáutica gerada por este endpoint exige papel admin.
    // Manager pode alterar outros status, mas não pode mintar qualificações
    // administrativamente sem evidência de conclusão.
    if (existing.qualificacao_tipo_id && !hasRole(c, 'admin')) {
      throw new ApiError(
        'Somente administradores podem concluir matrículas vinculadas a qualificações',
        403,
      );
    }

    // Cursos SCORM exigem evidência real de conclusão — mesmo gate do /finalizar.
    const isScorm = String(existing.tipo_conteudo ?? 'scorm').toLowerCase() === 'scorm';
    if (isScorm) {
      const scormAtual = await db
        .prepare(
          `SELECT lesson_status, completion_status, success_status,
                  score_raw, score_max, score_scaled,
                  session_time, total_time, suspend_data, cmi_json
             FROM lms_progresso_scorm
            WHERE matricula_id = ? AND empresa_id = ?`,
        )
        .bind(matriculaId, empresaId)
        .first<{
          lesson_status: string | null;
          completion_status: string | null;
          success_status: string | null;
          score_raw: number | null;
          score_max: number | null;
          score_scaled: number | null;
          session_time: string | null;
          total_time: string | null;
          suspend_data: string | null;
          cmi_json: string | null;
        }>();

      const completionDiagnostic = buildMatriculaCompletionDiagnostic({
        matriculaStatus: existing.status,
        progressoPct: existing.progresso_pct,
        masteryScore: existing.scorm_mastery_score,
        scorm: scormAtual,
      });

      if (requiresExplicitScormCompletion(existing.tipo_conteudo, completionDiagnostic)) {
        await logLmsMatriculaAudit(db, c, {
          action: 'SCORM_COMPLETION_REJECTED',
          matriculaId,
          newValues: {
            origem: 'admin-patch-status-endpoint',
            completion_diagnostic: completionDiagnostic,
          },
        });
        return c.json(
          {
            success: false,
            error:
              'Nao foi possivel confirmar a conclusao com os dados SCORM disponiveis. Cursos SCORM exigem status final explicito passed/completed.',
            code: 'SCORM_COMPLETION_REJECTED',
            data: { completion_diagnostic: completionDiagnostic },
          },
          409,
        );
      }
    }

    if (
      requiresServerValidatedNonScormEvidence(
        existing.tipo_conteudo,
        existing.gerar_qualificacao_ao_concluir,
      )
    ) {
      return c.json(
        {
          success: false,
          code: 'CONTENT_EVIDENCE_REQUIRED',
          error:
            'Conteúdo não-SCORM qualificante exige evidência de conclusão validada pelo servidor.',
          data: {
            matricula_id: matriculaId,
            novo_status: existing.status,
            progresso_pct: existing.progresso_pct,
            qualificacao_gerada: null,
          },
        },
        409,
      );
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  const dataConclusao = status === 'CONCLUIDO' || status === 'REPROVADO' ? now : null;
  let qualificacaoHistoricoId = existing.qualificacao_historico_id;

  if (status === 'CONCLUIDO') {
    // Toda a persistência da conclusão é delegada ao serviço canônico —
    // atômica via db.batch(). Ver worker-airtrust/src/services/lms-completion.ts.
    try {
      const result = await completeLmsMatricula({
        db,
        empresaId,
        matriculaId,
        funcionarioId: existing.funcionario_id,
        cursoId: existing.curso_id,
        cursoTitulo: existing.curso_titulo,
        gerarQualificacaoAoConcluir: existing.gerar_qualificacao_ao_concluir === 1,
        qualificacaoTipoId: existing.qualificacao_tipo_id,
        qualificacaoCodigo: existing.qualificacao_codigo,
        qualificacaoNome: existing.qualificacao_nome ?? existing.curso_titulo,
        qualificacaoCategoria: existing.qualificacao_categoria,
        validade: existing.qualificacao_validade,
        vencimentoFimMes: existing.qualificacao_vencimento_fim_mes,
        dataConclusao: dataConclusao as string,
        existingHistoricoId: existing.qualificacao_historico_id,
        progressoPct: 100,
        action: 'LMS_MATRICULA_CONCLUIDA',
        actorUserId: getCallerUserId(c),
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? undefined,
        userAgent: c.req.header('user-agent') ?? undefined,
      });
      qualificacaoHistoricoId =
        result.qualificacaoHistoricoId ?? existing.qualificacao_historico_id;
    } catch (error) {
      if (!(error instanceof LmsCompletionRejectedError)) throw error;
      console.error('[LMS] Conclusão via PATCH status rejeitada (batch revertido):', error);
      await logLmsMatriculaAudit(db, c, {
        action: 'LMS_QUALIFICATION_COMPLETION_FAILED',
        matriculaId,
        newValues: { origem: 'admin-patch-status-endpoint' },
      });
      return c.json(
        {
          success: false,
          error:
            'Não foi possível confirmar a qualificação exigida por este curso. A matrícula não foi concluída — tente novamente.',
          code: 'LMS_QUALIFICATION_COMPLETION_FAILED',
          data: {
            matricula_id: matriculaId,
            novo_status: existing.status,
            progresso_pct: existing.progresso_pct,
            qualificacao_gerada: null,
          },
        },
        409,
      );
    }

    if (observacoes) {
      await db
        .prepare(
          `UPDATE lms_matriculas SET observacoes = ?, updated_at = datetime('now') WHERE id = ? AND empresa_id = ?`,
        )
        .bind(observacoes, matriculaId, empresaId)
        .run();
    }

    if (qualificacaoHistoricoId) {
      try {
        const certResult = await ensureCertificateForQualification(
          c.env,
          qualificacaoHistoricoId,
          empresaId,
          {
            actorUserId: getCallerUserId(c) ?? undefined,
          },
        );
        console.log(
          `[auto-cert/status] historicoId=${qualificacaoHistoricoId} state=${certResult.state}`,
        );
      } catch (certErr) {
        console.error(`[auto-cert/status] ERROR historicoId=${qualificacaoHistoricoId}:`, certErr);
      }
    }
  } else {
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
  const updatedRow = (updated ?? {}) as { status?: string; progresso_pct?: number | null };
  const effectiveProgress = resolveLmsEffectiveProgress({
    status: updatedRow.status,
    progressoBruto: updatedRow.progresso_pct,
  });

  return c.json({
    success: true,
    data: {
      ...(updated as Record<string, unknown>),
      progresso_bruto: effectiveProgress.progresso_bruto,
      progresso_efetivo: effectiveProgress.progresso_efetivo,
      completion_state: effectiveProgress.completion_state,
      completion_reason_code: effectiveProgress.completion_reason_code,
    },
  });
});

// ── Salvar progresso (PDF / PPTX / H5P / vídeo) ──────────────────────────────
// PATCH /matriculas/:id/progresso
// Body: { progresso_pct: number; ultimo_slide?: number; ultima_pagina?: number }

const PatchProgressoSchema = z.object({
  progresso_pct: z.number().int().min(0).max(100).optional(),
  ultimo_slide: z.number().int().min(0).optional(),
  ultima_pagina: z.number().int().min(0).optional(),
});

const ProgressRecoveryDryRunSchema = z.object({
  target_lesson_location: z
    .string()
    .trim()
    .regex(/^\d+\/\d+$/, 'target_lesson_location deve estar no formato n/total (ex: "113/405")'),
  target_progress_pct: z.number().int().min(0).max(100),
  reason: z.string().trim().min(5).max(1000),
  evidence_source: z.string().trim().min(3).max(2000),
  operator_note: z.string().trim().max(2000).optional().nullable(),
  target_lesson_status: z.string().trim().max(50).optional(),
  target_score_raw: z.number().optional(),
  target_matricula_status: z.string().trim().max(50).optional(),
});

const ProgressRecoveryApplySchema = z.object({
  target_lesson_location: z
    .string()
    .trim()
    .regex(/^\d+\/\d+$/, 'target_lesson_location deve estar no formato n/total (ex: "113/405")'),
  target_progress_pct: z.number().int().min(0).max(100),
  reason: z.string().trim().min(5).max(1000),
  evidence_source: z.string().trim().min(3).max(2000),
  operator_note: z.string().trim().min(3).max(2000),
  dry_run_reference: z.string().trim().min(8),
  target_lesson_status: z.string().trim().max(50).optional(),
  target_score_raw: z.number().optional(),
  target_matricula_status: z.string().trim().max(50).optional(),
});

const ProgressRecoveryRollbackSchema = z.object({
  audit_log_id: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
});

type ProgressRecoveryEnrollment = {
  id: number;
  curso_id: number;
  funcionario_id: number;
  status: string;
  progresso_pct: number | null;
  ultimo_slide: number | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  qualificacao_historico_id: number | null;
  curso_titulo: string;
  tipo_conteudo: string | null;
  scorm_id: number | null;
  lesson_status: string | null;
  completion_status: string | null;
  success_status: string | null;
  score_raw: number | null;
  score_max: number | null;
  score_min: number | null;
  score_scaled: number | null;
  session_time: string | null;
  total_time: string | null;
  session_count: number | null;
  suspend_data: string | null;
  launch_data: string | null;
  cmi_json: string | null;
};

type ProgressRecoveryStateSnapshot = {
  matricula: {
    id: number;
    curso_id: number;
    funcionario_id: number;
    status: string;
    progresso_pct: number;
    ultimo_slide: number;
    data_inicio: string | null;
    data_conclusao: string | null;
    qualificacao_historico_id: number | null;
  };
  scorm: {
    row_present: boolean;
    id: number | null;
    lesson_location: string | null;
    lesson_status: string | null;
    completion_status: string | null;
    success_status: string | null;
    score_raw: number | null;
    score_max: number | null;
    score_min: number | null;
    score_scaled: number | null;
    session_time: string | null;
    total_time: string | null;
    session_count: number | null;
    suspend_data: string | null;
    launch_data: string | null;
    cmi_json: string | null;
  };
};

type ProgressRecoveryEvaluation = {
  enrollment: ProgressRecoveryEnrollment;
  currentEffectiveProgress: number;
  currentStrongSlide: number;
  currentLessonLocation: string | null;
  blockers: string[];
  risks: string[];
  simulatedProgress: number;
  simulatedSlide: number;
  simulatedMatriculaStatus: string;
  simulatedLessonLocation: string | null;
  differences: Array<{ field: string; current: unknown; simulated: unknown }>;
  currentSnapshot: ProgressRecoveryStateSnapshot;
  simulatedSnapshot: ProgressRecoveryStateSnapshot;
  dryRunReference: string;
};

function extractLessonLocationValue(cmiJson: string | null | undefined): string | null {
  if (!cmiJson) return null;
  try {
    const parsed = JSON.parse(cmiJson) as Record<string, unknown>;
    const location = parsed['cmi.location'] ?? parsed['cmi.core.lesson_location'];
    return typeof location === 'string' && location.trim() ? location.trim() : null;
  } catch {
    return null;
  }
}

function normalizeStatusToken(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function hashProgressRecoveryReference(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `prr-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function buildProgressRecoveryReference(snapshot: ProgressRecoveryStateSnapshot) {
  return hashProgressRecoveryReference(
    JSON.stringify({
      matricula: {
        id: snapshot.matricula.id,
        curso_id: snapshot.matricula.curso_id,
        funcionario_id: snapshot.matricula.funcionario_id,
        status: snapshot.matricula.status,
        progresso_pct: snapshot.matricula.progresso_pct,
        ultimo_slide: snapshot.matricula.ultimo_slide,
        data_inicio: snapshot.matricula.data_inicio,
        data_conclusao: snapshot.matricula.data_conclusao,
        qualificacao_historico_id: snapshot.matricula.qualificacao_historico_id,
      },
      scorm: {
        row_present: snapshot.scorm.row_present,
        lesson_location: snapshot.scorm.lesson_location,
        lesson_status: snapshot.scorm.lesson_status,
        completion_status: snapshot.scorm.completion_status,
        success_status: snapshot.scorm.success_status,
        score_raw: snapshot.scorm.score_raw,
        score_max: snapshot.scorm.score_max,
        score_min: snapshot.scorm.score_min,
        score_scaled: snapshot.scorm.score_scaled,
        session_time: snapshot.scorm.session_time,
        total_time: snapshot.scorm.total_time,
        session_count: snapshot.scorm.session_count,
        suspend_data: snapshot.scorm.suspend_data,
        launch_data: snapshot.scorm.launch_data,
        cmi_json: snapshot.scorm.cmi_json,
      },
    }),
  );
}

function buildProgressRecoverySnapshot(params: {
  enrollment: ProgressRecoveryEnrollment;
  progressPct: number;
  slide: number;
  lessonLocation: string | null;
  matriculaStatus: string;
  cmiJson: string | null;
  suspendData: string | null;
}) {
  return {
    matricula: {
      id: params.enrollment.id,
      curso_id: params.enrollment.curso_id,
      funcionario_id: params.enrollment.funcionario_id,
      status: params.matriculaStatus,
      progresso_pct: params.progressPct,
      ultimo_slide: params.slide,
      data_inicio: params.enrollment.data_inicio,
      data_conclusao: params.enrollment.data_conclusao,
      qualificacao_historico_id: params.enrollment.qualificacao_historico_id,
    },
    scorm: {
      row_present: params.enrollment.scorm_id != null,
      id: params.enrollment.scorm_id,
      lesson_location: params.lessonLocation,
      lesson_status: params.enrollment.lesson_status,
      completion_status: params.enrollment.completion_status,
      success_status: params.enrollment.success_status,
      score_raw: params.enrollment.score_raw,
      score_max: params.enrollment.score_max,
      score_min: params.enrollment.score_min,
      score_scaled: params.enrollment.score_scaled,
      session_time: params.enrollment.session_time,
      total_time: params.enrollment.total_time,
      session_count: params.enrollment.session_count,
      suspend_data: params.suspendData,
      launch_data: params.enrollment.launch_data,
      cmi_json: params.cmiJson,
    },
  } satisfies ProgressRecoveryStateSnapshot;
}

function summarizeProgressRecoverySnapshot(snapshot: ProgressRecoveryStateSnapshot) {
  return {
    matricula: {
      id: snapshot.matricula.id,
      status: snapshot.matricula.status,
      progresso_pct: snapshot.matricula.progresso_pct,
      ultimo_slide: snapshot.matricula.ultimo_slide,
      qualificacao_historico_id: snapshot.matricula.qualificacao_historico_id,
    },
    scorm: {
      lesson_location: snapshot.scorm.lesson_location,
      lesson_status: snapshot.scorm.lesson_status,
      completion_status: snapshot.scorm.completion_status,
      success_status: snapshot.scorm.success_status,
      score_raw: snapshot.scorm.score_raw,
      score_max: snapshot.scorm.score_max,
      score_scaled: snapshot.scorm.score_scaled,
      suspend_data_present: Boolean(snapshot.scorm.suspend_data?.trim()),
    },
  };
}

async function loadProgressRecoveryEnrollment(
  db: D1Database,
  matriculaId: number,
  empresaId: number,
) {
  return db
    .prepare(
      `SELECT m.id, m.curso_id, m.funcionario_id, m.status, m.progresso_pct, m.ultimo_slide,
              m.data_inicio, m.data_conclusao, m.qualificacao_historico_id,
              c.titulo AS curso_titulo, c.tipo_conteudo,
              ps.id AS scorm_id, ps.lesson_status, ps.completion_status, ps.success_status,
              ps.score_raw, ps.score_max, ps.score_min, ps.score_scaled,
              ps.session_time, ps.total_time, ps.session_count,
              ps.suspend_data, ps.launch_data, ps.cmi_json
         FROM lms_matriculas m
         JOIN lms_cursos c
           ON c.id = m.curso_id
          AND c.empresa_id = m.empresa_id
          AND c.deleted_at IS NULL
         LEFT JOIN lms_progresso_scorm ps
           ON ps.matricula_id = m.id
          AND ps.empresa_id = m.empresa_id
        WHERE m.id = ?
          AND m.empresa_id = ?
          AND m.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(matriculaId, empresaId)
    .first<ProgressRecoveryEnrollment>();
}

function evaluateProgressRecovery(params: {
  enrollment: ProgressRecoveryEnrollment;
  targetLessonLocation: string;
  targetProgressPct: number;
  targetLessonStatus?: string | null;
  targetScoreRaw?: number;
  targetMatriculaStatus?: string | null;
}) {
  const {
    enrollment,
    targetLessonLocation,
    targetProgressPct,
    targetLessonStatus,
    targetScoreRaw,
    targetMatriculaStatus,
  } = params;
  const targetLocation = parseScormLocationPair(targetLessonLocation);
  if (!targetLocation) {
    throw new ApiError('target_lesson_location deve estar no formato n/total', 400);
  }

  const currentProgress = Number(enrollment.progresso_pct ?? 0);
  const currentSlide = Number(enrollment.ultimo_slide ?? 0);
  const currentLessonLocation = extractLessonLocationValue(enrollment.cmi_json);
  const currentLocationMarker = extractScormLocationFromCmiJson(enrollment.cmi_json);
  const currentEffectiveProgress = Math.max(
    currentProgress,
    extractProgressPctFromCmiJson(enrollment.cmi_json) ?? 0,
  );
  const currentStrongSlide = Math.max(currentSlide, currentLocationMarker?.current ?? 0);

  const blockers: string[] = [];
  const risks: string[] = [];
  const normalizedMatriculaStatus = normalizeStatusToken(enrollment.status);
  const normalizedTargetLessonStatus = normalizeStatusToken(targetLessonStatus);
  const normalizedTargetMatriculaStatus = normalizeStatusToken(targetMatriculaStatus);

  if ((enrollment.tipo_conteudo ?? '').toLowerCase() !== 'scorm') {
    blockers.push('NON_SCORM_COURSE');
  }
  if (['CONCLUIDO', 'REPROVADO', 'CANCELADO'].includes(normalizedMatriculaStatus)) {
    blockers.push('TERMINAL_STATUS');
  }
  if (enrollment.qualificacao_historico_id) {
    blockers.push('QUALIFICATION_ALREADY_LINKED');
  }
  if (targetProgressPct >= 100) {
    blockers.push('TARGET_PROGRESS_COMPLETION_NOT_ALLOWED');
  }
  if (targetProgressPct < currentEffectiveProgress) {
    blockers.push('TARGET_PROGRESS_REGRESSION');
  }
  if (targetLocation.current < currentStrongSlide) {
    blockers.push('TARGET_LOCATION_REGRESSION');
  }
  if (normalizedTargetLessonStatus === 'PASSED' || normalizedTargetLessonStatus === 'COMPLETED') {
    blockers.push('TARGET_LESSON_STATUS_COMPLETION_FORBIDDEN');
  }
  if (targetScoreRaw !== undefined) {
    blockers.push('TARGET_SCORE_CHANGE_FORBIDDEN');
  }
  if (normalizedTargetMatriculaStatus === 'CONCLUIDO') {
    blockers.push('TARGET_MATRICULA_STATUS_COMPLETION_FORBIDDEN');
  }
  if (enrollment.data_conclusao) {
    blockers.push('DATA_CONCLUSAO_ALREADY_PRESENT');
  }

  if (currentLocationMarker?.total == null && currentLocationMarker?.current) {
    risks.push('CURRENT_RUNTIME_USES_LEGACY_NUMERIC_LOCATION');
  }
  if (
    currentLocationMarker?.total != null &&
    currentLocationMarker.total !== targetLocation.total
  ) {
    risks.push('TARGET_TOTAL_DIFFERS_FROM_CURRENT_RUNTIME');
  }
  if (!enrollment.suspend_data?.trim()) {
    risks.push('CURRENT_RUNTIME_HAS_NO_SUSPEND_DATA');
  }
  if (enrollment.score_raw != null || enrollment.score_scaled != null) {
    risks.push('CURRENT_SCORE_WILL_BE_PRESERVED');
  }
  if (
    normalizeStatusToken(enrollment.lesson_status) === 'PASSED' ||
    normalizeStatusToken(enrollment.lesson_status) === 'COMPLETED' ||
    normalizeStatusToken(enrollment.completion_status) === 'COMPLETED' ||
    normalizeStatusToken(enrollment.success_status) === 'PASSED'
  ) {
    risks.push('CURRENT_SCORM_COMPLETION_EVIDENCE_PRESENT');
  }

  const simulatedProgress = Math.max(currentEffectiveProgress, targetProgressPct);
  const simulatedSlide = Math.max(currentStrongSlide, targetLocation.current);
  const simulatedMatriculaStatus =
    normalizedMatriculaStatus === 'NAO_INICIADO' && (simulatedProgress > 0 || simulatedSlide > 0)
      ? 'EM_ANDAMENTO'
      : enrollment.status;
  const simulatedLessonLocation =
    targetLocation.current < currentStrongSlide
      ? (currentLessonLocation ?? String(currentStrongSlide))
      : targetLessonLocation;

  const currentSnapshot = buildProgressRecoverySnapshot({
    enrollment,
    progressPct: currentEffectiveProgress,
    slide: currentStrongSlide,
    lessonLocation: currentLessonLocation,
    matriculaStatus: enrollment.status,
    cmiJson: enrollment.cmi_json,
    suspendData: enrollment.suspend_data,
  });
  const simulatedSnapshot = buildProgressRecoverySnapshot({
    enrollment,
    progressPct: simulatedProgress,
    slide: simulatedSlide,
    lessonLocation: simulatedLessonLocation,
    matriculaStatus: simulatedMatriculaStatus,
    cmiJson: enrollment.cmi_json,
    suspendData: enrollment.suspend_data,
  });
  const dryRunReference = buildProgressRecoveryReference(currentSnapshot);

  return {
    enrollment,
    currentEffectiveProgress,
    currentStrongSlide,
    currentLessonLocation,
    blockers,
    risks,
    simulatedProgress,
    simulatedSlide,
    simulatedMatriculaStatus,
    simulatedLessonLocation,
    differences: buildRecoveryDryRunDifferences({
      currentStatus: enrollment.status,
      currentProgress: currentEffectiveProgress,
      currentSlide: currentStrongSlide,
      currentLessonLocation,
      simulatedStatus: simulatedMatriculaStatus,
      simulatedProgress,
      simulatedSlide,
      simulatedLessonLocation,
    }),
    currentSnapshot,
    simulatedSnapshot,
    dryRunReference,
  } satisfies ProgressRecoveryEvaluation;
}

function buildAppliedScormState(params: {
  enrollment: ProgressRecoveryEnrollment;
  targetLessonLocation: string;
}) {
  const currentSuspendData = params.enrollment.suspend_data?.trim()
    ? params.enrollment.suspend_data
    : null;
  const incomingCmi = {
    'cmi.location': params.targetLessonLocation,
    'cmi.core.lesson_location': params.targetLessonLocation,
    ...(currentSuspendData ? { 'cmi.suspend_data': currentSuspendData } : {}),
  };
  const runtimeMerge = mergeScormRuntimeState({
    currentCmiJson: params.enrollment.cmi_json,
    incomingCmiJson: JSON.stringify(incomingCmi),
    currentSuspendData,
    incomingSuspendData: currentSuspendData,
  });

  return {
    cmiJson: runtimeMerge.cmiJson,
    suspendData: runtimeMerge.suspendData,
    lessonLocation: extractLessonLocationValue(runtimeMerge.cmiJson),
  };
}

function safeJsonParseObject(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function insertProgressRecoveryAuditLog(
  db: D1Database,
  c: Context,
  params: {
    action: 'LMS_PROGRESS_RECOVERY_APPLY' | 'LMS_PROGRESS_RECOVERY_ROLLBACK';
    matriculaId: number;
    empresaId: number;
    before: ProgressRecoveryStateSnapshot;
    after: ProgressRecoveryStateSnapshot;
    details: Record<string, unknown>;
  },
) {
  const metadata = buildAuditMetadata(c, {
    empresa_id: params.empresaId,
    mode: 'RESTORE_PROGRESS_ONLY',
    ...params.details,
  });

  const result = await db
    .prepare(
      `INSERT INTO audit_logs (
        user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent,
        empresa_id, usuario_id, acao, tabela, registro_id, detalhes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      getCallerUserId(c) ?? null,
      params.action,
      'lms_matriculas',
      params.matriculaId,
      JSON.stringify(params.before),
      JSON.stringify(params.after),
      c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
      c.req.header('user-agent') ?? null,
      params.empresaId,
      getCallerUserId(c) ?? null,
      params.action,
      'lms_matriculas',
      params.matriculaId,
      JSON.stringify(metadata),
    )
    .run();

  return Number(result.meta.last_row_id ?? 0);
}

function buildRecoveryDryRunDifferences(params: {
  currentStatus: string;
  currentProgress: number;
  currentSlide: number;
  currentLessonLocation: string | null;
  simulatedStatus: string;
  simulatedProgress: number;
  simulatedSlide: number;
  simulatedLessonLocation: string | null;
}) {
  const differences: Array<{ field: string; current: unknown; simulated: unknown }> = [];

  if (params.currentStatus !== params.simulatedStatus) {
    differences.push({
      field: 'matricula.status',
      current: params.currentStatus,
      simulated: params.simulatedStatus,
    });
  }
  if (params.currentProgress !== params.simulatedProgress) {
    differences.push({
      field: 'matricula.progresso_pct',
      current: params.currentProgress,
      simulated: params.simulatedProgress,
    });
  }
  if (params.currentSlide !== params.simulatedSlide) {
    differences.push({
      field: 'matricula.ultimo_slide',
      current: params.currentSlide,
      simulated: params.simulatedSlide,
    });
  }
  if ((params.currentLessonLocation ?? null) !== (params.simulatedLessonLocation ?? null)) {
    differences.push({
      field: 'scorm.lesson_location',
      current: params.currentLessonLocation,
      simulated: params.simulatedLessonLocation,
    });
  }

  return differences;
}

// ── Recuperação administrativa de progresso SCORM (dry-run only) ────────────
// POST /matriculas/:id/progresso-recuperacao/dry-run
// Admin-only. Does not write to any table. Does not generate qualification.

app.post('/:id/progresso-recuperacao/dry-run', requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));
  if (!matriculaId || Number.isNaN(matriculaId)) throw new ApiError('ID inválido', 400);

  const body = await c.req.json<unknown>();
  const parsed = ProgressRecoveryDryRunSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  }

  const {
    target_lesson_location,
    target_progress_pct,
    reason,
    evidence_source,
    operator_note,
    target_lesson_status,
    target_score_raw,
    target_matricula_status,
  } = parsed.data;

  const enrollment = await loadProgressRecoveryEnrollment(db, matriculaId, empresaId);

  if (!enrollment) throw new ApiError('Matrícula não encontrada', 404);
  const evaluation = evaluateProgressRecovery({
    enrollment,
    targetLessonLocation: target_lesson_location,
    targetProgressPct: target_progress_pct,
    targetLessonStatus: target_lesson_status,
    targetScoreRaw: target_score_raw,
    targetMatriculaStatus: target_matricula_status,
  });

  return c.json({
    success: true,
    data: {
      mode: 'dry-run',
      reason,
      evidence_source,
      operator_note: operator_note ?? null,
      writes_executed: false,
      dry_run_reference: evaluation.dryRunReference,
      current_state: {
        ...summarizeProgressRecoverySnapshot(evaluation.currentSnapshot),
        matricula: {
          ...summarizeProgressRecoverySnapshot(evaluation.currentSnapshot).matricula,
          curso_titulo: enrollment.curso_titulo,
          tipo_conteudo: enrollment.tipo_conteudo,
        },
      },
      simulated_state: {
        ...summarizeProgressRecoverySnapshot(evaluation.simulatedSnapshot),
      },
      requested_target: {
        lesson_location: target_lesson_location,
        progress_pct: target_progress_pct,
        lesson_status: target_lesson_status ?? null,
        score_raw: target_score_raw ?? null,
        matricula_status: target_matricula_status ?? null,
      },
      differences: evaluation.differences,
      risks: evaluation.risks,
      would_be_allowed_future: evaluation.blockers.length === 0,
      apply_allowed: evaluation.blockers.length === 0,
      blocked_reason: evaluation.blockers[0] ?? null,
      blockers: evaluation.blockers,
      safety_guards: {
        apply_implemented: true,
        qualification_generation_allowed: false,
        score_changes_allowed: false,
        matricula_completion_allowed: false,
      },
    },
  });
});

app.post('/:id/progresso-recuperacao/apply', requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));
  if (!matriculaId || Number.isNaN(matriculaId)) throw new ApiError('ID inválido', 400);

  const body = await c.req.json<unknown>();
  const parsed = ProgressRecoveryApplySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  }

  const {
    target_lesson_location,
    target_progress_pct,
    reason,
    evidence_source,
    operator_note,
    dry_run_reference,
    target_lesson_status,
    target_score_raw,
    target_matricula_status,
  } = parsed.data;

  const enrollment = await loadProgressRecoveryEnrollment(db, matriculaId, empresaId);
  if (!enrollment) throw new ApiError('Matrícula não encontrada', 404);

  const evaluation = evaluateProgressRecovery({
    enrollment,
    targetLessonLocation: target_lesson_location,
    targetProgressPct: target_progress_pct,
    targetLessonStatus: target_lesson_status,
    targetScoreRaw: target_score_raw,
    targetMatriculaStatus: target_matricula_status,
  });

  if (evaluation.dryRunReference !== dry_run_reference) {
    throw new ApiError(
      'Estado atual divergiu do dry-run revisado; execute novo dry-run antes do apply',
      409,
    );
  }
  if (evaluation.blockers.length > 0) {
    throw new ApiError(`Apply bloqueado: ${evaluation.blockers[0]}`, 409);
  }

  const appliedScormState = buildAppliedScormState({
    enrollment,
    targetLessonLocation: target_lesson_location,
  });
  if (enrollment.suspend_data?.trim() && !appliedScormState.suspendData?.trim()) {
    throw new ApiError('Apply bloqueado: suspend_data forte não pode ser apagado', 409);
  }

  const afterSnapshot = buildProgressRecoverySnapshot({
    enrollment,
    progressPct: evaluation.simulatedProgress,
    slide: evaluation.simulatedSlide,
    lessonLocation: appliedScormState.lessonLocation,
    matriculaStatus: evaluation.simulatedMatriculaStatus,
    cmiJson: appliedScormState.cmiJson,
    suspendData: appliedScormState.suspendData,
  });

  const rollbackPayload = {
    audit_log_action: 'LMS_PROGRESS_RECOVERY_ROLLBACK',
    restore_reference: buildProgressRecoveryReference(evaluation.currentSnapshot),
  };
  const auditLogId = await insertProgressRecoveryAuditLog(db, c, {
    action: 'LMS_PROGRESS_RECOVERY_APPLY',
    matriculaId,
    empresaId,
    before: evaluation.currentSnapshot,
    after: afterSnapshot,
    details: {
      reason,
      evidence_source,
      operator_note,
      dry_run_reference,
      rollback_payload: rollbackPayload,
      course_id: enrollment.curso_id,
      funcionario_id: enrollment.funcionario_id,
      target_lesson_location,
      target_progress_pct,
    },
  });

  await db
    .prepare(
      `UPDATE lms_matriculas
          SET status = ?,
              progresso_pct = ?,
              ultimo_slide = ?,
              data_inicio = COALESCE(data_inicio, datetime('now')),
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    )
    .bind(
      evaluation.simulatedMatriculaStatus,
      evaluation.simulatedProgress,
      evaluation.simulatedSlide,
      matriculaId,
      empresaId,
    )
    .run();

  await db
    .prepare(
      `INSERT INTO lms_progresso_scorm
        (matricula_id, empresa_id, lesson_status, completion_status, success_status,
         score_raw, score_max, score_min, score_scaled,
         session_time, total_time, suspend_data, launch_data, cmi_json, session_count, last_commit_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(matricula_id) DO UPDATE SET
        lesson_status = excluded.lesson_status,
        completion_status = excluded.completion_status,
        success_status = excluded.success_status,
        score_raw = COALESCE(excluded.score_raw, lms_progresso_scorm.score_raw),
        score_max = COALESCE(excluded.score_max, lms_progresso_scorm.score_max),
        score_min = COALESCE(excluded.score_min, lms_progresso_scorm.score_min),
        score_scaled = COALESCE(excluded.score_scaled, lms_progresso_scorm.score_scaled),
        session_time = COALESCE(excluded.session_time, lms_progresso_scorm.session_time),
        total_time = COALESCE(excluded.total_time, lms_progresso_scorm.total_time),
        suspend_data = COALESCE(excluded.suspend_data, lms_progresso_scorm.suspend_data),
        launch_data = COALESCE(excluded.launch_data, lms_progresso_scorm.launch_data),
        cmi_json = COALESCE(excluded.cmi_json, lms_progresso_scorm.cmi_json),
        session_count = COALESCE(lms_progresso_scorm.session_count, 1),
        last_commit_at = datetime('now'),
        updated_at = datetime('now')`,
    )
    .bind(
      matriculaId,
      empresaId,
      enrollment.lesson_status ?? 'incomplete',
      enrollment.completion_status,
      enrollment.success_status,
      enrollment.score_raw,
      enrollment.score_max,
      enrollment.score_min,
      enrollment.score_scaled,
      enrollment.session_time,
      enrollment.total_time,
      appliedScormState.suspendData,
      enrollment.launch_data,
      appliedScormState.cmiJson,
      enrollment.session_count ?? 1,
    )
    .run();

  return c.json({
    success: true,
    data: {
      mode: 'apply',
      writes_executed: true,
      audit_log_id: auditLogId,
      rollback_available: true,
      dry_run_reference,
      before: summarizeProgressRecoverySnapshot(evaluation.currentSnapshot),
      after: summarizeProgressRecoverySnapshot(afterSnapshot),
    },
  });
});

app.post('/:id/progresso-recuperacao/rollback', requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('id'));
  if (!matriculaId || Number.isNaN(matriculaId)) throw new ApiError('ID inválido', 400);

  const body = await c.req.json<unknown>();
  const parsed = ProgressRecoveryRollbackSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Dados inválidos', 400);
  }

  const enrollment = await loadProgressRecoveryEnrollment(db, matriculaId, empresaId);
  if (!enrollment) throw new ApiError('Matrícula não encontrada', 404);

  const auditLog = await db
    .prepare(
      `SELECT id, action, entity_type, entity_id, old_values, new_values, detalhes
         FROM audit_logs
        WHERE id = ? AND entity_id = ? AND entity_type = 'lms_matriculas'
        LIMIT 1`,
    )
    .bind(parsed.data.audit_log_id, matriculaId)
    .first<{
      id: number;
      action: string | null;
      entity_type: string | null;
      entity_id: number | null;
      old_values: string | null;
      new_values: string | null;
      detalhes: string | null;
    }>();

  if (!auditLog || auditLog.action !== 'LMS_PROGRESS_RECOVERY_APPLY') {
    throw new ApiError('Audit log de apply não encontrado para esta matrícula', 404);
  }

  const beforeSnapshot = safeJsonParseObject(
    auditLog.old_values,
  ) as ProgressRecoveryStateSnapshot | null;
  const appliedSnapshot = safeJsonParseObject(
    auditLog.new_values,
  ) as ProgressRecoveryStateSnapshot | null;
  if (!beforeSnapshot || !appliedSnapshot) {
    throw new ApiError('Audit log de recovery inválido; rollback bloqueado', 409);
  }

  const currentProgress = Math.max(
    Number(enrollment.progresso_pct ?? 0),
    extractProgressPctFromCmiJson(enrollment.cmi_json) ?? 0,
  );
  const currentSlide = Math.max(
    Number(enrollment.ultimo_slide ?? 0),
    extractScormLocationFromCmiJson(enrollment.cmi_json)?.current ?? 0,
  );
  const currentSnapshot = buildProgressRecoverySnapshot({
    enrollment,
    progressPct: currentProgress,
    slide: currentSlide,
    lessonLocation: extractLessonLocationValue(enrollment.cmi_json),
    matriculaStatus: enrollment.status,
    cmiJson: enrollment.cmi_json,
    suspendData: enrollment.suspend_data,
  });

  if (
    buildProgressRecoveryReference(currentSnapshot) !==
    buildProgressRecoveryReference(appliedSnapshot)
  ) {
    throw new ApiError('Estado atual divergiu do estado aplicado; rollback bloqueado', 409);
  }

  await db
    .prepare(
      `UPDATE lms_matriculas
          SET status = ?,
              progresso_pct = ?,
              ultimo_slide = ?,
              data_inicio = ?,
              data_conclusao = ?,
              updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ?`,
    )
    .bind(
      beforeSnapshot.matricula.status,
      beforeSnapshot.matricula.progresso_pct,
      beforeSnapshot.matricula.ultimo_slide,
      beforeSnapshot.matricula.data_inicio,
      beforeSnapshot.matricula.data_conclusao,
      matriculaId,
      empresaId,
    )
    .run();

  if (!beforeSnapshot.scorm.row_present) {
    await db
      .prepare('DELETE FROM lms_progresso_scorm WHERE matricula_id = ? AND empresa_id = ?')
      .bind(matriculaId, empresaId)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO lms_progresso_scorm
          (id, matricula_id, empresa_id, lesson_status, completion_status, success_status,
           score_raw, score_max, score_min, score_scaled, session_time, total_time,
           session_count, suspend_data, launch_data, cmi_json, last_commit_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(matricula_id) DO UPDATE SET
          lesson_status = excluded.lesson_status,
          completion_status = excluded.completion_status,
          success_status = excluded.success_status,
          score_raw = excluded.score_raw,
          score_max = excluded.score_max,
          score_min = excluded.score_min,
          score_scaled = excluded.score_scaled,
          session_time = excluded.session_time,
          total_time = excluded.total_time,
          session_count = excluded.session_count,
          suspend_data = excluded.suspend_data,
          launch_data = excluded.launch_data,
          cmi_json = excluded.cmi_json,
          last_commit_at = datetime('now'),
          updated_at = datetime('now')`,
      )
      .bind(
        beforeSnapshot.scorm.id,
        matriculaId,
        empresaId,
        beforeSnapshot.scorm.lesson_status,
        beforeSnapshot.scorm.completion_status,
        beforeSnapshot.scorm.success_status,
        beforeSnapshot.scorm.score_raw,
        beforeSnapshot.scorm.score_max,
        beforeSnapshot.scorm.score_min,
        beforeSnapshot.scorm.score_scaled,
        beforeSnapshot.scorm.session_time,
        beforeSnapshot.scorm.total_time,
        beforeSnapshot.scorm.session_count ?? 1,
        beforeSnapshot.scorm.suspend_data,
        beforeSnapshot.scorm.launch_data,
        beforeSnapshot.scorm.cmi_json,
      )
      .run();
  }

  const rollbackAuditLogId = await insertProgressRecoveryAuditLog(db, c, {
    action: 'LMS_PROGRESS_RECOVERY_ROLLBACK',
    matriculaId,
    empresaId,
    before: appliedSnapshot,
    after: beforeSnapshot,
    details: {
      reason: parsed.data.reason,
      rollback_of_audit_log_id: parsed.data.audit_log_id,
      mode: 'RESTORE_PROGRESS_ONLY',
    },
  });

  return c.json({
    success: true,
    data: {
      mode: 'rollback',
      writes_executed: true,
      audit_log_id: rollbackAuditLogId,
      rolled_back_audit_log_id: parsed.data.audit_log_id,
      before: summarizeProgressRecoverySnapshot(appliedSnapshot),
      after: summarizeProgressRecoverySnapshot(beforeSnapshot),
    },
  });
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
  const userId = getCallerUserId(c);
  const userRole = hasRole(c, 'admin') ? 'ADMIN' : hasRole(c, 'manager') ? 'MANAGER' : '';
  const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';

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
