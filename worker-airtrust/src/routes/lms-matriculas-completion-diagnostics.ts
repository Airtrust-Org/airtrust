/**
 * LMS — Snapshot do diagnóstico granular AIRTRUST_COMPLETION_DIAGNOSTICS_V1.
 *
 * Read model puramente INFORMATIVO: guarda a última "foto" de pendências que o
 * pacote SCORM reportou, para que o painel "Pendências para concluir"
 * sobreviva a um reload da página.
 *
 * Nunca altera lesson_status, score, status de matrícula, qualificação ou
 * certificado — a autoridade canônica de conclusão continua sendo
 * `completion_diagnostic` (services/lms-progress-guardrails.ts).
 *
 * Fica em arquivo próprio para não engrossar routes/lms-matriculas.ts, que já
 * está sob teto de tamanho no guard de arquitetura.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { auth } from '../middleware/auth';
import { hasRole } from '../middleware/rbac';
import { ApiError } from '../middleware/error-handler';
import { getEmpresaIdSafe } from './escalas-shared';
import { parseCompletionDiagnosticsSnapshot } from '../services/lms-completion-diagnostics-snapshot';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', auth());

function getCallerUserId(c: Context): number | undefined {
  const raw = c.get('userId' as never) as unknown;
  const parsed = typeof raw === 'string' ? Number(raw) : (raw as number | null | undefined);
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : undefined;
}

async function resolveCallerFuncionarioId(
  c: Context,
  db: D1Database,
): Promise<number | null> {
  const userId = getCallerUserId(c);
  if (!userId) return null;
  const row = await db
    .prepare('SELECT funcionario_id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(userId)
    .first<{ funcionario_id: number | null }>();
  const parsed = row?.funcionario_id;
  return Number.isFinite(parsed) && Number(parsed) > 0 ? Number(parsed) : null;
}

/**
 * Resolve a matrícula garantindo escopo de empresa E de titularidade.
 * Alunos só alcançam a própria matrícula; admin/manager alcançam as da empresa.
 */
async function resolveMatricula(
  c: Context,
  db: D1Database,
  matriculaId: number,
): Promise<{ id: number; curso_id: number; funcionario_id: number }> {
  const empresaId = getEmpresaIdSafe(c);
  if (!Number.isFinite(matriculaId) || matriculaId <= 0) {
    throw new ApiError('Matrícula inválida', 400);
  }

  const matricula = await db
    .prepare(
      `SELECT id, curso_id, funcionario_id
         FROM lms_matriculas
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(matriculaId, empresaId)
    .first<{ id: number; curso_id: number; funcionario_id: number }>();

  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);

  if (!hasRole(c, 'admin', 'manager')) {
    const callerFuncionarioId = await resolveCallerFuncionarioId(c, db);
    if (!callerFuncionarioId || Number(matricula.funcionario_id) !== callerFuncionarioId) {
      throw new ApiError('Acesso negado', 403);
    }
  }

  return matricula;
}

app.put('/:id/completion-diagnostics', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matricula = await resolveMatricula(c, db, Number(c.req.param('id')));

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError('Payload inválido', 400);
  }

  const snapshot = parseCompletionDiagnosticsSnapshot(
    (body as { diagnostics?: unknown } | null)?.diagnostics,
  );
  if (!snapshot) throw new ApiError('Diagnóstico inválido', 400);

  // empresa_id / matricula_id / curso_id vêm SEMPRE do contexto autenticado,
  // nunca do payload enviado pelo pacote SCORM.
  await db
    .prepare(
      `INSERT INTO lms_completion_diagnostics_snapshots
         (empresa_id, matricula_id, curso_id, tentativa, diagnostics_json, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now'))
       ON CONFLICT (empresa_id, matricula_id, curso_id, tentativa)
       DO UPDATE SET diagnostics_json = excluded.diagnostics_json,
                     updated_at = datetime('now')`,
    )
    .bind(empresaId, matricula.id, matricula.curso_id, JSON.stringify(snapshot))
    .run();

  return c.json({ success: true, data: { stored: true } });
});

app.get('/:id/completion-diagnostics', async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const matricula = await resolveMatricula(c, db, Number(c.req.param('id')));

  const row = await db
    .prepare(
      `SELECT diagnostics_json, updated_at
         FROM lms_completion_diagnostics_snapshots
        WHERE empresa_id = ? AND matricula_id = ? AND curso_id = ?
        ORDER BY tentativa DESC
        LIMIT 1`,
    )
    .bind(empresaId, matricula.id, matricula.curso_id)
    .first<{ diagnostics_json: string; updated_at: string }>();

  if (!row) return c.json({ success: true, data: { diagnostics: null } });

  let diagnostics: unknown = null;
  try {
    diagnostics = parseCompletionDiagnosticsSnapshot(JSON.parse(row.diagnostics_json));
  } catch {
    diagnostics = null;
  }

  return c.json({ success: true, data: { diagnostics, updated_at: row.updated_at } });
});

export default app;
