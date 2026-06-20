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
import { createLmsQualificationOnCompletion } from '../services/lms-qualification';
import { syncMatriculaCycleFromMatricula } from '../services/lms-matricula-cycle';
import {
  mergeMonotonicMatriculaStatus,
  mergeMonotonicNumber,
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
        c.gerar_qualificacao_ao_concluir, c.qualificacao_tipo_id,
        c.titulo AS curso_titulo,
        qt.codigo AS qualificacao_codigo,
        qt.nome AS qualificacao_nome,
        qt.categoria AS qualificacao_categoria,
        qt.validade AS qualificacao_validade
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

  const shouldConcluir =
    isCompletion &&
    (resultSuccess ||
      resultCompletion ||
      isPassedVerb(verbId) ||
      (isCompletedVerb(verbId) && !completionExplicitlyFalse && !successExplicitlyFalse));
  const shouldReprovar = isFailure && !resultSuccess;

  let novoStatus = matricula.status;
  let qualificacaoGerada: Record<string, unknown> | null = null;
  const statusAnterior = matricula.status;

  if (matricula.status === 'NAO_INICIADO') {
    novoStatus = mergeMonotonicMatriculaStatus(matricula.status, 'EM_ANDAMENTO');
  }

  if (shouldConcluir) {
    novoStatus = mergeMonotonicMatriculaStatus(novoStatus, 'CONCLUIDO');
  } else if (shouldReprovar) {
    novoStatus = mergeMonotonicMatriculaStatus(novoStatus, 'REPROVADO');
  }

  // Calcular progresso a partir do score se disponível
  const scoreRaw = stmt.result?.score?.raw;
  const scoreMax = stmt.result?.score?.max;
  const progressoPct = shouldConcluir
    ? 100
    : scoreRaw != null && scoreMax != null && scoreMax > 0
      ? mergeMonotonicNumber(matricula.progresso_pct, Math.round((scoreRaw / scoreMax) * 100))
      : undefined;

  // Atualizar matrícula
  if (novoStatus !== matricula.status || progressoPct !== undefined) {
    const dataConclusao =
      novoStatus === 'CONCLUIDO' || novoStatus === 'REPROVADO'
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
        novoStatus,
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

  // Disparar qualificação automática se concluído
  if (
    shouldConcluir &&
    matricula.gerar_qualificacao_ao_concluir === 1 &&
    matricula.qualificacao_tipo_id
  ) {
    try {
      const dataConclusao = new Date().toISOString().slice(0, 10);
      const historicoId = await createLmsQualificationOnCompletion({
        db,
        matriculaId: stmt.matricula_id,
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
      console.error('[LMS xAPI] Erro ao gerar qualificação automática:', e);
    }
  }

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

  return c.json(
    {
      success: true,
      data: {
        statement_id: statementId,
        matricula_id: stmt.matricula_id,
        verb_id: verbId,
        novo_status: novoStatus,
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
