/**
 * LMS — Progresso SCORM e Statements xAPI
 *
 * GET  /api/lms/scorm/state/:matriculaId   — retorna suspend_data + cmi_json para retomar curso
 * POST /api/lms/xapi/statements            — recebe statement xAPI, salva e pode disparar qualificação
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { hasRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import { completeLmsMatricula, LmsCompletionRejectedError } from '../services/lms-completion';
import type { VencimentoMode } from '../utils/qualificacoes-expiration';
import { syncMatriculaCycleFromMatricula } from '../services/lms-matricula-cycle';
import {
  mergeMonotonicMatriculaStatus,
  mergeMonotonicNumber,
  resolveLmsEffectiveProgress,
} from '../services/lms-progress-guardrails';
import { logAudit } from '../utils/db';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.use('/scorm/state/*', auth());
app.use('/xapi/*', auth());

function getCallerFuncionarioId(c: Context): number | null {
  const raw = c.get('funcionarioId' as never) as unknown;
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : null;
}

function getCallerUserId(c: Context): number | undefined {
  const raw = c.get('userId' as never) as unknown;
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : undefined;
}

async function resolveCallerFuncionarioId(c: Context, db: D1Database): Promise<number | null> {
  const fromJwt = getCallerFuncionarioId(c);
  if (fromJwt) return fromJwt;
  const userId = getCallerUserId(c);
  if (!userId) return null;
  const row = await db
    .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(userId)
    .first<{ funcionario_id: number | null }>();
  const parsed = row?.funcionario_id;
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : null;
}

async function logLmsProgressAudit(
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
    console.warn('[LMS] Falha ao registrar audit log de progresso:', error);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Verbs xAPI que indicam conclusão com sucesso */
const COMPLETION_VERBS = new Set([
  'http://adlnet.gov/expapi/verbs/completed',
  'http://adlnet.gov/expapi/verbs/passed',
  'https://w3id.org/xapi/adl/verbs/completed',
  'https://w3id.org/xapi/adl/verbs/passed',
]);

/** Verbs xAPI que indicam falha */
const FAILURE_VERBS = new Set([
  'http://adlnet.gov/expapi/verbs/failed',
  'https://w3id.org/xapi/adl/verbs/failed',
]);

function isPassedVerb(verbId: string): boolean {
  return verbId.endsWith('/passed');
}

function isCompletedVerb(verbId: string): boolean {
  return verbId.endsWith('/completed');
}

/**
 * Verifica se o score do statement xAPI atende ao mastery score do curso.
 * Se o curso não tem scorm_mastery_score definido, qualquer nota é aceita.
 * Se tem, a nota (raw/max ou scaled) deve ser >= mastery score.
 */
function meetsMasteryScore(
  result: { score?: { raw?: number; max?: number; scaled?: number } } | undefined,
  masteryScore: number | null | undefined,
): boolean {
  if (masteryScore == null || masteryScore <= 0) return true;

  const scaled = result?.score?.scaled;
  if (scaled != null) {
    return scaled * 100 >= masteryScore;
  }

  const raw = result?.score?.raw;
  const max = result?.score?.max;
  if (raw != null && max != null && max > 0) {
    return (raw / max) * 100 >= masteryScore;
  }

  return false;
}

// ── Schema de statement xAPI ─────────────────────────────────────────────────

const XApiStatementSchema = z.object({
  matricula_id: z.number().int().positive(),
  actor: z.record(z.unknown()), // { mbox, name, ... }
  verb: z.object({
    id: z.string().url(),
    display: z.record(z.string()).optional(), // { "pt-BR": "completou" }
  }),
  object: z.object({
    id: z.string(),
    objectType: z.string().optional().default('Activity'),
    definition: z.record(z.unknown()).optional(),
  }),
  result: z
    .object({
      success: z.boolean().optional(),
      completion: z.boolean().optional(),
      score: z
        .object({
          raw: z.number().optional(),
          max: z.number().optional(),
          min: z.number().optional(),
          scaled: z.number().min(-1).max(1).optional(),
        })
        .optional(),
      duration: z.string().optional(), // ISO 8601 duration
      response: z.string().optional(),
    })
    .optional(),
  context: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(), // ISO 8601
});

// ── GET /scorm/state/:matriculaId ─────────────────────────────────────────────

app.get('/scorm/state/:matriculaId', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('matriculaId'));
  const canManage = hasRole(c, 'admin', 'manager');
  const callerFuncionarioId = canManage ? null : await resolveCallerFuncionarioId(c, db);

  // Verificar que a matrícula pertence à empresa (multi-tenancy)
  const matricula = await db
    .prepare(
      'SELECT id, status, funcionario_id FROM lms_matriculas WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(matriculaId, empresaId)
    .first<{ id: number; status: string; funcionario_id: number }>();
  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  if (!canManage) {
    if (!callerFuncionarioId || matricula.funcionario_id !== callerFuncionarioId) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  const progresso = await db
    .prepare(
      'SELECT suspend_data, cmi_json, lesson_status, completion_status, success_status, score_raw, score_max, total_time, session_count, last_commit_at FROM lms_progresso_scorm WHERE matricula_id = ? AND empresa_id = ?',
    )
    .bind(matriculaId, empresaId)
    .first<Record<string, unknown>>();

  return c.json({
    success: true,
    data: {
      matricula_id: matriculaId,
      status: matricula.status,
      progresso: progresso ?? null,
    },
  });
});

// ── POST /xapi/statements ─────────────────────────────────────────────────────

app.post('/xapi/statements', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const canManage = hasRole(c, 'admin', 'manager');
  const callerFuncionarioId = canManage ? null : await resolveCallerFuncionarioId(c, db);

  const body = await c.req.json<unknown>();
  const parsed = XApiStatementSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(parsed.error.issues[0]?.message ?? 'Statement xAPI inválido', 400);

  const stmt = parsed.data;

  // Verificar matrícula + multi-tenancy
  const matricula = await db
    .prepare(
      `
      SELECT m.id, m.funcionario_id, m.status, m.empresa_id, m.progresso_pct, m.score_final,
        m.qualificacao_historico_id,
        c.id AS curso_id, c.gerar_qualificacao_ao_concluir, c.qualificacao_tipo_id,
        c.titulo AS curso_titulo,
        c.scorm_mastery_score,
        qt.codigo AS qualificacao_codigo,
        qt.nome AS qualificacao_nome,
        qt.categoria AS qualificacao_categoria,
        qt.validade AS qualificacao_validade,
        qt.vencimento_fim_mes AS qualificacao_vencimento_fim_mes
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = c.qualificacao_tipo_id
      WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
    `,
    )
    .bind(stmt.matricula_id, empresaId)
    .first<{
      id: number;
      funcionario_id: number;
      status: string;
      empresa_id: number;
      progresso_pct: number | null;
      score_final: number | null;
      qualificacao_historico_id: number | null;
      curso_id: number;
      gerar_qualificacao_ao_concluir: number;
      qualificacao_tipo_id: number | null;
      curso_titulo: string;
      scorm_mastery_score: number | null;
      qualificacao_codigo: string | null;
      qualificacao_nome: string | null;
      qualificacao_categoria: string | null;
      qualificacao_validade: number | null;
      qualificacao_vencimento_fim_mes: VencimentoMode | null;
    }>();

  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  if (!canManage) {
    if (!callerFuncionarioId || matricula.funcionario_id !== callerFuncionarioId) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  const verbId = stmt.verb.id;
  const verbDisplay = stmt.verb.display
    ? (stmt.verb.display['pt-BR'] ??
      stmt.verb.display['en-US'] ??
      Object.values(stmt.verb.display)[0])
    : null;

  const timestamp = stmt.timestamp ?? new Date().toISOString();

  // Salvar statement
  const insertResult = await db
    .prepare(
      `
      INSERT INTO lms_xapi_statements
        (empresa_id, matricula_id, actor_json, verb_id, verb_display,
         object_id, object_type, result_json, context_json, timestamp)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `,
    )
    .bind(
      empresaId,
      stmt.matricula_id,
      JSON.stringify(stmt.actor),
      verbId,
      verbDisplay ?? null,
      stmt.object.id,
      stmt.object.objectType ?? 'Activity',
      stmt.result ? JSON.stringify(stmt.result) : null,
      stmt.context ? JSON.stringify(stmt.context) : null,
      timestamp,
    )
    .run();

  const statementId = insertResult.meta.last_row_id;

  // Determinar novo status da matrícula
  const isCompletion = COMPLETION_VERBS.has(verbId);
  const isFailure = FAILURE_VERBS.has(verbId);
  const resultSuccess = stmt.result?.success === true;
  const resultCompletion = stmt.result?.completion === true;
  const completionExplicitlyFalse = stmt.result?.completion === false;
  const successExplicitlyFalse = stmt.result?.success === false;

  // Validar mastery score: se o curso tem scorm_mastery_score, a nota deve atender
  const masteryOk = meetsMasteryScore(stmt.result, matricula.scorm_mastery_score);

  const shouldConcluir =
    isCompletion &&
    masteryOk &&
    (resultSuccess ||
      resultCompletion ||
      isPassedVerb(verbId) ||
      (isCompletedVerb(verbId) && !completionExplicitlyFalse && !successExplicitlyFalse));
  const shouldReprovar = isFailure && !resultSuccess;

  let qualificacaoGerada: Record<string, unknown> | null = null;
  const statusAnterior = matricula.status;

  let statusSemConclusao = matricula.status;
  if (matricula.status === 'NAO_INICIADO') {
    statusSemConclusao = mergeMonotonicMatriculaStatus(matricula.status, 'EM_ANDAMENTO');
  }

  let novoStatus = statusSemConclusao;
  if (shouldConcluir) {
    novoStatus = mergeMonotonicMatriculaStatus(statusSemConclusao, 'CONCLUIDO');
  } else if (shouldReprovar) {
    novoStatus = mergeMonotonicMatriculaStatus(statusSemConclusao, 'REPROVADO');
  }

  // Calcular progresso a partir do score se disponível
  const scoreRaw = stmt.result?.score?.raw;
  const scoreMax = stmt.result?.score?.max;
  const progressoPct = shouldConcluir
    ? 100
    : scoreRaw != null && scoreMax != null && scoreMax > 0
      ? mergeMonotonicNumber(matricula.progresso_pct, Math.round((scoreRaw / scoreMax) * 100))
      : undefined;

  // Toda transição real para CONCLUIDO deve passar pelo serviço canônico,
  // independentemente de já existir qualificacao_historico_id vinculado.
  // O Histórico existente será validado e reutilizado atomicamente.
  const isNewCompletion = novoStatus === 'CONCLUIDO' && statusAnterior !== 'CONCLUIDO';
  let qualificationFailed = false;
  let statusFinal = novoStatus;

  if (isNewCompletion) {
    const dataConclusaoQualificacao = new Date().toISOString().slice(0, 10);
    const mergedScore = mergeMonotonicNumber(
      matricula.score_final as number | null | undefined,
      scoreRaw ?? null,
    );
    try {
      const result = await completeLmsMatricula({
        db,
        empresaId,
        matriculaId: stmt.matricula_id,
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
        dataConclusao: dataConclusaoQualificacao,
        existingHistoricoId: matricula.qualificacao_historico_id,
        progressoPct: 100,
        scoreFinal: mergedScore,
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
      qualificationFailed = true;
      statusFinal = statusSemConclusao;
      console.error('[LMS xAPI] Conclusão rejeitada (batch revertido):', e);
    }
  } else if (statusFinal !== matricula.status || progressoPct !== undefined) {
    // Sem transição para CONCLUIDO nesta chamada (progresso parcial,
    // REPROVADO, ou já CONCLUIDO antes): mantém a atualização direta.
    const dataConclusao =
      statusFinal === 'CONCLUIDO' || statusFinal === 'REPROVADO'
        ? new Date().toISOString().slice(0, 10)
        : null;
    await db
      .prepare(
        `
        UPDATE lms_matriculas
        SET status = ?,
            progresso_pct = MAX(COALESCE(progresso_pct, 0), COALESCE(?, 0)),
            data_inicio = COALESCE(data_inicio, datetime('now')),
            data_conclusao = COALESCE(?, data_conclusao),
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
        progressoPct ?? null,
        dataConclusao,
        mergeMonotonicNumber(matricula.score_final as number | null | undefined, scoreRaw ?? null),
        mergeMonotonicNumber(matricula.score_final as number | null | undefined, scoreRaw ?? null),
        mergeMonotonicNumber(matricula.score_final as number | null | undefined, scoreRaw ?? null),
        stmt.matricula_id,
        empresaId,
      )
      .run();
    await syncMatriculaCycleFromMatricula(db, { matriculaId: stmt.matricula_id });
  }

  novoStatus = statusFinal;

  if (novoStatus !== statusAnterior) {
    const action =
      novoStatus === 'CONCLUIDO'
        ? 'LMS_MATRICULA_CONCLUIDA'
        : novoStatus === 'REPROVADO'
          ? 'LMS_MATRICULA_REPROVADA'
          : 'LMS_MATRICULA_STATUS_ATUALIZADO';
    await logLmsProgressAudit(db, c, {
      action,
      matriculaId: stmt.matricula_id,
      oldValues: { status: statusAnterior },
      newValues: {
        status: novoStatus,
        progresso_pct: progressoPct ?? null,
        statement_id: Number(statementId),
        qualificacao_historico_id:
          (qualificacaoGerada?.qualificacao_historico_id as number | undefined) ??
          matricula.qualificacao_historico_id,
      },
    });
  }

  const effectiveProgress = resolveLmsEffectiveProgress({
    status: novoStatus,
    progressoBruto: progressoPct ?? matricula.progresso_pct,
  });

  if (qualificationFailed) {
    // Qualificação exigida e não garantida: erro HTTP sanitizado, nunca 200
    // com qualification_failed:true. O statement xAPI já foi persistido
    // (trilha de auditoria bruta preservada); a conclusão não foi.
    return c.json(
      {
        success: false,
        error:
          'Não foi possível confirmar a qualificação exigida por este curso. A matrícula não foi concluída — tente novamente.',
        code: 'LMS_QUALIFICATION_COMPLETION_FAILED',
        data: {
          statement_id: statementId,
          matricula_id: stmt.matricula_id,
          verb_id: verbId,
          novo_status: novoStatus,
          progresso_bruto: effectiveProgress.progresso_bruto,
          progresso_efetivo: effectiveProgress.progresso_efetivo,
          completion_state: effectiveProgress.completion_state,
          completion_reason_code: effectiveProgress.completion_reason_code,
          qualificacao_gerada: null,
        },
      },
      409,
    );
  }

  return c.json(
    {
      success: true,
      data: {
        statement_id: statementId,
        matricula_id: stmt.matricula_id,
        verb_id: verbId,
        novo_status: novoStatus,
        progresso_bruto: effectiveProgress.progresso_bruto,
        progresso_efetivo: effectiveProgress.progresso_efetivo,
        completion_state: effectiveProgress.completion_state,
        completion_reason_code: effectiveProgress.completion_reason_code,
        qualificacao_gerada: qualificacaoGerada,
      },
    },
    201,
  );
});

// ── GET /xapi/statements/:matriculaId ─────────────────────────────────────────

app.get('/xapi/statements/:matriculaId', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matriculaId = Number(c.req.param('matriculaId'));
  const canManage = hasRole(c, 'admin', 'manager');
  const callerFuncionarioId = canManage ? null : await resolveCallerFuncionarioId(c, db);

  // Verificar multi-tenancy
  const matricula = await db
    .prepare(
      'SELECT id, funcionario_id FROM lms_matriculas WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(matriculaId, empresaId)
    .first<{ id: number; funcionario_id: number }>();
  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  if (!canManage) {
    if (!callerFuncionarioId || matricula.funcionario_id !== callerFuncionarioId) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 500);
  const rows = await db
    .prepare(
      'SELECT id, verb_id, verb_display, object_id, result_json, timestamp, created_at FROM lms_xapi_statements WHERE matricula_id = ? AND empresa_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .bind(matriculaId, empresaId, limit)
    .all<Record<string, unknown>>();

  return c.json({ success: true, data: rows.results });
});

export default app;
